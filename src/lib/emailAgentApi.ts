// Client for the luke-agents email agent (the AI email-template builder).
//
// The agent is a stateless EmailDoc generator: given the CURRENT EmailDoc (or
// null on the first turn) plus a natural-language instruction, it returns the
// COMPLETE updated EmailDoc, which we then repair + saveDraft + re-render.
//
// luke-agents (an approved AI sub-processor) hosts the agent fleet under
// /agents/<slug>, reached through core-engine at /api/ai, which authenticates the
// caller and attaches the workspace's own provider key. See lib/agentTransport.ts.
import type { EmailDoc } from "@lukeflow/email-core";
import { agentPost } from "./agentTransport";


export type EmailAgentResult = {
  doc: EmailDoc;
  title: string;
  /** Natural-language message describing what the assistant did. */
  reply?: string;
  /** Short, clickable next-step ideas tailored to the email. */
  suggestions?: string[];
  /** False when the email was left untouched (e.g. the user asked a question). */
  changed?: boolean;
  brain: string;
  turn_id?: string;
};

// Cancellation is the shared transport's; re-exported so the `instanceof` checks in the
// AI panels keep working against the one class.
export { AgentCancelledError, AgentProviderRequiredError } from "./agentTransport";

const LABEL = "email assistant";

const postWithRetry = <T,>(path: string, body: unknown, tenant?: string, signal?: AbortSignal) =>
  agentPost<T>(path, body, tenant, signal, LABEL);

/**
 * Ask the agent to build/edit an email. Retries on a free-tier cold start with
 * backoff; pass `signal` to cancel a slow request. `doc` is null on the first turn.
 */
export function generateEmail(
  message: string,
  doc: EmailDoc | null,
  title?: string,
  tenant?: string,
  signal?: AbortSignal,
): Promise<EmailAgentResult> {
  return postWithRetry<EmailAgentResult>(
    "/agents/email/chat",
    { message, doc, title, consent: true }, // no client user id — the tenant scopes the call
    tenant,
    signal,
  );
}

/** One generated sample: variable name -> plausible value. */
export type TestDataSample = { values: Record<string, unknown> };
export type TestDataResult = {
  samples: TestDataSample[];
  brain: string;
};

/**
 * Ask the email agent to generate `count` plausible value sets for the doc's
 * variables (for preview + test send). Retries on a free-tier cold start like
 * generateEmail.
 */
export function generateTestData(
  doc: EmailDoc,
  count = 1,
  tenant?: string,
  signal?: AbortSignal,
): Promise<TestDataResult> {
  return postWithRetry<TestDataResult>(
    "/agents/email/testdata",
    { doc, count }, // no client user id — the tenant scopes the call
    tenant,
    signal,
  );
}
