import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMutationLock } from "./useMutationLock";

describe("useMutationLock (#37)", () => {
  it("skips a re-entrant call while one mutation is in flight", async () => {
    const { result } = renderHook(() => useMutationLock());

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let firstRan = false;
    let secondRan = false;

    // Start the first (long-running) mutation — don't await yet.
    let firstResult: Promise<boolean>;
    act(() => {
      firstResult = result.current.runExclusive(async () => {
        firstRan = true;
        await gate;
      });
    });

    await waitFor(() => expect(result.current.locked).toBe(true));

    // A second call while the first is in flight must be skipped (returns false).
    let secondOutcome: boolean | undefined;
    await act(async () => {
      secondOutcome = await result.current.runExclusive(async () => {
        secondRan = true;
      });
    });
    expect(secondOutcome).toBe(false);
    expect(secondRan).toBe(false);

    // Finish the first; lock releases and it reports success.
    await act(async () => {
      release();
      await firstResult;
    });
    expect(firstRan).toBe(true);
    await waitFor(() => expect(result.current.locked).toBe(false));
  });

  it("allows a new mutation after the previous one completes", async () => {
    const { result } = renderHook(() => useMutationLock());
    let ok1: boolean | undefined;
    let ok2: boolean | undefined;
    await act(async () => { ok1 = await result.current.runExclusive(async () => {}); });
    await act(async () => { ok2 = await result.current.runExclusive(async () => {}); });
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
  });
});
