import { describe, it, expect } from "vitest";
import { isAbortError } from "./abort";

describe("isAbortError (#27)", () => {
  it("recognizes a DOMException AbortError (what fetch throws on abort)", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("recognizes a plain object with name AbortError", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true);
  });

  it("does NOT treat real errors as aborts (so they still surface)", () => {
    expect(isAbortError(new Error("network down"))).toBe(false);
    expect(isAbortError(new DOMException("boom", "NotFoundError"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("nope")).toBe(false);
  });
});
