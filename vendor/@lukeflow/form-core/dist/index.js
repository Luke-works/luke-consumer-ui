// src/schema/types.ts
var KEY_REGEX_SOURCE = "^[A-Za-z_][A-Za-z0-9_]*$";
var RESERVED_KEYS = [
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity"
];
var LOGIC_ACTIONS = [
  "show",
  "hide",
  "enable",
  "disable",
  "require",
  "optional",
  "setValue"
];

// src/schema/repair.ts
var KEY_RE = new RegExp(KEY_REGEX_SOURCE);
var RESERVED = new Set(RESERVED_KEYS);
function isValidKey(value) {
  return typeof value === "string" && KEY_RE.test(value) && !RESERVED.has(value);
}
function attrsOf(e) {
  if (!e || typeof e.attributes !== "object" || e.attributes === null) return {};
  return e.attributes;
}
function isKeyed(e) {
  return !!e && typeof e.attributes === "object" && e.attributes !== null && "key" in e.attributes;
}
function sanitizeKey(raw) {
  if (isValidKey(raw)) return raw;
  const text = typeof raw === "string" ? raw : "";
  const words = text.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "field";
  let k = words.map((w, i) => i === 0 ? w.toLowerCase() : (w[0] ?? "").toUpperCase() + w.slice(1).toLowerCase()).join("");
  if (/^[0-9]/.test(k)) k = `f${k}`;
  if (RESERVED.has(k)) k = `${k}Field`;
  return k || "field";
}
function toCamelKey(raw) {
  const text = typeof raw === "string" ? raw : "";
  const words = text.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "field";
  let k = words.map(
    (w, i) => i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)
  ).join("");
  if (/^[0-9]/.test(k)) k = `f${k}`;
  if (RESERVED.has(k)) k = `${k}Field`;
  return k || "field";
}
function uniqueKey(base, taken) {
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}
function isAutoKey(key, label) {
  if (!key) return true;
  const base = sanitizeKey(label);
  return key === base || new RegExp(`^${base}\\d+$`).test(key);
}
function keyOf(id, e) {
  const k = attrsOf(e).key;
  return typeof k === "string" && k ? k : id;
}
function orderedIds(schema) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const entities = schema.entities ?? {};
  const visit = (id) => {
    if (seen.has(id)) return;
    const e = entities[id];
    if (!e) return;
    seen.add(id);
    out.push(id);
    for (const c of e.children ?? []) visit(c);
  };
  for (const id of schema.root ?? []) visit(id);
  for (const id of Object.keys(entities)) if (!seen.has(id)) visit(id);
  return out;
}
function collectKeys(schema) {
  const out = [];
  const entities = schema.entities ?? {};
  for (const id of orderedIds(schema)) {
    const e = entities[id];
    if (isKeyed(e)) out.push({ id, key: keyOf(id, e) });
  }
  return out;
}
function duplicateKeyIds(schema) {
  const seen = /* @__PURE__ */ new Set();
  const dupes = /* @__PURE__ */ new Set();
  for (const { id, key } of collectKeys(schema)) {
    if (seen.has(key)) dupes.add(id);
    else seen.add(key);
  }
  return dupes;
}
function cloneEntities(schema) {
  const entities = {};
  for (const [id, e] of Object.entries(schema.entities ?? {})) {
    entities[id] = { ...e, attributes: { ...attrsOf(e) } };
  }
  return entities;
}
function normalizeKeys(schema) {
  const entities = cloneEntities(schema);
  const out = { ...schema, entities, root: [...schema.root ?? []] };
  const taken = /* @__PURE__ */ new Set();
  for (const id of orderedIds(out)) {
    const e = out.entities[id];
    if (!isKeyed(e) || !e) continue;
    const a = e.attributes;
    const cur = a.key;
    const fallback = typeof a.label === "string" && a.label ? a.label : e.type;
    const base = sanitizeKey(typeof cur === "string" && cur ? cur : fallback);
    const key = uniqueKey(base, taken);
    taken.add(key);
    a.key = key;
  }
  return out;
}
var EXPR_ATTRS = [
  "calculateValue",
  "customConditional",
  "customValidation",
  "customDefaultValue"
];
function camelCaseKeys(schema) {
  const entities = cloneEntities(schema);
  const out = { ...schema, entities, root: [...schema.root ?? []] };
  const taken = /* @__PURE__ */ new Set();
  const remap = /* @__PURE__ */ new Map();
  for (const id of orderedIds(out)) {
    const e = out.entities[id];
    if (!isKeyed(e) || !e) continue;
    const a = e.attributes;
    const oldKey = typeof a.key === "string" ? a.key : "";
    const labelSource = typeof a.label === "string" && a.label ? a.label : oldKey || e.type;
    const base = toCamelKey(labelSource);
    const newKey = uniqueKey(base, taken);
    taken.add(newKey);
    a.key = newKey;
    if (oldKey && oldKey !== newKey) remap.set(oldKey, newKey);
  }
  if (remap.size === 0) return out;
  const olds = [...remap.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${olds.map(escapeRe).join("|")})\\b`, "g");
  const rewrite = (s) => s.replace(re, (m) => remap.get(m) ?? m);
  for (const id of Object.keys(entities)) {
    const entity = entities[id];
    if (!entity) continue;
    const a = entity.attributes;
    for (const attr of EXPR_ATTRS) {
      const v = a[attr];
      if (typeof v === "string") a[attr] = rewrite(v);
    }
    const cond = a.conditional;
    if (cond && typeof cond.when === "string" && remap.has(cond.when)) {
      a.conditional = { ...cond, when: remap.get(cond.when) };
    }
    if (Array.isArray(a.logic)) {
      a.logic = a.logic.map((r) => ({
        ...r,
        ...typeof r.when === "string" ? { when: rewrite(r.when) } : {},
        ...typeof r.value === "string" ? { value: rewrite(r.value) } : {}
      }));
    }
  }
  return out;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function repairSchema(schema) {
  const src = schema?.entities ?? {};
  const exists = (id) => Object.prototype.hasOwnProperty.call(src, id);
  const entities = {};
  for (const [id, e] of Object.entries(src)) {
    entities[id] = { ...e, attributes: { ...attrsOf(e) } };
    if (Array.isArray(e.children)) entities[id].children = e.children.filter(exists);
  }
  const root = (Array.isArray(schema?.root) ? schema.root : []).filter(exists);
  const reachable = /* @__PURE__ */ new Set();
  const onStack = /* @__PURE__ */ new Set();
  const visit = (id, parentId) => {
    const e = entities[id];
    if (!e) return;
    if (onStack.has(id) || reachable.has(id)) {
      if (parentId) {
        const parent = entities[parentId];
        if (parent?.children) parent.children = parent.children.filter((c) => c !== id);
      }
      return;
    }
    reachable.add(id);
    onStack.add(id);
    if (parentId) e.parentId = parentId;
    else delete e.parentId;
    for (const cid of [...e.children ?? []]) visit(cid, id);
    onStack.delete(id);
  };
  for (const id of root) visit(id, void 0);
  const removed = [];
  for (const id of Object.keys(entities)) {
    if (!reachable.has(id)) {
      removed.push(id);
      delete entities[id];
    }
  }
  const repaired = { ...schema, entities, root };
  return { schema: repaired, removed };
}

// src/schema/validate.ts
var RESERVED2 = new Set(RESERVED_KEYS);
function diag(code, severity, message, context = {}, entityId) {
  return entityId === void 0 ? { code, severity, context, message } : { code, severity, entityId, context, message };
}
function validateSchema(schema) {
  const out = [];
  if (!schema || typeof schema !== "object" || typeof schema.entities !== "object" || schema.entities === null || !Array.isArray(schema.root)) {
    out.push(diag("malformed-schema", "error", "Schema is missing entities or root."));
    return out;
  }
  const entities = schema.entities;
  const root = schema.root;
  for (const id of root) {
    if (!entities[id]) {
      out.push(
        diag("dangling-root", "error", `Root references unknown entity "${id}".`, { id }, id)
      );
    }
  }
  for (const [id, e] of Object.entries(entities)) {
    for (const cid of e.children ?? []) {
      const child = entities[cid];
      if (!child) {
        out.push(
          diag(
            "dangling-child",
            "error",
            `Container "${id}" references unknown child "${cid}".`,
            { parentId: id, childId: cid },
            id
          )
        );
      } else if (child.parentId !== void 0 && child.parentId !== null && child.parentId !== id) {
        out.push(
          diag(
            "parent-mismatch",
            "warning",
            `Entity "${cid}" is a child of "${id}" but its parentId is "${child.parentId}".`,
            { childId: cid, listedParent: id, parentId: child.parentId },
            cid
          )
        );
      }
    }
  }
  const reachable = /* @__PURE__ */ new Set();
  const onStack = /* @__PURE__ */ new Set();
  let cycle = false;
  const walk = (id) => {
    if (onStack.has(id)) {
      cycle = true;
      return;
    }
    if (reachable.has(id)) return;
    const e = entities[id];
    if (!e) return;
    reachable.add(id);
    onStack.add(id);
    for (const c of e.children ?? []) walk(c);
    onStack.delete(id);
  };
  for (const id of root) walk(id);
  if (cycle) out.push(diag("cycle", "error", "The schema contains a container cycle."));
  for (const id of Object.keys(entities)) {
    if (!reachable.has(id)) {
      out.push(
        diag(
          "orphan",
          "warning",
          `Entity "${id}" is not reachable from the form root.`,
          { id },
          id
        )
      );
    }
  }
  for (const { id, key } of collectKeys(schema)) {
    if (typeof key === "string" && RESERVED2.has(key)) {
      out.push(
        diag(
          "reserved-key",
          "error",
          `Key "${key}" is a reserved word \u2014 it would shadow the expression engine.`,
          { key, source: KEY_REGEX_SOURCE },
          id
        )
      );
    } else if (!KEY_RE.test(key)) {
      out.push(
        diag(
          "invalid-key",
          "error",
          `Key "${key}" isn't a valid identifier \u2014 logic and calculations can't reference it.`,
          { key, source: KEY_REGEX_SOURCE },
          id
        )
      );
    }
  }
  for (const [id, e] of Object.entries(entities)) {
    const at = e.attributes;
    if (!at || at.disabled !== true || at.required !== true || at.hidden === true) continue;
    const logic = Array.isArray(at.logic) ? at.logic : [];
    const hasValueSource = logic.some((r) => r.action === "enable" || r.action === "setValue") || at.calculateValue != null || at.calculateValueJs != null || at.customDefaultValue != null || at.defaultValue !== void 0 || at.defaultChecked === true;
    if (hasValueSource) continue;
    out.push(
      diag(
        "disabled-required",
        "warning",
        `Field "${keyOf(id, e)}" is both disabled and required, but nothing supplies a value \u2014 it can never be filled. Enable it with a logic rule (or give it a calculated/default value), or clear one of the two.`,
        { key: keyOf(id, e) },
        id
      )
    );
  }
  for (const [id, e] of Object.entries(entities)) {
    const at = e.attributes;
    if (!at || at.required !== true || at.persistent !== false) continue;
    out.push(
      diag(
        "required-excluded",
        "warning",
        `Field "${keyOf(id, e)}" is required but excluded from submission \u2014 a respondent must fill it, yet its value is dropped and never saved. Clear "Exclude from submission", or make the field optional.`,
        { key: keyOf(id, e) },
        id
      )
    );
  }
  const rootPages = root.filter((id) => entities[id]?.type === "page").length;
  if (rootPages > 0 && rootPages < root.length) {
    out.push(
      diag(
        "partial-wizard",
        "warning",
        "Pages become wizard steps only when EVERY top-level item is a Page. Mixed with other fields, a Page renders as a plain container \u2014 move the other fields into Pages (or remove the Page) to get a multi-step wizard.",
        { rootPages, rootCount: root.length }
      )
    );
  }
  for (const id of duplicateKeyIds(schema)) {
    const e = entities[id];
    out.push(
      diag(
        "duplicate-key",
        "error",
        `Key "${keyOf(id, e)}" is used by more than one field \u2014 their answers would collide.`,
        { key: keyOf(id, e) },
        id
      )
    );
  }
  return out;
}
function validateSchemaReport(schema) {
  const diagnostics = validateSchema(schema);
  let hasErrors = false;
  let hasWarnings = false;
  for (const d of diagnostics) {
    if (d.severity === "error") hasErrors = true;
    else if (d.severity === "warning") hasWarnings = true;
  }
  return { diagnostics, hasErrors, hasWarnings };
}
function hasBlockingProblems(schema) {
  return validateSchema(schema).some((d) => d.severity === "error");
}

// src/schema/settings.ts
function readSettings(rawSchema) {
  if (!rawSchema) return {};
  try {
    const s = JSON.parse(rawSchema);
    const settings = s && typeof s === "object" ? s.settings : void 0;
    return settings && typeof settings === "object" ? settings : {};
  } catch {
    return {};
  }
}
function readSubmitMessage(rawSchema) {
  const m = readSettings(rawSchema).submitMessage;
  return typeof m === "string" ? m : "";
}

// src/schema/migrate.ts
var CURRENT_SCHEMA_VERSION = 1;
function migrateSchema(schema, migrations = []) {
  const from = typeof schema?.version === "number" ? schema.version : 0;
  let version = from;
  let out = schema ?? { root: [], entities: {} };
  const applied = [];
  for (const m of [...migrations].sort((a, b) => a.to - b.to)) {
    if (m.to > version) {
      out = { ...m.migrate(out), version: m.to };
      version = m.to;
      applied.push(m.to);
    }
  }
  if (version < CURRENT_SCHEMA_VERSION) {
    out = { ...out, version: CURRENT_SCHEMA_VERSION };
    version = CURRENT_SCHEMA_VERSION;
  }
  return { schema: out, from, to: version, applied };
}

// src/validation/messages.ts
var DEFAULT_MESSAGES = {
  required: "{label} is required",
  minLength: "Must be at least {min} characters",
  maxLength: "Must be at most {max} characters",
  minWords: "Must be at least {min} words",
  maxWords: "Must be at most {max} words",
  min: "Must be \u2265 {min}",
  max: "Must be \u2264 {max}",
  pattern: "Invalid format",
  email: "Enter a valid email address",
  url: "Enter a valid URL (https://\u2026)",
  minDate: "Must be on or after {min}",
  maxDate: "Must be on or before {max}",
  minTime: "Must be at or after {min}",
  maxTime: "Must be at or before {max}",
  minSelected: "Select at least {min}",
  maxSelected: "Select at most {max}",
  minTags: "Add at least {min} {units}",
  maxTags: "Add at most {max} {units}",
  minRows: "Add at least {min} {units}",
  maxRows: "Add at most {max} {units}",
  minFiles: "Upload at least {min} {units}",
  maxFiles: "Upload at most {max} {units}",
  maxFileSize: "Each file must be \u2264 {max} MB",
  custom: "Invalid value"
};
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
    const value = params[name];
    return value == null ? "" : String(value);
  });
}
function renderMessage(code, params, customMessage) {
  if (typeof customMessage === "string" && customMessage.length > 0) {
    return customMessage;
  }
  return interpolate(DEFAULT_MESSAGES[code], params);
}

// src/validation/builtins.ts
function asNum(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : void 0;
}
function asStr(v) {
  return typeof v === "string" ? v : "";
}
function asBool(v) {
  return Boolean(v);
}
function wordCount(v) {
  return v.trim() ? v.trim().split(/\s+/).length : 0;
}
function labelOf(attributes) {
  return asStr(attributes.errorLabel) || asStr(attributes.label) || "This field";
}
function customMessageOf(attributes) {
  const m = asStr(attributes.customMessage);
  return m.length > 0 ? m : void 0;
}
function unit(count, singular) {
  const plural = count === 1 ? singular : `${singular}s`;
  return { unit: singular, units: plural };
}
function ok(field) {
  return { field, valid: true };
}
function fail(field, code, params, customMessage) {
  return {
    field,
    valid: false,
    code,
    params,
    message: renderMessage(code, params, customMessage)
  };
}
function isEmptyValue(v) {
  if (v === void 0 || v === null || v === "" || Array.isArray(v) && v.length === 0) return true;
  if (typeof v === "object" && !Array.isArray(v)) {
    const vals = Object.values(v);
    return vals.length === 0 || vals.every((x) => x === void 0 || x === null || x === "" || Array.isArray(x) && x.length === 0);
  }
  return false;
}
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var URL_RE = /^https?:\/\/\S+$/;
var requiredRule = {
  code: "required",
  build(attributes) {
    if (!asBool(attributes.required)) return null;
    const label = labelOf(attributes);
    const custom = customMessageOf(attributes);
    return ({ field, value }) => {
      const empty = value === true ? false : isEmptyValue(value);
      const checkboxUnchecked = typeof value === "boolean" && value !== true;
      if (empty || checkboxUnchecked) {
        return fail(field, "required", { label }, custom);
      }
      return ok(field);
    };
  }
};
function lengthRule(code, attr, measure, compare, boundKey) {
  return {
    code,
    build(attributes) {
      const bound = asNum(attributes[attr]);
      if (bound === void 0) return null;
      const custom = customMessageOf(attributes);
      return ({ field, value }) => {
        if (isEmptyValue(value) || typeof value !== "string") return ok(field);
        const n = measure(value);
        if (compare(n, bound)) return fail(field, code, { [boundKey]: bound, actual: n }, custom);
        return ok(field);
      };
    }
  };
}
var minLengthRule = lengthRule(
  "minLength",
  "minLength",
  (s) => s.length,
  (n, b) => n < b,
  "min"
);
var maxLengthRule = lengthRule(
  "maxLength",
  "maxLength",
  (s) => s.length,
  (n, b) => n > b,
  "max"
);
var minWordsRule = lengthRule(
  "minWords",
  "minWords",
  wordCount,
  (n, b) => n < b,
  "min"
);
var maxWordsRule = lengthRule(
  "maxWords",
  "maxWords",
  wordCount,
  (n, b) => n > b,
  "max"
);
var patternRule = {
  code: "pattern",
  build(attributes) {
    const pattern = asStr(attributes.pattern);
    if (!pattern) return null;
    let re = null;
    try {
      re = new RegExp(pattern);
    } catch {
      re = null;
    }
    if (re === null) return null;
    const compiled = re;
    const custom = customMessageOf(attributes);
    return ({ field, value }) => {
      if (isEmptyValue(value) || typeof value !== "string") return ok(field);
      let pass = true;
      try {
        pass = compiled.test(value);
      } catch {
        pass = true;
      }
      return pass ? ok(field) : fail(field, "pattern", { pattern }, custom);
    };
  }
};
function numericRule(code, attr, compare) {
  return {
    code,
    build(attributes) {
      const bound = asNum(attributes[attr]);
      if (bound === void 0) return null;
      const custom = customMessageOf(attributes);
      return ({ field, value }) => {
        if (isEmptyValue(value)) return ok(field);
        if (typeof value !== "number" && typeof value !== "string") return ok(field);
        const n = Number(value);
        if (!Number.isFinite(n)) return ok(field);
        if (compare(n, bound)) return fail(field, code, { [attr]: bound, actual: n }, custom);
        return ok(field);
      };
    }
  };
}
var minRule = numericRule("min", "min", (n, b) => n < b);
var maxRule = numericRule("max", "max", (n, b) => n > b);
function shapeRule(code, type, re) {
  return {
    code,
    build(attributes) {
      if (asStr(attributes.type) !== type) return null;
      const custom = customMessageOf(attributes);
      return ({ field, value }) => {
        if (isEmptyValue(value) || typeof value !== "string") return ok(field);
        return re.test(value) ? ok(field) : fail(field, code, {}, custom);
      };
    }
  };
}
var emailRule = shapeRule("email", "email", EMAIL_RE);
var urlRule = shapeRule("url", "url", URL_RE);
function boundaryRule(code, attr, compare, boundKey) {
  return {
    code,
    build(attributes) {
      const bound = asStr(attributes[attr]);
      if (!bound) return null;
      const custom = customMessageOf(attributes);
      return ({ field, value }) => {
        if (isEmptyValue(value) || typeof value !== "string") return ok(field);
        if (compare(value, bound)) return fail(field, code, { [boundKey]: bound }, custom);
        return ok(field);
      };
    }
  };
}
var minDateRule = boundaryRule("minDate", "minDate", (v, b) => v < b, "min");
var maxDateRule = boundaryRule("maxDate", "maxDate", (v, b) => v > b, "max");
var minTimeRule = boundaryRule("minTime", "minTime", (v, b) => v < b, "min");
var maxTimeRule = boundaryRule("maxTime", "maxTime", (v, b) => v > b, "max");
function countRule(code, attr, compare, boundKey, unitSingular) {
  return {
    code,
    build(attributes) {
      const bound = asNum(attributes[attr]);
      if (bound === void 0) return null;
      const custom = customMessageOf(attributes);
      return ({ field, value }) => {
        const arr = Array.isArray(value) ? value : [];
        const n = arr.length;
        if (compare(n, bound)) {
          return fail(field, code, { [boundKey]: bound, actual: n, ...unit(bound, unitSingular) }, custom);
        }
        return ok(field);
      };
    }
  };
}
var minSelectedRule = countRule("minSelected", "minSelected", (n, b) => n < b, "min", "option");
var maxSelectedRule = countRule("maxSelected", "maxSelected", (n, b) => n > b, "max", "option");
var minTagsRule = countRule("minTags", "minTags", (n, b) => n < b, "min", "tag");
var maxTagsRule = countRule("maxTags", "maxTags", (n, b) => n > b, "max", "tag");
var minRowsRule = countRule("minRows", "minRows", (n, b) => n < b, "min", "row");
var maxRowsRule = countRule("maxRows", "maxRows", (n, b) => n > b, "max", "row");
var minFilesRule = countRule("minFiles", "minFiles", (n, b) => n < b, "min", "file");
var maxFilesRule = countRule("maxFiles", "maxFiles", (n, b) => n > b, "max", "file");
var maxFileSizeRule = {
  code: "maxFileSize",
  build(attributes) {
    const maxSize = asNum(attributes.maxSize);
    if (maxSize === void 0) return null;
    const custom = customMessageOf(attributes);
    const limitBytes = maxSize * 1024 * 1024;
    return ({ field, value }) => {
      const files = Array.isArray(value) ? value : [];
      const over = files.some((f) => typeof f?.size === "number" && f.size > limitBytes);
      return over ? fail(field, "maxFileSize", { max: maxSize }, custom) : ok(field);
    };
  }
};
var BUILTIN_RULES = [
  requiredRule,
  minLengthRule,
  maxLengthRule,
  minWordsRule,
  maxWordsRule,
  patternRule,
  emailRule,
  urlRule,
  minRule,
  maxRule,
  minDateRule,
  maxDateRule,
  minTimeRule,
  maxTimeRule,
  minSelectedRule,
  maxSelectedRule,
  minTagsRule,
  maxTagsRule,
  minRowsRule,
  maxRowsRule,
  minFilesRule,
  maxFilesRule,
  maxFileSizeRule
];

// src/engine/exprParser.ts
var CONSTANTS = { PI: Math.PI, E: Math.E };
var FUNCTIONS = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  trunc: Math.trunc,
  sign: Math.sign,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  exp: Math.exp,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  hypot: Math.hypot
};
var KEYWORDS = /* @__PURE__ */ new Set(["and", "or", "not", "true", "false"]);
var OPS = ["==", "!=", "<=", ">=", "&&", "||", "+", "-", "*", "/", "%", "^", "<", ">", "!"];
var PUNC = /* @__PURE__ */ new Set(["(", ")", ",", "?", ":", "[", "]"]);
function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "	" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let s = "";
      while (j < n && src[j] !== quote) {
        if (src[j] === "\\" && j + 1 < n) {
          s += src[j + 1];
          j += 2;
          continue;
        }
        s += src[j];
        j++;
      }
      if (j >= n) throw new SyntaxError("unterminated string");
      toks.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (c >= "0" && c <= "9" || c === "." && i + 1 < n && src[i + 1] >= "0" && src[i + 1] <= "9") {
      let j = i;
      while (j < n && (src[j] >= "0" && src[j] <= "9" || src[j] === ".")) j++;
      if (j < n && (src[j] === "e" || src[j] === "E")) {
        j++;
        if (j < n && (src[j] === "+" || src[j] === "-")) j++;
        while (j < n && src[j] >= "0" && src[j] <= "9") j++;
      }
      toks.push({ t: "num", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j])) j++;
      toks.push({ t: "ident", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      toks.push({ t: "op", v: op });
      i += op.length;
      continue;
    }
    if (PUNC.has(c)) {
      toks.push({ t: "punc", v: c });
      i++;
      continue;
    }
    throw new SyntaxError(`unexpected character '${c}'`);
  }
  return toks;
}
var Parser = class {
  constructor(toks) {
    this.toks = toks;
    this.p = 0;
  }
  peek() {
    return this.toks[this.p];
  }
  next() {
    return this.toks[this.p++];
  }
  isOp(v) {
    const t = this.peek();
    return !!t && (t.t === "op" || t.t === "ident") && t.v === v;
  }
  isPunc(v) {
    const t = this.peek();
    return !!t && t.t === "punc" && t.v === v;
  }
  eat(v) {
    const t = this.next();
    if (!t || t.v !== v) throw new SyntaxError(`expected '${v}'`);
  }
  parse() {
    const node = this.ternary();
    if (this.peek()) throw new SyntaxError(`unexpected token '${this.peek().v}'`);
    return node;
  }
  ternary() {
    const cond = this.or();
    if (this.isPunc("?")) {
      this.next();
      const then = this.ternary();
      this.eat(":");
      const els = this.ternary();
      return { k: "ternary", cond, then, else: els };
    }
    return cond;
  }
  or() {
    let l = this.and();
    while (this.isOp("or") || this.isOp("||")) {
      this.next();
      l = { k: "logical", op: "or", l, r: this.and() };
    }
    return l;
  }
  and() {
    let l = this.equality();
    while (this.isOp("and") || this.isOp("&&")) {
      this.next();
      l = { k: "logical", op: "and", l, r: this.equality() };
    }
    return l;
  }
  equality() {
    let l = this.comparison();
    while (this.isOp("==") || this.isOp("!=")) {
      const op = this.next().v;
      l = { k: "bin", op, l, r: this.comparison() };
    }
    return l;
  }
  comparison() {
    let l = this.additive();
    while (this.isOp("<") || this.isOp("<=") || this.isOp(">") || this.isOp(">=")) {
      const op = this.next().v;
      l = { k: "bin", op, l, r: this.additive() };
    }
    return l;
  }
  additive() {
    let l = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next().v;
      l = { k: "bin", op, l, r: this.multiplicative() };
    }
    return l;
  }
  multiplicative() {
    let l = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.next().v;
      l = { k: "bin", op, l, r: this.unary() };
    }
    return l;
  }
  // Unary binds LOOSER than `^` (so `-2^2` === -(2^2) === -4, matching standard math + expr-eval),
  // but the EXPONENT may be unary (`2^-1`). unary → power → primary; the exponent recurses via unary.
  unary() {
    if (this.isOp("-") || this.isOp("+") || this.isOp("!") || this.isOp("not")) {
      const op = this.next().v;
      return { k: "unary", op: op === "not" ? "!" : op, arg: this.unary() };
    }
    return this.power();
  }
  power() {
    const l = this.primary();
    if (this.isOp("^")) {
      this.next();
      return { k: "bin", op: "^", l, r: this.unary() };
    }
    return l;
  }
  primary() {
    const t = this.next();
    if (!t) throw new SyntaxError("unexpected end of expression");
    if (t.t === "num") {
      const v = Number(t.v);
      if (Number.isNaN(v)) throw new SyntaxError(`invalid number '${t.v}'`);
      return { k: "lit", v };
    }
    if (t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "punc" && t.v === "(") {
      const e = this.ternary();
      this.eat(")");
      return e;
    }
    if (t.t === "punc" && t.v === "[") {
      const items = [];
      if (!this.isPunc("]")) {
        items.push(this.ternary());
        while (this.isPunc(",")) {
          this.next();
          items.push(this.ternary());
        }
      }
      this.eat("]");
      return { k: "array", items };
    }
    if (t.t === "ident") {
      if (t.v === "true") return { k: "lit", v: true };
      if (t.v === "false") return { k: "lit", v: false };
      if (KEYWORDS.has(t.v)) throw new SyntaxError(`unexpected keyword '${t.v}'`);
      if (this.isPunc("(")) {
        this.next();
        const args = [];
        if (!this.isPunc(")")) {
          args.push(this.ternary());
          while (this.isPunc(",")) {
            this.next();
            args.push(this.ternary());
          }
        }
        this.eat(")");
        return { k: "call", name: t.v, args };
      }
      return { k: "var", name: t.v };
    }
    throw new SyntaxError(`unexpected token '${t.v}'`);
  }
};
function parse(source) {
  return new Parser(tokenize(source)).parse();
}
var truthy = (v) => Boolean(v);
var isNumericLike = (v) => typeof v === "number" || typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v));
function looseEq(a, b) {
  if (a === b) return true;
  if (isNumericLike(a) && isNumericLike(b)) return Number(a) === Number(b);
  return false;
}
function evaluate(node, scope) {
  switch (node.k) {
    case "lit":
      return node.v;
    case "var":
      if (Object.prototype.hasOwnProperty.call(scope, node.name)) return scope[node.name];
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, node.name)) return CONSTANTS[node.name];
      throw new Error(`undefined variable: ${node.name}`);
    case "unary": {
      const v = evaluate(node.arg, scope);
      if (node.op === "!") return !truthy(v);
      if (node.op === "-") return -Number(v);
      return +Number(v);
    }
    case "logical": {
      const l = evaluate(node.l, scope);
      if (node.op === "and") return truthy(l) ? truthy(evaluate(node.r, scope)) : false;
      return truthy(l) ? true : truthy(evaluate(node.r, scope));
    }
    case "ternary":
      return truthy(evaluate(node.cond, scope)) ? evaluate(node.then, scope) : evaluate(node.else, scope);
    case "bin": {
      const l = evaluate(node.l, scope);
      const r = evaluate(node.r, scope);
      switch (node.op) {
        case "+":
          return typeof l === "string" || typeof r === "string" ? `${l}${r}` : Number(l) + Number(r);
        case "-":
          return Number(l) - Number(r);
        case "*":
          return Number(l) * Number(r);
        case "/":
          return Number(l) / Number(r);
        case "%":
          return Number(l) % Number(r);
        case "^":
          return Number(l) ** Number(r);
        case "==":
          return looseEq(l, r);
        case "!=":
          return !looseEq(l, r);
        case "<":
          return Number(l) < Number(r);
        case "<=":
          return Number(l) <= Number(r);
        case ">":
          return Number(l) > Number(r);
        case ">=":
          return Number(l) >= Number(r);
        default:
          throw new Error(`unknown operator: ${node.op}`);
      }
    }
    case "call": {
      const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : void 0;
      if (!fn) throw new Error(`undefined function: ${node.name}`);
      return fn(...node.args.map((a) => Number(evaluate(a, scope))));
    }
    case "array":
      return node.items.map((i) => evaluate(i, scope));
  }
}
function variablesOf(node, out = [], seen = /* @__PURE__ */ new Set()) {
  switch (node.k) {
    // Built-in constants (PI/E) are not field dependencies (a same-named field still settles on a
    // full pass; it just doesn't get an incremental edge — an acceptable edge for such a key).
    case "var":
      if (!seen.has(node.name) && !Object.prototype.hasOwnProperty.call(CONSTANTS, node.name)) {
        seen.add(node.name);
        out.push(node.name);
      }
      break;
    case "unary":
      variablesOf(node.arg, out, seen);
      break;
    case "bin":
    case "logical":
      variablesOf(node.l, out, seen);
      variablesOf(node.r, out, seen);
      break;
    case "ternary":
      variablesOf(node.cond, out, seen);
      variablesOf(node.then, out, seen);
      variablesOf(node.else, out, seen);
      break;
    case "call":
      for (const a of node.args) variablesOf(a, out, seen);
      break;
    case "array":
      for (const i of node.items) variablesOf(i, out, seen);
      break;
  }
  return out;
}

// src/engine/expression.ts
var MAX_EXPRESSION_LENGTH = 4096;
var HOSTILE_IDENTIFIERS = /* @__PURE__ */ new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  "prototype",
  "__proto__",
  "constructor"
]);
var IDENT_TOKEN_RE = /[A-Za-z_$][\w$]*/g;
function hasHostileIdentifier(expr) {
  const tokens = expr.match(IDENT_TOKEN_RE);
  if (!tokens) return false;
  for (const t of tokens) {
    if (HOSTILE_IDENTIFIERS.has(t)) return true;
  }
  return false;
}
function parseExpression(expr) {
  const source = typeof expr === "string" ? expr.trim() : "";
  if (!source) return { ok: true, expression: null };
  if (source.length > MAX_EXPRESSION_LENGTH) return { ok: false, error: "expression too long" };
  let ast;
  try {
    ast = parse(source);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  let variables;
  try {
    variables = variablesOf(ast);
  } catch {
    variables = [];
  }
  return { ok: true, expression: { source, ast, variables } };
}
function expressionVariables(expr) {
  const result = parseExpression(expr);
  if (!result.ok || result.expression === null) return [];
  return [...result.expression.variables];
}
function evaluateCompiled(expr, scope) {
  try {
    return { ok: true, value: evaluate(expr.ast, scope) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
function evaluateExpression(expr, scope) {
  if (typeof expr === "string" && hasHostileIdentifier(expr)) return void 0;
  const parsed = parseExpression(expr);
  if (!parsed.ok || parsed.expression === null) return void 0;
  const result = evaluateCompiled(parsed.expression, scope);
  return result.ok ? result.value : void 0;
}
function errorMessage(e) {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : String(e);
}

// src/validation/registry.ts
var ValidatorRegistry = class _ValidatorRegistry {
  constructor() {
    this.order = [];
    this.rules = /* @__PURE__ */ new Map();
  }
  /** Register (or replace, by code) a rule. Returns `this` for chaining. */
  register(rule) {
    if (!this.rules.has(rule.code)) this.order.push(rule.code);
    this.rules.set(rule.code, rule);
    return this;
  }
  /** The rule registered for a code, or `undefined`. */
  get(code) {
    return this.rules.get(code);
  }
  /** Whether a code has a registered rule. */
  has(code) {
    return this.rules.has(code);
  }
  /** All registered rules in registration order. */
  all() {
    return this.order.map((code) => this.rules.get(code));
  }
  /** A shallow clone (same rules, independent order) for scoped customization. */
  clone() {
    const next = new _ValidatorRegistry();
    for (const code of this.order) next.register(this.rules.get(code));
    return next;
  }
};
function createDefaultRegistry() {
  const registry = new ValidatorRegistry();
  for (const rule of BUILTIN_RULES) registry.register(rule);
  return registry;
}
var defaultRegistry = createDefaultRegistry();
function registerValidator(rule, registry = defaultRegistry) {
  return registry.register(rule);
}
function customValidationValidator(attributes) {
  const expr = typeof attributes.customValidation === "string" ? attributes.customValidation : "";
  if (!expr.trim()) return null;
  const custom = typeof attributes.customMessage === "string" ? attributes.customMessage : "";
  return (ctx) => {
    const scope = { ...ctx.scope, value: ctx.value };
    const result = evaluateExpression(expr, scope);
    const passed = result === void 0 ? true : Boolean(result);
    return passed ? ok(ctx.field) : fail(ctx.field, "custom", {}, custom || void 0);
  };
}
function buildFieldValidators(attributes, registry = defaultRegistry) {
  const validators = [];
  for (const rule of registry.all()) {
    const validator = rule.build(attributes);
    if (validator) validators.push(validator);
  }
  const custom = customValidationValidator(attributes);
  if (custom) validators.push(custom);
  return validators;
}
function validateValue(attributes, ctx, registry = defaultRegistry) {
  const validators = buildFieldValidators(attributes, registry);
  for (const validator of validators) {
    let result;
    try {
      result = validator(ctx);
    } catch {
      continue;
    }
    if (!result.valid) return result;
  }
  return ok(ctx.field);
}

// src/engine/js.ts
var SHADOWED = [
  "window",
  "self",
  "globalThis",
  "global",
  "process",
  "require",
  "module",
  "exports",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  // NB: `eval` is intentionally NOT shadowed — it is an illegal binding name in
  // strict mode (would make `new Function` throw). Strict mode already prevents
  // indirect `eval` from writing the caller's scope; direct `eval` is a trusted-
  // author escape we accept (see the security note above).
  "Function",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "document",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "crypto",
  "Worker",
  "SharedWorker",
  "importScripts",
  "WebAssembly",
  "Reflect",
  "Proxy"
];
var cache = /* @__PURE__ */ new Map();
function compile(code) {
  let fn = cache.get(code);
  if (!fn) {
    const body = '"use strict";\nconst data = __scope;\nlet value = __self, input = __self, show = true, valid = true;\nconst row = __row;\nvoid input;\n' + code + "\n;return { value: value, show: show, valid: valid };";
    fn = new Function(...SHADOWED, "__scope", "__self", "__row", body);
    cache.set(code, fn);
  }
  return fn;
}
function evaluateJs(code, scope, self, row) {
  if (typeof code !== "string" || !code.trim()) {
    return { value: self, show: true, valid: true, ok: true };
  }
  try {
    const fn = compile(code);
    const undef = SHADOWED.map(() => void 0);
    const out = fn(...undef, scope, self, row);
    return { value: out.value, show: out.show, valid: out.valid, ok: true };
  } catch (e) {
    return {
      value: self,
      show: true,
      valid: true,
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}
function extractDataRefs(code) {
  if (typeof code !== "string" || !code) return [];
  const out = /* @__PURE__ */ new Set();
  const dot = /\bdata\.([A-Za-z_$][\w$]*)/g;
  const bracket = /\bdata\[\s*['"]([^'"]+)['"]\s*\]/g;
  let m;
  while ((m = dot.exec(code)) !== null) if (m[1]) out.add(m[1]);
  while ((m = bracket.exec(code)) !== null) if (m[1]) out.add(m[1]);
  return [...out];
}

// src/engine/evaluatorTypes.ts
var SOURCE_PRIORITY = {
  seed: 0,
  default: 1,
  customDefault: 2,
  calculate: 3,
  logicSetValue: 4,
  user: 5,
  clearOnHide: 0
};
function sourcePriority(source) {
  return SOURCE_PRIORITY[source];
}
var DEFAULT_MAX_PASSES = 10;

// src/engine/evaluatorCoercion.ts
function coerceValue(fieldType, raw) {
  if (!fieldType) return raw ?? "";
  try {
    return fieldType.coerce(raw);
  } catch {
    return raw ?? fieldType.empty?.() ?? "";
  }
}
function emptyValue(fieldType) {
  if (!fieldType) return "";
  try {
    return fieldType.empty();
  } catch {
    return "";
  }
}
function sameValue(fieldType, a, b) {
  if (fieldType?.compare) {
    try {
      return fieldType.compare(a, b);
    } catch {
    }
  }
  return defaultSameValue(a, b);
}
function defaultSameValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => defaultSameValue(x, b[i]));
  }
  if (a == null || b == null || typeof a === "object" || typeof b === "object") return false;
  const sa = String(a);
  const sb = String(b);
  if (sa.trim() !== "" && sb.trim() !== "") {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  return sa === sb;
}
function asExpr(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function asBool2(value) {
  return Boolean(value);
}
function clampPasses(maxPasses) {
  if (typeof maxPasses !== "number" || !Number.isFinite(maxPasses) || maxPasses < 1) {
    return DEFAULT_MAX_PASSES;
  }
  return Math.floor(maxPasses);
}

// src/engine/visibility.ts
function evaluateVisibility(attributes, scope, opts = {}) {
  const a = attributes ?? {};
  if (a.hidden) return false;
  const cond = a.conditional;
  if (cond && typeof cond === "object" && typeof cond.when === "string" && cond.when) {
    const match = String(scope[cond.when] ?? "") === String(cond.eq ?? "");
    const shown = cond.show === false ? !match : match;
    if (!shown) return false;
  }
  const allowJs = opts.allowJs !== false;
  const customJs = allowJs && typeof a.customConditionalJs === "string" && a.customConditionalJs.trim() ? a.customConditionalJs : void 0;
  if (customJs) {
    const runJs = opts.jsEvaluator ?? evaluateJs;
    const r = runJs(customJs, { ...scope });
    return r.ok ? Boolean(r.show) : true;
  }
  const custom = typeof a.customConditional === "string" && a.customConditional.trim() ? a.customConditional : void 0;
  if (custom) {
    if (hasHostileIdentifier(custom)) return true;
    const result = evaluateExpression(custom, { ...scope });
    return result === void 0 ? true : Boolean(result);
  }
  return true;
}
function evaluateRequired(attributes, scope) {
  const a = attributes ?? {};
  const expr = typeof a.requiredWhen === "string" && a.requiredWhen.trim() ? a.requiredWhen : void 0;
  if (expr && !hasHostileIdentifier(expr)) {
    const result = evaluateExpression(expr, { ...scope });
    if (result !== void 0) return Boolean(result);
  }
  return asBool2(a.required);
}

// src/engine/dependencyExtraction.ts
var SELF_VALUE_IDENT = "value";
function asExpr2(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function* entityExpressions(e) {
  const a = e.attributes ?? {};
  const calc = asExpr2(a.calculateValue);
  if (calc) yield { source: "calculateValue", expr: calc };
  const cond = asExpr2(a.customConditional);
  if (cond) yield { source: "customConditional", expr: cond };
  const valid = asExpr2(a.customValidation);
  if (valid) yield { source: "customValidation", expr: valid };
  const dflt = asExpr2(a.customDefaultValue);
  if (dflt) yield { source: "customDefaultValue", expr: dflt };
  const calcJs = asExpr2(a.calculateValueJs);
  if (calcJs) yield { source: "calculateValue", expr: calcJs, jsRefs: true };
  const condJs = asExpr2(a.customConditionalJs);
  if (condJs) yield { source: "customConditional", expr: condJs, jsRefs: true };
  const validJs = asExpr2(a.customValidationJs);
  if (validJs) yield { source: "customValidation", expr: validJs, jsRefs: true };
  const dfltJs = asExpr2(a.customDefaultValueJs);
  if (dfltJs) yield { source: "customDefaultValue", expr: dfltJs, jsRefs: true };
  const logic = a.logic;
  if (Array.isArray(logic)) {
    for (const rule of logic) {
      if (!rule || typeof rule !== "object") continue;
      const when = asExpr2(rule.when);
      if (when) yield { source: "logic.when", expr: when };
      const value = asExpr2(rule.value);
      if (value) yield { source: "logic.value", expr: value };
    }
  }
  const literal = a.conditional;
  if (literal && typeof literal === "object" && typeof literal.when === "string" && literal.when) {
    yield { source: "conditional.when", expr: literal.when, literalKey: true };
  }
}

// src/engine/dependencyTopoSort.ts
function topoSort(keys, outAdj, inAdj, byRank) {
  const indeg = /* @__PURE__ */ new Map();
  for (const k of keys) indeg.set(k, inAdj.get(k).length);
  const order = [];
  const emitted = /* @__PURE__ */ new Set();
  const cycles = [];
  const reportedCycleNodes = /* @__PURE__ */ new Set();
  const remaining = () => keys.filter((k) => !emitted.has(k));
  const emit = (k) => {
    order.push(k);
    emitted.add(k);
    for (const to of outAdj.get(k)) {
      if (!emitted.has(to)) indeg.set(to, (indeg.get(to) ?? 0) - 1);
    }
  };
  while (emitted.size < keys.length) {
    const ready = remaining().filter((k) => (indeg.get(k) ?? 0) <= 0).sort(byRank);
    if (ready.length > 0) {
      emit(ready[0]);
      continue;
    }
    const stuck = remaining();
    const cycle = findCycle(stuck, outAdj, byRank);
    if (cycle) {
      const nodeKey = [...new Set(cycle)].sort().join("|");
      if (!reportedCycleNodes.has(nodeKey)) {
        reportedCycleNodes.add(nodeKey);
        cycles.push({ path: cycle });
      }
      const breakAt = [...new Set(cycle)].sort(byRank)[0];
      emit(breakAt);
    } else {
      emit([...stuck].sort(byRank)[0]);
    }
  }
  return { order, cycles };
}
function findCycle(nodes, outAdj, byRank) {
  const inSet = new Set(nodes);
  const stack = [];
  const onStack = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const starts = [...nodes].sort(byRank);
  const dfs = (node) => {
    stack.push(node);
    onStack.add(node);
    visited.add(node);
    for (const next of outAdj.get(node)) {
      if (!inSet.has(next)) continue;
      if (onStack.has(next)) {
        const idx = stack.indexOf(next);
        return [...stack.slice(idx), next];
      }
      if (!visited.has(next)) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    stack.pop();
    onStack.delete(node);
    return null;
  };
  for (const start of starts) {
    if (!visited.has(start)) {
      const found = dfs(start);
      if (found) return found;
    }
  }
  return null;
}
function freezeAdj(adj) {
  const out = /* @__PURE__ */ new Map();
  for (const [k, v] of adj) out.set(k, [...v]);
  return out;
}

// src/engine/dependencyGraph.ts
function buildDependencyGraph(schema) {
  const entities = schema?.entities ?? {};
  const treeOrder = orderedIds(schema);
  const keyRank = /* @__PURE__ */ new Map();
  const edges = [];
  const diagnostics = [];
  const keySet = /* @__PURE__ */ new Set();
  const addKey = (k) => {
    if (!keySet.has(k)) {
      keySet.add(k);
      keyRank.set(k, keyRank.size);
    }
  };
  for (const id of treeOrder) {
    const e = entities[id];
    if (isKeyed(e)) addKey(keyOf(id, e));
  }
  for (const id of treeOrder) {
    const e = entities[id];
    if (!isKeyed(e) || !e) continue;
    const to = keyOf(id, e);
    for (const { source, expr, literalKey, jsRefs } of entityExpressions(e)) {
      let refs;
      if (literalKey) {
        refs = [expr];
      } else if (jsRefs) {
        refs = extractDataRefs(expr);
      } else {
        const parsed = parseExpression(expr);
        if (!parsed.ok) {
          diagnostics.push({
            code: "expr-parse-error",
            severity: "error",
            entityId: id,
            context: { key: to, source, expression: expr, error: parsed.error },
            message: `Expression in ${source} of "${to}" failed to parse: ${parsed.error}`
          });
        }
        refs = expressionVariables(expr);
        if (source === "customValidation") {
          refs = refs.filter((r) => r !== SELF_VALUE_IDENT);
        }
      }
      for (const from of refs) {
        addKey(from);
        edges.push({ from, to, via: source });
      }
    }
  }
  const keys = [...keySet].sort((a, b) => keyRank.get(a) - keyRank.get(b));
  const outAdj = /* @__PURE__ */ new Map();
  const inAdj = /* @__PURE__ */ new Map();
  for (const k of keys) {
    outAdj.set(k, []);
    inAdj.set(k, []);
  }
  const edgeSeen = /* @__PURE__ */ new Set();
  for (const { from, to } of edges) {
    const sig = from + "->" + to;
    if (edgeSeen.has(sig)) continue;
    edgeSeen.add(sig);
    outAdj.get(from).push(to);
    inAdj.get(to).push(from);
  }
  const byRank = (a, b) => keyRank.get(a) - keyRank.get(b);
  for (const list of outAdj.values()) list.sort(byRank);
  for (const list of inAdj.values()) list.sort(byRank);
  const { order, cycles } = topoSort(keys, outAdj, inAdj, byRank);
  for (const cycle of cycles) {
    diagnostics.push({
      code: "dependency-cycle",
      severity: "error",
      context: { path: cycle.path },
      message: "Dependency cycle: " + cycle.path.join(" -> ")
    });
  }
  return {
    keys,
    edges,
    dependents: freezeAdj(outAdj),
    dependencies: freezeAdj(inAdj),
    order,
    hasCycle: cycles.length > 0,
    cycles,
    diagnostics
  };
}

// src/engine/evaluatorExpression.ts
function buildScope(fields) {
  const scope = /* @__PURE__ */ Object.create(null);
  for (const [key, field] of fields) scope[key] = field.value;
  return scope;
}
function evaluateScoped(expr, scope, entityId, via, diagnostics) {
  if (hasHostileIdentifier(expr)) {
    pushOnce(diagnostics, entityId, via, expr, "blocked unsafe identifier");
    return void 0;
  }
  const parsed = parseExpression(expr);
  if (!parsed.ok || parsed.expression === null) return void 0;
  const result = evaluateCompiled(parsed.expression, scope);
  if (result.ok) return result.value;
  pushOnce(diagnostics, entityId, via, expr, result.error);
  return void 0;
}
function pushOnce(diagnostics, entityId, via, expr, error) {
  for (const d of diagnostics) {
    if (d.code === "expr-runtime-error" && d.entityId === entityId && d.context.via === via && d.context.expression === expr) {
      return;
    }
  }
  diagnostics.push({
    code: "expr-runtime-error",
    severity: "warning",
    entityId,
    context: { via, expression: expr, error },
    message: `Expression in ${via} threw at runtime (treated fail-open): ${error}`
  });
}

// src/engine/evaluatorLogic.ts
function evalLogic(logic, scope, entityId, diagnostics) {
  const out = { hasSetValue: false };
  if (!Array.isArray(logic)) return out;
  for (const rule of logic) {
    if (!rule || typeof rule !== "object") continue;
    const when = asExpr(rule.when);
    if (when) {
      const result = evaluateScoped(when, scope, entityId, "logic.when", diagnostics);
      if (!result) continue;
    }
    switch (rule.action) {
      case "show":
        out.visible = true;
        break;
      case "hide":
        out.visible = false;
        break;
      case "enable":
        out.disabled = false;
        break;
      case "disable":
        out.disabled = true;
        break;
      case "require":
        out.required = true;
        break;
      case "optional":
        out.required = false;
        break;
      case "setValue": {
        const expr = asExpr(rule.value);
        out.hasSetValue = true;
        out.value = expr ? evaluateScoped(expr, scope, entityId, "logic.value", diagnostics) : void 0;
        break;
      }
    }
  }
  return out;
}
function resolveVisibility(a, logic, scope, entityId, diagnostics, allowJs, selfValue, runJs) {
  if (logic.visible !== void 0) return logic.visible;
  if (asBool2(a.hidden)) return false;
  const cond = a.conditional;
  if (cond && typeof cond === "object" && typeof cond.when === "string" && cond.when) {
    const match = String(scope[cond.when] ?? "") === String(cond.eq ?? "");
    const shown = cond.show === false ? !match : match;
    if (!shown) return false;
  }
  const customJs = allowJs ? asExpr(a.customConditionalJs) : void 0;
  if (customJs) {
    const r = runJs(customJs, scope, selfValue);
    if (!r.ok) {
      pushOnce(diagnostics, entityId, "customConditionalJs", customJs, r.error ?? "JS error");
      return true;
    }
    return Boolean(r.show);
  }
  const custom = asExpr(a.customConditional);
  if (!custom) return true;
  const result = evaluateScoped(custom, scope, entityId, "customConditional", diagnostics);
  return result === void 0 ? true : Boolean(result);
}

// src/engine/evaluatorModel.ts
function buildEvalModel(schema, graph, registry) {
  const entities = schema?.entities ?? {};
  const nodes = [];
  const byKey = /* @__PURE__ */ new Map();
  const gridTemplates = /* @__PURE__ */ new Map();
  const gridDescendants = /* @__PURE__ */ new Set();
  for (const id of orderedIds(schema)) {
    const e = entities[id];
    if (e && registry.get(e.type)?.isGrid) {
      for (const d of descendantIds(id, entities)) gridDescendants.add(d);
    }
  }
  for (const id of orderedIds(schema)) {
    const entity = entities[id];
    if (!isKeyed(entity) || !entity) continue;
    if (gridDescendants.has(id)) continue;
    const key = keyOf(id, entity);
    if (byKey.has(key)) continue;
    const fieldType = registry.get(entity.type);
    const node = { id, key, entity, fieldType };
    nodes.push(node);
    byKey.set(key, node);
    if (fieldType?.isGrid) {
      const template = [];
      for (const d of descendantIds(id, entities)) {
        const de = entities[d];
        if (!isKeyed(de) || !de) continue;
        template.push({ id: d, key: keyOf(d, de), entity: de, fieldType: registry.get(de.type) });
      }
      gridTemplates.set(key, template);
    }
  }
  const order = [];
  const placed = /* @__PURE__ */ new Set();
  for (const key of graph.order) {
    if (byKey.has(key) && !placed.has(key)) {
      order.push(key);
      placed.add(key);
    }
  }
  for (const node of nodes) {
    if (!placed.has(node.key)) {
      order.push(node.key);
      placed.add(node.key);
    }
  }
  return { nodes, order, byKey, graph, registry, gridTemplates };
}
function descendantIds(rootId, entities) {
  const out = [];
  const seen = /* @__PURE__ */ new Set([rootId]);
  const stack = [...entities[rootId]?.children ?? []];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const e = entities[id];
    if (!e) continue;
    out.push(id);
    for (const c of e.children ?? []) stack.push(c);
  }
  return out;
}
function seedFields(model, values, source = "seed") {
  const fields = /* @__PURE__ */ new Map();
  for (const node of model.nodes) {
    const has = Object.prototype.hasOwnProperty.call(values, node.key);
    const raw = has ? values[node.key] : void 0;
    const value = coerceValue(node.fieldType, raw);
    fields.set(node.key, {
      entityId: node.id,
      key: node.key,
      fieldType: node.fieldType,
      value,
      source: has ? source : "seed",
      pinned: false,
      isVisible: true,
      isDisabled: false,
      isRequired: false
    });
  }
  return fields;
}

// src/engine/evaluator.ts
function evaluate2(model, fields, options = {}) {
  return settle(model, fields, model.order, options);
}
function evaluateIncremental(model, fields, changedKeys, options = {}) {
  const affected = downstreamClosure(model, changedKeys);
  const subOrder = model.order.filter((k) => affected.has(k));
  return settle(model, fields, subOrder, options);
}
function downstreamClosure(model, seeds) {
  const out = /* @__PURE__ */ new Set();
  const stack = [];
  for (const k of seeds) {
    if (model.byKey.has(k) && !out.has(k)) {
      out.add(k);
      stack.push(k);
    }
  }
  while (stack.length) {
    const k = stack.pop();
    for (const dep of model.graph.dependents.get(k) ?? []) {
      if (model.byKey.has(dep) && !out.has(dep)) {
        out.add(dep);
        stack.push(dep);
      }
    }
  }
  return out;
}
function settle(model, fields, order, options) {
  const maxPasses = clampPasses(options.maxPasses);
  const diagnostics = [];
  const traceSteps = options.trace ? [] : null;
  const allowJs = options.allowJs !== false;
  const runJs = options.jsEvaluator ?? evaluateJs;
  let passCount = 0;
  let settled = true;
  if (order.length === 0) {
    return { passCount: 0, settled: true, diagnostics, ...traceSteps ? { trace: traceSteps } : {} };
  }
  const scope = buildScope(fields);
  let changedThisPass = true;
  while (changedThisPass) {
    if (passCount >= maxPasses) {
      settled = false;
      diagnostics.push({
        code: "settlement-not-reached",
        severity: "warning",
        context: { passCount, maxPasses },
        message: "Form did not settle within " + maxPasses + " passes; a calculate/logic loop may oscillate. Showing best-effort state."
      });
      break;
    }
    passCount++;
    changedThisPass = false;
    for (const key of order) {
      const field = fields.get(key);
      if (!field) continue;
      const changed = deriveField(model, fields, field, diagnostics, scope, traceSteps, passCount, allowJs, runJs);
      if (changed) changedThisPass = true;
    }
  }
  return { passCount, settled, diagnostics, ...traceSteps ? { trace: traceSteps } : {} };
}
function deriveField(model, fields, field, diagnostics, scope, trace = null, pass = 0, allowJs = true, runJs = evaluateJs) {
  const entity = model.byKey.get(field.key)?.entity;
  if (!entity) return false;
  const a = entity.attributes ?? {};
  let changed = false;
  const deps = trace ? model.graph.dependencies.get(field.key) : void 0;
  const rec = trace ? (kind, from, to, source) => {
    const step = { pass, entityId: field.entityId, kind, from, to };
    if (source) step.source = source;
    if (deps && deps.length) step.dependsOn = deps;
    trace.push(step);
  } : null;
  const logic = evalLogic(a.logic, scope, field.entityId, diagnostics);
  const nextVisible = resolveVisibility(a, logic, scope, field.entityId, diagnostics, allowJs, field.value, runJs);
  if (nextVisible !== field.isVisible) {
    rec?.("visibility", field.isVisible, nextVisible);
    field.isVisible = nextVisible;
    changed = true;
  }
  const nextDisabled = logic.disabled ?? asBool2(a.disabled);
  if (nextDisabled !== field.isDisabled) {
    rec?.("disabled", field.isDisabled, nextDisabled);
    field.isDisabled = nextDisabled;
    changed = true;
  }
  const nextRequired = logic.required ?? asBool2(a.required);
  if (nextRequired !== field.isRequired) {
    rec?.("required", field.isRequired, nextRequired);
    field.isRequired = nextRequired;
    changed = true;
  }
  if (asBool2(a.clearOnHide) && !field.isVisible) {
    const empty = emptyValue(field.fieldType);
    if (!sameValue(field.fieldType, field.value, empty)) {
      rec?.("value", field.value, empty, "clearOnHide");
      field.value = empty;
      scope[field.key] = empty;
      field.source = "clearOnHide";
      changed = true;
    }
    if (field.pinned) field.pinned = false;
    return changed;
  }
  let wroteLogicValue = false;
  if (logic.hasSetValue) {
    if (canWrite(field)) {
      const next = coerceValue(field.fieldType, logic.value);
      if (!sameValue(field.fieldType, next, field.value)) {
        rec?.("value", field.value, next, "logicSetValue");
        field.value = next;
        scope[field.key] = next;
        field.source = "logicSetValue";
        changed = true;
      } else if (field.source !== "logicSetValue" && SOURCE_PRIORITY[field.source] < SOURCE_PRIORITY.logicSetValue) {
        field.source = "logicSetValue";
      }
      wroteLogicValue = true;
    }
  }
  const calcJsExpr = allowJs ? asExpr(a.calculateValueJs) : void 0;
  const calcExpr = asExpr(a.calculateValue);
  if ((calcJsExpr || calcExpr) && !wroteLogicValue) {
    const pinnedByUser = asBool2(a.allowCalculateOverride) && field.pinned;
    if (!pinnedByUser) {
      let computed;
      if (calcJsExpr) {
        const r = runJs(calcJsExpr, scope, field.value);
        if (r.ok) computed = r.value;
        else pushOnce(diagnostics, field.entityId, "calculateValueJs", calcJsExpr, r.error ?? "JS error");
      } else if (calcExpr) {
        computed = evaluateScoped(calcExpr, scope, field.entityId, "calculateValue", diagnostics);
      }
      if (computed !== void 0) {
        const next = coerceValue(field.fieldType, computed);
        if (!sameValue(field.fieldType, next, field.value)) {
          rec?.("value", field.value, next, "calculate");
          field.value = next;
          scope[field.key] = next;
          field.source = "calculate";
          changed = true;
        }
      }
    }
  }
  return changed;
}
function canWrite(field, incoming) {
  if (field.source !== "user") return true;
  return !field.pinned;
}

// src/engine/fieldTypes.ts
function deepSameValue(a, b) {
  if (defaultSameValue(a, b)) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) return false;
  if (aArr) {
    const ba = b;
    const aa = a;
    return aa.length === ba.length && aa.every((x, i) => deepSameValue(x, ba[i]));
  }
  const ao = a;
  const bo = b;
  const ka = Object.keys(ao);
  const kb = Object.keys(bo);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepSameValue(ao[k], bo[k]));
}
function stringType(name, valueType = "string") {
  return {
    name,
    valueType,
    coerce: (v) => v == null ? "" : typeof v === "string" ? v : String(v),
    empty: () => "",
    compare: (a, b) => defaultSameValue(a, b)
  };
}
function numberType(name) {
  return {
    name,
    valueType: "number",
    coerce: (v) => typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : v === "" || v == null ? "" : v,
    empty: () => "",
    compare: (a, b) => defaultSameValue(a, b)
  };
}
function boolType(name) {
  return {
    name,
    valueType: "boolean",
    coerce: (v) => Boolean(v),
    empty: () => false,
    // Dedicated compare (NOT defaultSameValue) so `false` never reads equal to `""`
    // (Number("") === Number(false) === 0 would otherwise collide).
    compare: (a, b) => Boolean(a) === Boolean(b)
  };
}
function arrayType(name, valueType = "array") {
  return {
    name,
    valueType,
    coerce: (v) => Array.isArray(v) ? v : v == null || v === "" ? [] : [v],
    empty: () => [],
    // Structural so an array of OBJECTS (a data carrier) doesn't churn each settle pass;
    // for arrays of primitives this matches defaultSameValue exactly.
    compare: (a, b) => deepSameValue(a, b)
  };
}
function gridType(name) {
  return {
    name,
    valueType: "array",
    isContainer: true,
    isGrid: true,
    coerce: (v) => Array.isArray(v) ? v.filter((r) => r != null && typeof r === "object") : [],
    empty: () => [],
    compare: (a, b) => defaultSameValue(a, b)
  };
}
function objectType(name) {
  return {
    name,
    valueType: "object",
    coerce: (v) => v != null && typeof v === "object" && !Array.isArray(v) ? v : {},
    empty: () => ({}),
    // Structural compare so a calculated/logic-set map quiesces when unchanged (a
    // reference compare never would, churning to the maxPasses cap).
    compare: (a, b) => deepSameValue(a, b)
  };
}
function noneType(name, kind) {
  return {
    name,
    valueType: "none",
    ...kind === "container" ? { isContainer: true } : { isStatic: true },
    coerce: (v) => v,
    empty: () => void 0,
    compare: (a, b) => a === b
  };
}
var STRING_TYPES = [
  "textField",
  "textarea",
  "email",
  "url",
  "phoneNumber",
  "password",
  "select",
  "searchSelect",
  "radio",
  "signature",
  "address",
  "time",
  "richText"
  // WYSIWYG → sanitized HTML string
];
var DATE_TYPES = ["day", "datetime"];
var NUMBER_TYPES = ["number", "currency", "rating"];
var ARRAY_TYPES = ["selectBoxes", "tags", "tagsField", "array", "ranking"];
var GRID_TYPES = ["dataGrid", "editGrid"];
var CONTAINER_TYPES = ["panel", "columns", "fieldset", "well", "table", "tabs", "container", "wizard", "page"];
var STATIC_TYPES = ["button", "heading", "content", "htmlElement", "html", "divider", "hr"];
function createDefaultFieldTypeRegistry() {
  const map = /* @__PURE__ */ new Map();
  const add = (t) => map.set(t.name, t);
  for (const name of STRING_TYPES) add(stringType(name));
  for (const name of DATE_TYPES) add(stringType(name, "date"));
  for (const name of NUMBER_TYPES) add(numberType(name));
  add(boolType("checkbox"));
  for (const name of ARRAY_TYPES) add(arrayType(name));
  add(arrayType("file", "file"));
  add(objectType("map"));
  add(objectType("matrix"));
  add(objectType("addressBlock"));
  for (const name of GRID_TYPES) add(gridType(name));
  for (const name of CONTAINER_TYPES) add(noneType(name, "container"));
  for (const name of STATIC_TYPES) add(noneType(name, "static"));
  return map;
}
var defaultFieldTypeRegistry = createDefaultFieldTypeRegistry();

// src/engine/engineHelpers.ts
function coerceWith(fieldType, raw) {
  if (!fieldType) return raw ?? "";
  try {
    return fieldType.coerce(raw);
  } catch {
    try {
      return fieldType.empty();
    } catch {
      return "";
    }
  }
}
function emptyWith(fieldType) {
  if (!fieldType) return "";
  try {
    return fieldType.empty();
  } catch {
    return "";
  }
}
function sameWith(fieldType, a, b) {
  if (fieldType?.compare) {
    try {
      return fieldType.compare(a, b);
    } catch {
    }
  }
  return defaultSameValue(a, b);
}
function isEmptyValue2(fieldType, value) {
  return sameWith(fieldType, value, emptyWith(fieldType));
}
var EMPTY_SCHEMA = { root: [], entities: {} };
var GRID_PATH_RE = /^([A-Za-z_$][\w$]*)\[(\d+)\]\.([A-Za-z_$][\w$]*)$/;
function parseGridPath(key) {
  const m = GRID_PATH_RE.exec(key);
  return m ? { grid: m[1], row: Number(m[2]), cell: m[3] } : null;
}

// src/engine/createFormEngine.ts
var createFormEngine = (factoryOptions = {}) => {
  let model = null;
  let fields = /* @__PURE__ */ new Map();
  let fieldRegistry = factoryOptions.registry ?? createDefaultFieldTypeRegistry();
  const validatorRegistry = defaultRegistry;
  let maxPasses = factoryOptions.maxPasses;
  let initialSeed = /* @__PURE__ */ new Map();
  let baseline = /* @__PURE__ */ new Map();
  const touched = /* @__PURE__ */ new Set();
  const errorsByKey = /* @__PURE__ */ new Map();
  const cellErrors = /* @__PURE__ */ new Map();
  let baseDiagnostics = [];
  let runtimeDiagnostics = [];
  let lastPassCount = 0;
  let validatedOnce = false;
  let isValidFlag = null;
  let traceEnabled = Boolean(factoryOptions.trace);
  let allowJsEnabled = factoryOptions.allowJs !== false;
  let jsEvaluator = factoryOptions.jsEvaluator;
  let lastTrace;
  const runJs = (code, scope, self) => (jsEvaluator ?? evaluateJs)(code, scope, self);
  const passOpts = () => ({
    ...typeof maxPasses === "number" ? { maxPasses } : {},
    ...traceEnabled ? { trace: true } : {},
    ...jsEvaluator ? { jsEvaluator } : {},
    allowJs: allowJsEnabled
  });
  function recordTrace(res) {
    lastTrace = traceEnabled ? { steps: res.trace ?? [], passCount: res.passCount, settled: res.settled } : void 0;
  }
  function scopeOf() {
    const s = /* @__PURE__ */ Object.create(null);
    for (const [k, f] of fields) s[k] = f.value;
    return s;
  }
  function init(schema, options = {}) {
    const opts = { ...factoryOptions, ...options };
    fieldRegistry = opts.registry ?? createDefaultFieldTypeRegistry();
    maxPasses = opts.maxPasses;
    traceEnabled = Boolean(opts.trace);
    allowJsEnabled = opts.allowJs !== false;
    jsEvaluator = opts.jsEvaluator;
    const snapshot = opts.restore;
    const initialValues = snapshot ? snapshot.initialValues ?? {} : opts.initialValues ?? {};
    const base = opts.migrations ? migrateSchema(schema ?? EMPTY_SCHEMA, opts.migrations).schema : schema ?? EMPTY_SCHEMA;
    const repaired = repairSchema(base).schema;
    const normalized = normalizeKeys(repaired);
    const schemaReport = validateSchemaReport(normalized);
    const graph = buildDependencyGraph(normalized);
    model = buildEvalModel(normalized, graph, fieldRegistry);
    const diags = [...schemaReport.diagnostics, ...graph.diagnostics];
    for (const node of model.nodes) {
      if (!node.fieldType) {
        diags.push({
          code: "unknown-field-type",
          severity: "warning",
          entityId: node.id,
          context: { type: node.entity.type, key: node.key },
          message: `Unknown field type "${node.entity.type}"; treated as an opaque, value-less node.`
        });
      }
    }
    const seenUnknownIdent = /* @__PURE__ */ new Set();
    for (const edge of graph.edges) {
      if (model.byKey.has(edge.from)) continue;
      const dedupe = `${edge.to}|${edge.from}|${edge.via}`;
      if (seenUnknownIdent.has(dedupe)) continue;
      seenUnknownIdent.add(dedupe);
      diags.push({
        code: "expr-unknown-ident",
        severity: "warning",
        entityId: model.byKey.get(edge.to)?.id,
        context: { key: edge.from, via: edge.via, dependent: edge.to },
        message: `Expression in ${edge.via} of "${edge.to}" references unknown field "${edge.from}".`
      });
    }
    baseDiagnostics = diags;
    const seedValues = /* @__PURE__ */ Object.create(null);
    const sources = /* @__PURE__ */ new Map();
    for (const node of model.nodes) {
      const a = node.entity.attributes ?? {};
      if (Object.prototype.hasOwnProperty.call(initialValues, node.key) && initialValues[node.key] !== void 0) {
        seedValues[node.key] = initialValues[node.key];
        sources.set(node.key, "seed");
      } else if (node.fieldType?.valueType === "boolean" && a.defaultChecked !== void 0) {
        seedValues[node.key] = a.defaultChecked;
        sources.set(node.key, "default");
      } else if (a.defaultValue !== void 0) {
        seedValues[node.key] = a.defaultValue;
        sources.set(node.key, "default");
      }
    }
    fields = seedFields(model, seedValues, "seed");
    for (const [key, source] of sources) {
      const f = fields.get(key);
      if (f) f.source = source;
    }
    for (const [gridKey, template] of model.gridTemplates) {
      const f = fields.get(gridKey);
      if (!f || !Array.isArray(f.value)) continue;
      const byCell = new Map(template.map((c) => [c.key, c]));
      f.value = f.value.map((row) => {
        const next = {};
        for (const [k, v] of Object.entries(row ?? {})) {
          const child = byCell.get(k);
          next[k] = child ? coerceWith(child.fieldType, v) : v;
        }
        return next;
      });
    }
    computeCustomDefaults();
    initialSeed = /* @__PURE__ */ new Map();
    for (const [key, f] of fields) initialSeed.set(key, { value: f.value, source: f.source });
    touched.clear();
    errorsByKey.clear();
    cellErrors.clear();
    validatedOnce = false;
    isValidFlag = null;
    const res = evaluate2(model, fields, passOpts());
    runtimeDiagnostics = res.diagnostics;
    lastPassCount = res.passCount;
    recordTrace(res);
    settleGridRows();
    baseline = /* @__PURE__ */ new Map();
    for (const [key, f] of fields) baseline.set(key, f.value);
    if (snapshot) {
      const touchedKeys = new Set(snapshot.touched ?? []);
      for (const node of model.nodes) {
        if (!touchedKeys.has(node.key)) continue;
        const f = fields.get(node.key);
        if (!f || !Object.prototype.hasOwnProperty.call(snapshot.values, node.key)) continue;
        f.value = coerceWith(node.fieldType, snapshot.values[node.key]);
        f.source = "user";
        f.pinned = Boolean(node.entity.attributes?.allowCalculateOverride);
        touched.add(node.key);
      }
      const replay = evaluate2(model, fields, passOpts());
      runtimeDiagnostics = replay.diagnostics;
      lastPassCount = replay.passCount;
      recordTrace(replay);
      settleGridRows();
    }
    return engine;
  }
  function computeCustomDefaults() {
    if (!model) return;
    for (const key of model.order) {
      const node = model.byKey.get(key);
      const f = fields.get(key);
      if (!node || !f) continue;
      const a = node.entity.attributes ?? {};
      const jsExpr = allowJsEnabled && typeof a.customDefaultValueJs === "string" && a.customDefaultValueJs.trim() ? a.customDefaultValueJs : void 0;
      const expr = typeof a.customDefaultValue === "string" && a.customDefaultValue.trim() ? a.customDefaultValue : void 0;
      if (!jsExpr && !expr) continue;
      if (f.source !== "seed" && f.source !== "default") continue;
      if (!isEmptyValue2(node.fieldType, f.value)) continue;
      let computed;
      if (jsExpr) {
        const r = runJs(jsExpr, scopeOf(), f.value);
        if (r.ok) computed = r.value;
      } else if (expr) {
        if (hasHostileIdentifier(expr)) continue;
        computed = evaluateExpression(expr, scopeOf());
      }
      if (computed === void 0) continue;
      f.value = coerceWith(node.fieldType, computed);
      f.source = "customDefault";
    }
  }
  function settleGridRows() {
    if (!model) return;
    for (const [gridKey, template] of model.gridTemplates) {
      const gf = fields.get(gridKey);
      if (!gf || !Array.isArray(gf.value)) continue;
      const calcCells = template.filter((c) => {
        const a = c.entity.attributes ?? {};
        const js = allowJsEnabled && typeof a.calculateValueJs === "string" && a.calculateValueJs.trim();
        const ex = typeof a.calculateValue === "string" && a.calculateValue.trim();
        return Boolean(js || ex);
      });
      if (calcCells.length === 0) continue;
      const top = scopeOf();
      let gridChanged = false;
      const rows = gf.value.map((row) => {
        const r = { ...row };
        for (let pass = 0; pass < 5; pass++) {
          let changed = false;
          const rowScope = { ...top, ...r };
          for (const c of calcCells) {
            const a = c.entity.attributes ?? {};
            let computed;
            const js = allowJsEnabled && typeof a.calculateValueJs === "string" && a.calculateValueJs.trim() ? a.calculateValueJs : void 0;
            if (js) {
              const res = runJs(js, rowScope, r[c.key]);
              if (res.ok) computed = res.value;
            } else {
              const expr = a.calculateValue;
              if (typeof expr === "string" && !hasHostileIdentifier(expr)) computed = evaluateExpression(expr, rowScope);
            }
            if (computed === void 0) continue;
            const next = coerceWith(c.fieldType, computed);
            if (!sameWith(c.fieldType, next, r[c.key])) {
              r[c.key] = next;
              rowScope[c.key] = next;
              changed = true;
            }
          }
          if (!changed) break;
        }
        for (const c of calcCells) if (!sameWith(c.fieldType, r[c.key], row[c.key])) gridChanged = true;
        return r;
      });
      if (gridChanged) gf.value = rows;
    }
  }
  function update(key, value) {
    if (!model) return getState();
    const gridPath = parseGridPath(key);
    if (gridPath) return updateGridCell(gridPath, value);
    const node = model.byKey.get(key);
    const f = node ? fields.get(key) : void 0;
    if (!node || !f) return getState();
    f.value = coerceWith(node.fieldType, value);
    f.source = "user";
    f.pinned = Boolean(node.entity.attributes?.allowCalculateOverride);
    touched.add(key);
    settleAfterEdit(key);
    return getState();
  }
  function updateGridCell(path, value) {
    const gnode = model.byKey.get(path.grid);
    const gf = gnode ? fields.get(path.grid) : void 0;
    if (!gnode || !gf || !gnode.fieldType?.isGrid || path.row < 0) return getState();
    const child = (model.gridTemplates.get(path.grid) ?? []).find((c) => c.key === path.cell);
    const rows = Array.isArray(gf.value) ? gf.value.map((r) => ({ ...r })) : [];
    while (rows.length <= path.row) rows.push({});
    rows[path.row] = { ...rows[path.row], [path.cell]: coerceWith(child?.fieldType, value) };
    gf.value = rows;
    gf.source = "user";
    gf.pinned = Boolean(gnode.entity.attributes?.allowCalculateOverride);
    touched.add(path.grid);
    settleAfterEdit(path.grid);
    return getState();
  }
  function settleAfterEdit(changedKey) {
    const res = evaluateIncremental(model, fields, [changedKey], passOpts());
    lastPassCount = res.passCount;
    recordTrace(res);
    const affectedIds = /* @__PURE__ */ new Set();
    for (const k of downstreamClosure(model, [changedKey])) {
      const id = model.byKey.get(k)?.id;
      if (id) affectedIds.add(id);
    }
    runtimeDiagnostics = runtimeDiagnostics.filter(
      (d) => d.entityId ? !affectedIds.has(d.entityId) : d.code !== "settlement-not-reached"
    );
    runtimeDiagnostics.push(...res.diagnostics);
    settleGridRows();
    if (validatedOnce) revalidate([changedKey]);
  }
  function setValues(values, options) {
    if (!model) return getState();
    const markTouched = Boolean(options?.markTouched);
    for (const [key, raw] of Object.entries(values)) {
      const node = model.byKey.get(key);
      const f = node ? fields.get(key) : void 0;
      if (!node || !f) continue;
      f.value = coerceWith(node.fieldType, raw);
      f.source = markTouched ? "user" : "seed";
      if (markTouched) {
        touched.add(key);
        f.pinned = Boolean(node.entity.attributes?.allowCalculateOverride);
      }
    }
    const res = evaluate2(model, fields, passOpts());
    runtimeDiagnostics = res.diagnostics;
    lastPassCount = res.passCount;
    recordTrace(res);
    settleGridRows();
    if (validatedOnce) validate();
    return getState();
  }
  function evaluateFull() {
    if (!model) return getState();
    const res = evaluate2(model, fields, passOpts());
    runtimeDiagnostics = res.diagnostics;
    lastPassCount = res.passCount;
    recordTrace(res);
    settleGridRows();
    if (validatedOnce) validate();
    return getState();
  }
  function validateField(key) {
    const node = model.byKey.get(key);
    const f = fields.get(key);
    const attributes = { ...node.entity.attributes, type: node.entity.type };
    const base = validateValue(attributes, { field: key, value: f.value, scope: scopeOf() }, validatorRegistry);
    if (!base.valid) return base;
    const rawJs = node.entity.attributes?.customValidationJs;
    const jsExpr = allowJsEnabled && typeof rawJs === "string" && rawJs.trim() ? rawJs : void 0;
    if (jsExpr) {
      const r = runJs(jsExpr, { ...scopeOf(), value: f.value }, f.value);
      if (r.ok && r.valid !== true) {
        const message = typeof r.valid === "string" ? r.valid : "Invalid value";
        return { field: key, valid: false, code: "custom", params: {}, message };
      }
    }
    return base;
  }
  function clearCellErrors(gridKey) {
    const prefix = `${gridKey}[`;
    for (const path of cellErrors.keys()) {
      if (path.startsWith(prefix)) cellErrors.delete(path);
    }
  }
  function validateGrid(gridNode) {
    const gf = fields.get(gridNode.key);
    const template = model.gridTemplates.get(gridNode.key) ?? [];
    const rows = Array.isArray(gf?.value) ? gf.value : [];
    const top = scopeOf();
    const out = [];
    rows.forEach((rowVals, i) => {
      const rowVisScope = { ...top, ...rowVals };
      for (const child of template) {
        const cellValue = rowVals?.[child.key];
        const path = `${gridNode.key}[${i}].${child.key}`;
        if (!evaluateVisibility(child.entity.attributes, rowVisScope, { allowJs: allowJsEnabled, jsEvaluator })) {
          cellErrors.delete(path);
          continue;
        }
        const required = evaluateRequired(child.entity.attributes, rowVisScope);
        const attributes = { ...child.entity.attributes, type: child.entity.type, required };
        const rowScope = { ...top, ...rowVals, value: cellValue };
        const r = validateValue(attributes, { field: path, value: cellValue, scope: rowScope }, validatorRegistry);
        if (r.valid) {
          cellErrors.delete(path);
        } else {
          const result = { ...r, field: path };
          cellErrors.set(path, result);
          out.push(result);
        }
      }
    });
    return out;
  }
  function recomputeValid() {
    if (!model) {
      isValidFlag = true;
      return;
    }
    let ok2 = cellErrors.size === 0;
    if (ok2) {
      for (const node of model.nodes) {
        const f = fields.get(node.key);
        if (f?.isVisible && errorsByKey.has(node.key)) {
          ok2 = false;
          break;
        }
      }
    }
    isValidFlag = ok2;
  }
  function revalidate(changedKeys) {
    if (!model) return;
    for (const key of downstreamClosure(model, changedKeys)) {
      const f = fields.get(key);
      if (!f) continue;
      const node = model.byKey.get(key);
      if (!f.isVisible) {
        errorsByKey.delete(key);
        clearCellErrors(key);
        continue;
      }
      const r = validateField(key);
      if (r.valid) errorsByKey.delete(key);
      else errorsByKey.set(key, r);
      if (node?.fieldType?.isGrid) {
        clearCellErrors(key);
        validateGrid(node);
      }
    }
    recomputeValid();
  }
  function validate(fieldsArg) {
    if (!model) {
      isValidFlag = true;
      return { ok: true, errors: [], errorKeys: [] };
    }
    const targets = fieldsArg ? fieldsArg.filter((k) => model.byKey.has(k)) : model.nodes.map((n) => n.key);
    for (const key of targets) {
      const f = fields.get(key);
      if (!f) continue;
      const node = model.byKey.get(key);
      if (!f.isVisible) {
        errorsByKey.delete(key);
        clearCellErrors(key);
        continue;
      }
      const r = validateField(key);
      if (r.valid) errorsByKey.delete(key);
      else errorsByKey.set(key, r);
      if (node?.fieldType?.isGrid) {
        clearCellErrors(key);
        validateGrid(node);
      }
    }
    validatedOnce = true;
    const errors = [];
    for (const node of model.nodes) {
      const f = fields.get(node.key);
      if (!f || !f.isVisible) continue;
      const e = errorsByKey.get(node.key);
      if (e) errors.push(e);
      if (node.fieldType?.isGrid) {
        const prefix = `${node.key}[`;
        for (const [path, res] of cellErrors) {
          if (path.startsWith(prefix)) errors.push(res);
        }
      }
    }
    isValidFlag = errors.length === 0;
    return {
      ok: errors.length === 0,
      errors,
      errorKeys: errors.map((e) => e.field)
    };
  }
  function getScope() {
    const s = {};
    for (const [k, f] of fields) s[k] = f.value;
    return Object.freeze(s);
  }
  function getState() {
    const fieldStates = {};
    const scope = {};
    let anyDirty = false;
    if (model) {
      for (const node of model.nodes) {
        const f = fields.get(node.key);
        if (!f) continue;
        scope[node.key] = f.value;
        const dirty = baseline.has(node.key) ? !sameWith(node.fieldType, f.value, baseline.get(node.key)) : !isEmptyValue2(node.fieldType, f.value);
        if (dirty) anyDirty = true;
        fieldStates[node.id] = {
          entityId: node.id,
          key: node.key,
          value: f.value,
          isVisible: f.isVisible,
          isDisabled: f.isDisabled,
          isRequired: f.isRequired,
          isDirty: dirty,
          isTouched: touched.has(node.key),
          error: (f.isVisible ? errorsByKey.get(node.key) : void 0) ?? null,
          computed: { source: f.source, priority: sourcePriority(f.source) }
        };
      }
    }
    return {
      fields: fieldStates,
      scope,
      isDirty: anyDirty,
      isValid: isValidFlag,
      passCount: lastPassCount
    };
  }
  function getField(key) {
    if (!model) return void 0;
    const node = model.byKey.get(key);
    if (!node) return void 0;
    return getState().fields[node.id];
  }
  function getDiagnostics() {
    const all = [...baseDiagnostics, ...runtimeDiagnostics];
    return {
      diagnostics: all,
      hasErrors: all.some((d) => d.severity === "error"),
      hasWarnings: all.some((d) => d.severity === "warning")
    };
  }
  function getTrace() {
    return lastTrace;
  }
  function serialize() {
    const values = {};
    const initialValues = {};
    if (model) {
      for (const node of model.nodes) {
        const f = fields.get(node.key);
        if (f) values[node.key] = f.value;
        const init2 = initialSeed.get(node.key);
        if (init2) initialValues[node.key] = init2.value;
      }
    }
    return {
      version: 1,
      values,
      initialValues,
      touched: [...touched],
      diagnostics: [...baseDiagnostics, ...runtimeDiagnostics]
    };
  }
  function reset() {
    if (!model) return getState();
    const seedVals = /* @__PURE__ */ Object.create(null);
    for (const [key, snap] of initialSeed) seedVals[key] = snap.value;
    fields = seedFields(model, seedVals, "seed");
    for (const [key, snap] of initialSeed) {
      const f = fields.get(key);
      if (f) f.source = snap.source;
    }
    touched.clear();
    errorsByKey.clear();
    cellErrors.clear();
    validatedOnce = false;
    isValidFlag = null;
    const res = evaluate2(model, fields, passOpts());
    runtimeDiagnostics = res.diagnostics;
    lastPassCount = res.passCount;
    recordTrace(res);
    settleGridRows();
    return getState();
  }
  function collect() {
    const out = {};
    if (!model) return out;
    for (const node of model.nodes) {
      const f = fields.get(node.key);
      if (!f || !f.isVisible) continue;
      if (node.entity.attributes?.persistent === false) continue;
      out[node.key] = f.value;
    }
    return out;
  }
  const engine = {
    init,
    update,
    setValues,
    evaluate: evaluateFull,
    validate,
    getScope,
    getState,
    getField,
    getDiagnostics,
    getTrace,
    serialize,
    reset,
    collect
  };
  return engine;
};

// src/data/datasource.ts
function readDataSource(attributes) {
  const ds = attributes?.dataSource;
  if (!ds || typeof ds !== "object") return null;
  const o = ds;
  if (typeof o.minion !== "string" || !o.minion) return null;
  return {
    minion: o.minion,
    params: isStringRecord(o.params) ? o.params : void 0,
    resultPath: typeof o.resultPath === "string" ? o.resultPath : void 0,
    labelPath: typeof o.labelPath === "string" ? o.labelPath : void 0,
    valuePath: typeof o.valuePath === "string" ? o.valuePath : void 0,
    trigger: o.trigger === "change" ? "change" : "load"
  };
}
function resolveMinionParams(ds, scope) {
  const out = {};
  for (const [param, key] of Object.entries(ds.params ?? {})) {
    out[param] = scope[key];
  }
  return out;
}
var ADDR_KEYS = ["line1", "line2", "city", "region", "postalCode", "country", "countryCode"];
function normalizeSuggestion(item) {
  if (!item || typeof item !== "object") return null;
  const o = item;
  const label = stringify(o.label ?? o.place_name ?? o.text ?? o.description ?? "");
  if (!label) return null;
  const src = o.address && typeof o.address === "object" ? o.address : o;
  const address = {};
  for (const k of ADDR_KEYS) if (typeof src[k] === "string" && src[k]) address[k] = src[k];
  if (typeof src.lat === "number") address.lat = src.lat;
  if (typeof src.lng === "number") address.lng = src.lng;
  return { id: typeof o.id === "string" ? o.id : void 0, label, address };
}
function toAddressSuggestions(result, ds) {
  const envelope = result && typeof result === "object" ? result : void 0;
  const arr = ds?.resultPath ? getPath(result, ds.resultPath) : Array.isArray(result) ? result : Array.isArray(envelope?.results) ? envelope.results : Array.isArray(envelope?.suggestions) ? envelope.suggestions : void 0;
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeSuggestion).filter((s) => s !== null);
}
function toOptions(result, ds) {
  const arr = ds.resultPath ? getPath(result, ds.resultPath) : result;
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    const value = ds.valuePath ? getPath(item, ds.valuePath) : item;
    const label = ds.labelPath ? getPath(item, ds.labelPath) : value;
    return { label: stringify(label), value: stringify(value) };
  });
}
function readAsyncValidation(attributes) {
  const av = attributes?.asyncValidation;
  if (!av || typeof av !== "object") return null;
  const o = av;
  if (typeof o.minion !== "string" || !o.minion) return null;
  return {
    minion: o.minion,
    params: isStringRecord(o.params) ? o.params : void 0,
    message: typeof o.message === "string" ? o.message : void 0
  };
}
async function runAsyncValidation(av, scope, value, client, signal) {
  const params = { value };
  for (const [param, key] of Object.entries(av.params ?? {})) params[param] = scope[key];
  const res = await client.request(av.minion, params, signal);
  if (res && typeof res === "object") {
    const o = res;
    return { valid: Boolean(o.valid), message: typeof o.message === "string" ? o.message : av.message };
  }
  return { valid: Boolean(res), message: av.message };
}
function getPath(obj, path) {
  if (!path) return obj;
  let cur = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return void 0;
    cur = cur[part];
  }
  return cur;
}
function stringify(v) {
  return v == null ? "" : typeof v === "string" ? v : String(v);
}
function isStringRecord(v) {
  return Boolean(v) && typeof v === "object" && Object.values(v).every((x) => typeof x === "string");
}

// src/print.ts
var PRINT_CSS = `
*{box-sizing:border-box}body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;max-width:760px}
h1{font-size:20px;margin:0 0 16px}h2{font-size:15px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
.row{display:flex;gap:12px;padding:4px 0;border-bottom:1px solid #f0f0f0}
.label{font-weight:600;min-width:200px}.value{flex:1;white-space:pre-wrap}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:13px}
section{margin:8px 0}`;
function toPrintableHtml(schema, data, options = {}) {
  const reg = options.registry ?? createDefaultFieldTypeRegistry();
  const t = options.t ?? ((s) => s);
  const title = esc(t(options.title ?? "Form Submission"));
  const body = (schema.root ?? []).map((id) => renderEntity(id, schema, data, reg, t)).filter(Boolean).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_CSS}</style></head><body><h1>${title}</h1>${body}</body></html>`;
}
function renderEntity(id, schema, data, reg, t) {
  const e = schema.entities?.[id];
  if (!e) return "";
  const ft = reg.get(e.type);
  if (ft?.isStatic) return "";
  const label = labelOf2(e);
  if (ft?.isGrid) return renderGrid(e, schema, data, t, label);
  if (ft?.isContainer) {
    const inner = (e.children ?? []).map((c) => renderEntity(c, schema, data, reg, t)).filter(Boolean).join("\n");
    if (!inner) return "";
    return `<section>${label ? `<h2>${esc(t(label))}</h2>` : ""}${inner}</section>`;
  }
  const key = keyOf2(e);
  return `<div class="row"><span class="label">${esc(t(label || key))}</span><span class="value">${esc(formatValue(data?.[key]))}</span></div>`;
}
function renderGrid(e, schema, data, t, label) {
  const cells = (e.children ?? []).map((c) => schema.entities?.[c]).filter((c) => Boolean(c));
  const rows = Array.isArray(data?.[keyOf2(e)]) ? data[keyOf2(e)] : [];
  const head = cells.map((c) => `<th>${esc(t(labelOf2(c) || keyOf2(c)))}</th>`).join("");
  const bodyRows = rows.map((r) => `<tr>${cells.map((c) => `<td>${esc(formatValue(r?.[keyOf2(c)]))}</td>`).join("")}</tr>`).join("");
  return `<section>${label ? `<h2>${esc(t(label))}</h2>` : ""}<table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table></section>`;
}
function labelOf2(e) {
  const l = e.attributes?.label;
  return typeof l === "string" ? l : "";
}
function keyOf2(e) {
  const k = e.attributes?.key;
  return typeof k === "string" && k ? k : e.id;
}
function formatValue(v) {
  if (v == null || v === "") return "\u2014";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    if (v.length === 0) return "\u2014";
    return v.map((x) => x && typeof x === "object" ? JSON.stringify(x) : String(x)).join(", ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// src/builder/operations.ts
var _idCounter = 0;
function defaultIdGen() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  _idCounter += 1;
  return `e${_idCounter}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
function createEntity(type, attributes = {}, idgen = defaultIdGen) {
  const provided = typeof attributes.key === "string" && attributes.key ? attributes.key : void 0;
  const key = provided ?? sanitizeKey(attributes.label ?? type);
  return { id: idgen(), type, attributes: { key, ...attributes } };
}
function insert(schema, entity, target = {}) {
  const entities = cloneEntities2(schema);
  const desired = keyOf(entity.id, entity);
  const key = uniqueKey(isValidKey(desired) ? desired : sanitizeKey(desired), takenKeys(schema));
  const parentId = target.parentId ?? null;
  entities[entity.id] = {
    ...entity,
    attributes: { ...entity.attributes, key },
    parentId,
    ...entity.children ? { children: [...entity.children] } : {}
  };
  if (parentId) {
    const parent = entities[parentId];
    if (!parent) {
      entities[entity.id] = { ...entities[entity.id], parentId: null };
      return repairSchema({ ...schema, entities, root: appendAt([...schema.root ?? []], entity.id, target.index) }).schema;
    }
    entities[parentId] = { ...parent, children: appendAt([...parent.children ?? []], entity.id, target.index) };
    return repairSchema({ ...schema, entities, root: [...schema.root ?? []] }).schema;
  }
  return repairSchema({ ...schema, entities, root: appendAt([...schema.root ?? []], entity.id, target.index) }).schema;
}
function remove(schema, id) {
  if (!schema.entities?.[id]) return schema;
  const doomed = /* @__PURE__ */ new Set([id, ...descendantIds2(schema, id)]);
  const entities = {};
  for (const [eid, e] of Object.entries(schema.entities)) {
    if (doomed.has(eid)) continue;
    const children = e.children?.filter((c) => !doomed.has(c));
    entities[eid] = { ...e, attributes: { ...e.attributes }, ...children ? { children } : {} };
  }
  const root = (schema.root ?? []).filter((r) => !doomed.has(r));
  return repairSchema({ ...schema, entities, root }).schema;
}
function move(schema, id, target) {
  const e = schema.entities?.[id];
  if (!e) return schema;
  const parentId = target.parentId ?? null;
  if (parentId === id) return schema;
  if (parentId && descendantIds2(schema, id).includes(parentId)) return schema;
  const detached = detach(schema, id);
  const entities = cloneEntities2(detached);
  const me = entities[id];
  if (!me) return schema;
  entities[id] = { ...me, parentId };
  if (parentId) {
    const parent = entities[parentId];
    if (!parent) return schema;
    entities[parentId] = { ...parent, children: appendAt([...parent.children ?? []], id, target.index) };
    return repairSchema({ ...detached, entities, root: [...detached.root ?? []] }).schema;
  }
  return repairSchema({ ...detached, entities, root: appendAt([...detached.root ?? []], id, target.index) }).schema;
}
function duplicate(schema, id, idgen = defaultIdGen) {
  const orig = schema.entities?.[id];
  if (!orig) return schema;
  const taken = takenKeys(schema);
  const idMap = /* @__PURE__ */ new Map();
  const clones = [];
  const cloneRec = (origId) => {
    const e = schema.entities?.[origId];
    if (!e) return null;
    const newId = idgen();
    idMap.set(origId, newId);
    const children = (e.children ?? []).map((c) => cloneRec(c)).filter((x) => Boolean(x));
    let attributes = { ...e.attributes };
    if (isKeyed(e)) {
      const key = uniqueKey(`${keyOf(origId, e)}Copy`, taken);
      taken.add(key);
      attributes = { ...attributes, key };
    }
    clones.push({ ...e, id: newId, attributes, ...e.children ? { children } : {}, parentId: e.parentId ?? null });
    return newId;
  };
  const newRootId = cloneRec(id);
  if (!newRootId) return schema;
  const entities = cloneEntities2(schema);
  for (const c of clones) {
    const remapped = c.parentId && idMap.has(c.parentId) ? idMap.get(c.parentId) : null;
    entities[c.id] = { ...c, parentId: c.id === newRootId ? orig.parentId ?? null : remapped };
  }
  const parentId = orig.parentId ?? null;
  if (parentId && entities[parentId]) {
    const parent = entities[parentId];
    entities[parentId] = { ...parent, children: insertAfter([...parent.children ?? []], id, newRootId) };
    return repairSchema({ ...schema, entities, root: [...schema.root ?? []] }).schema;
  }
  return repairSchema({ ...schema, entities, root: insertAfter([...schema.root ?? []], id, newRootId) }).schema;
}
function reorder(schema, parentId, fromIndex, toIndex) {
  const list = parentId ? schema.entities?.[parentId]?.children : schema.root;
  if (!list || fromIndex < 0 || fromIndex >= list.length) return schema;
  const arr = [...list];
  const moved = arr.splice(fromIndex, 1)[0];
  if (moved === void 0) return schema;
  arr.splice(clampIndex(toIndex, arr.length), 0, moved);
  if (parentId) {
    const entities = cloneEntities2(schema);
    const p = entities[parentId];
    if (!p) return schema;
    entities[parentId] = { ...p, children: arr };
    return { ...schema, entities };
  }
  return { ...schema, root: arr };
}
function updateAttributes(schema, id, patch) {
  const e = schema.entities?.[id];
  if (!e) return schema;
  const entities = cloneEntities2(schema);
  let attributes = { ...e.attributes, ...patch };
  if (patch.key !== void 0) {
    const desired = typeof patch.key === "string" && isValidKey(patch.key) ? patch.key : sanitizeKey(patch.key ?? e.attributes.label ?? e.type);
    attributes = { ...attributes, key: uniqueKey(desired, takenKeys(schema, id)) };
  }
  entities[id] = { ...e, attributes };
  return { ...schema, entities };
}
function setSettings(schema, patch) {
  return { ...schema, settings: { ...schema.settings ?? {}, ...patch } };
}
function takenKeys(schema, exceptId) {
  const set = /* @__PURE__ */ new Set();
  for (const { id, key } of collectKeys(schema)) if (id !== exceptId) set.add(key);
  return set;
}
function cloneEntities2(schema) {
  const out = {};
  for (const [id, e] of Object.entries(schema.entities ?? {})) {
    out[id] = { ...e, attributes: { ...e.attributes }, ...e.children ? { children: [...e.children] } : {} };
  }
  return out;
}
function detach(schema, id) {
  const entities = cloneEntities2(schema);
  for (const [eid, e] of Object.entries(entities)) {
    if (e.children?.includes(id)) entities[eid] = { ...e, children: e.children.filter((c) => c !== id) };
  }
  return { ...schema, entities, root: (schema.root ?? []).filter((r) => r !== id) };
}
function descendantIds2(schema, id) {
  const out = [];
  const seen = /* @__PURE__ */ new Set([id]);
  const stack = [...schema.entities?.[id]?.children ?? []];
  while (stack.length) {
    const c = stack.pop();
    if (c === void 0 || seen.has(c)) continue;
    seen.add(c);
    const e = schema.entities?.[c];
    if (!e) continue;
    out.push(c);
    for (const cc of e.children ?? []) stack.push(cc);
  }
  return out;
}
function appendAt(arr, id, index) {
  arr.splice(clampIndex(index, arr.length), 0, id);
  return arr;
}
function insertAfter(arr, afterId, id) {
  const i = arr.indexOf(afterId);
  arr.splice(i < 0 ? arr.length : i + 1, 0, id);
  return arr;
}
function clampIndex(index, length) {
  if (typeof index !== "number" || !Number.isFinite(index) || index < 0 || index > length) return length;
  return Math.floor(index);
}

// src/index.ts
var VERSION = "0.1.0-alpha.0";

export { BUILTIN_RULES, CURRENT_SCHEMA_VERSION, DEFAULT_MAX_PASSES, DEFAULT_MESSAGES, KEY_RE, KEY_REGEX_SOURCE, LOGIC_ACTIONS, RESERVED_KEYS, VERSION, ValidatorRegistry, buildDependencyGraph, buildEvalModel, buildFieldValidators, camelCaseKeys, collectKeys, createDefaultFieldTypeRegistry, createDefaultRegistry, createEntity, createFormEngine, customValidationValidator, defaultFieldTypeRegistry, defaultIdGen, defaultRegistry, defaultSameValue, downstreamClosure, duplicate, duplicateKeyIds, emailRule, evaluate2 as evaluate, evaluateCompiled, evaluateExpression, evaluateIncremental, evaluateJs, evaluateRequired, evaluateVisibility, expressionVariables, extractDataRefs, fail, getPath, hasBlockingProblems, hasHostileIdentifier, insert, interpolate, isAutoKey, isEmptyValue, isKeyed, isValidKey, keyOf, maxDateRule, maxFileSizeRule, maxFilesRule, maxLengthRule, maxRowsRule, maxRule, maxSelectedRule, maxTagsRule, maxTimeRule, maxWordsRule, migrateSchema, minDateRule, minFilesRule, minLengthRule, minRowsRule, minRule, minSelectedRule, minTagsRule, minTimeRule, minWordsRule, move, normalizeKeys, ok, orderedIds, parseExpression, patternRule, readAsyncValidation, readDataSource, readSettings, readSubmitMessage, registerValidator, remove, renderMessage, reorder, repairSchema, requiredRule, resolveMinionParams, runAsyncValidation, sanitizeKey, seedFields, setSettings, sourcePriority, toAddressSuggestions, toCamelKey, toOptions, toPrintableHtml, uniqueKey, updateAttributes, urlRule, validateSchema, validateSchemaReport, validateValue };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map