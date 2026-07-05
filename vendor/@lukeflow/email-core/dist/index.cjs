'use strict';

// src/emailDoc.ts
var MAX_BLOCKS = 50;
var MIN_CONTENT_WIDTH = 480;
var MAX_CONTENT_WIDTH = 700;
var ALLOWED_BLOCK_TYPES = /* @__PURE__ */ new Set([
  "heading",
  "text",
  "button",
  "image",
  "divider",
  "spacer",
  "footer"
]);
var ALLOWED_ALIGN = /* @__PURE__ */ new Set(["left", "center", "right"]);
var ALLOWED_FONTS = /* @__PURE__ */ new Set(["sans", "serif", "mono"]);
var MAX_SUBJECT_LEN = 256;
var MAX_PREHEADER_LEN = 256;
var MAX_RICH_TEXT_LEN = 5e3;
var MAX_SHORT_TEXT_LEN = 256;
var MAX_URL_LEN = 2048;
var MAX_SPACER_SIZE = 200;
var HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
var FUNC_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$/i;
var NAMED_COLORS = new Set(
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen currentcolor".split(" ")
);
function isValidColor(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return HEX_COLOR.test(v) || FUNC_COLOR.test(v) || /^[a-z]+$/i.test(v) && NAMED_COLORS.has(v.toLowerCase());
}
function coerceColor(value, fallback) {
  return isValidColor(value) ? value.trim() : fallback;
}
var DEFAULT_THEME = {
  brandColor: "#2563eb",
  fontFamily: "sans",
  contentWidth: 600,
  backgroundColor: "#f3f4f6",
  contentBackground: "#ffffff"
};
function emptyEmailDoc() {
  return { subject: "", preheader: "", theme: { ...DEFAULT_THEME }, blocks: [] };
}
var VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
function extractVariables(doc) {
  if (!doc || typeof doc !== "object") return [];
  const seen = /* @__PURE__ */ new Set();
  const scan = (s) => {
    if (typeof s !== "string") return;
    for (const m of s.matchAll(VAR_RE)) {
      const name = m[1];
      if (name) seen.add(name);
    }
  };
  scan(doc.subject);
  scan(doc.preheader);
  for (const b of Array.isArray(doc.blocks) ? doc.blocks : []) {
    if (!b || typeof b !== "object") continue;
    const blk = b;
    scan(blk.text);
    scan(blk.label);
    scan(blk.href);
    scan(blk.src);
    scan(blk.unsubscribeUrl);
  }
  return [...seen];
}
function isHttpsUrl(value) {
  return typeof value === "string" && /^https:\/\/\S+/i.test(value.trim());
}
function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\/\S+/i.test(value.trim());
}
function isVarOnly(value) {
  if (typeof value !== "string") return false;
  return /^\s*\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}\s*$/.test(value);
}
function hasVar(value) {
  return typeof value === "string" && /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/.test(value);
}
var nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
function validateEmailDoc(doc) {
  const problems = [];
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.blocks)) {
    problems.push({ code: "malformed-doc", severity: "error", message: "Email document is missing its blocks." });
    return problems;
  }
  const overLen = (v, n) => typeof v === "string" && v.length > n;
  const colorBad = (v) => typeof v === "string" && v.trim() !== "" && !isValidColor(v);
  if (!nonEmpty(doc.subject)) {
    problems.push({ code: "no-subject", severity: "warning", message: "This email has no subject line." });
  }
  if (overLen(doc.subject, MAX_SUBJECT_LEN)) {
    problems.push({ code: "field-truncated", severity: "warning", message: `Subject is longer than ${MAX_SUBJECT_LEN} characters and will be truncated.` });
  }
  if (overLen(doc.preheader, MAX_PREHEADER_LEN)) {
    problems.push({ code: "field-truncated", severity: "warning", message: `Preheader is longer than ${MAX_PREHEADER_LEN} characters and will be truncated.` });
  }
  const theme = doc.theme;
  if (theme) {
    for (const [key, label] of [["brandColor", "Brand color"], ["backgroundColor", "Background color"], ["contentBackground", "Card background"]]) {
      if (colorBad(theme[key])) {
        problems.push({ code: "insecure-color", severity: "warning", message: `${label} isn't a valid CSS color and will be reset to the default.` });
      }
    }
  }
  if (doc.blocks.length === 0) {
    problems.push({ code: "empty-blocks", severity: "error", message: "Add at least one block \u2014 the email is empty." });
  }
  if (doc.blocks.length > MAX_BLOCKS) {
    problems.push({ code: "too-many-blocks", severity: "error", message: `An email can have at most ${MAX_BLOCKS} blocks.` });
  }
  doc.blocks.forEach((raw, i) => {
    const b = raw;
    const type = b?.type;
    if (!type || !ALLOWED_BLOCK_TYPES.has(type)) {
      problems.push({ code: "invalid-type", severity: "error", blockIndex: i, message: `Block ${i + 1} has an unknown type "${String(type)}".` });
      return;
    }
    for (const [prop, cap] of [["text", MAX_RICH_TEXT_LEN], ["label", MAX_SHORT_TEXT_LEN], ["alt", MAX_SHORT_TEXT_LEN], ["href", MAX_URL_LEN], ["src", MAX_URL_LEN], ["unsubscribeUrl", MAX_URL_LEN]]) {
      if (overLen(b[prop], cap)) problems.push({ code: "field-truncated", severity: "warning", blockIndex: i, message: `Block ${i + 1} ${prop} is longer than ${cap} characters and will be truncated.` });
    }
    if (colorBad(b.bgColor) || colorBad(b.textColor)) {
      problems.push({ code: "insecure-color", severity: "warning", blockIndex: i, message: `Block ${i + 1} has a color that isn't valid CSS and will be dropped.` });
    }
    switch (type) {
      case "heading":
        if (!nonEmpty(b.text)) problems.push({ code: "missing-prop", severity: "error", blockIndex: i, message: "Heading is missing its text." });
        break;
      case "text":
        if (!nonEmpty(b.text)) problems.push({ code: "missing-prop", severity: "error", blockIndex: i, message: "Text block is empty." });
        break;
      case "button":
        if (!nonEmpty(b.label)) problems.push({ code: "missing-prop", severity: "error", blockIndex: i, message: "Button is missing its label." });
        if (!nonEmpty(b.href)) {
          problems.push({ code: "missing-prop", severity: "error", blockIndex: i, message: "Button is missing its link." });
        } else if (!isHttpUrl(b.href) && !isVarOnly(b.href)) {
          problems.push({ code: "invalid-href", severity: "error", blockIndex: i, message: "Button link must be a URL or a {{variable}}." });
        } else if (!isHttpUrl(b.href) && hasVar(b.href)) {
          problems.push({ code: "var-href-no-scheme", severity: "warning", blockIndex: i, message: "Button link uses a variable without an http(s) scheme \u2014 make sure it resolves to a full URL." });
        }
        break;
      case "image":
        if (!nonEmpty(b.src)) {
          problems.push({ code: "missing-prop", severity: "error", blockIndex: i, message: "Image is missing its source." });
        } else if (!isHttpsUrl(b.src) && !isVarOnly(b.src)) {
          problems.push({ code: "insecure-image", severity: "error", blockIndex: i, message: "Image source must be an https:// URL." });
        }
        if (!nonEmpty(b.alt)) problems.push({ code: "missing-prop", severity: "warning", blockIndex: i, message: "Image has no alt text (hurts accessibility)." });
        break;
      case "footer":
        if (!nonEmpty(b.text)) problems.push({ code: "missing-prop", severity: "error", blockIndex: i, message: "Footer is missing its text." });
        break;
    }
  });
  return problems;
}
function hasBlockingProblems(doc) {
  return validateEmailDoc(doc).some((p) => p.severity === "error");
}
var clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
var coerceAlign = (v) => typeof v === "string" && ALLOWED_ALIGN.has(v) ? v : void 0;
var coerceLevel = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return n === 2 ? 2 : n === 3 ? 3 : 1;
};
function repairTheme(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  const widthNum = typeof t.contentWidth === "number" ? t.contentWidth : Number(t.contentWidth);
  return {
    brandColor: coerceColor(t.brandColor, DEFAULT_THEME.brandColor),
    fontFamily: typeof t.fontFamily === "string" && ALLOWED_FONTS.has(t.fontFamily) ? t.fontFamily : DEFAULT_THEME.fontFamily,
    contentWidth: Number.isFinite(widthNum) ? clamp(Math.round(widthNum), MIN_CONTENT_WIDTH, MAX_CONTENT_WIDTH) : DEFAULT_THEME.contentWidth,
    backgroundColor: coerceColor(t.backgroundColor, DEFAULT_THEME.backgroundColor),
    contentBackground: coerceColor(t.contentBackground, DEFAULT_THEME.contentBackground)
  };
}
var str = (v) => typeof v === "string" ? v : "";
var clip = (v, n) => str(v).slice(0, n);
function sanitizeVars(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const v of raw) {
    const name = v?.name;
    if (v && typeof v === "object" && typeof name === "string" && name && !seen.has(name)) {
      seen.add(name);
      out.push(v);
    }
  }
  return out;
}
var optColor = (v) => coerceColor(v, "");
function repairBlock(raw) {
  if (!raw || typeof raw !== "object") return null;
  const b = raw;
  const align = coerceAlign(b.align);
  switch (b.type) {
    case "heading":
      return { type: "heading", text: clip(b.text, MAX_RICH_TEXT_LEN), level: coerceLevel(b.level), ...align ? { align } : {} };
    case "text":
      return { type: "text", text: clip(b.text, MAX_RICH_TEXT_LEN), ...align ? { align } : {} };
    case "button": {
      const bg = optColor(b.bgColor);
      const fg = optColor(b.textColor);
      return {
        type: "button",
        label: clip(b.label, MAX_SHORT_TEXT_LEN),
        href: clip(b.href, MAX_URL_LEN),
        ...align ? { align } : {},
        ...bg ? { bgColor: bg } : {},
        ...fg ? { textColor: fg } : {}
      };
    }
    case "image":
      return {
        type: "image",
        src: clip(b.src, MAX_URL_LEN),
        alt: clip(b.alt, MAX_SHORT_TEXT_LEN),
        ...typeof b.width === "number" || b.width && Number.isFinite(Number(b.width)) ? { width: clamp(Math.round(Number(b.width)), 1, MAX_CONTENT_WIDTH) } : {},
        ...typeof b.href === "string" && b.href ? { href: clip(b.href, MAX_URL_LEN) } : {},
        ...align ? { align } : {}
      };
    case "divider":
      return { type: "divider" };
    case "spacer":
      return { type: "spacer", size: typeof b.size === "number" || Number.isFinite(Number(b.size)) ? clamp(Math.round(Number(b.size) || 24), 1, MAX_SPACER_SIZE) : 24 };
    case "footer":
      return {
        type: "footer",
        text: clip(b.text, MAX_RICH_TEXT_LEN),
        ...typeof b.unsubscribeUrl === "string" && b.unsubscribeUrl ? { unsubscribeUrl: clip(b.unsubscribeUrl, MAX_URL_LEN) } : {}
      };
    default:
      return null;
  }
}
function repairEmailDoc(doc) {
  const removed = [];
  const src = doc && typeof doc === "object" ? doc : {};
  const rawBlocks = Array.isArray(src.blocks) ? src.blocks : [];
  const blocks = [];
  rawBlocks.forEach((raw, i) => {
    const fixed = repairBlock(raw);
    if (fixed) blocks.push(fixed);
    else removed.push(`block ${i + 1} (unknown type "${String(raw?.type)}")`);
  });
  if (blocks.length > MAX_BLOCKS) {
    removed.push(`${blocks.length - MAX_BLOCKS} block(s) over the ${MAX_BLOCKS} limit`);
    blocks.length = MAX_BLOCKS;
  }
  return {
    doc: {
      subject: clip(src.subject, MAX_SUBJECT_LEN),
      ...typeof src.preheader === "string" ? { preheader: clip(src.preheader, MAX_PREHEADER_LEN) } : {},
      theme: repairTheme(src.theme),
      blocks,
      ...Array.isArray(src.variables) ? { variables: sanitizeVars(src.variables) } : {}
    },
    removed
  };
}
function parseEmailDoc(raw) {
  if (!raw) return emptyEmailDoc();
  try {
    return repairEmailDoc(JSON.parse(raw)).doc;
  } catch {
    return emptyEmailDoc();
  }
}

