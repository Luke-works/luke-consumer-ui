// Client for the luke-agents workflow agent (the AI workflow builder / "LukeBuilds").
//
// The agent is a stateless WorkflowDoc generator: given the CURRENT WorkflowDoc
// plus the capability catalog and a natural-language instruction, it returns the
// COMPLETE updated WorkflowDoc, which we then updateDraft + reload into the builder.
//
// It runs in the same luke-agents service as the form agent (mounted at
// /agents/workflow) and is reached the same way: through core-engine at /api/ai,
// which authenticates the caller and attaches the workspace's own provider key.
// See lib/agentTransport.ts.

import type { StepTypeDescriptor, WorkflowDoc } from "@lukeflow/workflow-core";
import { agentPost } from "./agentTransport";


export type WorkflowAgentResult = {
  /** The full updated WorkflowDoc, ready for the builder / updateDraft. */
  doc: WorkflowDoc;
  title: string;
  /** Natural-language message describing what the assistant did. */
  reply?: string;
  /** Short, clickable next-step ideas tailored to the workflow. */
  suggestions?: string[];
  /** False when the workflow was left untouched (e.g. the user asked a question). */
  changed?: boolean;
  brain: string;
};

// Cancellation is the shared transport's; re-exported so the `instanceof` checks in the
// AI panels keep working against the one class.
export { AgentCancelledError, AgentProviderRequiredError } from "./agentTransport";

const LABEL = "workflow assistant";

/** This agent reasons over the whole catalog, so it gets a longer budget. */
const TIMEOUTS = { attemptMs: 30000, deadlineMs: 80000 };

const postWithRetry = <T,>(path: string, body: unknown, tenant?: string, signal?: AbortSignal) =>
  agentPost<T>(path, body, tenant, signal, LABEL, TIMEOUTS);

/**
 * Ask the agent to build/edit a workflow. Retries on a free-tier cold start with
 * backoff; pass `signal` to cancel a slow request. The `catalog` (from
 * GET /api/workflow/catalog) constrains the model to the tenant's capabilities.
 */
export function generateWorkflow(
  message: string,
  doc: WorkflowDoc | null,
  catalog: readonly StepTypeDescriptor[],
  title?: string,
  tenant?: string,
  signal?: AbortSignal,
): Promise<WorkflowAgentResult> {
  return postWithRetry<WorkflowAgentResult>(
    "/agents/workflow/chat",
    { message, doc, catalog, title }, // no client user id — the tenant scopes the call
    tenant,
    signal,
  );
}
