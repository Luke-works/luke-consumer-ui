// The EmailDoc block model — the linchpin shared (identically) across all three
// repos. The AI agent emits it, the UI renders/edits it, and we version it.
//
// It is intentionally small & bounded: a fixed theme plus an ordered list of
// blocks from a closed vocabulary (heading | text | button | image | divider |
// spacer | footer). Every block carries only the props the contract allows;
// anything else is stripped on repair so the renderer can never choke.
//
// Like formSchema.ts, this module is decoupled from the renderer/builder so it
// can be unit-tested in isolation and reused by the AI apply path. The two
// invariants it protects: the doc is structurally sound (valid blocks, clamped
// theme) and its {{variables}} form a clear merge contract.

// ── Theme ────────────────────────────────────────────────────────────────────
export type FontFamily = "sans" | "serif" | "mono";

export type Theme = {
  /** Hex; used for buttons/accents. */
  brandColor: string;
  fontFamily: FontFamily;
  /** px, clamped to 480..700. */
  contentWidth: number;
  /** Page background. */
  backgroundColor: string;
  /** Card background. */
  contentBackground: string;
};

// ── Blocks (the ONLY allowed `type` values — bounded on purpose) ──────────────
export type Align = "left" | "center" | "right";
export type HeadingLevel = 1 | 2 | 3;

export type HeadingBlock = { type: "heading"; text: string; level?: HeadingLevel; align?: Align };
export type TextBlock = { type: "text"; text: string; align?: Align };
export type ButtonBlock = { type: "button"; label: string; href: string; align?: Align; bgColor?: string; textColor?: string };
export type ImageBlock = { type: "image"; src: string; alt: string; width?: number; href?: string | null; align?: Align };
export type DividerBlock = { type: "divider" };
export type SpacerBlock = { type: "spacer"; size?: number };
export type FooterBlock = { type: "footer"; text: string; unsubscribeUrl?: string };

export type EmailBlock =
  | HeadingBlock
  | TextBlock
  | ButtonBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | FooterBlock;

export type BlockType = EmailBlock["type"];

export type EmailDoc = {
  /** Subject line; may contain {{vars}}. */
  subject: string;
  /** Optional inbox preview text. */
  preheader?: string;
  theme: Theme;
  /** Ordered, bounded (max 50). */
  blocks: EmailBlock[];
};

// ── Bounds / defaults ─────────────────────────────────────────────────────────
export const MAX_BLOCKS = 50;
export const MIN_CONTENT_WIDTH = 480;
export const MAX_CONTENT_WIDTH = 700;
export const ALLOWED_BLOCK_TYPES = new Set<BlockType>([
  "heading",
  "text",
  "button",
  "image",
  "divider",
  "spacer",
  "footer",
]);
const ALLOWED_ALIGN = new Set<Align>(["left", "center", "right"]);
const ALLOWED_FONTS = new Set<FontFamily>(["sans", "serif", "mono"]);

export const DEFAULT_THEME: Theme = {
  brandColor: "#2563eb",
  fontFamily: "sans",
  contentWidth: 600,
  backgroundColor: "#f3f4f6",
  contentBackground: "#ffffff",
};

/** A fresh, valid, empty document the builder can start from. */
export function emptyEmailDoc(): EmailDoc {
  return { subject: "", preheader: "", theme: { ...DEFAULT_THEME }, blocks: [] };
}

// ── Variables ─────────────────────────────────────────────────────────────────
// A "variable" is any {{identifier}} (Mustachio-compatible) appearing in the
// subject, any block text/label/href/src, or footer.unsubscribeUrl. The distinct
// set is the merge contract (Postmark TemplateModel keys).
export const VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Distinct variable names referenced anywhere in the doc, in first-seen order. */
export function extractVariables(doc: EmailDoc | null | undefined): string[] {
  if (!doc || typeof doc !== "object") return [];
  const seen = new Set<string>();
  const scan = (s: unknown) => {
    if (typeof s !== "string") return;
    for (const m of s.matchAll(VAR_RE)) seen.add(m[1]);
  };
  scan(doc.subject);
  scan(doc.preheader);
  for (const b of Array.isArray(doc.blocks) ? doc.blocks : []) {
    if (!b || typeof b !== "object") continue;
    const blk = b as Record<string, unknown>;
    scan(blk.text);
    scan(blk.label);
    scan(blk.href);
    scan(blk.src);
    scan(blk.unsubscribeUrl);
  }
  return [...seen];
}

