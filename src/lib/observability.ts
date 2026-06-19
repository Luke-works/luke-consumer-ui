/**
 * Client-side observability (#23). Sentry is initialized ONLY when VITE_SENTRY_DSN
 * is configured, so dev/qa environments without a DSN are completely unaffected (no
 * SDK init, no network). Once initialized it captures uncaught errors, unhandled
 * promise rejections, and performance traces; `reportError` routes through here too.
 */
import * as Sentry from "@sentry/react";

let enabled = false;

export function initObservability(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // no DSN → no-op (default-lenient)
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_RELEASE as string | undefined) || undefined,
    // Tunable via env; modest default so traces don't overwhelm a starter plan.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_RATE ?? 0.1),
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
  });
  enabled = true;
}

export function isObservabilityEnabled(): boolean {
  return enabled;
}

/** Attach the active tenant/user to reports for multi-tenant triage (ids only, no PII). */
export function setObservabilityContext(ctx: { tenant?: string | null; userId?: string | null }): void {
  if (!enabled) return;
  Sentry.setTag("tenant", ctx.tenant ?? "unknown");
  Sentry.setUser(ctx.userId ? { id: ctx.userId } : null);
}
