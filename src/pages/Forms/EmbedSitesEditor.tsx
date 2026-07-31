/**
 * The allowed-embed-sites editor: one row per website, Name beside Website.
 *
 * Replaces a free-text "one origin per line" textarea. An author running several sites could read
 * that list but not tell the entries apart — `https://acme.com` and `https://acme-staging.com` look
 * near-identical in a monospace block, and deleting the wrong one silently breaks a live form.
 *
 * The name is decoration and the server treats it as such: the CSP is computed from the origins
 * alone, and a label is only ever stored for an origin that is actually on the allowlist.
 */
import { Plus, Trash2 } from "lucide-react";
import { ICON_LABEL_NUDGE } from "../../lib/iconAlign";
import { emptyRow, invalidRowIndexes, isValidOrigin, type EmbedSiteRow } from "../../lib/embedSites";

const CELL =
  "w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-800 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:bg-white/5 dark:text-white/90";

export default function EmbedSitesEditor({
  rows,
  onChange,
  disabled = false,
}: {
  rows: EmbedSiteRow[];
  onChange: (rows: EmbedSiteRow[]) => void;
  disabled?: boolean;
}) {
  const invalid = new Set(invalidRowIndexes(rows));
  const update = (i: number, patch: Partial<EmbedSiteRow>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  // Removing the last row leaves one empty row rather than an empty editor: an author who cleared
  // the list still needs somewhere to type, and "no rows at all" reads as broken rather than public.
  const remove = (i: number) => {
    const next = rows.filter((_, k) => k !== i);
    onChange(next.length ? next : [emptyRow()]);
  };

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-x-3 gap-y-2">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</div>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Website</div>
        <div className="sr-only">Remove</div>

        {rows.map((row, i) => {
          const bad = invalid.has(i);
          return (
            // Index keys are correct here: rows have no stable id, and reordering isn't possible —
            // only append and remove, both of which re-render the whole list anyway.
            <div key={i} className="contents">
              <input
                type="text"
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value })}
                disabled={disabled}
                placeholder="Acme main site"
                aria-label={`Website ${i + 1} name`}
                className={`${CELL} border-gray-300 dark:border-gray-700`}
              />
              <input
                type="text"
                value={row.origin}
                onChange={(e) => update(i, { origin: e.target.value })}
                disabled={disabled}
                spellCheck={false}
                placeholder="https://example.com"
                aria-label={`Website ${i + 1} address`}
                aria-invalid={bad || undefined}
                aria-describedby={bad ? `embed-site-error-${i}` : undefined}
                className={`${CELL} font-mono text-xs ${bad ? "border-error-400 dark:border-error-500/60" : "border-gray-300 dark:border-gray-700"}`}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                aria-label={`Remove website ${i + 1}`}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-error-500 disabled:opacity-40 dark:hover:bg-white/5"
              >
                <Trash2 className="size-4" />
              </button>
              {bad ? (
                <p id={`embed-site-error-${i}`} role="alert" className="col-span-3 -mt-1 text-xs text-error-500">
                  Use a full origin like <code>https://example.com</code> — no path, and the scheme is required.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onChange([...rows, emptyRow()])}
        disabled={disabled}
        className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-800 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 ${ICON_LABEL_NUDGE}`}
      >
        <Plus className="size-4" />Add another
      </button>

      <p className="mt-3 text-xs leading-relaxed text-gray-400">
        Only these websites may show the form. Use <code>https://*.acme.com</code> to allow every
        subdomain. Leave the list empty to allow any website.
      </p>
    </div>
  );
}

/** Exported for the panel's save gate — kept here so the rule lives beside the UI that shows it. */
export { isValidOrigin };