// ── Validation ────────────────────────────────────────────────────────────────
export type ProblemSeverity = "error" | "warning";

export type Problem = {
  /** Stable machine code, e.g. "missing-prop". */
  code: string;
  severity: ProblemSeverity;
  message: string;
  /** The offending block's index, when the problem is block-scoped. */
  blockIndex?: number;
};

/** True when a string is an https URL (the only scheme we allow for images). */
function isHttpsUrl(value: unknown): boolean {
  return typeof value === "string" && /^https:\/\/\S+/i.test(value.trim());
}

/** True when a string is an http(s) URL. */
function isHttpUrl(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\/\S+/i.test(value.trim());
}

/** True when the value is, or fully is, a single {{variable}} placeholder. */
function isVarOnly(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^\s*\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}\s*$/.test(value);
}

/** True when a string contains at least one {{variable}}. */
function hasVar(value: unknown): boolean {
  return typeof value === "string" && /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/.test(value);
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Full integrity check: bounded structure + required props + URL soundness.
 * Returns a flat problem list (errors block check-in/publish; warnings are
 * advisory). Tolerant of malformed input — never throws.
 */
export function validateEmailDoc(doc: EmailDoc | null | undefined): Problem[] {
  const problems: Problem[] = [];
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.blocks)) {
    problems.push({ code: "malformed-doc", severity: "error", message: "Email document is missing its blocks." });
    return problems;
  }

  if (!nonEmpty(doc.subject)) {
    problems.push({ code: "no-subject", severity: "warning", message: "This email has no subject line." });
  }

  if (doc.blocks.length === 0) {
    problems.push({ code: "empty-blocks", severity: "error", message: "Add at least one block — the email is empty." });
  }
  if (doc.blocks.length > MAX_BLOCKS) {
    problems.push({ code: "too-many-blocks", severity: "error", message: `An email can have at most ${MAX_BLOCKS} blocks.` });
  }

  doc.blocks.forEach((raw, i) => {
    const b = raw as Record<string, unknown>;
    const type = b?.type as BlockType | undefined;
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
          problems.push({ code: "var-href-no-scheme", severity: "warning", blockIndex: i, message: "Button link uses a variable without an http(s) scheme — make sure it resolves to a full URL." });
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
      case "divider":
      case "spacer":
        break;
    }
  });

  return problems;
}

/** Convenience: does the doc have any blocking (error-severity) problem? */
export function hasBlockingProblems(doc: EmailDoc | null | undefined): boolean {
  return validateEmailDoc(doc).some((p) => p.severity === "error");
}

// ── Repair ────────────────────────────────────────────────────────────────────
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const coerceAlign = (v: unknown): Align | undefined =>
  typeof v === "string" && ALLOWED_ALIGN.has(v as Align) ? (v as Align) : undefined;

const coerceLevel = (v: unknown): HeadingLevel => {
  const n = typeof v === "number" ? v : Number(v);
  return n === 2 ? 2 : n === 3 ? 3 : 1;
};

