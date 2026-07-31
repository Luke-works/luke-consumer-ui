// Client for the PUBLIC embed surface (the only unauthenticated API in the app).
// No bearer token, no tenant header — the opaque signed token in the path is the
// auth. Routed through the gateway, which forwards /api/public/** without auth.
//
// This is the highest-visibility surface (a form on a customer's site), so loads
// and submits retry transient failures with bounded backoff and report terminal
// failures via observability (#39).
import { isAbortError } from "./abort";
import { reportError } from "./reportError";

const BASE = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");
const seg = (s: string) => encodeURIComponent(s);

export type EmbedForm = {
  code: string;
  title: string;
  version: number;
  schema: string;
  /** Effective "Developed at Lukeflow" attribution flag — the server has ALREADY applied the tenant's
   *  plan (free plans can't switch it off), so render it as given. Optional for forward/backward
   *  compatibility with an engine that predates the field. */
  showBranding?: boolean;
  /** Effective "this form collects file attachments" flag — the server has ALREADY applied the
   *  tenant's plan (attachments are a paid feature), so render it as given rather than re-reading the
   *  schema. Optional for compatibility with an engine that predates the field; absent falls back to
   *  the schema, which is what older engines effectively meant. */
  attachmentsEnabled?: boolean;
  /** Whether this deployment demands a Cloudflare Turnstile challenge before a submission is accepted.
   *  Platform-wide, not per-form. Optional for compatibility with an engine that predates the field —
   *  absent means "no widget", and the server simply won't be asking for a token either. */
  captchaEnabled?: boolean;
  /** The PUBLIC Turnstile sitekey to mount the widget with. Carried in the payload so a key rotation or
   *  an environment difference never requires rebuilding and re-vendoring this bundle. The SECRET half
   *  stays in core-engine and is never served. */
  captchaSitekey?: string | null;
};

/** Thrown when the server is rate-limiting (HTTP 429) — callers wait + retry. */
export class EmbedRateLimitedError extends Error {
  constructor() {
    super("Too many submissions — please wait a moment and try again.");
    this.name = "EmbedRateLimitedError";
  }
}

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 800;
const BACKOFF_CAP_MS = 6000;
// Statuses worth retrying: 0 = network/opaque failure, plus typical transients.
const TRANSIENT = new Set([0, 408, 425, 500, 502, 503, 504]);

function backoff(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS) + Math.floor(Math.random() * 250);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); },
      { once: true },
    );
  });
}

type RetryOpts = { signal?: AbortSignal; label: string; retryOn429?: boolean };

/** GET/POST with bounded backoff on transient failures. 4xx (except optionally 429)
 *  are terminal. Aborts propagate as AbortError; terminal failures are reported. */
async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOpts): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 1; ; attempt++) {
    if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
    let res: Response | null = null;
    try {
      res = await fetch(url, { ...init, signal: opts.signal });
    } catch (e) {
      if (isAbortError(e)) throw e; // cancelled by the caller — not a failure
      res = null; // network blip → transient
    }
    if (res?.ok) return res;
    lastStatus = res?.status ?? 0;

    const is429 = lastStatus === 429;
    const transient = TRANSIENT.has(lastStatus) || (is429 && opts.retryOn429 !== false);
    if (transient && attempt < MAX_ATTEMPTS) {
      await sleep(backoff(attempt), opts.signal);
      continue;
    }
    // Terminal — report (observability) and throw a friendly error.
    reportError(new Error(`embed ${opts.label} failed (HTTP ${lastStatus})`), {
      label: opts.label,
      status: lastStatus,
    });
    if (is429) throw new EmbedRateLimitedError();
    if (lastStatus === 404) throw new Error("This form link is invalid or no longer available.");
    throw new Error(
      lastStatus === 0
        ? "Couldn’t reach the form. Check your connection and try again."
        : `Couldn’t load the form (HTTP ${lastStatus}).`,
    );
  }
}

export async function getEmbedForm(token: string, signal?: AbortSignal): Promise<EmbedForm> {
  const res = await fetchWithRetry(`${BASE}/api/public/embed/${seg(token)}`, {}, { signal, label: "load" });
  return res.json();
}

export async function submitEmbed(
  token: string,
  data: Record<string, unknown>,
  attachmentRef?: string,
  consentAgreed?: boolean,
  captchaToken?: string | null,
  signal?: AbortSignal,
): Promise<{ ok: boolean; instanceId: string }> {
  const res = await fetchWithRetry(
    `${BASE}/api/public/embed/${seg(token)}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // attachmentRef lets the server bind this session's uploads to the instance BEFORE it snapshots
      // them into formMetaData (the post-submit /link call remains a best-effort fallback).
      // consentAgreed carries only the filler's tick; the server records the wording from the schema it
      // served, so this cannot be used to assert agreement to different terms.
      // captchaToken is the Turnstile challenge response. It proves nothing by itself — core-engine
      // verifies it against Cloudflare — and it is single-use, so a retry needs a fresh one.
      body: JSON.stringify({
        data,
        attachmentRef,
        consentAgreed: consentAgreed === true,
        captchaToken: captchaToken ?? null,
      }),
    },
    { signal, label: "submit" },
  );
  return res.json();
}
