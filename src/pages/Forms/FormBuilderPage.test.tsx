import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import FormBuilderPage from "./FormBuilderPage";
import * as formsApi from "../../lib/formsApi";

// Read-write FORMS access so the lifecycle actions render.
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1", capabilities: { FORMS: "read-write" } } }),
}));
// Heavy children render nothing — the gate is computed from the loaded schema via the
// REAL form-core validateSchema (not mocked), the same validator the builder's badge uses.
const builderProps: { current: Record<string, unknown> } = { current: {} };
vi.mock("@lukeflow/form-builder", () => ({
  FormBuilder: React.forwardRef((props: Record<string, unknown>) => {
    builderProps.current = props;
    return null;
  }),
}));
vi.mock("../../components/common/PageMeta", () => ({ default: () => null })); // uses react-helmet-async (needs a provider)
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
  saveDraft: vi.fn(),
  updateMeta: vi.fn().mockResolvedValue({}),
  getAudit: vi.fn().mockResolvedValue([]),
  latestVersion: () => 1,
  setOutboundConfig: vi.fn().mockResolvedValue({}),
}));

const mocked = vi.mocked(formsApi);

function form(schema: object, over: Partial<formsApi.StoredForm> = {}): formsApi.StoredForm {
  return {
    id: "f1", code: "C1", name: "Contact", schema: JSON.stringify(schema),
    status: "published", publishedVersion: 1, latestVersion: 1, latestVersionSignedOff: false,
    ...over,
  } as formsApi.StoredForm;
}

// Two fields sharing a key → a blocking "duplicate-key" diagnostic.
const DUP = { root: ["a", "b"], entities: {
  a: { type: "textField", attributes: { key: "dup", label: "A" } },
  b: { type: "textField", attributes: { key: "dup", label: "B" } },
} };
const CLEAN = { root: ["a", "b"], entities: {
  a: { type: "textField", attributes: { key: "a1", label: "A" } },
  b: { type: "textField", attributes: { key: "b1", label: "B" } },
} };

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/forms/f1"]}>
      <Routes><Route path="/forms/:id" element={<FormBuilderPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish a clean default each test (clearAllMocks keeps implementations).
  mocked.checkout.mockResolvedValue({} as formsApi.StoredForm);
});

/**
 * View-only is now readable from the status ICON's accessible name — that is the at-a-glance claim
 * the popover consolidation rests on, so assert it there rather than on the prose that moved inside.
 */
const statusIcon = () => screen.getByRole("button", { name: /^form status:/i });

describe("FormBuilderPage — lifecycle gating", () => {
  it("opens an existing form view-only: Checkout shown, Check in disabled, error chip for a blocking schema", async () => {
    mocked.getForm.mockResolvedValue(form(DUP));
    renderPage();
    // Existing form (has a version) opens view-only — you check out to edit.
    expect(await screen.findByRole("button", { name: /^checkout$/i })).toBeEnabled();
    expect(statusIcon()).toHaveAccessibleName(/view only/i); // state readable without opening anything
    expect(screen.getByRole("button", { name: /check in/i })).toBeDisabled(); // not checked out
    expect(screen.getByText(/\d+ error/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeDisabled();
  });

  it("Checkout enters edit mode — the button flips to Undo checkout and the banner clears", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form(CLEAN));
    renderPage();
    await user.click(await screen.findByRole("button", { name: /^checkout$/i }));
    expect(await screen.findByRole("button", { name: /undo checkout/i })).toBeInTheDocument();
    expect(statusIcon()).not.toHaveAccessibleName(/view only/i); // no longer read-only
  });

  it("shows no error chip for a clean schema", async () => {
    mocked.getForm.mockResolvedValue(form(CLEAN));
    renderPage();
    await screen.findByRole("button", { name: /^checkout$/i });
    expect(screen.queryByText(/\d+ error/i)).not.toBeInTheDocument();
  });

  it("enables Publish only when the latest version is signed off and not already live", async () => {
    // Signed off + not yet published → Publish is actionable (independent of checkout).
    mocked.getForm.mockResolvedValue(form(CLEAN, { latestVersionSignedOff: true, publishedVersion: undefined }));
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /^publish$/i })).toBeEnabled());
    // Sign-off detail lives in the status popover now.
    await userEvent.setup().click(statusIcon());
    expect(await screen.findByText(/sign-off/i)).toBeInTheDocument();
  });

  it("disables Publish (shows 'Published') when the latest version is already the live one", async () => {
    mocked.getForm.mockResolvedValue(form(CLEAN, { latestVersionSignedOff: true, publishedVersion: 1 }));
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /^published$/i })).toBeDisabled());
  });

  it("publishing drops back to view-only — same as a page refresh", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form(CLEAN, { latestVersionSignedOff: true, publishedVersion: undefined }));
    renderPage();
    // Enter an editing session, then publish the signed-off version.
    await user.click(await screen.findByRole("button", { name: /^checkout$/i }));
    expect(await screen.findByRole("button", { name: /undo checkout/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^publish$/i }));
    // Back to view-only: Checkout returns and the view-only banner is shown again.
    expect(await screen.findByRole("button", { name: /^checkout$/i })).toBeInTheDocument();
    expect(statusIcon()).toHaveAccessibleName(/view only/i);
    await waitFor(() => expect(mocked.publishVersion).toHaveBeenCalledWith("t1", "f1", 1));
  });
});

