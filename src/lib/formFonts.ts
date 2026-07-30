/**
 * The FONT CATALOG a form author can choose from, and the loader that makes a chosen webfont available.
 *
 * The renderer is styled entirely by `--lf-*` design tokens (see @lukeflow/form-react's theme), and
 * `--lf-font` is one of them — so applying a font is just handing the renderer a font stack. That is done
 * once, in `LukeFormRenderer`, which every surface goes through (builder preview, in-app fill, the public
 * embed, the outbound respond page, and the PDF render harness).
 *
 * TWO KINDS of entry:
 *   • **stack-only** — system/web-safe families. Nothing to download, so they work offline, in a
 *     locked-down CSP, and in headless Chromium with no network. These are the safe choices.
 *   • **webfont** — a Google-hosted family (`google`), fetched only when a form actually selects it.
 *     Matches how the app already loads its own "Anek Telugu".
 *
 * SECURITY: the catalog is a FIXED allowlist. A form stores a font *id*, never a family name or a URL, so
 * a malicious schema can't inject a stylesheet URL or CSS into `--lf-font` / a `<link>`. An unknown id
 * falls back to the default — never to whatever the schema said.
 *
 * PRIVACY: choosing a Google-hosted font means a filler's browser requests it from Google, which exposes
 * their IP to a third party — worth knowing for a form embedded on an EU site. The system stacks avoid
 * that entirely, which is why one of them is always offered as an alternative to the default.
 */

export type FormFontId =
  | "default"
  | "anek-telugu"
  | "system"
  | "serif"
  | "mono"
  | "inter"
  | "outfit"
  | "lora"
  | "source-serif"
  | "jetbrains-mono";

export type FormFont = {
  id: FormFontId;
  /** What the author sees in the picker. */
  label: string;
  /** One-line explanation of when to reach for it. */
  hint: string;
  /** The CSS font stack handed to the renderer as `--lf-font`. */
  stack: string;
  /** Present only for webfonts: the Google Fonts family + weights to load on demand. */
  google?: { family: string; weights: string };
};

/** Kept in sync with the app's own font (see index.css) so "default" always means "what Lukeflow uses". */
const ANEK_STACK = '"Anek Telugu", ui-sans-serif, system-ui, sans-serif';
const SYSTEM_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** What a form gets when its author never chose (or chose something we no longer ship). */
export const DEFAULT_FONT: FormFont = {
  id: "default",
  label: "Lukeflow default",
  hint: "Anek Telugu — matches the rest of Lukeflow. Supports Telugu and Latin script.",
  stack: ANEK_STACK,
  google: { family: "Anek+Telugu", weights: "wght@100..800" },
};

export const FORM_FONTS: readonly FormFont[] = [
  DEFAULT_FONT,
  {
    id: "system",
    label: "System sans",
    hint: "The reader's own OS font. Nothing to download, so it renders instantly and makes no third-party request.",
    stack: SYSTEM_STACK,
  },
  {
    id: "serif",
    label: "System serif",
    hint: "Georgia and friends — a traditional, formal look for contracts and agreements. No download.",
    stack: 'Georgia, Cambria, "Times New Roman", Times, serif',
  },
  {
    id: "mono",
    label: "System mono",
    hint: "Fixed-width, for forms full of codes, references or figures. No download.",
    stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  },
  {
    id: "inter",
    label: "Inter",
    hint: "A neutral, highly legible UI face. Good default if you don't want Anek Telugu.",
    stack: '"Inter", ' + SYSTEM_STACK,
    google: { family: "Inter", weights: "wght@100..900" },
  },
  {
    id: "outfit",
    label: "Outfit",
    hint: "Geometric and modern, with a slightly branded feel.",
    stack: '"Outfit", ' + SYSTEM_STACK,
    google: { family: "Outfit", weights: "wght@100..900" },
  },
  {
    id: "lora",
    label: "Lora",
    hint: "A contemporary serif — warmer than Georgia, still formal.",
    stack: '"Lora", Georgia, serif',
    google: { family: "Lora", weights: "wght@400..700" },
  },
  {
    id: "source-serif",
    label: "Source Serif",
    hint: "A clean serif designed for long text — suits detailed terms and declarations.",
    stack: '"Source Serif 4", Georgia, serif',
    google: { family: "Source+Serif+4", weights: "wght@200..900" },
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    hint: "A refined monospace, for technical intake forms.",
    stack: '"JetBrains Mono", ui-monospace, Menlo, monospace',
    google: { family: "JetBrains+Mono", weights: "wght@100..800" },
  },
  {
    id: "anek-telugu",
    label: "Anek Telugu",
    hint: "The same face as the Lukeflow default, chosen explicitly.",
    stack: ANEK_STACK,
    google: { family: "Anek+Telugu", weights: "wght@100..800" },
  },
];

const BY_ID = new Map<string, FormFont>(FORM_FONTS.map((f) => [f.id as string, f]));

/** The catalog entry for a stored id. Anything unknown/absent resolves to the default — NEVER to the
 *  raw value, so a hand-edited schema can't put arbitrary CSS into the font token. */
export function resolveFont(id: string | null | undefined): FormFont {
  return (id ? BY_ID.get(id) : undefined) ?? DEFAULT_FONT;
}

/** The `--lf-font` value for a stored id. */
export function fontStack(id: string | null | undefined): string {
  return resolveFont(id).stack;
}

/**
 * Make sure a chosen webfont is actually loaded, by appending one `<link>` per family (idempotent).
 *
 * Only ever called with a catalog entry, so the URL is built from OUR constants — the stored id never
 * reaches the DOM. Stack-only fonts do nothing. Safe to call on every render.
 *
 * `document` is guarded so the module stays importable in a non-DOM context (tests, SSR).
 */
export function ensureFontLoaded(id: string | null | undefined): void {
  const font = resolveFont(id);
  if (!font.google || typeof document === "undefined") return;
  const linkId = `lf-font-${font.id}`;
  if (document.getElementById(linkId)) return;
  const link = document.createElement("link");
  link.id = linkId;
  link.rel = "stylesheet";
  // display=swap: show text in the fallback immediately rather than blocking on the download — a form
  // must never be invisible while a font loads.
  link.href = `https://fonts.googleapis.com/css2?family=${font.google.family}:${font.google.weights}&display=swap`;
  document.head.appendChild(link);
}
