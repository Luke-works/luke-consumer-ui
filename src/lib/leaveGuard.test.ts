import { describe, it, expect, vi } from "vitest";
import { guardedLeave } from "./leaveGuard";

describe("guardedLeave (#30)", () => {
  it("allows leaving immediately when there are no unsaved edits", async () => {
    const flush = vi.fn();
    expect(await guardedLeave(false, flush)).toBe(true);
    expect(flush).not.toHaveBeenCalled();
  });

  it("flushes and allows leaving when the save succeeds", async () => {
    const flush = vi.fn().mockResolvedValue(true);
    expect(await guardedLeave(true, flush)).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("blocks leaving when the flush fails (keep the user on the page)", async () => {
    const flush = vi.fn().mockResolvedValue(false);
    expect(await guardedLeave(true, flush)).toBe(false);
  });
});
