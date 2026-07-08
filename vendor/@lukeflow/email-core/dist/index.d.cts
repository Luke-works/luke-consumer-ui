type EmailVarType = "string" | "number" | "url" | "date" | "boolean";
type EmailVariable = {
    /** The {{name}} identifier (VAR_RE grammar). */
    name: string;
    /** Declared type; drives TemplateModel seeding + validation. Default "string". */
    type: EmailVarType;
    /** Whether the send-time TemplateModel must supply it. Default true. */
    required: boolean;
    /** Optional default — seeds the TemplateModel and the preview. */
    default?: string | number | boolean;
    /** Optional human label for the builder UI. */
    label?: string;
};
/** A template = the doc plus its declared variable contract. */
type EmailTemplate = {
    doc: EmailDoc;
    variables: EmailVariable[];
};
declare const EMAIL_VAR_TYPES: readonly EmailVarType[];
declare function isValidVarName(name: unknown): name is string;
/**
 * The canonical variable contract for a doc: every {{var}} actually used, enriched
 * with any matching declaration, in a stable order (doc first-seen order, then
 * declared-but-unused appended). A used var is never dropped — undeclared ones
 * default to `{ type: "string", required: true }`. Pure & deterministic.
 */
declare function reconcileVariables(doc: EmailDoc | null | undefined, declared?: EmailVariable[] | null | undefined): EmailVariable[];
/**
 * Check a template's declared variable contract against its doc. Flags invalid
 * names/types, duplicates, defaults that don't match their type, declared-but-unused
 * and used-but-undeclared vars. Tolerant of malformed input — never throws.
 */
declare function validateVariables(template: EmailTemplate | null | undefined): Problem[];
/**
 * Build the Postmark TemplateModel skeleton: one key per reconciled variable,
 * seeded from `values` → the variable's `default` → the type's zero value. This is
 * what the Camunda outbound task fills with real values before Postmark merges.
 */
declare function buildTemplateModel(template: EmailTemplate | null | undefined, values?: Record<string, string | number | boolean> | null | undefined): Record<string, string | number | boolean>;
/**
 * Realistic string values for the LIVE preview so the operator sees rendered
 * content instead of raw {{vars}}. Uses each variable's `default` when set, else a
 * type-based sample. The PUBLISHED html/text still keep {{vars}} literal — this is
 * preview-only. Deterministic.
 */
declare function previewValues(template: EmailTemplate | null | undefined): Record<string, string>;
/**
 * Merge concrete values into a compiled email's HTML, exactly as Postmark's
 * Mustachio does for a `{{var}}` reference: substitute each `{{name}}` with its
 * value, HTML-escaped (so a value can't inject markup into the message). This
 * yields the ACTUAL email a recipient sees, for the LIVE PREVIEW only — the
 * PUBLISHED artifact keeps `{{vars}}` literal (Postmark merges at send time).
 *
 * A variable with no supplied value is left as its literal `{{name}}`, so gaps in
 * the model stay visible in the preview instead of silently rendering blank. Pure
 * and deterministic; operates on the rendered HTML string (no DOM).
 */
declare function mergePreview(html: string, values: Record<string, string | number | boolean> | null | undefined): string;

/** A font id from the shared library (see fonts.ts). The whole email uses ONE font
 *  — this is the single, template-wide choice; blocks never carry their own. */
type FontFamily = string;
type Theme = {
    /** Hex; used for buttons/accents. */
    brandColor: string;
    /** A font id from the shared FONTS library — applied globally to every block. */
    fontFamily: FontFamily;
    /** px, clamped to 480..700. */
    contentWidth: number;
    /** Page background. */
    backgroundColor: string;
    /** Card background. */
    contentBackground: string;
};
type Align = "left" | "center" | "right";
type HeadingLevel = 1 | 2 | 3;
type HeadingBlock = {
    type: "heading";
    text: string;
    level?: HeadingLevel;
    align?: Align;
};
type TextBlock = {
    type: "text";
    text: string;
    align?: Align;
};
type ButtonBlock = {
    type: "button";
    label: string;
    href: string;
    align?: Align;
    bgColor?: string;
    textColor?: string;
};
type ImageBlock = {
    type: "image";
    src: string;
    alt: string;
    width?: number;
    href?: string | null;
    align?: Align;
};
type DividerBlock = {
    type: "divider";
};
type SpacerBlock = {
    type: "spacer";
    size?: number;
};
type FooterBlock = {
    type: "footer";
    text: string;
    unsubscribeUrl?: string;
};
type EmailBlock = HeadingBlock | TextBlock | ButtonBlock | ImageBlock | DividerBlock | SpacerBlock | FooterBlock;
type BlockType = EmailBlock["type"];
type EmailDoc = {
    /** Subject line; may contain {{vars}}. */
    subject: string;
    /** Optional inbox preview text. */
    preheader?: string;
    theme: Theme;
    /** Ordered, bounded (max 50). */
    blocks: EmailBlock[];
    /** Optional declared typed variable contract (name→type/required/default/label).
     *  Repair-preserved; reconciled against the doc's {{vars}} on read. */
    variables?: EmailVariable[];
};
declare const MAX_BLOCKS = 50;
declare const MIN_CONTENT_WIDTH = 480;
declare const MAX_CONTENT_WIDTH = 700;
declare const ALLOWED_BLOCK_TYPES: Set<"heading" | "text" | "button" | "image" | "divider" | "spacer" | "footer">;
declare const MAX_SUBJECT_LEN = 256;
declare const MAX_PREHEADER_LEN = 256;
/** heading / text / footer body. */
declare const MAX_RICH_TEXT_LEN = 5000;
/** button label, image alt. */
declare const MAX_SHORT_TEXT_LEN = 256;
/** href / src / unsubscribeUrl. */
declare const MAX_URL_LEN = 2048;
declare const MAX_SPACER_SIZE = 200;
/** True when a string is a safe CSS color (hex, rgb/rgba/hsl/hsla, or a named color). */
declare function isValidColor(value: unknown): value is string;
/** Return the value if it's a safe color, else the fallback. */
declare function coerceColor(value: unknown, fallback: string): string;
declare const DEFAULT_THEME: Theme;
/** A fresh, valid, empty document the builder can start from. */
declare function emptyEmailDoc(): EmailDoc;
declare const VAR_RE: RegExp;
/** Distinct variable names referenced anywhere in the doc, in first-seen order. */
declare function extractVariables(doc: EmailDoc | null | undefined): string[];
type ProblemSeverity = "error" | "warning";
type Problem = {
    /** Stable machine code, e.g. "missing-prop". */
    code: string;
    severity: ProblemSeverity;
    message: string;
    /** The offending block's index, when the problem is block-scoped. */
    blockIndex?: number;
};
/** True when a string is an https URL (the only scheme we allow for images). */
declare function isHttpsUrl(value: unknown): boolean;
/** True when a string is an http(s) URL. */
declare function isHttpUrl(value: unknown): boolean;
/** True when the value is, or fully is, a single {{variable}} placeholder. */
declare function isVarOnly(value: unknown): boolean;
/**
 * Full integrity check: bounded structure + required props + URL soundness.
 * Returns a flat problem list (errors block check-in/publish; warnings are
 * advisory). Tolerant of malformed input — never throws.
 */
