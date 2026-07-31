import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import FormBuilderPage from "./FormBuilderPage";
import * as formsApi from "../../lib/formsApi";
import { CONSENT_DEFAULT_TEXT } from "../../lib/formSchema";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1", capabilities: { FORMS: "read-write" } } }),
}));
vi.mock("@lukeflow/form-builder", () => ({ FormBuilder: React.forwardRef(() => null) }));
vi.mock("../../components/common/PageMeta", () => ({ default: () => null }));
vi.mock("./AiAssistPanel", () => ({ default: () => null }));
vi.mock("./FormTestPanel", () => ({ default: () => null }));
vi.mock("./FormEmbedPanel", () => ({ default: () => null }));
vi.mock("../../components/formBuilder/LukeFormRenderer", () => ({ default: () => null }));
vi.mock("../../lib/formsApi", () => ({
  getForm: vi.fn(),
  checkout: vi.fn().mockResolvedValue({}),
  release: vi.fn().mockResolvedValue({}),
  checkIn: vi.fn(),
  publishVersion: vi.fn(),
  discardDraft: vi.fn(),
  saveDraft: vi.fn().mockResolvedValue({}),
  updateMeta: vi.fn().mockResolvedValue({}),
  getAudit: vi.fn().mockResolvedValue([]),
  latestVersion: () => 1,
}));

const mocked = vi.mocked(formsApi);

const CLEAN = { root: ["a"], entities: { a: { type: "textField", attributes: { key: "a1", label: "A" } } } };

function form(settings?: object): formsApi.StoredForm {
  return {
    id: "f1", code: "C1", name: "Contact",
    schema: JSON.stringify(settings ? { ...CLEAN, settings } : CLEAN),
    status: "published", publishedVersion: 1, latestVersion: 1, latestVersionSignedOff: true,
    showBranding: true, brandingLocked: true,
  } as formsApi.StoredForm;
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/forms/f1"]}>
      <Routes><Route path="/forms/:id" element={<FormBuilderPage />} /></Routes>
    </MemoryRouter>,
  );
}

/** Open Form settings → Legal. `checkout` first unless testing the read-only path. */
async function openLegal(user: ReturnType<typeof userEvent.setup>, { checkout = true } = {}) {
  if (checkout) await user.click(await screen.findByRole("button", { name: /^checkout$/i }));
  await user.click(await screen.findByRole("button", { name: /form settings/i }));
  await user.click(await screen.findByRole("tab", { name: /legal/i }));
}

const requireBox = () => screen.getByRole("checkbox", { name: /require the filler to accept/i });

/** The `settings` object of the most recent autosaved draft. */
function lastSavedSettings(): Record<string, unknown> {
  const calls = mocked.saveDraft.mock.calls;
  const raw = calls[calls.length - 1]![2] as string;
  return JSON.parse(raw).settings;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.checkout.mockResolvedValue({} as formsApi.StoredForm);
  mocked.saveDraft.mockResolvedValue({} as never);
});

describe("Form settings — Legal tab (the consent record)", () => {
  it("is off by default, and always lists what gets recorded regardless", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form());
    renderPage();
    await openLegal(user);

    expect(requireBox()).not.toBeChecked();
    expect(screen.queryByLabelText(/agreement statement/i)).not.toBeInTheDocument();
    // The IP / device / door capture is unconditional, so it's stated whether or not consent is on.
    expect(screen.getByText(/always recorded, on every form/i)).toBeInTheDocument();
    expect(screen.getByText(/IP address and device/i)).toBeInTheDocument();
  });

  it("seeds the standard statement when switched on, so it can never mean 'agree to nothing'", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form());
    renderPage();
    await openLegal(user);

    await user.click(requireBox());

    expect(await screen.findByDisplayValue(CONSENT_DEFAULT_TEXT)).toBeInTheDocument();
    await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalled(), { timeout: 3000 });
    expect(lastSavedSettings().consent).toEqual({ enabled: true, text: CONSENT_DEFAULT_TEXT });
  });

  it("persists the author's own wording into the versioned schema", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form({ consent: { enabled: true, text: "Old wording" } }));
    renderPage();
    await openLegal(user);

    const box = await screen.findByDisplayValue("Old wording");
    await user.clear(box);
    await user.type(box, "I accept the Acme MSA.");

    await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(lastSavedSettings().consent).toEqual({
      enabled: true,
      text: "I accept the Acme MSA.",
    }), { timeout: 3000 });
  });

  it("writes enabled:false when switched off, rather than dropping the key", async () => {
    // Regression fence. The serializer spreads the existing settings, so omitting `consent` when it's off
    // would carry the old value forward — the requirement would look removed in the builder while the
    // published form kept demanding agreement.
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form({ consent: { enabled: true, text: "Old wording" } }));
    renderPage();
    await openLegal(user);

    expect(requireBox()).toBeChecked();
    await user.click(requireBox());

    await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalled(), { timeout: 3000 });
    expect(lastSavedSettings().consent).toEqual({ enabled: false, text: "Old wording" });
  });

  it("re-gates sign-off: changing what people must accept invalidates the signed-off version", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form()); // latestVersionSignedOff: true
    renderPage();
    await user.click(await screen.findByRole("button", { name: /^checkout$/i }));

    // Sign-off state lives in the status popover. Read it THERE rather than page-wide: with the
    // popover closed a "not in the document" assertion would pass for the wrong reason.
    const signOffRow = async () => {
      await user.click(screen.getByRole("button", { name: /^form status:/i }));
      const panel = await screen.findByRole("dialog", { name: /form status/i });
      const text = within(panel).getByText(/sign-off/i).parentElement!.textContent ?? "";
      await user.keyboard("{Escape}");
      return text;
    };

    // Signed off on load → Publish is live-able.
    expect(await signOffRow()).not.toMatch(/not signed off/i);

    await user.click(await screen.findByRole("button", { name: /form settings/i }));
    await user.click(await screen.findByRole("tab", { name: /legal/i }));
    await user.click(requireBox());
    await user.keyboard("{Escape}"); // close settings so the status icon is reachable again

    // Sign-off is cleared — a wording change cannot reach a live form without going back through it.
    await waitFor(async () => expect(await signOffRow()).toMatch(/not signed off/i));
  });

  it("warns, and shows the substitute, if the author clears the wording", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form({ consent: { enabled: true, text: "Old wording" } }));
    renderPage();
    await openLegal(user);

    await user.clear(await screen.findByDisplayValue("Old wording"));

    expect(await screen.findByText(/uses our standard statement/i)).toBeInTheDocument();
    // The preview shows the real component with the default text, so nothing is a surprise later.
    expect(screen.getByRole("checkbox", { name: /information I have provided is accurate/i })).toBeInTheDocument();
  });

  it("is read-only until the form is checked out", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form({ consent: { enabled: true, text: "Old wording" } }));
    renderPage();
    await openLegal(user, { checkout: false });

    expect(requireBox()).toBeDisabled();
    expect(await screen.findByDisplayValue("Old wording")).toBeDisabled();
    expect(mocked.saveDraft).not.toHaveBeenCalled();
  });
});
