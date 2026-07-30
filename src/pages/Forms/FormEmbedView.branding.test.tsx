import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import FormEmbedView from "./FormEmbedView";
import FormRespondView from "./FormRespondView";
import * as embedApi from "../../lib/publicEmbedApi";
import * as instanceApi from "../../lib/publicInstanceApi";

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
vi.mock("../../lib/publicInstanceApi", () => ({
  getRespondForm: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  submitRespond: vi.fn(),
}));

const embed = vi.mocked(embedApi);
const instances = vi.mocked(instanceApi);

const SCHEMA = JSON.stringify({
  root: ["a"],
  entities: { a: { id: "a", type: "textField", attributes: { key: "fullName", label: "Full name" } } },
});

/** The badge is one link with a stable accessible name. */
const badge = () => screen.queryByRole("link", { name: /developed at lukeflow/i });

describe("“Developed at Lukeflow” badge on the public embed surface", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders under the form when the server says to show it", async () => {
    embed.getEmbedForm.mockResolvedValue({
      code: "F1", title: "Intake", version: 1, schema: SCHEMA, showBranding: true,
    });
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);

    const link = badge()!;
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", expect.stringContaining("lukeflow.com"));
    expect(link).toHaveAttribute("href", expect.stringContaining("utm_medium=embed"));
    expect(link).toHaveAttribute("target", "_blank");
    // Never expose the embedding site's referrer / window handle to the marketing site.
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("is absent when a paying tenant switched it off", async () => {
    embed.getEmbedForm.mockResolvedValue({
      code: "F1", title: "Intake", version: 1, schema: SCHEMA, showBranding: false,
    });
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);
    expect(badge()).not.toBeInTheDocument();
  });

  it("shows for an engine that predates the flag only when it says so (no client-side guessing)", async () => {
    // The field is optional in the payload type; absent must NOT render a badge the server didn't ask
    // for — visibility is the server's decision, never the browser's.
    embed.getEmbedForm.mockResolvedValue({ code: "F1", title: "Intake", version: 1, schema: SCHEMA });
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);
    expect(badge()).not.toBeInTheDocument();
  });

  it("is inside the element the iframe host measures, so it can't be cropped", async () => {
    // Regression fence: the embed reports its height from the element connectEmbedFrame() is given.
    // If the badge were a sibling of that element, hosts would clip it.
    embed.getEmbedForm.mockResolvedValue({
      code: "F1", title: "Intake", version: 1, schema: SCHEMA, showBranding: true,
    });
    const { container } = render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);

    // The measured wrapper is the max-w-[640px] box that also holds the card.
    const measured = container.querySelector<HTMLElement>(".max-w-\\[640px\\]")!;
    expect(measured).toBeTruthy();
    expect(measured.contains(badge()!)).toBe(true);
  });

  it("does not advertise on the loading or error shell", async () => {
    embed.getEmbedForm.mockRejectedValue(new Error("This form link is invalid or no longer available."));
    render(<FormEmbedView token="tok" />);
    await screen.findByText(/invalid or no longer available/i);
    expect(badge()).not.toBeInTheDocument();
  });
});

describe("“Developed at Lukeflow” badge on the outbound respond surface", () => {
  beforeEach(() => vi.clearAllMocks());

  it("appears once the recipient is verified, tagged to the respond surface", async () => {
    instances.requestOtp.mockResolvedValue({ sentTo: "a@b.com" });
    instances.verifyOtp.mockResolvedValue({ accessToken: "at" });
    instances.getRespondForm.mockResolvedValue({
      code: "F1", name: "Renewal", version: 1, schema: SCHEMA,
      prefill: {}, data: {}, outboundRoles: {}, recipient: {}, state: "SENT", showBranding: true,
    });

    render(<FormRespondView token="inv_1" />);
    // The OTP challenge has no form payload yet → nothing to attribute.
    expect(badge()).not.toBeInTheDocument();

    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.click(screen.getByRole("button", { name: /email me a code/i }));
    await userEvent.type(await screen.findByPlaceholderText("123456"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await waitFor(() => expect(badge()).toBeInTheDocument());
    expect(badge()).toHaveAttribute("href", expect.stringContaining("utm_medium=respond"));
  });
});
