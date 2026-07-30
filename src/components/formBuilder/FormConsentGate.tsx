/**
 * FormConsentGate — the agreement a filler must accept before their submission counts.
 *
 * Shown on every FILL surface (public embed, the emailed respond page, the recipient portal and the
 * in-app fill) directly above the form, because agreeing to terms after supplying the data is the wrong
 * order both legally and for the person reading it.
 *
 * <p>This component is a COURTESY, not the boundary: core-engine reads the same `settings.consent` off
 * the version it served and refuses a submission that arrives without agreement. So an unchecked box
 * here means a friendlier message, not a security control.
 *
 * <p>Dependency-free (no TailAdmin UI, no router) so the standalone embed/respond bundles can include it
 * without pulling app chrome — the same constraint LukeflowBadge is built to.
 */
import { useId, useMemo } from "react";

/** Split a statement into plain text and safe http(s) links, so "see https://acme.com/terms" is reachable. */
type Piece = { text: string; href?: string };

/**
 * Linkify bare http(s) URLs. Tenant-authored wording is rendered as TEXT — never as HTML — so the only
 * markup that can appear is an anchor WE construct, and only for a URL that parses as http/https. That
 * closes the obvious hole (a `javascript:` href or an injected tag) while still letting a consent
 * statement point at the terms it refers to, which it usually has to.
 */
export function linkifyConsent(text: string): Piece[] {
  const out: Piece[] = [];
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const start = m.index ?? 0;
    // Trailing sentence punctuation belongs to the sentence, not the URL.
    const trimmed = raw.replace(/[.,;:!?]+$/, "");
    let href: string | undefined;
    try {
      const u = new URL(trimmed);
      if (u.protocol === "http:" || u.protocol === "https:") href = u.toString();
    } catch {
      /* not a URL after all — fall through and keep it as text */
    }
    if (!href) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: trimmed, href });
    last = start + trimmed.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}

export default function FormConsentGate({
  text,
  agreed,
  onChange,
  error = false,
  disabled = false,
  inputRef,
}: {
  /** The exact statement, as published in the form's versioned schema. */
  text: string;
  agreed: boolean;
  onChange: (agreed: boolean) => void;
  /** True once a submit was attempted without agreement — turns the block into an error state. */
  error?: boolean;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const pieces = useMemo(() => linkifyConsent(text), [text]);
  // Unique per instance: the builder's Legal tab renders this component as a live preview, so a
  // hardcoded id would collide the moment a preview and a real gate ever shared a page — and
  // aria-labelledby / aria-describedby pointing at a duplicate id silently mislabels the control.
  const uid = useId();
  const headingId = `luke-consent-heading-${uid}`;
  const errorId = `luke-consent-error-${uid}`;

  return (
    <section
      aria-labelledby={headingId}
      className={`mb-6 rounded-xl border p-4 transition ${
        error
          ? "border-error-400 bg-error-50 dark:border-error-500/50 dark:bg-error-500/10"
          : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-white/5"
      }`}
    >
      <h2
        id={headingId}
        className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        Agreement
      </h2>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          ref={inputRef}
          type="checkbox"
          checked={agreed}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={error ? errorId : undefined}
          aria-required="true"
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-transparent"
        />
        <span className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
          {pieces.map((p, i) =>
            p.href ? (
              <a
                key={i}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="font-medium text-brand-600 underline hover:text-brand-700 dark:text-brand-400"
              >
                {p.text}
              </a>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
          <span aria-hidden className="ms-1 text-error-500">
            *
          </span>
        </span>
      </label>
      {error && (
        <p id={errorId} role="alert" className="mt-2 ps-7 text-xs font-medium text-error-600 dark:text-error-400">
          You need to accept this before the form can be submitted.
        </p>
      )}
    </section>
  );
}
