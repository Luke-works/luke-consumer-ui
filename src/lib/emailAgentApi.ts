// Client for the luke-agents email agent (the AI email-template builder).
//
// The agent is a stateless EmailDoc generator: given the CURRENT EmailDoc (or
// null on the first turn) plus a natural-language instruction, it returns the
// COMPLETE updated EmailDoc, which we then repair + saveDraft + re-render.
//
// luke-agents (an approved AI sub-processor) hosts the agent fleet under
// /agents/<slug>; base URL via VITE_FORM_AGENT_URL. No hardcoded public fallback
// (#32): a missing env fails the AI feature with a clear error instead of silently
// shipping authored content to a public host. Calls are tenant-scoped (X-Tenant-Id)
// and carry no client user id.
import type { EmailDoc } from "./emailDoc";

/** Resolve the agents base URL, or throw if it isn't configured (no public fallback). */
function agentBase(): string {
  const raw = import.meta.env.VITE_FORM_AGENT_URL as string | undefined;
  if (!raw) {
    throw new Error(
      "The AI assistant isn't configured. Set VITE_FORM_AGENT_URL to the luke-agents base URL.",
    );
  }
  return raw.replace(/\/$/, "");
}

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

/** Thrown when a request is cancelled by the caller (not a service failure). */
export class AgentCancelledError extends Error {
  constructor() {
    super("Request cancelled.");
    this.name = "AgentCancelledError";
  }
}

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 25_000; // a single hung request fails fast, not forever
const TOTAL_DEADLINE_MS = 75_000; // overall budget across retries
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
 * POST JSON to the email agent with bounded retry. Handles free-tier cold starts
 * (HTML wake-up page / 502 / 503) and hung requests:
 *  - each attempt has an AbortController timeout so a no-response fetch fails fast;
 *  - retries use exponential backoff + jitter within a total deadline;
 *  - an optional caller `signal` cancels everything (→ {@link AgentCancelledError}).
 */
async function postWithRetry<T>(path: string, body: unknown, tenant?: string, signal?: AbortSignal): Promise<T> {
  const base = agentBase(); // throws (no public fallback) if unconfigured
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (tenant) headers["X-Tenant-Id"] = tenant; // tenant-scoped egress (#32/#33)
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

    // A caller cancel wins over timeout/network classification.
    if (signal?.aborted) throw new AgentCancelledError();

    let status = 0;
    let ok = false;
    let data: (T & { detail?: string }) | null = null;
    if (res) {
      status = res.status;
      ok = res.ok;
      // Read as text so a non-JSON cold-start page can't throw "Unexpected token <".
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
          `Couldn't reach the email assistant. ${(networkErr as Error)?.message ?? ""}`.trim(),
        );
      }
      const detail = data?.detail || `The email assistant is unavailable (HTTP ${status}).`;
      throw new Error(typeof detail === "string" ? detail : "Email assistant error");
    }

    await abortableSleep(delay, signal);
  }
}

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
