// Personal / free mailbox providers — mirrors OrgDomainMatcher.FREE_PROVIDERS in
// luke-capability-engine. Used to hide company-only features (e.g. the EMAIL
// capability) from accounts that signed up with a personal address, since they can't
// verify a business sending domain.
const PERSONAL_DOMAINS = new Set<string>([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.in",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "pm.me", "gmx.com", "gmx.net", "mail.com", "yandex.com", "zoho.com",
  "hey.com", "fastmail.com", "tutanota.com", "qq.com", "163.com", "126.com",
]);

/** The lowercased domain part of an email, or "" if there's no '@'. */
export function emailDomain(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/**
 * True when the email is on a personal/free mailbox provider. Unknown/blank emails
 * return false (don't restrict when we can't tell).
 */
export function isPersonalEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(email);
  return domain !== "" && PERSONAL_DOMAINS.has(domain);
}
