import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormTestPanel from "./FormTestPanel";
import * as formsApi from "../../lib/formsApi";
import * as agentApi from "../../lib/formAgentApi";

// Stub the renderer: each instance exposes pass/fail buttons that fire onResult, so we
// can drive verdicts deterministically without a real form engine. The positive renderer
// is mounted before the negative one, so getAllByText(...)[0] targets the positive run.
vi.mock("../../components/formBuilder/LukeFormRenderer", () => ({
  default: ({ onResult }: { onResult?: (r: { ok: boolean; errorCount: number; errorKeys: string[] }) => void }) => (
    <div>
      <button type="button" onClick={() => onResult?.({ ok: true, errorCount: 0, errorKeys: [] })}>res-pass</button>
      <button type="button" onClick={() => onResult?.({ ok: false, errorCount: 1, errorKeys: ["email"] })}>res-fail</button>
    </div>
  ),
}));
vi.mock("./CapabilityBuildingAnimation", () => ({ default: () => null }));
vi.mock("../../components/branding/LukeTestsMark", () => ({ default: () => null }));
vi.mock("../../lib/formsApi", () => ({ signOffTest: vi.fn() }));
vi.mock("../../lib/formAgentApi", () => ({ generateSchema: vi.fn(), generateTestData: vi.fn() }));

const mockedForms = vi.mocked(formsApi);
const mockedAgent = vi.mocked(agentApi);

// A schema with no negatively-testable fields → negative run is "n/a", so sign-off
// hinges purely on a clean positive run (keeps these assertions to one axis).
const EMPTY_JSON = JSON.stringify({ root: [], entities: {} });

function renderPanel(over: Partial<React.ComponentProps<typeof FormTestPanel>> = {}) {
  const onClose = vi.fn();
  const onApplyAiSchema = vi.fn();
  const onSignedOff = vi.fn();
  render(
    <FormTestPanel
      open
      onClose={onClose}
      tenant="t1"
      formId="f1"
      formName="Contact"
      canEdit
      getJson={() => EMPTY_JSON}
      onApplyAiSchema={onApplyAiSchema}
      onSignedOff={onSignedOff}
      {...over}
    />,
  );
  return { onClose, onApplyAiSchema, onSignedOff };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FormTestPanel", () => {
  it("gates sign-off until the positive run passes, then signs off", async () => {
    const user = userEvent.setup();
    mockedForms.signOffTest.mockResolvedValue({ lastTestedAt: 1717000000000 } as formsApi.StoredForm);
    const { onClose, onSignedOff } = renderPanel();

    // Before any result, sign-off is disabled.
    const signOff = screen.getByRole("button", { name: /sign off/i });
    expect(signOff).toBeDisabled();

    // Fire the POSITIVE renderer's pass result.
    await user.click(screen.getAllByText("res-pass")[0]);

    await waitFor(() => expect(signOff).toBeEnabled());
    await user.click(signOff);

    await waitFor(() => expect(mockedForms.signOffTest).toHaveBeenCalledWith("t1", "f1"));
    expect(onSignedOff).toHaveBeenCalledWith(1717000000000);
    expect(onClose).toHaveBeenCalled();
  });

  it("offers an AI fix on a failing positive run and applies it via the handle", async () => {
    const user = userEvent.setup();
    const fixed = { entities: {}, root: [] };
    mockedAgent.generateSchema.mockResolvedValue({ schema: fixed, title: "Contact", brain: "x" } as agentApi.AgentResult);
    const { onClose, onApplyAiSchema } = renderPanel();

    // Fire the POSITIVE renderer's FAIL result → a fixable failure appears.
    await user.click(screen.getAllByText("res-fail")[0]);

    const fix = await screen.findByRole("button", { name: /ask luketests to fix/i });
    await user.click(fix);

    await waitFor(() => expect(mockedAgent.generateSchema).toHaveBeenCalledTimes(1));
    // v2 applies through the imperative handle (no remount), not saveDraft+reload.
    expect(onApplyAiSchema).toHaveBeenCalledWith(fixed);
    expect(onClose).toHaveBeenCalled();
  });

  it("hides AI actions and sign-off for view-only users", () => {
    renderPanel({ canEdit: false });
    expect(screen.queryByRole("button", { name: /sign off/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate data/i })).not.toBeInTheDocument();
    expect(screen.getByText(/sign-off needs edit access/i)).toBeInTheDocument();
  });
});
