// Personal / free mailbox providers. This classification is ADVISORY only — it hides
// company-only features (e.g. the EMAIL capability) from accounts on a personal
// address — and the SERVER is always the source of truth (it re-checks on every
// gated action via OrgDomainMatcher). The authoritative list is served at
// /api/public/meta/free-email-domains (#38) and loaded by loadFreeEmailDomains();
// the list below is a bundled fallback so the hint works before that resolves.

// The gateway forwards /api/public/** with an any-origin, NO-credentials CORS policy
// (the embed/public surface). So this must be a plain, credential-less fetch — using
// the authed() client (which sends credentials:"include" + a bearer) trips the browser's
// CORS check ("Access-Control-Allow-Credentials must be 'true'") and the request fails.
const PUBLIC_BASE = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");

const FALLBACK_DOMAINS: readonly string[] = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.in",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "pm.me", "gmx.com", "gmx.net", "mail.com", "yandex.com", "zoho.com",
  "hey.com", "fastmail.com", "tutanota.com", "qq.com", "163.com", "126.com",
];

let personalDomains = new Set<string>(FALLBACK_DOMAINS);
let loaded = false;

/** Fetch the authoritative free-provider list once and replace the bundled fallback.
 *  Best-effort: on failure we keep the fallback and allow a later retry. Call at
 *  startup; the classification stays advisory either way. */
export async function loadFreeEmailDomains(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const res = await fetch(`${PUBLIC_BASE}/api/public/meta/free-email-domains`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { providers } = (await res.json()) as { providers: string[] };
    if (Array.isArray(providers) && providers.length) {
      personalDomains = new Set(providers.map((d) => d.trim().toLowerCase()));
    }
  } catch {
    loaded = false; // keep the fallback; let a future call retry
  }
}

/** The lowercased domain part of an email, or "" if there's no '@'. */
export function emailDomain(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/**
 * True when the email is on a personal/free mailbox provider. Unknown/blank emails
 * return false (don't restrict when we can't tell). Advisory — the server decides.
 */
export function isPersonalEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(email);
  return domain !== "" && personalDomains.has(domain);
}
