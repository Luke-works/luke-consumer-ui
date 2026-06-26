import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import LukeBuilderPage from "./LukeBuilderPage";
import * as formsApi from "../../lib/formsApi";

// Read-write FORMS access so the lifecycle actions render.
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1", capabilities: { FORMS: "read-write" } } }),
}));
// Heavy children render nothing — the gate is computed from the loaded schema via the
// REAL form-core validateSchema (not mocked), the same validator the builder's badge uses.
vi.mock("@lukeflow/form-builder", () => ({ FormBuilder: React.forwardRef(() => null) }));
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
}));

const mocked = vi.mocked(formsApi);

function form(schema: object): formsApi.StoredForm {
  return {
    id: "f1", code: "C1", name: "Contact", schema: JSON.stringify(schema),
    status: "published", publishedVersion: 1, latestVersion: 1,
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
      <Routes><Route path="/forms/:id" element={<LukeBuilderPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish a clean default each test (clearAllMocks keeps implementations).
  mocked.checkout.mockResolvedValue({} as formsApi.StoredForm);
});

describe("LukeBuilderPage — problems gating", () => {
  it("disables Check in / Publish and shows an error chip for a blocking schema", async () => {
    mocked.getForm.mockResolvedValue(form(DUP));
    renderPage();
    const checkIn = await screen.findByRole("button", { name: /check in/i });
    expect(checkIn).toBeDisabled();
    expect(screen.getByRole("button", { name: /publish/i })).toBeDisabled();
    expect(screen.getByText(/\d+ error/i)).toBeInTheDocument();
  });

  it("enables Check in and shows no error chip for a clean schema", async () => {
    mocked.getForm.mockResolvedValue(form(CLEAN));
    renderPage();
    const checkIn = await screen.findByRole("button", { name: /check in/i });
    expect(checkIn).toBeEnabled();
    expect(screen.queryByText(/\d+ error/i)).not.toBeInTheDocument();
  });
});

describe("LukeBuilderPage — settings modal", () => {
  it("opens settings from the name, edits the name, and persists via updateMeta", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form(CLEAN)); // name "Contact", no description
    renderPage();

    await user.click(await screen.findByRole("button", { name: /contact/i })); // form-name button
    const nameInput = await screen.findByDisplayValue("Contact"); // seeded from the saved form
    fireEvent.change(nameInput, { target: { value: "Contact Form" } });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mocked.updateMeta).toHaveBeenCalledWith("t1", "f1", { name: "Contact Form", description: "" }),
    );
  });
});

describe("LukeBuilderPage — edit-lock take-over", () => {
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
