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
