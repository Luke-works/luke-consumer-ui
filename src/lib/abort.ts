/**
 * True when a rejection is an aborted fetch (AbortController.abort()) rather than a
 * real failure (#27). Effects abort superseded/unmounted requests on cleanup, and the
 * resulting rejection must NOT surface as an error banner.
 */
export function isAbortError(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    ((e as { name?: string }).name === "AbortError" ||
      (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError"))
  );
}
