import { describe, expect, it } from "vitest";
import { lifecycleGate, type LifecycleState } from "./lifecycle";

/**
 * `lifecycleGate` decides whether a form can be checked in, published, or reverted — and it is
 * the SINGLE source of truth for that, shared by the builder toolbar and the LukeBuilds chat path
 * so the two can never disagree. It had no tests.
 *
 * The publish branch is the one that matters most: a version reaches customers only through it,
 * and the whole check-in → test → sign-off flow exists to make `publish.ok` mean "a human vouched
 * for this". A gate that wrongly returns ok would put an unvouched version live.
 *
 * The `reason` strings are asserted too, not just the booleans. They are not diagnostics — they
 * are the tooltip on a disabled button and the reply the assistant gives when asked why it can't
 * publish. A correct boolean with a misleading reason is still a bug the user pays for.
 */
const base: LifecycleState = {
  busy: null,
  mutating: false,
  checkedOut: false,
  dirty: false,
  version: 0,
  signedOff: false,
  publishedVersion: null,
};
const state = (over: Partial<LifecycleState> = {}): LifecycleState => ({ ...base, ...over });

describe("lifecycleGate — check in", () => {
  it("is blocked while view-only, and says how to start editing", () => {
    const g = lifecycleGate(state({ checkedOut: false })).checkin;
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/check out/i);
  });

  it("is blocked when checked out but nothing has changed", () => {
    const g = lifecycleGate(state({ checkedOut: true, dirty: false })).checkin;
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/no changes/i);
  });

  it("is allowed once there are changes, and says errors are fine", () => {
    // Check-in is a SNAPSHOT, deliberately permissive: a work-in-progress version with validation
    // errors is legal because it cannot reach anyone until it is signed off and published.
    const g = lifecycleGate(state({ checkedOut: true, dirty: true })).checkin;
    expect(g.ok).toBe(true);
    expect(g.reason).toMatch(/won't go live/i);
  });
});

describe("lifecycleGate — publish", () => {
  it("is blocked with nothing checked in", () => {
    const g = lifecycleGate(state({ version: 0, signedOff: true })).publish;
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/check in a version first/i);
  });

  it("is BLOCKED when the version is not signed off — the rule sign-off exists to enforce", () => {
    const g = lifecycleGate(state({ version: 3, signedOff: false })).publish;
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/signed off/i);
    expect(g.reason).toMatch(/Test/); // tells them the way out, not just "no"
  });

  it("is allowed for a signed-off version that is not already live", () => {
    const g = lifecycleGate(state({ version: 3, signedOff: true, publishedVersion: 2 })).publish;
    expect(g.ok).toBe(true);
    expect(g.reason).toContain("v3");
  });

  it("is blocked when the latest version is already the live one", () => {
    const g = lifecycleGate(state({ version: 3, signedOff: true, publishedVersion: 3 })).publish;
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/already published/i);
  });

  it("stays blocked when already-live AND unsigned — already-live wins the explanation", () => {
    // Both conditions hold; the useful thing to tell someone is that this IS the live version,
    // not that it lacks a sign-off it will never need.
    const g = lifecycleGate(state({ version: 2, signedOff: false, publishedVersion: 2 })).publish;
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/already published/i);
  });

  it("does not treat v0 with publishedVersion 0 as already-live", () => {
    // Guards the `version >= 1` half of the already-live test: without it a brand-new form
    // (version 0) could match publishedVersion 0 and report itself live.
    const g = lifecycleGate(state({ version: 0, publishedVersion: 0 })).publish;
    expect(g.reason).toMatch(/check in a version first/i);
  });

  it("does not depend on being checked out — you can publish from view-only", () => {
    const viewOnly = lifecycleGate(state({ checkedOut: false, version: 2, signedOff: true })).publish;
    const editing = lifecycleGate(state({ checkedOut: true, version: 2, signedOff: true })).publish;
    expect(viewOnly.ok).toBe(true);
    expect(editing.ok).toBe(true);
  });
});

describe("lifecycleGate — undo checkout", () => {
  it("is blocked when not editing", () => {
    const g = lifecycleGate(state({ checkedOut: false })).undo;
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/not editing/i);
  });

  it("is blocked with nothing checked in to revert to, and points at the builder's own undo", () => {
    const g = lifecycleGate(state({ checkedOut: true, version: 0 })).undo;
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/⌘Z|Undo/);
  });

  it("discards changes when dirty, and says so — this one destroys work", () => {
    const g = lifecycleGate(state({ checkedOut: true, version: 2, dirty: true })).undo;
    expect(g.ok).toBe(true);
    expect(g.reason).toMatch(/discard/i);
    expect(g.reason).toContain("v2");
  });

  it("just leaves edit mode when clean — and must NOT threaten to discard anything", () => {
    const g = lifecycleGate(state({ checkedOut: true, version: 2, dirty: false })).undo;
    expect(g.ok).toBe(true);
    expect(g.reason).not.toMatch(/discard/i);
  });
});

describe("lifecycleGate — shape", () => {
  it("always answers for all three actions, whatever the state", () => {
    // The chat path indexes this by action name; a missing key would throw mid-conversation.
    for (const checkedOut of [true, false]) {
      for (const dirty of [true, false]) {
        for (const version of [0, 1, 5]) {
          for (const signedOff of [true, false]) {
            for (const publishedVersion of [null, 0, 1, 5]) {
              const g = lifecycleGate(state({ checkedOut, dirty, version, signedOff, publishedVersion }));
              for (const action of ["checkin", "publish", "undo"] as const) {
                expect(typeof g[action].ok).toBe("boolean");
                expect(g[action].reason.length).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
  });
});
