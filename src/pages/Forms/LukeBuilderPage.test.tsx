import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
    <MemoryRouter initialEntries={["/forms/f1/build-v2"]}>
      <Routes><Route path="/forms/:id/build-v2" element={<LukeBuilderPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

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
