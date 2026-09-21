// Shared transport for every luke-agents call (form, email, workflow).
//
// The browser used to POST to luke-agents DIRECTLY (VITE_FORM_AGENT_URL), with the
// workspace asserted by an X-Tenant-Id header the client set. That was survivable while
// one platform key served everyone — a spoofed tenant only mislabelled a budget bucket.
//
// Under bring-your-own-key it would be credential theft: name another workspace and spend
// their provider key. So every agent call now goes through core-engine at /api/ai, which
// authenticates the caller, checks they may act for that workspace, decrypts that
// workspace's own key and attaches it server-side. The key never touches the browser, and
// the agents service is no longer reachable from one.
//
// The retry behaviour below is unchanged: it exists for Render free-tier cold starts,
// which return an HTML wake-up page or a 502/503 for the first few seconds.
import { getAccessToken } from "./authApi";
import { getCurrentTier } from "./planTier";

const BASE = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");

/** Thrown when a request is cancelled by the caller (not a service failure). */
export class AgentCancelledError extends Error {
  constructor() {
    super("Request cancelled.");
    this.name = "AgentCancelledError";
  }
}

/**
 * Thrown when the workspace can't run an AI turn yet — no provider connected, or the
 * provider rejected its key. Distinct from a failure so the UI can offer "Connect your AI
 * provider" instead of an error nobody can act on.
 */
export class AgentProviderRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Connect an AI provider to use the assistant.");
    this.name = "AgentProviderRequiredError";
  }
}

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1_500;
const BACKOFF_CAP_MS = 8_000;
const COLD_START_STATUSES = new Set([502, 503]);

export type AgentTimeouts = {
  /** Per-attempt cap, so a hung request fails fast rather than forever. */
  attemptMs: number;
  /** Overall budget across retries. */
  deadlineMs: number;
};

export const DEFAULT_TIMEOUTS: AgentTimeouts = { attemptMs: 25_000, deadlineMs: 75_000 };

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
 * POST JSON to an agent through core-engine, with bounded retry.
 *
 * `path` is the agent path as the fleet exposes it, e.g. "/agents/form/chat" — core-engine
 * maps it onto the fleet one-for-one, so the agents' own API stays the contract.
 *
 *  - each attempt has an AbortController timeout so a no-response fetch fails fast;
 *  - retries use exponential backoff + jitter within a total deadline;
 *  - an optional caller `signal` cancels everything (→ {@link AgentCancelledError});
 *  - a 402 means the workspace needs to connect a provider (→ {@link AgentProviderRequiredError})
 *    and is NEVER retried: retrying can't make a missing key appear.
 */
export async function agentPost<T>(
  path: string,
  body: unknown,
  tenant?: string,
  signal?: AbortSignal,
  label = "assistant",
  timeouts: AgentTimeouts = DEFAULT_TIMEOUTS,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAccessToken();
  // The workspace is proved by this credential, not claimed by the header below.
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers["X-Tenant-Id"] = tenant;
  const tier = getCurrentTier();
  if (tier) headers["X-Tenant-Tier"] = tier; // sizes the tenant's AI token budget by plan
  const deadline = Date.now() + timeouts.deadlineMs;

  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw new AgentCancelledError();

    const timeoutCtl = new AbortController();
    const timer = setTimeout(() => timeoutCtl.abort(), timeouts.attemptMs);
    const onExternalAbort = () => timeoutCtl.abort();
    signal?.addEventListener("abort", onExternalAbort, { once: true });

    let res: Response | null = null;
    let networkErr: unknown = null;
    try {
      res = await fetch(`${BASE}/api/ai${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        credentials: "include",
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
      // No key, or a key the provider refused. Retrying cannot fix either.
      if (status === 402) {
        throw new AgentProviderRequiredError(
          typeof data?.detail === "string" ? data.detail : undefined,
        );
      }
    }

    const transient =
      networkErr !== null || res === null || data === null || COLD_START_STATUSES.has(status);
    const delay = backoffDelay(attempt);
    const canRetry = transient && attempt < MAX_ATTEMPTS && Date.now() + delay < deadline;

    if (!canRetry) {
      if (networkErr !== null || res === null) {
        throw new Error(
          `Couldn't reach the ${label}. ${(networkErr as Error)?.message ?? ""}`.trim(),
        );
      }
      const detail = data?.detail || `The ${label} is unavailable (HTTP ${status}).`;
      throw new Error(typeof detail === "string" ? detail : `${label} error`);
    }

    await abortableSleep(delay, signal);
  }
}
