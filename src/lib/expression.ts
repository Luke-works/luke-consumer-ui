import { Parser } from "expr-eval";
import { reportError } from "./reportError";

// A safe expression engine (no raw JS eval). Expressions reference form field
// values by their property key, e.g. `price * quantity` or `age >= 18`.
//
// Hardened against expr-eval's prototype-pollution advisory: form expressions only
// need arithmetic / comparison / logical / conditional operators over flat field
// keys, so we disable assignment (no scope mutation)…
const parser = new Parser({ operators: { assignment: false } });

// …and — the definitive guard — reject any expression that even mentions a
// prototype-chain identifier. The pollution path requires naming one of these, and
// none has a legitimate use in a form field-value expression, so blocking them
// closes the vector outright without affecting authored rules.
const DANGEROUS_IDENTIFIER = /\b(?:__proto__|prototype|constructor)\b/;

export type Scope = Record<string, unknown>;

// A runtime expression error is a real defect (the authored rule isn't running),
// but we don't want to spam the sink on every keystroke in the builder preview, so
// each distinct (label + expression) failure is reported at most once per session.
const reportedErrors = new Set<string>();

/**
 * Evaluate an expression against the form's values-by-key. Returns undefined on
 * error. Runtime semantics are deliberately FAIL-OPEN (a typo must not blank a
 * field or wedge a submit), but the error is now REPORTED so a broken rule is
 * detectable rather than silently swallowed. Publishing a form whose expressions
 * fail {@link analyzeExpression} is blocked at build time, so this is a safety net.
 */
export function evaluateExpression(expr: string, scope: Scope, label?: string): unknown {
  const code = expr?.trim();
  if (!code) return undefined;
  if (DANGEROUS_IDENTIFIER.test(code)) return undefined; // never evaluate proto-chain access
  try {
    return parser.evaluate(code, scope as Record<string, number>);
  } catch (e) {
    const dedupeKey = (label ?? "expression") + "::" + code;
    if (!reportedErrors.has(dedupeKey)) {
      reportedErrors.add(dedupeKey);
      reportError(e, { label: label ?? "expression", expression: code });
    }
    return undefined;
  }
}

/** Visibility / advanced-conditional: truthy shows the field. Empty = show.
 *  On error we default to SHOWING (so a typo never hides the whole form). */
export function evaluateCondition(expr: string | undefined, scope: Scope): boolean {
  if (!expr?.trim()) return true;
  const result = evaluateExpression(expr, scope, "visibility");
  return result === undefined ? true : Boolean(result);
}

/** Custom validation: truthy = valid. Empty = valid. Error = valid (fail-open so a
 *  broken rule never wedges a submit) — but the error is reported, and publishing
 *  such a form is blocked at build time. */
export function evaluateValidation(expr: string | undefined, scope: Scope): boolean {
  if (!expr?.trim()) return true;
  const result = evaluateExpression(expr, scope, "customValidation");
  return result === undefined ? true : Boolean(result);
}

/**
 * Static analysis for builder-time authoring feedback: returns an error message
 * if the expression doesn't parse, or references identifiers not in `knownKeys`
 * (so a typo'd field name surfaces instead of silently no-op'ing). Empty = ok.
 */
export function analyzeExpression(
  expr: string | undefined,
  knownKeys: ReadonlySet<string>,
): string | null {
  const code = expr?.trim();
  if (!code) return null;
  if (DANGEROUS_IDENTIFIER.test(code)) {
    return "Disallowed identifier (__proto__ / prototype / constructor).";
  }
  let parsed: ReturnType<Parser["parse"]>;
  try {
    parsed = parser.parse(code);
  } catch (e) {
    return `Syntax error: ${(e as Error).message}`;
  }
  let vars: string[];
  try {
    vars = parsed.variables();
  } catch {
    vars = [];
  }
  const unknown = vars.filter((v) => !knownKeys.has(v));
  if (unknown.length) {
    return `Unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`;
  }
  return null;
}
