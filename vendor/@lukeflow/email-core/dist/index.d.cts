type FontFamily = "sans" | "serif" | "mono";
type Theme = {
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
};
declare const MAX_BLOCKS = 50;
declare const MIN_CONTENT_WIDTH = 480;
declare const MAX_CONTENT_WIDTH = 700;
declare const ALLOWED_BLOCK_TYPES: Set<"heading" | "text" | "button" | "image" | "divider" | "spacer" | "footer">;
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

export { ALLOWED_BLOCK_TYPES, type Align, type BlockType, type ButtonBlock, DEFAULT_THEME, type DividerBlock, type EmailBlock, type EmailDoc, type FontFamily, type FooterBlock, type HeadingBlock, type HeadingLevel, type ImageBlock, MAX_BLOCKS, MAX_CONTENT_WIDTH, MIN_CONTENT_WIDTH, type Problem, type ProblemSeverity, type SpacerBlock, type TextBlock, type Theme, VAR_RE, emptyEmailDoc, extractVariables, hasBlockingProblems, isHttpUrl, isHttpsUrl, isVarOnly, parseEmailDoc, repairEmailDoc, validateEmailDoc };
