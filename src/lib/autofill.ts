// Generates valid sample data for a form schema — the engine behind "Test the
// form". The output is keyed by field KEY (and grids as key-keyed rows), so it
// drops straight into <FormRenderer initialValues={...} />.
//
// Best-effort: it honors required, lengths, min/max, options, min/max rows/tags,
// and date/time bounds. It cannot satisfy arbitrary regex `pattern`s or custom
// validation expressions — those fields may still fail the test and need manual
// input, which is exactly the signal the test surfaces.
import { repairSchema, type FormSchema } from "./formSchema";

type Attrs = Record<string, unknown>;
type Entity = { type: string; attributes: Attrs; children?: string[] };

const CONTAINER = new Set(["panel", "fieldset", "columns", "well", "table", "cell", "tabs", "tab"]);
const GRID = new Set(["dataGrid", "editGrid"]);
const STATIC = new Set(["button", "content", "heading", "divider", "next", "previous"]);
const MULTI_TEXTNUM = ["textField", "email", "url", "phoneNumber", "password", "textarea", "number", "currency"];

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const bool = (v: unknown): boolean => Boolean(v);
const keyOf = (id: string, e: Entity): string => str(e.attributes.key) || id;

const optionValues = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map((o) => (typeof o === "string" ? o : String((o as { value?: unknown })?.value ?? "")));

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const clamp = (v: string, min?: string, max?: string) => (min && v < min ? min : max && v > max ? max : v);

