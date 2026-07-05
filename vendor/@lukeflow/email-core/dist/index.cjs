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
  if (!nonEmpty(doc.subject)) {
    problems.push({ code: "no-subject", severity: "warning", message: "This email has no subject line." });
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
    brandColor: typeof t.brandColor === "string" && t.brandColor ? t.brandColor : DEFAULT_THEME.brandColor,
    fontFamily: typeof t.fontFamily === "string" && ALLOWED_FONTS.has(t.fontFamily) ? t.fontFamily : DEFAULT_THEME.fontFamily,
    contentWidth: Number.isFinite(widthNum) ? clamp(Math.round(widthNum), MIN_CONTENT_WIDTH, MAX_CONTENT_WIDTH) : DEFAULT_THEME.contentWidth,
    backgroundColor: typeof t.backgroundColor === "string" && t.backgroundColor ? t.backgroundColor : DEFAULT_THEME.backgroundColor,
    contentBackground: typeof t.contentBackground === "string" && t.contentBackground ? t.contentBackground : DEFAULT_THEME.contentBackground
  };
}
var str = (v) => typeof v === "string" ? v : "";
function repairBlock(raw) {
  if (!raw || typeof raw !== "object") return null;
  const b = raw;
  const align = coerceAlign(b.align);
  switch (b.type) {
    case "heading":
      return { type: "heading", text: str(b.text), level: coerceLevel(b.level), ...align ? { align } : {} };
    case "text":
      return { type: "text", text: str(b.text), ...align ? { align } : {} };
    case "button":
      return {
        type: "button",
        label: str(b.label),
        href: str(b.href),
        ...align ? { align } : {},
        ...typeof b.bgColor === "string" && b.bgColor ? { bgColor: b.bgColor } : {},
        ...typeof b.textColor === "string" && b.textColor ? { textColor: b.textColor } : {}
      };
    case "image":
      return {
        type: "image",
        src: str(b.src),
        alt: str(b.alt),
        ...typeof b.width === "number" || b.width && Number.isFinite(Number(b.width)) ? { width: Math.round(Number(b.width)) } : {},
        ...typeof b.href === "string" && b.href ? { href: b.href } : {},
        ...align ? { align } : {}
      };
    case "divider":
      return { type: "divider" };
    case "spacer":
      return { type: "spacer", size: typeof b.size === "number" || Number.isFinite(Number(b.size)) ? Math.max(1, Math.round(Number(b.size) || 24)) : 24 };
    case "footer":
      return {
        type: "footer",
        text: str(b.text),
        ...typeof b.unsubscribeUrl === "string" && b.unsubscribeUrl ? { unsubscribeUrl: b.unsubscribeUrl } : {}
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
      subject: str(src.subject),
      ...typeof src.preheader === "string" ? { preheader: src.preheader } : {},
      theme: repairTheme(src.theme),
      blocks
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

exports.ALLOWED_BLOCK_TYPES = ALLOWED_BLOCK_TYPES;
exports.DEFAULT_THEME = DEFAULT_THEME;
exports.MAX_BLOCKS = MAX_BLOCKS;
exports.MAX_CONTENT_WIDTH = MAX_CONTENT_WIDTH;
exports.MIN_CONTENT_WIDTH = MIN_CONTENT_WIDTH;
exports.VAR_RE = VAR_RE;
exports.emptyEmailDoc = emptyEmailDoc;
exports.extractVariables = extractVariables;
exports.hasBlockingProblems = hasBlockingProblems;
exports.isHttpUrl = isHttpUrl;
exports.isHttpsUrl = isHttpsUrl;
exports.isVarOnly = isVarOnly;
exports.parseEmailDoc = parseEmailDoc;
exports.repairEmailDoc = repairEmailDoc;
exports.validateEmailDoc = validateEmailDoc;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map