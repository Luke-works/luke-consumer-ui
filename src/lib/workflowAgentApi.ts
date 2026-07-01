// Client for the luke-agents workflow agent (the AI workflow builder / "LukeBuilds").
//
// The agent is a stateless WorkflowDoc generator: given the CURRENT WorkflowDoc
// plus the capability catalog and a natural-language instruction, it returns the
// COMPLETE updated WorkflowDoc, which we then updateDraft + reload into the builder.
//
// It runs in the same luke-agents service as the form agent (mounted at
// /agents/workflow), so the base URL resolves from VITE_WORKFLOW_AGENT_URL and
// falls back to VITE_FORM_AGENT_URL (same deployment). As with the form agent
// (#32) there is deliberately NO hardcoded public fallback: a missing env fails
// the AI feature with a clear error rather than silently shipping authored content
// to a public host. Calls are tenant-scoped (X-Tenant-Id) and carry no client user id.

import type { StepTypeDescriptor, WorkflowDoc } from "@lukeflow/workflow-core";

/** Resolve the agents base URL, or throw if it isn't configured (no public fallback). */
function agentBase(): string {
  const raw =
    (import.meta.env.VITE_WORKFLOW_AGENT_URL as string | undefined) ||
    (import.meta.env.VITE_FORM_AGENT_URL as string | undefined);
  if (!raw) {
    throw new Error(
      "The AI assistant isn't configured. Set VITE_WORKFLOW_AGENT_URL to the luke-agents base URL.",
    );
  }
  return raw.replace(/\/$/, "");
}

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

/** Thrown when a request is cancelled by the caller (not a service failure). */
export class AgentCancelledError extends Error {
  constructor() {
    super("Request cancelled.");
    this.name = "AgentCancelledError";
  }
}

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 30_000; // a single hung request fails fast, not forever
const TOTAL_DEADLINE_MS = 80_000; // overall budget across retries
const BACKOFF_BASE_MS = 1_500;
const BACKOFF_CAP_MS = 8_000;
const COLD_START_STATUSES = new Set([502, 503]);

/** Exponential backoff with jitter so retries don't thundering-herd a recovering service. */
function backoffDelay(attempt: number): number {
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  return exp + Math.floor(Math.random() * 500);
}

/** Sleep that rejects immediately if the caller cancels. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AgentCancelledError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new AgentCancelledError());
      },
      { once: true },
    );
  });
}

/**
 * POST JSON to the workflow agent with bounded retry — handles free-tier cold
 * starts (HTML wake-up page / 502 / 503) and hung requests, and an optional
 * caller `signal` cancels everything (→ {@link AgentCancelledError}).
 * Mirrors formAgentApi.postWithRetry.
 */
async function postWithRetry<T>(path: string, body: unknown, tenant?: string, signal?: AbortSignal): Promise<T> {
  const base = agentBase(); // throws (no public fallback) if unconfigured
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (tenant) headers["X-Tenant-Id"] = tenant; // tenant-scoped egress
  const deadline = Date.now() + TOTAL_DEADLINE_MS;

  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw new AgentCancelledError();

    const timeoutCtl = new AbortController();
    const timer = setTimeout(() => timeoutCtl.abort(), ATTEMPT_TIMEOUT_MS);
    const onExternalAbort = () => timeoutCtl.abort();
    signal?.addEventListener("abort", onExternalAbort, { once: true });

    let res: Response | null = null;
    let networkErr: unknown = null;
    try {
      res = await fetch(`${base}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: timeoutCtl.signal,
      });
    } catch (e) {
      networkErr = e; // network failure OR per-attempt timeout abort — both transient
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onExternalAbort);
    }

    if (signal?.aborted) throw new AgentCancelledError();

    let status = 0;
    let ok = false;
    let data: (T & { detail?: string }) | null = null;
    if (res) {
      status = res.status;
      ok = res.ok;
      const raw = await res.text();
      try {
        data = JSON.parse(raw);
      } catch {
        /* HTML / empty — treated as cold start below */
      }
      if (ok && data !== null) return data as T;
    }

    const transient =
      networkErr !== null || res === null || data === null || COLD_START_STATUSES.has(status);
    const delay = backoffDelay(attempt);
    const canRetry = transient && attempt < MAX_ATTEMPTS && Date.now() + delay < deadline;

    if (!canRetry) {
      if (networkErr !== null || res === null) {
        throw new Error(
          `Couldn't reach the workflow assistant. ${(networkErr as Error)?.message ?? ""}`.trim(),
        );
      }
      const detail = data?.detail || `The workflow assistant is unavailable (HTTP ${status}).`;
      throw new Error(typeof detail === "string" ? detail : "Workflow assistant error");
    }

    await abortableSleep(delay, signal);
  }
}

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
