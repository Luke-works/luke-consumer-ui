// Helpers for reading capability access off the session. The gateway returns
// `session.capabilities` as a { CODE: level } map (e.g. { FORMS: "read-write" })
// and `session.can` as a flattened list (e.g. ["forms:read", "forms:write"]).
// Levels and tiers mirror the capability-engine (read | read-write; FREE/STANDARD/PREMIUM).
import type { SessionView } from "./authApi";

export type CapabilityLevel = "none" | "read" | "read-write";

/** Well-known capability codes (the map keys the gateway emits, uppercase). */
export const FORMS = "FORMS";
export const EMAIL = "EMAIL";
export const SIGNATURES = "SIGNATURES";

/** The caller's effective level for a capability, or "none" if not granted. */
export function capabilityLevel(
  session: SessionView | null | undefined,
  code: string,
): CapabilityLevel {
  const v = session?.capabilities?.[code];
  return v === "read" || v === "read-write" ? v : "none";
}

/** True when the caller can at least view the capability's resource. */
export function canRead(session: SessionView | null | undefined, code: string): boolean {
  return capabilityLevel(session, code) !== "none";
}

/** True when the caller can create/edit within the capability's resource. */
export function canWrite(session: SessionView | null | undefined, code: string): boolean {
  return capabilityLevel(session, code) === "read-write";
}

/** Pricing/availability tiers as surfaced by the capability catalog. */
export const TIER_LABEL: Record<string, string> = {
  FREE: "Free",
  STANDARD: "Standard",
  PREMIUM: "Premium",
};

/** Tailwind classes for a tier badge. Unknown tiers fall back to a neutral chip. */
export const TIER_BADGE: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  STANDARD: "bg-brand-50 text-brand-600 dark:bg-brand-500/10",
  PREMIUM: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
};

/** Human label for a capability level. */
export const LEVEL_LABEL: Record<CapabilityLevel, string> = {
  none: "No access",
  read: "Read-only",
  "read-write": "Read & write",
};
