import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormTestPanel from "./FormTestPanel";
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
vi.mock("../../lib/formAgentApi", () => ({ generateSchema: vi.fn(), generateTestData: vi.fn() }));

const mockedAgent = vi.mocked(agentApi);

// A schema with no negatively-testable fields → negative run is "n/a", so sign-off
// hinges purely on a clean positive run (keeps these assertions to one axis).
const EMPTY_JSON = JSON.stringify({ root: [], entities: {} });

function renderPanel(over: Partial<React.ComponentProps<typeof FormTestPanel>> = {}) {
  const onClose = vi.fn();
  const onApplyAiSchema = vi.fn();
  const onSignOff = vi.fn().mockResolvedValue(undefined);
  render(
    <FormTestPanel
      open
      onClose={onClose}
      tenant="t1"
      formName="Contact"
      canEdit
      getJson={() => EMPTY_JSON}
      onApplyAiSchema={onApplyAiSchema}
      onSignOff={onSignOff}
      {...over}
    />,
  );
  return { onClose, onApplyAiSchema, onSignOff };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FormTestPanel", () => {
  it("gates sign-off until the positive run passes, then signs off (via the page's onSignOff)", async () => {
    const user = userEvent.setup();
    const { onClose, onSignOff } = renderPanel();

    // Before any result, sign-off is disabled.
    const signOff = screen.getByRole("button", { name: /sign off/i });
    expect(signOff).toBeDisabled();

    // Fire the POSITIVE renderer's pass result.
    await user.click(screen.getAllByText("res-pass")[0]);

    await waitFor(() => expect(signOff).toBeEnabled());
    await user.click(signOff);

    // v2: sign-off delegates to the page (check in + sign off the version), then closes.
    await waitFor(() => expect(onSignOff).toHaveBeenCalled());
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

  it("Generate data requests VALID datasets on the positive tab and INVALID on the negative tab", async () => {
    const user = userEvent.setup();
    mockedAgent.generateTestData.mockResolvedValue({
      datasets: [{ values: {}, notes: "set" }],
      brain: "groq",
    } as agentApi.TestDataResult);
    renderPanel();

    // Positive is the default tab → "valid".
    await user.click(screen.getByRole("button", { name: /generate data/i }));
    await waitFor(() =>
      expect(mockedAgent.generateTestData).toHaveBeenCalledWith(expect.anything(), "valid", expect.any(Number), "Contact", "t1"),
    );

    // Switch to Negative → "invalid".
    await user.click(screen.getByRole("button", { name: /^negative$/i }));
    await user.click(screen.getByRole("button", { name: /generate data/i }));
    await waitFor(() =>
      expect(mockedAgent.generateTestData).toHaveBeenCalledWith(expect.anything(), "invalid", expect.any(Number), "Contact", "t1"),
    );
  });

  it("an AI invalid dataset passes the negative run when the form reports any error", async () => {
    const user = userEvent.setup();
    mockedAgent.generateTestData.mockResolvedValue({
      datasets: [{ values: { email: "x" }, notes: "broken email" }],
      brain: "groq",
    } as agentApi.TestDataResult);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /^negative$/i }));
    await user.click(screen.getByRole("button", { name: /generate data/i }));
    // Fire the NEGATIVE renderer's FAIL result ([1] — the form rejected the invalid data).
    await waitFor(() => expect(screen.getAllByText("res-fail").length).toBeGreaterThan(1));
    await user.click(screen.getAllByText("res-fail")[1]);

    expect(await screen.findByText(/rejected this invalid data/i)).toBeInTheDocument();
  });
});
