// Schema integrity utilities for the form builder/renderer.
//
// The coltorapps schema is `{ entities, root }`, where each entity is
// `{ type, attributes, parentId?, children? }`. Field entities carry a `key`
// attribute — the identifier that names the field in the expression scope and in
// the submitted payload. Two invariants keep submissions trustworthy:
//
//   1. Every key is a valid expression identifier  →  logic/calc can reference it.
//   2. Every key is unique                          →  values never overwrite each
//                                                       other in scope or payload.
//
// This module is intentionally decoupled from the builder (no @coltorapps import)
// so it can be unit-tested in isolation and reused by the renderer and the AI
// apply path. An entity is treated as "keyed" iff its attributes carry a `key`.

export type SchemaEntity = {
  type: string;
  attributes: Record<string, unknown>;
  parentId?: string;
  children?: string[];
};

export type FormSchema = {
  entities: Record<string, SchemaEntity>;
  root: string[];
};

export type ProblemSeverity = "error" | "warning";

export type SchemaProblem = {
  /** Stable machine code, e.g. "duplicate-key". */
  code: string;
  severity: ProblemSeverity;
  /** The offending entity, when the problem is field-scoped. */
  entityId?: string;
  message: string;
};

/** A valid expression identifier: letter/underscore start, then word chars. */
export const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A small set of names that would shadow the expression engine / JS globals. */
const RESERVED_KEYS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);

export function isValidKey(value: unknown): value is string {
  return typeof value === "string" && KEY_RE.test(value) && !RESERVED_KEYS.has(value);
}

/** True when this entity participates in the keyed namespace (a data field). */
export function isKeyed(e: SchemaEntity | undefined): boolean {
  return !!e && typeof e.attributes === "object" && e.attributes !== null && "key" in e.attributes;
}

/**
 * Coerce an arbitrary string into a valid, identifier-safe key. Already-valid
 * keys are returned untouched (so "emailAddress" is preserved, not flattened).
 */
export function sanitizeKey(raw: unknown): string {
  if (isValidKey(raw)) return raw;
  const text = typeof raw === "string" ? raw : "";
  const words = text.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "field";
  let k = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
  if (/^[0-9]/.test(k)) k = `f${k}`; // identifiers can't start with a digit
  if (RESERVED_KEYS.has(k)) k = `${k}Field`;
  return k || "field";
}

/**
 * Force a camelCase identifier from a label (or existing key). Unlike
 * `sanitizeKey`, it does NOT preserve already-valid keys verbatim, so snake_case
 * and Title Case collapse to camelCase: `first_name` / `First Name` → `firstName`.
 * Idempotent on already-camelCase input.
 */
export function toCamelKey(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const words = text.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "field";
  let k = words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
  if (/^[0-9]/.test(k)) k = `f${k}`;
  if (RESERVED_KEYS.has(k)) k = `${k}Field`;
  return k || "field";
}

/** Return `base`, or `base1`, `base2`… until it isn't already in `taken`. */
export function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/**
 * True when `key` still looks auto-derived from `label` — i.e. it's the label's
 * camelCase base, or that base with a numeric collision suffix. Used to decide
 * whether a label edit should keep re-deriving the key: once the user edits the
 * key to something that no longer matches the label, this returns false and the
 * key is treated as a manual override (no further auto-sync). Survives reloads
 * because it's computed purely from the key/label pair, not a stored flag.
 */
export function isAutoKey(key: string, label: string): boolean {
  if (!key) return true; // empty → will be derived
  const base = sanitizeKey(label); // identifier-safe, so regex-safe
  return key === base || new RegExp(`^${base}\\d+$`).test(key);
}

/** Effective key for an entity (its `key` attribute, falling back to its id). */
export function keyOf(id: string, e: SchemaEntity): string {
  const k = e.attributes?.key;
  return typeof k === "string" && k ? k : id;
}