describe("FormBuilderPage — settings modal", () => {
  it("checks out, edits the name, persists via updateMeta, and the metadata change re-enables Check in", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form(CLEAN)); // name "Contact", no description
    renderPage();

    // Editing settings is part of the edit lifecycle now — check out first (view-only disables them).
    await user.click(await screen.findByRole("button", { name: /^checkout$/i }));
    expect(await screen.findByRole("button", { name: /undo checkout/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /form settings/i })); // the gear
    const nameInput = await screen.findByDisplayValue("Contact"); // seeded from the saved form
    fireEvent.change(nameInput, { target: { value: "Contact Form" } });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mocked.updateMeta).toHaveBeenCalledWith("t1", "f1", { name: "Contact Form", description: "" }),
    );
    // A metadata change dirties the draft, so Check in is actionable again.
    await waitFor(() => expect(screen.getByRole("button", { name: /check in/i })).toBeEnabled());
  });

  it("view-only disables the settings fields and hides Save", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form(CLEAN));
    renderPage();

    await user.click(await screen.findByRole("button", { name: /form settings/i })); // open settings (still view-only)
    expect(await screen.findByDisplayValue("Contact")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/check the form out/i)).toBeInTheDocument();
  });
});

describe("FormBuilderPage — edit-lock take-over", () => {
  it("shows the 'being edited' banner when another user holds the lock, and takes over on click", async () => {
    const user = userEvent.setup();
    // Initial checkout fails (someone else holds it); a forced take-over succeeds.
    mocked.checkout.mockImplementation((_t: string, _i: string, force?: boolean) =>
      force ? Promise.resolve({} as formsApi.StoredForm) : Promise.reject(new Error("409")));
    mocked.getForm.mockResolvedValue({ ...form(CLEAN), lockedBy: "workos:alice" } as formsApi.StoredForm);
    renderPage();

    expect(await screen.findByText(/being edited by/i)).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument(); // workos: prefix stripped
    await user.click(screen.getByRole("button", { name: /take over/i }));

    await waitFor(() => expect(mocked.checkout).toHaveBeenCalledWith("t1", "f1", true));
    await waitFor(() => expect(screen.queryByText(/being edited by/i)).not.toBeInTheDocument());
  });
});

describe("FormBuilderPage — the Data view is outbound-only", () => {
  const settled = async () => {
    await screen.findByRole("button", { name: /^checkout$/i });
    return builderProps.current as {
      hideDataView?: boolean;
      dataAnnotations?: {
        options: { id: string }[];
        modifier?: { id: string; under: string };
        value: Record<string, string>;
        onChange: (key: string, role: string) => void;
      };
      dataMetadata?: { key: string }[];
    };
  };

  it("hides it for an INBOUND form", async () => {
    // One filler, so there is nothing to divide the data between — the view has nothing to say.
    mocked.getForm.mockResolvedValue(form(CLEAN, { kind: "INBOUND" }));
    renderPage();
    const p = await settled();
    expect(p.hideDataView).toBe(true);
    expect(p.dataAnnotations).toBeUndefined();
  });

  it("shows it, annotated, for an OUTBOUND form", async () => {
    mocked.getForm.mockResolvedValue(form(CLEAN, { kind: "OUTBOUND" }));
    renderPage();
    const p = await settled();
    expect(p.hideDataView).toBe(false);
    // Exactly two answers — the engine's third role is offered as a qualifier, not a third option.
    expect(p.dataAnnotations!.options.map((o) => o.id)).toEqual(["PREPARER", "RECIPIENT"]);
    expect(p.dataAnnotations!.modifier).toMatchObject({ id: "EITHER", under: "PREPARER" });
  });

  it("seeds every variable from its EFFECTIVE role, not the (empty) stored map", async () => {
    // A form authored before roles existed has no entries at all; showing them as unassigned would
    // misreport how the form already behaves.
    mocked.getForm.mockResolvedValue(form(CLEAN, { kind: "OUTBOUND" }));
    renderPage();
    const p = await settled();
    expect(Object.keys(p.dataAnnotations!.value).sort()).toEqual(["a1", "b1"]);
  });

  it("persists a pick immediately, carrying the OTHER fields' roles with it", async () => {
    // Saving one key alone would freeze the rest at whatever they happened to derive to, silently.
    mocked.getForm.mockResolvedValue(form(CLEAN, { kind: "OUTBOUND" }));
    renderPage();
    const p = await settled();

    p.dataAnnotations!.onChange("a1", "PREPARER");

    await waitFor(() => expect(mocked.setOutboundConfig).toHaveBeenCalled());
    const sent = mocked.setOutboundConfig.mock.calls[0]![2] as Record<string, string>;
    expect(sent.a1).toBe("PREPARER");
    expect(Object.keys(sent).sort()).toEqual(["a1", "b1"]);
  });

  it("lists what the engine always records, so the contract shown is the whole contract", async () => {
    mocked.getForm.mockResolvedValue(form(CLEAN, { kind: "OUTBOUND" }));
    renderPage();
    const p = await settled();
    const keys = (p.dataMetadata ?? []).map((m) => m.key);
    expect(keys).toContain("submittedBy.at");
    expect(keys).toContain("consent");
  });
});
