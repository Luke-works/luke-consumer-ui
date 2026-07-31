import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormEmbedPanel from "./FormEmbedPanel";
import * as formsApi from "../../lib/formsApi";

vi.mock("../../lib/formsApi", () => ({
  getEmbedToken: vi.fn(),
  getEmbedVersion: vi.fn(),
  listEmbedSites: vi.fn(),
  rotateEmbedToken: vi.fn(),
  setEmbedVersion: vi.fn(),
  setSubmissionHandling: vi.fn(),
  updateMeta: vi.fn(),
}));

const api = vi.mocked(formsApi);

function open(props: Partial<React.ComponentProps<typeof FormEmbedPanel>> = {}) {
  return render(
    <FormEmbedPanel
      open
      onClose={() => {}}
      tenant="t1"
      formId="f1"
      publishedVersion={6}
      submissionHandling="COLLECT"
      {...props}
    />,
  );
}

/** The dialog is tabbed — open it and switch to the section under test. */
async function openTab(name: RegExp) {
  const user = userEvent.setup();
  open();
  await user.click(await screen.findByRole("tab", { name }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getEmbedToken.mockResolvedValue({ token: "tok_1", code: "FM-1", allowedEmbedOrigins: "https://acme.com" });
  api.listEmbedSites.mockResolvedValue([]);
  api.getEmbedVersion.mockResolvedValue({
    mode: "AUTO", pinnedVersion: null, publishedVersion: 6, servingVersion: 6, updateAvailable: false,
  });
});

describe("Embed panel — which version visitors see", () => {
  it("shows the live and latest-published versions", async () => {
    await openTab(/version/i);
    // Both figures are stated, because "live" and "latest published" can differ once pinned.
    const block = await screen.findByRole("tabpanel");
    expect(block.textContent).toMatch(/Live now:\s*v6/);
    expect(block.textContent).toMatch(/Latest published:\s*v6/);
    expect(screen.queryByRole("button", { name: /update embeds/i })).not.toBeInTheDocument();
  });

  it("offers 'Update embeds to vN' only when fillers are behind, and pins on click", async () => {
    api.getEmbedVersion.mockResolvedValue({
      mode: "PINNED", pinnedVersion: 3, publishedVersion: 6, servingVersion: 3, updateAvailable: true,
    });
    api.setEmbedVersion.mockResolvedValue({
      mode: "PINNED", pinnedVersion: 6, publishedVersion: 6, servingVersion: 6, updateAvailable: false,
    });
    const user = await openTab(/version/i);

    expect(await screen.findByText(/new version ready/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /update embeds to v6/i }));

    await waitFor(() => expect(api.setEmbedVersion).toHaveBeenCalledWith("t1", "f1", "PINNED", 6));
    // Once updated, the prompt is gone — the UI reflects the server's new answer, not the click.
    await waitFor(() => expect(screen.queryByRole("button", { name: /update embeds/i })).not.toBeInTheDocument());
  });

  it("switches to 'always serve the latest'", async () => {
    api.getEmbedVersion.mockResolvedValue({
      mode: "PINNED", pinnedVersion: 3, publishedVersion: 6, servingVersion: 3, updateAvailable: true,
    });
    api.setEmbedVersion.mockResolvedValue({
      mode: "AUTO", pinnedVersion: null, publishedVersion: 6, servingVersion: 6, updateAvailable: false,
    });
    const user = await openTab(/version/i);

    await user.click(await screen.findByRole("radio", { name: /always serve the latest/i }));
    await waitFor(() => expect(api.setEmbedVersion).toHaveBeenCalledWith("t1", "f1", "AUTO", undefined));
  });

  it("pins to what is currently live when the author chooses to hold", async () => {
    api.setEmbedVersion.mockResolvedValue({
      mode: "PINNED", pinnedVersion: 6, publishedVersion: 6, servingVersion: 6, updateAvailable: false,
    });
    const user = await openTab(/version/i);

    await user.click(await screen.findByRole("radio", { name: /hold on a version i choose/i }));
    // Holding must freeze the version people are seeing RIGHT NOW, not silently jump anywhere.
    await waitFor(() => expect(api.setEmbedVersion).toHaveBeenCalledWith("t1", "f1", "PINNED", 6));
  });

  it("keeps the panel usable when the version state can't be loaded", async () => {
    api.getEmbedVersion.mockRejectedValue(new Error("boom"));
    const user = await openTab(/version/i);
    // The snippet is the point of this modal; version control is additive and must not block it.
    expect(await screen.findByText(/aren’t available for this form/i)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /snippet/i }));
    expect(await screen.findByRole("button", { name: /copy snippet/i })).toBeInTheDocument();
  });
});

describe("Embed panel — where the form is embedded", () => {
  it("lists observed sites with a warning for ones the allowlist blocks", async () => {
    api.listEmbedSites.mockResolvedValue([
      { origin: "https://acme.com", firstSeenAt: 1, lastSeenAt: Date.parse("2026-07-30T10:00:00Z"), renderCount: 12, allowed: true },
      { origin: "https://partner.io", firstSeenAt: 1, lastSeenAt: Date.parse("2026-07-28T10:00:00Z"), renderCount: 3, allowed: false },
    ]);
    await openTab(/websites/i);

    // Scope to the observed section: the same origin also appears in the allowlist rows, so a
    // page-wide text query would be ambiguous rather than wrong.
    const section = (await screen.findByText(/^Seen embedding this form$/)).parentElement!;
    const list = await waitFor(() => {
      const ul = section.querySelector("ul");
      if (!ul) throw new Error("site list not rendered yet");
      return ul;
    });
    expect(list.textContent).toContain("https://acme.com");
    expect(list.textContent).toContain("https://partner.io");
    // The one outside the allowlist is called out — the browser is blocking it, which is worth knowing —
    // and the allowed one is NOT flagged.
    expect(list.querySelectorAll("span[title]")).toHaveLength(1);
    expect(list.textContent).toContain("Not allowed");
  });

  it("explains the empty state rather than showing nothing", async () => {
    await openTab(/websites/i);
    expect(await screen.findByText(/no sites seen yet/i)).toBeInTheDocument();
  });

  it("is honest that the list is observed and sampled", async () => {
    await openTab(/websites/i);
    // This matters: an author must not read this as a complete audit of where their form is live.
    expect(await screen.findByText(/sampled|treat it as a guide/i)).toBeInTheDocument();
  });
});