declare function validateEmailDoc(doc: EmailDoc | null | undefined): Problem[];
/** Convenience: does the doc have any blocking (error-severity) problem? */
declare function hasBlockingProblems(doc: EmailDoc | null | undefined): boolean;
/**
 * Return a structurally-sound copy of the doc so the builder/renderer can never
 * choke on a corrupted draft or AI output. It:
 *   - fills theme defaults and clamps contentWidth,
 *   - drops unknown block types and unknown props (coerces level/align),
 *   - caps the block list at MAX_BLOCKS.
 * Pure — does not mutate the input. `removed` describes what was dropped.
 */
declare function repairEmailDoc(doc: EmailDoc | null | undefined): {
    doc: EmailDoc;
    removed: string[];
};
/** Parse an EmailDoc JSON string into a repaired doc (empty doc on failure). */
declare function parseEmailDoc(raw: string | null | undefined): EmailDoc;

type FontCategory = "sans" | "serif" | "mono";
type FontDef = {
    /** Stable id persisted in `theme.fontFamily`. */
    id: string;
    /** Human label for the picker. */
    label: string;
    category: FontCategory;
    /** Full CSS `font-family` value: the (optional) web font first, then real
     *  fallbacks ending in a generic family so it renders everywhere. */
    stack: string;
    /** Google Fonts stylesheet to load in <Head> for clients that support web fonts.
     *  Omitted for web-safe fonts (which need no download). */
    webHref?: string;
};
declare const FONTS: readonly FontDef[];
/** All valid font ids (what may be stored in `theme.fontFamily`). */
declare const FONT_IDS: readonly string[];
/** Google Fonts stylesheet hrefs for every web font in the library. Load these in a
 *  page (e.g. a font picker) so each option can preview in its true face — otherwise
 *  a web font that isn't loaded falls back to its stack. Web-safe fonts need none. */
declare const WEB_FONT_HREFS: readonly string[];
/** The default font id (first in the list). */
declare const DEFAULT_FONT_ID: string;
/** True when `id` names a font in the library. */
declare function isFontId(id: unknown): id is string;
/** Resolve a font id to its definition, falling back to the default for unknown ids. */
declare function fontById(id: string | null | undefined): FontDef;
/** The CSS `font-family` stack for a font id (default's stack for unknown ids). */
declare function fontStack(id: string | null | undefined): string;

export { ALLOWED_BLOCK_TYPES, type Align, type BlockType, type ButtonBlock, DEFAULT_FONT_ID, DEFAULT_THEME, type DividerBlock, EMAIL_VAR_TYPES, type EmailBlock, type EmailDoc, type EmailTemplate, type EmailVarType, type EmailVariable, FONTS, FONT_IDS, type FontCategory, type FontDef, type FontFamily, type FooterBlock, type HeadingBlock, type HeadingLevel, type ImageBlock, MAX_BLOCKS, MAX_CONTENT_WIDTH, MAX_PREHEADER_LEN, MAX_RICH_TEXT_LEN, MAX_SHORT_TEXT_LEN, MAX_SPACER_SIZE, MAX_SUBJECT_LEN, MAX_URL_LEN, MIN_CONTENT_WIDTH, type Problem, type ProblemSeverity, type SpacerBlock, type TextBlock, type Theme, VAR_RE, WEB_FONT_HREFS, buildTemplateModel, coerceColor, emptyEmailDoc, extractVariables, fontById, fontStack, hasBlockingProblems, isFontId, isHttpUrl, isHttpsUrl, isValidColor, isValidVarName, isVarOnly, mergePreview, parseEmailDoc, previewValues, reconcileVariables, repairEmailDoc, validateEmailDoc, validateVariables };
