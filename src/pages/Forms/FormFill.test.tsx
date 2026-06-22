import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import FormFill from "./FormFill";
import * as api from "../../lib/formInstancesApi";

// Auth + heavy children stubbed so we can drive autosave deterministically.
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1" } }),
}));
vi.mock("../../components/common/PageMeta", () => ({ default: () => null }));
vi.mock("../../components/formBuilder/SubmissionSuccess", () => ({ default: () => null }));
// Stub the renderer so a click fires the autosave onChange with no real form fields.
vi.mock("../../components/formBuilder/LukeFormRenderer", () => ({
  default: ({ onChange }: { onChange: (d: Record<string, unknown>) => void }) => (
    <button type="button" onClick={() => onChange({ field: "value" })}>
      fire-change
    </button>
  ),
}));
vi.mock("../../lib/formInstancesApi", () => ({
  createInstance: vi.fn(),
  saveInstanceData: vi.fn(),
  submitInstance: vi.fn(),
  isOpen: () => true,
  STATE_LABEL: {},
}));

const mocked = vi.mocked(api);

function openInstance() {
  return {
    instance: { id: "i1", state: "OPEN", definitionCode: "MYFORM", version: 1, prefill: {}, data: {} },
    schema: {},
  } as unknown as api.InstanceView;
}

function renderFill() {
  return render(
    <MemoryRouter initialEntries={["/forms/MYFORM/fill"]}>
      <Routes>
        <Route path="/forms/:code/fill" element={<FormFill />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FormFill autosave", () => {
  beforeEach(() => vi.clearAllMocks());

  it("surfaces an error when autosave fails (no silent data loss)", async () => {
    mocked.createInstance.mockResolvedValue(openInstance());
    mocked.saveInstanceData.mockRejectedValue(new Error("network down"));

    renderFill();
    await userEvent.click(await screen.findByText("fire-change"));

    await waitFor(() => expect(screen.getByText(/couldn.t save/i)).toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(mocked.saveInstanceData).toHaveBeenCalled();
  });

  it("shows Saved when autosave succeeds", async () => {
    mocked.createInstance.mockResolvedValue(openInstance());
    mocked.saveInstanceData.mockResolvedValue(undefined as never);

    renderFill();
    await userEvent.click(await screen.findByText("fire-change"));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument(), { timeout: 2000 });
  });
});