// src/variables.ts
var EMAIL_VAR_TYPES = ["string", "number", "url", "date", "boolean"];
var VAR_TYPE_SET = new Set(EMAIL_VAR_TYPES);
var VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function isValidVarName(name) {
  return typeof name === "string" && VAR_NAME_RE.test(name);
}
var isPrimitive = (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
function normalizeVar(raw) {
  const v = {
    name: raw.name,
    type: typeof raw.type === "string" && VAR_TYPE_SET.has(raw.type) ? raw.type : "string",
    required: typeof raw.required === "boolean" ? raw.required : true
  };
  if (raw.default !== void 0 && isPrimitive(raw.default)) v.default = raw.default;
  if (typeof raw.label === "string" && raw.label) v.label = raw.label;
  return v;
}
function reconcileVariables(doc, declared = doc?.variables ?? []) {
  const declaredByName = /* @__PURE__ */ new Map();
  for (const d of Array.isArray(declared) ? declared : []) {
    if (d && isValidVarName(d.name) && !declaredByName.has(d.name)) {
      declaredByName.set(d.name, normalizeVar(d));
    }
  }
  const out = [];
  const emitted = /* @__PURE__ */ new Set();
  for (const name of extractVariables(doc)) {
    if (emitted.has(name)) continue;
    emitted.add(name);
    out.push(declaredByName.get(name) ?? { name, type: "string", required: true });
  }
  for (const [name, v] of declaredByName) {
    if (emitted.has(name)) continue;
    emitted.add(name);
    out.push(v);
  }
  return out;
}
function defaultMatchesType(value, type) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "url":
      return typeof value === "string" && /^https?:\/\/\S+/i.test(value.trim());
    case "date":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
  }
}
function validateVariables(template) {
  const problems = [];
  const doc = template?.doc;
  const declared = Array.isArray(template?.variables) ? template.variables : [];
  const used = new Set(extractVariables(doc));
  const seen = /* @__PURE__ */ new Set();
  for (const v of declared) {
    const name = v?.name;
    if (!isValidVarName(name)) {
      problems.push({ code: "invalid-variable-name", severity: "error", message: `Variable name "${String(name)}" is not a valid {{identifier}}.` });
      continue;
    }
    if (seen.has(name)) {
      problems.push({ code: "duplicate-variable", severity: "error", message: `Variable "${name}" is declared more than once.` });
      continue;
    }
    seen.add(name);
    if (v.type !== void 0 && !VAR_TYPE_SET.has(v.type)) {
      problems.push({ code: "invalid-variable-type", severity: "error", message: `Variable "${name}" has an unknown type "${String(v.type)}".` });
    }
    if (v.default !== void 0) {
      if (!isPrimitive(v.default) || !defaultMatchesType(v.default, VAR_TYPE_SET.has(v.type) ? v.type : "string")) {
        problems.push({ code: "default-type-mismatch", severity: "warning", message: `Variable "${name}" has a default that doesn't match its ${v.type ?? "string"} type.` });
      }
    }
    if (!used.has(name)) {
      problems.push({ code: "unused-variable", severity: "warning", message: `Variable "${name}" is declared but never used in the email.` });
    }
  }
  for (const name of used) {
    if (!seen.has(name)) {
      problems.push({ code: "undeclared-variable", severity: "warning", message: `Variable "${name}" is used but not declared in the contract.` });
    }
  }
  return problems;
}
function typeZero(type) {
  return type === "number" ? 0 : type === "boolean" ? false : "";
}
function buildTemplateModel(template, values = {}) {
  const vals = values && typeof values === "object" ? values : {};
  const model = {};
  for (const v of reconcileVariables(template?.doc, template?.variables)) {
    model[v.name] = v.name in vals && isPrimitive(vals[v.name]) ? vals[v.name] : v.default !== void 0 ? v.default : typeZero(v.type);
  }
  return model;
}
var SAMPLE = {
  string: "Sample text",
  number: "123",
  url: "https://example.com",
  date: "2025-01-01",
  boolean: "true"
};
function previewValues(template) {
  const out = {};
  for (const v of reconcileVariables(template?.doc, template?.variables)) {
    out[v.name] = v.default !== void 0 ? String(v.default) : SAMPLE[v.type];
  }
  return out;
}

