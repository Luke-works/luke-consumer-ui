import { useCallback, useRef, useState } from "react";

/**
 * Mutual exclusion for async lifecycle actions (#37). While one mutation runs,
 * re-entrant calls are skipped (returns false) so rapid clicks or check-in→publish
 * can't interleave on stale state. `locked` drives button-disabled UI; the ref is
 * the synchronous re-entry guard (state updates are async and would let a second
 * click slip through).
 */
export function useMutationLock() {
  const lockRef = useRef(false);
  const [locked, setLocked] = useState(false);

  const runExclusive = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    if (lockRef.current) return false; // a mutation is already in flight — skip
    lockRef.current = true;
    setLocked(true);
    try {
      await fn();
      return true;
    } finally {
      lockRef.current = false;
      setLocked(false);
    }
  }, []);

  return { locked, runExclusive };
}
