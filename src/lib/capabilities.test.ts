import { describe, it, expect } from "vitest";
import {
  canContribute,
  canDelete,
  canPublish,
  canRead,
  canWrite,
  capabilityLevel,
  FORMS,
  permits,
  requestableLevels,
  toLevel,
} from "./capabilities";
import type { SessionView } from "./authApi";

const session = (caps: Record<string, string>) =>
  ({ capabilities: caps } as unknown as SessionView);

describe("capabilities gating (#25)", () => {
  it("reads the effective level, defaulting to none", () => {
    expect(capabilityLevel(session({ FORMS: "read-write" }), FORMS)).toBe("read-write");
    expect(capabilityLevel(session({ FORMS: "contributor" }), FORMS)).toBe("contributor");
    expect(capabilityLevel(session({ FORMS: "read" }), FORMS)).toBe("read");
    expect(capabilityLevel(session({}), FORMS)).toBe("none");
    expect(capabilityLevel(null, FORMS)).toBe("none");
    expect(capabilityLevel(session({ FORMS: "bogus" }), FORMS)).toBe("none");
  });

  it("canRead is true for read, contributor, or read-write", () => {
    expect(canRead(session({ FORMS: "read" }), FORMS)).toBe(true);
    expect(canRead(session({ FORMS: "contributor" }), FORMS)).toBe(true);
    expect(canRead(session({ FORMS: "read-write" }), FORMS)).toBe(true);
    expect(canRead(session({}), FORMS)).toBe(false);
    expect(canRead(null, FORMS)).toBe(false);
  });

  it("canWrite is true for contributor and read-write (read alone is not enough)", () => {
    expect(canWrite(session({ FORMS: "read-write" }), FORMS)).toBe(true);
    expect(canWrite(session({ FORMS: "contributor" }), FORMS)).toBe(true); // contributor can edit
    expect(canWrite(session({ FORMS: "read" }), FORMS)).toBe(false);
    expect(canWrite(null, FORMS)).toBe(false);
  });
});

describe("contributor level (#46 / core-engine #104)", () => {
  it("is a recognised level", () => {
    expect(capabilityLevel(session({ FORMS: "contributor" }), FORMS)).toBe("contributor");
    expect(toLevel("contributor")).toBe("contributor");
    expect(toLevel(undefined)).toBe("none");
    expect(toLevel("nonsense")).toBe("none");
  });

  it("can read and contribute, but never publish or delete", () => {
    const s = session({ FORMS: "contributor" });
    expect(canRead(s, FORMS)).toBe(true);
    expect(canContribute(s, FORMS)).toBe(true);
    expect(canPublish(s, FORMS)).toBe(false);
    expect(canDelete(s, FORMS)).toBe(false);
  });

  it("canWrite follows the backend (contributor may edit) — privileged actions do not", () => {
    // canWrite mirrors the backend's ordinary-write contract, so a contributor passes it (#46).
    // The privileged actions stay separate: that is what canPublish/canDelete are for, and the
    // per-screen follow-on is to move Publish/Retire/sign-off/purge onto them so a contributor
    // stops being offered controls the engine answers with 403.
    expect(canWrite(session({ FORMS: "contributor" }), FORMS)).toBe(true);
    expect(permits("contributor", "write")).toBe(true);
    expect(permits("contributor", "publish")).toBe(false);
    expect(permits("contributor", "delete")).toBe(false);
  });

  it("read-write keeps permitting every action (grandfathered)", () => {
    const s = session({ FORMS: "read-write" });
    expect(canPublish(s, FORMS)).toBe(true);
    expect(canDelete(s, FORMS)).toBe(true);
  });

  it("mirrors core-engine CapabilityLevel.permits exactly", () => {
    expect(permits("none", "read")).toBe(false);
    expect(permits("read", "read")).toBe(true);
    expect(permits("read", "write")).toBe(false);
    expect(permits("contributor", "write")).toBe(true);
    expect(permits("contributor", "publish")).toBe(false);
    expect(permits("contributor", "delete")).toBe(false);
    expect(permits("read-write", "publish")).toBe(true);
    expect(permits("read-write", "delete")).toBe(true);
  });
});

describe("requestableLevels — everything above what you already hold", () => {
  it("offers every level to someone with no access", () => {
    expect(requestableLevels("none")).toEqual(["read", "contributor", "read-write"]);
  });

  it("offers the upgrade through the middle level", () => {
    // Matches core-engine CapabilityLevel.atLeast (rank comparison). The old action-class
    // comparison 409'd both of these.
    expect(requestableLevels("read")).toEqual(["contributor", "read-write"]);
    expect(requestableLevels("contributor")).toEqual(["read-write"]);
  });

  it("offers nothing at the top level", () => {
    expect(requestableLevels("read-write")).toEqual([]);
  });
});
