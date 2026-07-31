/**
 * The embed allowlist as the AUTHOR edits it — named rows — versus the two wire fields the engine
 * stores: a canonical comma-separated origin list (the CSP source of truth) and a label map keyed by
 * that canonical origin.
 *
 * Pure, so the fiddly half of the editor (canonicalization, pairing names back to origins, deciding
 * what is submittable) is testable without a DOM.
 */

export type EmbedSiteRow = {
  /** Friendly label. Optional — an unnamed site is still a perfectly good allowlist entry. */
  name: string;
  /** The web origin the browser will be told to allow. */
  origin: string;
};

/**
 * Mirrors `FrameAncestors.ORIGIN` in core-engine: scheme + host (one optional leading `*.` label) +
 * optional port. No path, no query, no userinfo.
 *
 * Kept in step deliberately so the UI can say WHICH row is wrong. The server still re-validates and
 * silently drops anything that doesn't parse — this is a courtesy, never the gate.
 */
export const ORIGIN_RE = /^https?:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/i;

/** The form the server stores an origin in: trimmed, lower-cased, no trailing slash. */
export function canonicalOrigin(raw: string): string {
  const o = raw.trim().replace(/\/+$/, "");
  return o.toLowerCase();
}

export function isValidOrigin(raw: string): boolean {
  return ORIGIN_RE.test(canonicalOrigin(raw));
}

/** One empty row, so the editor always has something to type into. */
export const emptyRow = (): EmbedSiteRow => ({ name: "", origin: "" });

/**
 * Wire → rows. An origin with no stored label simply gets an empty name; the list stays in the
 * server's canonical order so what the author sees is the order actually enforced.
 */
export function parseEmbedSites(
  allowedEmbedOrigins: string | null | undefined,
  names: Record<string, string> | null | undefined,
): EmbedSiteRow[] {
  const csv = (allowedEmbedOrigins ?? "").trim();
  if (!csv) return [];
  const labels = names ?? {};
  return csv
    .split(/[,\s]+/)
    .map((o) => o.trim())
    .filter(Boolean)
    .map((origin) => ({ origin, name: labels[canonicalOrigin(origin)] ?? "" }));
}

/**
 * Rows → wire. Blank rows are dropped (an author who cleared a row meant to remove it), origins are
 * canonicalized so labels key correctly, and duplicates collapse to the first occurrence — matching
 * the server, which de-duplicates too.
 *
 * INVALID origins are kept in the origins string rather than filtered out. Dropping them here would
 * silently narrow the allowlist to whatever happened to parse, so a typo would look saved while the
 * site it was meant to permit stayed blocked. The server rejects the whole patch instead, and the
 * editor blocks the save before it gets that far.
 */
export function serializeEmbedSites(rows: readonly EmbedSiteRow[]): {
  allowedEmbedOrigins: string;
  embedOriginNames: Record<string, string>;
} {
  const seen = new Set<string>();
  const origins: string[] = [];
  const embedOriginNames: Record<string, string> = {};
  for (const row of rows) {
    const origin = canonicalOrigin(row.origin);
    if (!origin || seen.has(origin)) continue;
    seen.add(origin);
    origins.push(origin);
    const name = row.name.trim();
    if (name) embedOriginNames[origin] = name;
  }
  return { allowedEmbedOrigins: origins.join("\n"), embedOriginNames };
}

/** Row indexes whose origin is filled in but malformed — what the editor marks up. */
export function invalidRowIndexes(rows: readonly EmbedSiteRow[]): number[] {
  return rows.reduce<number[]>((out, row, i) => {
    if (row.origin.trim() && !isValidOrigin(row.origin)) out.push(i);
    return out;
  }, []);
}

/**
 * Is this list safe to save?
 *
 * <p>A list of only-blank rows IS savable: that is how an author deliberately makes the form public
 * again, and the server treats a cleared allowlist as "any site may embed". What must never reach
 * the server is a list where the author typed something that doesn't parse — the engine fails that
 * closed with a 400, and catching it here names the offending row instead.
 */
export function canSaveSites(rows: readonly EmbedSiteRow[]): boolean {
  return invalidRowIndexes(rows).length === 0;
}
