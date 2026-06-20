import { describe, it, expect } from "vitest";
import { capabilityLevel, canRead, canWrite, FORMS } from "./capabilities";
import type { SessionView } from "./authApi";

const session = (caps: Record<string, string>) =>
  ({ capabilities: caps } as unknown as SessionView);

describe("capabilities gating (#25)", () => {
  it("reads the effective level, defaulting to none", () => {
    expect(capabilityLevel(session({ FORMS: "read-write" }), FORMS)).toBe("read-write");
    expect(capabilityLevel(session({ FORMS: "read" }), FORMS)).toBe("read");
    expect(capabilityLevel(session({}), FORMS)).toBe("none");
    expect(capabilityLevel(null, FORMS)).toBe("none");
    expect(capabilityLevel(session({ FORMS: "bogus" }), FORMS)).toBe("none");
  });

  it("canRead is true for read or read-write", () => {
    expect(canRead(session({ FORMS: "read" }), FORMS)).toBe(true);
    expect(canRead(session({ FORMS: "read-write" }), FORMS)).toBe(true);
    expect(canRead(session({}), FORMS)).toBe(false);
    expect(canRead(null, FORMS)).toBe(false);
  });

  it("canWrite requires read-write (read alone is not enough)", () => {
    expect(canWrite(session({ FORMS: "read-write" }), FORMS)).toBe(true);
    expect(canWrite(session({ FORMS: "read" }), FORMS)).toBe(false);
    expect(canWrite(null, FORMS)).toBe(false);
  });
});