/**
 * Deterministic traversal order: depth-first from `root`, then any entities not
 * reachable from root (orphans), in insertion order. Stable ordering matters so
 * that when keys collide the *earlier* field keeps its name and later ones get
 * suffixed — repeated normalization is then idempotent.
 */
export function orderedIds(schema: FormSchema): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return; // guard against cycles
    const e = schema.entities[id];
    if (!e) return;
    seen.add(id);
    out.push(id);
    for (const c of e.children ?? []) visit(c);
  };
  for (const id of schema.root) visit(id);
  for (const id of Object.keys(schema.entities)) if (!seen.has(id)) visit(id);
  return out;
}

/** entityId → effective key, for every keyed field, in traversal order. */
export function collectKeys(schema: FormSchema): Array<{ id: string; key: string }> {
  const out: Array<{ id: string; key: string }> = [];
  for (const id of orderedIds(schema)) {
    const e = schema.entities[id];
    if (e && isKeyed(e)) out.push({ id, key: keyOf(id, e) });
  }
  return out;
}

/** Ids of keyed entities whose key duplicates an earlier field's key. */
export function duplicateKeyIds(schema: FormSchema): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const { id, key } of collectKeys(schema)) {
    if (seen.has(key)) dupes.add(id);
    else seen.add(key);
  }
  return dupes;
}

/**
 * Return a copy of the schema with every keyed field given a valid, unique key.
 * Valid + still-unique keys are preserved; invalid or colliding ones are
 * sanitized and suffixed. Pure — does not mutate the input.
 */
export function normalizeKeys(schema: FormSchema): FormSchema {
  const entities: Record<string, SchemaEntity> = {};
  for (const [id, e] of Object.entries(schema.entities)) entities[id] = { ...e, attributes: { ...e.attributes } };
  const out: FormSchema = { entities, root: [...schema.root] };

  const taken = new Set<string>();
  for (const id of orderedIds(out)) {
    const e = out.entities[id];
    if (!e || !isKeyed(e)) continue;
    const cur = e.attributes.key;
    const base = sanitizeKey(typeof cur === "string" && cur ? cur : (e.attributes.label ?? e.type));
    const key = uniqueKey(base, taken);
    taken.add(key);
    e.attributes.key = key;
  }
  return out;
}

/**
 * Re-key every field to camelCase (derived from its label, else its current
 * key), keeping keys unique, and rewrite all key references — conditional
 * (`conditional.when`), logic rules (`logic[].when/value`) and the expression
 * attributes — so nothing breaks. Built for AI-applied schemas, whose agent may
 * emit snake_case keys. Pure; does not mutate the input.
 */