exports.ALLOWED_BLOCK_TYPES = ALLOWED_BLOCK_TYPES;
exports.DEFAULT_THEME = DEFAULT_THEME;
exports.EMAIL_VAR_TYPES = EMAIL_VAR_TYPES;
exports.MAX_BLOCKS = MAX_BLOCKS;
exports.MAX_CONTENT_WIDTH = MAX_CONTENT_WIDTH;
exports.MAX_PREHEADER_LEN = MAX_PREHEADER_LEN;
exports.MAX_RICH_TEXT_LEN = MAX_RICH_TEXT_LEN;
exports.MAX_SHORT_TEXT_LEN = MAX_SHORT_TEXT_LEN;
exports.MAX_SPACER_SIZE = MAX_SPACER_SIZE;
exports.MAX_SUBJECT_LEN = MAX_SUBJECT_LEN;
exports.MAX_URL_LEN = MAX_URL_LEN;
exports.MIN_CONTENT_WIDTH = MIN_CONTENT_WIDTH;
exports.VAR_RE = VAR_RE;
exports.buildTemplateModel = buildTemplateModel;
exports.coerceColor = coerceColor;
exports.emptyEmailDoc = emptyEmailDoc;
exports.extractVariables = extractVariables;
exports.hasBlockingProblems = hasBlockingProblems;
exports.isHttpUrl = isHttpUrl;
exports.isHttpsUrl = isHttpsUrl;
exports.isValidColor = isValidColor;
exports.isValidVarName = isValidVarName;
exports.isVarOnly = isVarOnly;
exports.parseEmailDoc = parseEmailDoc;
exports.previewValues = previewValues;
exports.reconcileVariables = reconcileVariables;
exports.repairEmailDoc = repairEmailDoc;
exports.validateEmailDoc = validateEmailDoc;
exports.validateVariables = validateVariables;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map