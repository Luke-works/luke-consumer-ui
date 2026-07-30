import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormEmbedView from "./FormEmbedView";
import * as embedApi from "../../lib/publicEmbedApi";

vi.mock("@lukeflow/form-embed", () => ({
  connectEmbedFrame: () => ({ destroy: () => {}, ready: () => {}, error: () => {}, submitted: () => {} }),
}));
vi.mock("../../lib/minionsApi", () => ({ createPublicMinionClient: () => null }));
vi.mock("../../lib/publicEmbedApi", () => ({ getEmbedForm: vi.fn(), submitEmbed: vi.fn() }));
vi.mock("../../lib/publicDocumentsApi", () => ({
  uploadEmbedDocument: vi.fn(),
  listEmbedDocuments: vi.fn(),
  deleteEmbedDocument: vi.fn(),
  linkEmbedDocuments: vi.fn(),
}));

const embed = vi.mocked(embedApi);

const TERMS = "I agree to the Acme terms at https://acme.example/terms and consent to processing.";

function schema(consent?: { enabled: boolean; text: string }) {
  return JSON.stringify({
    root: ["a"],
    entities: { a: { id: "a", type: "textField", attributes: { key: "fullName", label: "Full name" } } },
    ...(consent ? { settings: { consent } } : {}),
  });
}

const consentBox = () => screen.queryByRole("checkbox", { name: /acme terms/i });

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/full name/i), "Ada");
  await user.click(screen.getByRole("button", { name: /submit/i }));
}

describe("Consent on the public embed surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embed.submitEmbed.mockResolvedValue({ ok: true, instanceId: "i1" });
  });

  it("is absent entirely on a form that doesn't ask for it", async () => {
    embed.getEmbedForm.mockResolvedValue({ code: "F1", title: "Intake", version: 1, schema: schema() });
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/agreement/i)).not.toBeInTheDocument();
  });

  it("shows the statement published with the served version, with its URL made clickable", async () => {
    embed.getEmbedForm.mockResolvedValue({
      code: "F1", title: "Intake", version: 1, schema: schema({ enabled: true, text: TERMS }),
    });
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);

    expect(consentBox()).toBeInTheDocument();
    expect(consentBox()).not.toBeChecked();
    const link = screen.getByRole("link", { name: "https://acme.example/terms" });
    expect(link).toHaveAttribute("href", "https://acme.example/terms");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("blocks submit until agreed, and says why", async () => {
    const user = userEvent.setup();
    embed.getEmbedForm.mockResolvedValue({
      code: "F1", title: "Intake", version: 1, schema: schema({ enabled: true, text: TERMS }),
    });
    render(<FormEmbedView token="tok" />);
    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/accept this before the form can be submitted/i);
    expect(embed.submitEmbed).not.toHaveBeenCalled();
  });

  it("submits with consentAgreed once the box is ticked, and clears the error", async () => {
    const user = userEvent.setup();
    embed.getEmbedForm.mockResolvedValue({
      code: "F1", title: "Intake", version: 1, schema: schema({ enabled: true, text: TERMS }),
    });
    render(<FormEmbedView token="tok" />);
    await fillAndSubmit(user); // refused first
    await screen.findByRole("alert");

    await user.click(consentBox()!);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // ticking clears the complaint
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(embed.submitEmbed).toHaveBeenCalled());
    // 4th argument is the consent tick — the WORDING is never sent, the server resolves it.
    expect(embed.submitEmbed.mock.calls[0]![3]).toBe(true);
  });

  it("sends consentAgreed=false on a form with no consent, rather than omitting it", async () => {
    // The server treats absent as "not agreed" and refuses a consent-requiring form. Sending an explicit
    // false keeps the contract unambiguous instead of relying on that default.
    const user = userEvent.setup();
    embed.getEmbedForm.mockResolvedValue({ code: "F1", title: "Intake", version: 1, schema: schema() });
    render(<FormEmbedView token="tok" />);
    await fillAndSubmit(user);

    await waitFor(() => expect(embed.submitEmbed).toHaveBeenCalled());
    expect(embed.submitEmbed.mock.calls[0]![3]).toBe(false);
  });

  it("falls back to the standard statement when a form enables consent with no wording", async () => {
    // A hand-edited schema must not be able to silently waive the requirement — the server substitutes
    // the same default, so the filler agrees to exactly what gets recorded.
    embed.getEmbedForm.mockResolvedValue({
      code: "F1", title: "Intake", version: 1, schema: schema({ enabled: true, text: "  " }),
    });
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);
    expect(screen.getByRole("checkbox", { name: /information I have provided is accurate/i })).toBeInTheDocument();
  });
});
