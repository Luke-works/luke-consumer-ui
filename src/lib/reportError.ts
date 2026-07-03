/**
 * Central client-side error sink. Forwards to Sentry when observability is enabled
 * (see {@link initObservability}); always logs to the console so local dev and prod
 * consoles still surface it. Every caller (error boundaries, catch blocks) funnels
 * through here, so this is the single wiring point (#23).
 */
import * as Sentry from "@sentry/react";
import { isObservabilityEnabled } from "./observability";

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (isObservabilityEnabled()) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
  console.error("[reportError]", error, context ?? {});
}
