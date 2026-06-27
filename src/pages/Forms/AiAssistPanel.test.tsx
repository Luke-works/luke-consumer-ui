import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AiAssistPanel from "./AiAssistPanel";
import * as agentApi from "../../lib/formAgentApi";

// Mock auth + the agent client; keep normalizeAgentSchema (pure) real for the apply path.
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ session: { tenant: "t1" } }) }));
vi.mock("../../components/branding/LukeBuildsMark", () => ({ default: () => null }));
vi.mock("../../lib/formsApi", () => ({ saveDraft: vi.fn().mockResolvedValue({}) }));
vi.mock("../../lib/formAgentApi", async (orig) => ({
  ...(await orig<typeof agentApi>()),
  generateSchema: vi.fn(),
}));

const mockedAgent = vi.mocked(agentApi);
const EMPTY = { entities: {}, root: [] };

function renderPanel(over: Partial<React.ComponentProps<typeof AiAssistPanel>> = {}) {
  const onApplied = vi.fn();
  const onRunLifecycle = vi.fn().mockReturnValue({ ok: true, message: "" });
  render(
    <AiAssistPanel
      tenant="t1"
      formId="f1"
      formName="Contact"
      schema={EMPTY}
      onApplied={onApplied}
      onRunLifecycle={onRunLifecycle}
      {...over}
    />,
  );
  return { onApplied, onRunLifecycle };
}

async function ask(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(/add a required/i), text);
  await user.click(screen.getByRole("button", { name: /send/i }));
}

beforeEach(() => vi.clearAllMocks());

describe("AiAssistPanel — conversational lifecycle", () => {
  it("runs a lifecycle action (publish) and does NOT apply a schema", async () => {
    mockedAgent.generateSchema.mockResolvedValue({
      schema: EMPTY, title: "Contact", reply: "Publishing this for you.", action: "publish", changed: false, brain: "x",
    } as agentApi.AgentResult);
    const { onApplied, onRunLifecycle } = renderPanel();
    await ask("make it live");
    await waitFor(() => expect(onRunLifecycle).toHaveBeenCalledWith("publish"));
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("shows the app's reason in chat when a lifecycle action is blocked", async () => {
    mockedAgent.generateSchema.mockResolvedValue({
      schema: EMPTY, title: "Contact", reply: "Publishing…", action: "publish", changed: false, brain: "x",
    } as agentApi.AgentResult);
    renderPanel({ onRunLifecycle: () => ({ ok: false, message: "This version isn't signed off yet." }) });
    await ask("publish");
    expect(await screen.findByText(/isn't signed off yet/i)).toBeInTheDocument();
  });

  it("applies a normal edit (no action)", async () => {
    mockedAgent.generateSchema.mockResolvedValue({
      schema: EMPTY, title: "Contact", reply: "Added an email field.", changed: true, brain: "x",
    } as agentApi.AgentResult);
    const { onApplied, onRunLifecycle } = renderPanel();
    await ask("add an email field");
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(onRunLifecycle).not.toHaveBeenCalled();
  });
});