function sampleText(a: Attrs): string {
  const minWords = num(a.minWords) ?? 0;
  let s = minWords > 1 ? Array.from({ length: minWords }, () => "word").join(" ") : "Sample text";
  const minLen = num(a.minLength) ?? 0;
  while (s.length < minLen) s += "x";
  const maxLen = num(a.maxLength);
  if (maxLen !== undefined && s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

// A single valid value for a scalar (non-multiple) field.
function scalarValue(e: Entity): unknown {
  const a = e.attributes;
  switch (e.type) {
    case "email": return "test@example.com";
    case "url": return "https://example.com";
    case "phoneNumber": return "+15555550100";
    case "password": { let s = "Passw0rd!"; const min = num(a.minLength) ?? 0; while (s.length < min) s += "x"; return s; }
    case "number": case "currency": {
      const min = num(a.min), max = num(a.max);
      let n = min ?? 1;
      if (max !== undefined && n > max) n = max;
      return n;
    }
    case "checkbox": return true;
    case "select": case "radio": return optionValues(a.options)[0] ?? "";
    case "selectBoxes": {
      const vals = optionValues(a.options);
      const minS = Math.max(1, num(a.minSelected) ?? 1);
      return vals.slice(0, minS);
    }
    case "datetime": {
      const base = clamp(today(), str(a.minDate) || undefined, str(a.maxDate) || undefined);
      return bool(a.enableTime) ? `${base}T12:00` : base;
    }
    case "time": return clamp("12:00", str(a.minTime) || undefined, str(a.maxTime) || undefined);
    case "day": return today();
    case "tagsField": {
      const minT = Math.max(1, num(a.minTags) ?? 1);
      return Array.from({ length: minT }, (_, i) => `tag${i + 1}`);
    }
    case "file": return [{ name: "sample.txt", url: "data:text/plain;base64,c2FtcGxl", size: 6 }];
    case "signature": return "data:image/png;base64,iVBORw0KGgo=";
    default: return sampleText(a); // textField, textarea, and any text-like fallback
  }
}

// The value for a field, expanding `multiple` into an array.
function fieldValue(e: Entity): unknown {
  const a = e.attributes;
  if (bool(a.multiple)) {
    if (e.type === "select") { const v = optionValues(a.options)[0]; return v ? [v] : []; }
    if (MULTI_TEXTNUM.includes(e.type)) return [scalarValue(e)];
  }
  return scalarValue(e);
}

// ── Negative testing ────────────────────────────────────────────────────────
// Produces deliberately INVALID data so the test can confirm the form's
// validation actually rejects it. Each entry says which field was made invalid
// and why, so the panel can verify that field reported an error.
export type NegativeExpectation = { key: string; label: string; reason: string };
export type NegativeFill = { values: Record<string, unknown>; expected: NegativeExpectation[] };

// Could this field be conditionally hidden? Hidden fields aren't validated, so
// we exclude them from negative testing to avoid false "not rejected" alarms.
function maybeHidden(a: Attrs): boolean {
  const cond = a.conditional as { when?: string } | undefined;
  const logic = Array.isArray(a.logic) ? (a.logic as { action?: string }[]) : [];
  return bool(a.hidden) || !!cond?.when || !!str(a.customConditional) || logic.some((r) => r.action === "show" || r.action === "hide");
}

// An invalid value (+ human reason) for a field, or null if it has no
// negatively-testable constraint (so any value is valid → nothing to assert).
function invalidValue(e: Entity): { value: unknown; reason: string } | null {
  const a = e.attributes;
  const t = e.type;
  if (bool(a.required)) {
    if (t === "checkbox") return { value: false, reason: "required (must be checked)" };
    if (t === "selectBoxes" || t === "tagsField" || t === "file") return { value: [], reason: "required" };
    return { value: "", reason: "required" };
  }
  if (t === "email") return { value: "not-an-email", reason: "email format" };
  if (t === "url") return { value: "notaurl", reason: "URL format" };
  const minLen = num(a.minLength);
  if (minLen !== undefined && minLen > 1) return { value: "a", reason: `min length ${minLen}` };
  const maxLen = num(a.maxLength);
  if (maxLen !== undefined) return { value: "x".repeat(maxLen + 1), reason: `max length ${maxLen}` };
  const minW = num(a.minWords);
  if (minW !== undefined && minW > 1) return { value: "word", reason: `min words ${minW}` };
  const maxW = num(a.maxWords);
  if (maxW !== undefined) return { value: Array.from({ length: maxW + 1 }, () => "w").join(" "), reason: `max words ${maxW}` };
  if (t === "number" || t === "currency") {
    const min = num(a.min);
    if (min !== undefined) return { value: min - 1, reason: `minimum ${min}` };
    const max = num(a.max);
    if (max !== undefined) return { value: max + 1, reason: `maximum ${max}` };
  }
  if (str(a.pattern)) return { value: "###", reason: "pattern" };
  if (t === "selectBoxes") {
    const minS = num(a.minSelected);
    if (minS !== undefined && minS > 0) return { value: [], reason: `min selected ${minS}` };
  }
  if (t === "tagsField") {
    const minT = num(a.minTags);
    if (minT !== undefined && minT > 0) return { value: [], reason: `min tags ${minT}` };
  }
  return null;
}

/**
 * Valid data with each negatively-testable, always-visible field overridden to
 * an invalid value. Skips grids and multi-value fields (deferred). `expected`
 * lists the fields that SHOULD now report an error.
 */
export function negativeFillSchema(schemaJson: string): NegativeFill {
  let parsed: FormSchema;
  try {
    parsed = repairSchema(JSON.parse(schemaJson) as FormSchema).schema;
  } catch {
    return { values: {}, expected: [] };
  }
  const entities = parsed.entities as Record<string, Entity>;
  const values: Record<string, unknown> = { ...autofillSchema(schemaJson) }; // valid base
  const expected: NegativeExpectation[] = [];
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const e = entities[id];
      if (!e || GRID.has(e.type)) continue;
      if (CONTAINER.has(e.type)) { walk(e.children ?? []); continue; }
      if (STATIC.has(e.type) || bool(e.attributes.multiple) || maybeHidden(e.attributes)) continue;
      const inv = invalidValue(e);
      if (!inv) continue;
      const key = keyOf(id, e);
      values[key] = inv.value;
      expected.push({ key, label: str(e.attributes.label) || key, reason: inv.reason });
    }
  };
  walk(parsed.root);
  return { values, expected };
}

/** Valid sample data for every fillable field, keyed by field key (grids → rows). */
export function autofillSchema(schemaJson: string): Record<string, unknown> {
  let parsed: FormSchema;
  try {
    parsed = repairSchema(JSON.parse(schemaJson) as FormSchema).schema;
  } catch {
    return {};
  }
  const entities = parsed.entities as Record<string, Entity>;
  const out: Record<string, unknown> = {};
  const fillable = (cid: string) =>
    entities[cid] && !CONTAINER.has(entities[cid].type) && !GRID.has(entities[cid].type) && !STATIC.has(entities[cid].type);

  const walk = (ids: string[]) => {
    for (const id of ids) {
      const e = entities[id];
      if (!e) continue;
      if (GRID.has(e.type)) {
        const cellIds = (e.children ?? []).filter(fillable);
        const rowCount = Math.max(1, num(e.attributes.minRows) ?? 1);
        out[keyOf(id, e)] = Array.from({ length: rowCount }, () => {
          const row: Record<string, unknown> = {};
          for (const cid of cellIds) row[keyOf(cid, entities[cid])] = fieldValue(entities[cid]);
          return row;
        });
        continue;
      }
      if (CONTAINER.has(e.type)) { walk(e.children ?? []); continue; }
      if (STATIC.has(e.type)) continue;
      out[keyOf(id, e)] = fieldValue(e);
    }
  };
  walk(parsed.root);
  return out;
}
