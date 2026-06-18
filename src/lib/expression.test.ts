import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./reportError", () => ({ reportError: vi.fn() }));
import { reportError } from "./reportError";
import {
  analyzeExpression,
  evaluateExpression,
  evaluateCondition,
  evaluateValidation,
} from "./expression";

const known = new Set(["price", "quantity", "value", "age"]);

describe("analyzeExpression", () => {
  it("accepts empty/undefined as ok", () => {
    expect(analyzeExpression("", known)).toBeNull();
    expect(analyzeExpression(undefined, known)).toBeNull();
    expect(analyzeExpression("   ", known)).toBeNull();
  });
  it("accepts valid expressions referencing known fields", () => {
    expect(analyzeExpression("price * quantity", known)).toBeNull();
    expect(analyzeExpression("age >= 18", known)).toBeNull();
    expect(analyzeExpression("value > 0", known)).toBeNull();
  });
  it("flags syntax errors", () => {
    expect(analyzeExpression("price *", known)).toMatch(/syntax/i);
    expect(analyzeExpression("(a + ", known)).toMatch(/syntax/i);
  });
  it("flags references to unknown fields", () => {
    const err = analyzeExpression("price * qty", known);
    expect(err).toMatch(/unknown field/i);
    expect(err).toMatch(/qty/);
  });
  it("lists multiple unknown fields", () => {
    const err = analyzeExpression("foo + bar", known);
    expect(err).toMatch(/fields/i);
  });
});

describe("evaluate* sanity (unchanged behavior)", () => {
  it("evaluates arithmetic against scope", () => {
    expect(evaluateExpression("price * quantity", { price: 3, quantity: 4 })).toBe(12);
  });
  it("defaults to showing on a bad condition", () => {
    expect(evaluateCondition("nonsense (", { a: 1 })).toBe(true);
    expect(evaluateCondition("", {})).toBe(true);
  });
});

describe("custom-validation fail-open + reporting (#36)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("evaluates a valid validation rule", () => {
    expect(evaluateValidation("age >= 18", { age: 20 })).toBe(true);
    expect(evaluateValidation("age >= 18", { age: 10 })).toBe(false);
  });

  it("empty validation is valid and not reported", () => {
    expect(evaluateValidation("", {})).toBe(true);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("a broken validation rule fails open (valid) but IS reported", () => {
    // Distinct expression so the per-session dedupe doesn't suppress this report.
    expect(evaluateValidation("salary >= floor(", { salary: 100 })).toBe(true);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
