/**
 * Central client-side error sink. Today it logs to the console; when an
 * error-reporting service (e.g. Sentry) is added, wire it in HERE only — every
 * caller (error boundaries, catch blocks) already funnels through this function.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error("[reportError]", error, context ?? {});
}