export function camelCaseKeys(schema: FormSchema): FormSchema {
  const entities: Record<string, SchemaEntity> = {};
  for (const [id, e] of Object.entries(schema.entities)) entities[id] = { ...e, attributes: { ...e.attributes } };
  const out: FormSchema = { entities, root: [...schema.root] };

  const taken = new Set<string>();
  const remap = new Map<string, string>(); // oldKey → newKey
  for (const id of orderedIds(out)) {
    const e = out.entities[id];
    if (!e || !isKeyed(e)) continue;
    const oldKey = typeof e.attributes.key === "string" ? e.attributes.key : "";
    const base = toCamelKey(typeof e.attributes.label === "string" && e.attributes.label ? e.attributes.label : oldKey || e.type);
    const newKey = uniqueKey(base, taken);
    taken.add(newKey);
    e.attributes.key = newKey;
    if (oldKey && oldKey !== newKey) remap.set(oldKey, newKey);
  }
  if (remap.size === 0) return out;

  // Single-pass token replace, longest key first so no partial/cascading hits.
  const olds = [...remap.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${olds.join("|")})\\b`, "g");
  const rewrite = (s: unknown): string | unknown =>
    typeof s === "string" ? s.replace(re, (m) => remap.get(m) ?? m) : s;

  const EXPR = ["calculateValue", "customConditional", "customValidation", "customDefaultValue"];
  for (const id of Object.keys(entities)) {
    const entity = entities[id];
    if (!entity) continue; // id came from Object.keys(entities), always present
    const a = entity.attributes;
    for (const attr of EXPR) if (typeof a[attr] === "string") a[attr] = rewrite(a[attr]);
    const cond = a.conditional as { when?: string } | undefined;
    if (cond && typeof cond.when === "string" && remap.has(cond.when)) {
      a.conditional = { ...cond, when: remap.get(cond.when)! };
    }
    if (Array.isArray(a.logic)) {
      a.logic = (a.logic as Array<{ when?: string; value?: string }>).map((r) => ({
        ...r,
        ...(typeof r.when === "string" ? { when: rewrite(r.when) } : {}),
        ...(typeof r.value === "string" ? { value: rewrite(r.value) } : {}),
      }));
    }
  }
  return out;
}

/**
 * Full integrity check: referential soundness + key validity/uniqueness. Returns
 * a flat problem list (errors should block check-in/publish; warnings are
 * advisory). Tolerant of malformed input — never throws.
 */
export function validateSchema(schema: FormSchema | null | undefined): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  if (!schema || typeof schema !== "object" || !schema.entities || !Array.isArray(schema.root)) {
    problems.push({ code: "malformed-schema", severity: "error", message: "Schema is missing entities or root." });
    return problems;
  }
  const { entities, root } = schema;

  // Referential integrity: root + children must point at existing entities.
  for (const id of root) {
    if (!entities[id]) {
      problems.push({ code: "dangling-root", severity: "error", entityId: id, message: `Root references unknown entity "${id}".` });
    }
  }
  for (const [id, e] of Object.entries(entities)) {
    for (const cid of e.children ?? []) {
      if (!entities[cid]) {
        problems.push({ code: "dangling-child", severity: "error", entityId: id, message: `Container "${id}" references unknown child "${cid}".` });
      } else if (entities[cid].parentId !== undefined && entities[cid].parentId !== id) {
        problems.push({ code: "parent-mismatch", severity: "warning", entityId: cid, message: `Entity "${cid}" is a child of "${id}" but its parentId is "${entities[cid].parentId}".` });
      }
    }
  }

  // Reachability + cycle detection from root.
  const reachable = new Set<string>();
  const onStack = new Set<string>();
  let cycle = false;
  const walk = (id: string) => {
    if (onStack.has(id)) { cycle = true; return; }
    if (reachable.has(id)) return;
    const e = entities[id];
    if (!e) return;
    reachable.add(id);
    onStack.add(id);
    for (const c of e.children ?? []) walk(c);
    onStack.delete(id);
  };
  for (const id of root) walk(id);
  if (cycle) problems.push({ code: "cycle", severity: "error", message: "The schema contains a container cycle." });
  for (const id of Object.keys(entities)) {
    if (!reachable.has(id)) {
      problems.push({ code: "orphan", severity: "warning", entityId: id, message: `Entity "${id}" is not reachable from the form root.` });
    }
  }

  // Key validity.
  for (const { id, key } of collectKeys(schema)) {
    if (!isValidKey(key)) {
      problems.push({ code: "invalid-key", severity: "error", entityId: id, message: `Key "${key}" isn't a valid identifier — logic and calculations can't reference it.` });
    }
  }
  // Key uniqueness.
  for (const id of duplicateKeyIds(schema)) {
    const dup = entities[id];
    if (!dup) continue; // ids come from collectKeys → always existing entities
    problems.push({ code: "duplicate-key", severity: "error", entityId: id, message: `Key "${keyOf(id, dup)}" is used by more than one field — their answers would collide.` });
  }

  return problems;
}

/** Convenience: does the schema have any blocking (error-severity) problem? */
export function hasBlockingProblems(schema: FormSchema | null | undefined): boolean {
  return validateSchema(schema).some((p) => p.severity === "error");
}

// ── Form-level settings ──────────────────────────────────────────────────────
// Stored alongside `entities`/`root` in the schema JSON (a `settings` sibling).
// The builder preserves it across saves; the renderer reads it after submit.
export type FormSettings = {
  submitMessage?: string;
  /** Opt-in: when true the form offers a file-attachments tab to the filler. Default off. */
  attachments?: boolean;
  /** Opt-in: when true the completed submission is rendered to a PDF server-side and attached to
   *  the process instance (visible in the Form Inbox + Core UI Tasklist). Default off. */
  saveSubmissionAsPdf?: boolean;
};

/** Read form-level settings from a schema JSON string (tolerant of anything). */
export function readSettings(rawSchema: string | null | undefined): FormSettings {
  if (!rawSchema) return {};
  try {
    const s = JSON.parse(rawSchema);
    const settings = s && typeof s === "object" ? s.settings : null;
    return settings && typeof settings === "object" ? (settings as FormSettings) : {};
  } catch {
    return {};
  }
}

/** The custom submission message for a form, or "" when none is set. */
export function readSubmitMessage(rawSchema: string | null | undefined): string {
  const m = readSettings(rawSchema).submitMessage;
  return typeof m === "string" ? m : "";
}

/** Whether the form opts into a file-attachments tab for the filler (default off). */
export function readAttachmentsEnabled(rawSchema: string | null | undefined): boolean {
  return readSettings(rawSchema).attachments === true;
}

/** Whether the form renders each completed submission to a PDF attached to the process (default off). */
export function readSaveSubmissionAsPdf(rawSchema: string | null | undefined): boolean {
  return readSettings(rawSchema).saveSubmissionAsPdf === true;
}

/**
 * Return a structurally-sound copy of the schema so the builder/renderer can
 * never choke on a corrupted draft. It:
 *   - drops `root`/`children` ids that don't exist,
 *   - breaks container cycles (removes the back-edge),
 *   - keeps only entities reachable from root, with a correct `parentId`.
 * Pure. `removed` lists entity ids that were unreachable and dropped.
 */
export function repairSchema(schema: FormSchema): { schema: FormSchema; removed: string[] } {
  const src = schema.entities ?? {};
  const exists = (id: string) => Object.prototype.hasOwnProperty.call(src, id);

  // Clone entities with filtered children (drop dangling child ids up front).
  const entities: Record<string, SchemaEntity> = {};
  for (const [id, e] of Object.entries(src)) {
    entities[id] = { ...e, attributes: { ...e.attributes } };
    if (Array.isArray(e.children)) entities[id].children = e.children.filter(exists);
  }

  const root = (Array.isArray(schema.root) ? schema.root : []).filter(exists);

  // Reachability DFS from root, breaking cycles and reseating parentId.
  const reachable = new Set<string>();
  const onStack = new Set<string>();
  const visit = (id: string, parentId?: string) => {
    const e = entities[id];
    if (!e) return;
    if (onStack.has(id) || reachable.has(id)) {
      // Already placed (cycle back-edge or a child claimed by two parents):
      // sever this edge so the tree stays acyclic and single-parent.
      if (parentId) {
        const parent = entities[parentId];
        const pc = parent?.children;
        if (parent && pc) parent.children = pc.filter((c) => c !== id);
      }
      return;
    }
    reachable.add(id);
    onStack.add(id);
    if (parentId) e.parentId = parentId;
    else delete e.parentId;
    for (const cid of [...(e.children ?? [])]) visit(cid, id);
    onStack.delete(id);
  };
  for (const id of root) visit(id, undefined);

  // Drop anything not reachable from root (truly disconnected).
  const removed: string[] = [];
  for (const id of Object.keys(entities)) {
    if (!reachable.has(id)) {
      removed.push(id);
      delete entities[id];
    }
  }

  return { schema: { entities, root }, removed };
}
