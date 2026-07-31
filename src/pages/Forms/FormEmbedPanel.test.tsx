import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormEmbedPanel from "./FormEmbedPanel";
import * as formsApi from "../../lib/formsApi";

vi.mock("../../lib/formsApi", () => ({
  getEmbedToken: vi.fn(),
  rotateEmbedToken: vi.fn(),
  updateMeta: vi.fn(),
  // The panel also loads which version embeds serve + where the form is observed embedded. Those are
  // covered in FormEmbedPanel.versions.test.tsx; here they only need to resolve so this file keeps
  // testing the snippet/allowlist/rotation behaviour it is about.
  getEmbedVersion: vi.fn(),
  listEmbedSites: vi.fn(),
  setEmbedVersion: vi.fn(),
  setSubmissionHandling: vi.fn(),
}));

const mocked = vi.mocked(formsApi);
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  mocked.getEmbedVersion.mockResolvedValue({
    mode: "AUTO", pinnedVersion: null, publishedVersion: 1, servingVersion: 1, updateAvailable: false,
  });
  mocked.listEmbedSites.mockResolvedValue([]);
});

function renderOpen() {
  const onClose = vi.fn();
  render(<FormEmbedPanel open onClose={onClose} tenant="t1" formId="f1" />);
  return { onClose };
}

/** The dialog is tabbed; the allowlist lives behind "Websites". */
async function openWebsites(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("tab", { name: /websites/i }));
}

describe("FormEmbedPanel", () => {
  it("mints a token on open and shows the snippet + saved websites", async () => {
    mocked.getEmbedToken.mockResolvedValue({
      token: "tok_abc", code: "C1",
      allowedEmbedOrigins: "https://acme.com",
      embedOriginNames: { "https://acme.com": "Acme main site" },
    });
    const user = userEvent.setup();
    renderOpen();
    await waitFor(() => expect(mocked.getEmbedToken).toHaveBeenCalledWith("t1", "f1"));
    // The Snippet tab opens first, carrying the token + the auto-mount attribute.
    expect(await screen.findByText(/data-lukeform-token="tok_abc"/)).toBeInTheDocument();

    // Allowlist seeded from the response, as NAMED rows rather than a blob of text.
    await openWebsites(user);
    expect(screen.getByLabelText(/website 1 address/i)).toHaveValue("https://acme.com");
    expect(screen.getByLabelText(/website 1 name/i)).toHaveValue("Acme main site");
  });

  it("shows an origin with no stored label as an unnamed row, not a blank list", async () => {
    mocked.getEmbedToken.mockResolvedValue({ token: "t", code: "C1", allowedEmbedOrigins: "https://acme.com" });
    const user = userEvent.setup();
    renderOpen();
    await openWebsites(user);
    expect(screen.getByLabelText(/website 1 address/i)).toHaveValue("https://acme.com");
    expect(screen.getByLabelText(/website 1 name/i)).toHaveValue("");
  });

  it("adds and removes rows", async () => {
    mocked.getEmbedToken.mockResolvedValue({ token: "t", code: "C1", allowedEmbedOrigins: "https://acme.com" });
    const user = userEvent.setup();
    renderOpen();
    await openWebsites(user);

    await user.click(screen.getByRole("button", { name: /add another/i }));
    expect(screen.getByLabelText(/website 2 address/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove website 2/i }));
    expect(screen.queryByLabelText(/website 2 address/i)).not.toBeInTheDocument();
  });

  it("refuses to save a malformed website, and says which row", async () => {
    // The engine fails this closed with a generic 400; naming the row is friendlier, and it keeps a
    // typo from looking saved while the site it meant to allow stays blocked.
    mocked.getEmbedToken.mockResolvedValue({ token: "t", code: "C1", allowedEmbedOrigins: "" });
    const user = userEvent.setup();
    renderOpen();
    await openWebsites(user);

    await user.type(screen.getByLabelText(/website 1 address/i), "acme.com");
    expect(screen.getByRole("button", { name: /save websites/i })).toBeDisabled();
    expect(screen.getByLabelText(/website 1 address/i)).toHaveAttribute("aria-invalid", "true");
    expect(mocked.updateMeta).not.toHaveBeenCalled();
  });

  it("copies the snippet to the clipboard", async () => {
    mocked.getEmbedToken.mockResolvedValue({ token: "tok_abc", code: "C1" });
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub — reassert ours so the
    // component writes to the mock we assert on.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderOpen();
    await user.click(await screen.findByRole("button", { name: /copy snippet/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('data-lukeform-token="tok_abc"'));
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("saves name + website and reflects the canonical stored value", async () => {
    mocked.getEmbedToken.mockResolvedValue({ token: "tok_abc", code: "C1", allowedEmbedOrigins: "" });
    mocked.updateMeta.mockResolvedValue({
      allowedEmbedOrigins: "https://acme.com",
      embedOriginNames: { "https://acme.com": "Acme main site" },
    });
    const user = userEvent.setup();
    renderOpen();
    await openWebsites(user);

    await user.type(screen.getByLabelText(/website 1 name/i), "Acme main site");
    await user.type(screen.getByLabelText(/website 1 address/i), "https://ACME.com");
    await user.click(screen.getByRole("button", { name: /save websites/i }));

    // The label is keyed by the CANONICAL origin — keyed by the typed casing the server would drop it.
    await waitFor(() => expect(mocked.updateMeta).toHaveBeenCalledWith("t1", "f1", {
      allowedEmbedOrigins: "https://acme.com",
      embedOriginNames: { "https://acme.com": "Acme main site" },
    }));
    await waitFor(() => expect(screen.getByLabelText(/website 1 address/i)).toHaveValue("https://acme.com"));
  });

  it("rotates the token only after confirming in the modal (no window.confirm)", async () => {
    mocked.getEmbedToken.mockResolvedValue({ token: "tok_old", code: "C1" });
    mocked.rotateEmbedToken.mockResolvedValue({ token: "tok_new", code: "C1" });
    const user = userEvent.setup();
    renderOpen();
    await screen.findByText(/data-lukeform-token="tok_old"/);

    // The toolbar button opens a confirmation modal — it does NOT rotate yet.
    await user.click(screen.getByRole("button", { name: /^regenerate link$/i }));
    expect(await screen.findByText(/regenerate embed link\?/i)).toBeInTheDocument();
    expect(mocked.rotateEmbedToken).not.toHaveBeenCalled();

    // Two "Regenerate link" buttons now exist; the confirm modal's is the last one.
    const buttons = screen.getAllByRole("button", { name: /^regenerate link$/i });
    await user.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(mocked.rotateEmbedToken).toHaveBeenCalledWith("t1", "f1"));
    expect(await screen.findByText(/data-lukeform-token="tok_new"/)).toBeInTheDocument();
  });

  it("Cancel in the regenerate modal does not rotate the token", async () => {
    mocked.getEmbedToken.mockResolvedValue({ token: "tok_old", code: "C1" });
    const user = userEvent.setup();
    renderOpen();
    await screen.findByText(/data-lukeform-token="tok_old"/);
    await user.click(screen.getByRole("button", { name: /^regenerate link$/i }));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));
    expect(mocked.rotateEmbedToken).not.toHaveBeenCalled();
  });
});