/** Fill missing/invalid theme fields from the defaults, clamping contentWidth. */
function repairTheme(raw: unknown): Theme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const widthNum = typeof t.contentWidth === "number" ? t.contentWidth : Number(t.contentWidth);
  return {
    brandColor: typeof t.brandColor === "string" && t.brandColor ? t.brandColor : DEFAULT_THEME.brandColor,
    fontFamily: typeof t.fontFamily === "string" && ALLOWED_FONTS.has(t.fontFamily as FontFamily) ? (t.fontFamily as FontFamily) : DEFAULT_THEME.fontFamily,
    contentWidth: Number.isFinite(widthNum) ? clamp(Math.round(widthNum), MIN_CONTENT_WIDTH, MAX_CONTENT_WIDTH) : DEFAULT_THEME.contentWidth,
    backgroundColor: typeof t.backgroundColor === "string" && t.backgroundColor ? t.backgroundColor : DEFAULT_THEME.backgroundColor,
    contentBackground: typeof t.contentBackground === "string" && t.contentBackground ? t.contentBackground : DEFAULT_THEME.contentBackground,
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Coerce one raw block into a clean, typed block — or null to drop it. */
function repairBlock(raw: unknown): EmailBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const align = coerceAlign(b.align);
  switch (b.type) {
    case "heading":
      return { type: "heading", text: str(b.text), level: coerceLevel(b.level), ...(align ? { align } : {}) };
    case "text":
      return { type: "text", text: str(b.text), ...(align ? { align } : {}) };
    case "button":
      return {
        type: "button",
        label: str(b.label),
        href: str(b.href),
        ...(align ? { align } : {}),
        ...(typeof b.bgColor === "string" && b.bgColor ? { bgColor: b.bgColor } : {}),
        ...(typeof b.textColor === "string" && b.textColor ? { textColor: b.textColor } : {}),
      };
    case "image":
      return {
        type: "image",
        src: str(b.src),
        alt: str(b.alt),
        ...(typeof b.width === "number" || (b.width && Number.isFinite(Number(b.width))) ? { width: Math.round(Number(b.width)) } : {}),
        ...(typeof b.href === "string" && b.href ? { href: b.href } : {}),
        ...(align ? { align } : {}),
      };
    case "divider":
      return { type: "divider" };
    case "spacer":
      return { type: "spacer", size: typeof b.size === "number" || Number.isFinite(Number(b.size)) ? Math.max(1, Math.round(Number(b.size) || 24)) : 24 };
    case "footer":
      return {
        type: "footer",
        text: str(b.text),
        ...(typeof b.unsubscribeUrl === "string" && b.unsubscribeUrl ? { unsubscribeUrl: b.unsubscribeUrl } : {}),
      };
    default:
      return null; // unknown type → dropped
  }
}

/**
 * Return a structurally-sound copy of the doc so the builder/renderer can never
 * choke on a corrupted draft or AI output. It:
 *   - fills theme defaults and clamps contentWidth,
 *   - drops unknown block types and unknown props (coerces level/align),
 *   - caps the block list at MAX_BLOCKS.
 * Pure — does not mutate the input. `removed` describes what was dropped.
 */
export function repairEmailDoc(doc: EmailDoc | null | undefined): { doc: EmailDoc; removed: string[] } {
  const removed: string[] = [];
  const src = (doc && typeof doc === "object" ? doc : {}) as Record<string, unknown>;
  const rawBlocks = Array.isArray(src.blocks) ? src.blocks : [];

  const blocks: EmailBlock[] = [];
  rawBlocks.forEach((raw, i) => {
    const fixed = repairBlock(raw);
    if (fixed) blocks.push(fixed);
    else removed.push(`block ${i + 1} (unknown type "${String((raw as { type?: unknown })?.type)}")`);
  });
  if (blocks.length > MAX_BLOCKS) {
    removed.push(`${blocks.length - MAX_BLOCKS} block(s) over the ${MAX_BLOCKS} limit`);
    blocks.length = MAX_BLOCKS;
  }

  return {
    doc: {
      subject: str(src.subject),
      ...(typeof src.preheader === "string" ? { preheader: src.preheader } : {}),
      theme: repairTheme(src.theme),
      blocks,
    },
    removed,
  };
}

/** Parse an EmailDoc JSON string into a repaired doc (empty doc on failure). */
export function parseEmailDoc(raw: string | null | undefined): EmailDoc {
  if (!raw) return emptyEmailDoc();
  try {
    return repairEmailDoc(JSON.parse(raw) as EmailDoc).doc;
  } catch {
    return emptyEmailDoc();
  }
}
