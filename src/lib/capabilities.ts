// Helpers for reading capability access off the session. The gateway returns
// `session.capabilities` as a { CODE: level } map (e.g. { FORMS: "read-write" })
// and `session.can` as a flattened list (e.g. ["forms:read", "forms:write"]).
// Levels and tiers mirror the capability-engine (read | read-write; FREE/STANDARD/PREMIUM).
import type { SessionView } from "./authApi";

// `contributor` (core-engine #104) sits between read and read-write: create/edit ordinary content,
// but NOT the privileged actions (publish, sign-off, delete/purge) — the engine enforces that split.
export type CapabilityLevel = "none" | "read" | "contributor" | "read-write";

/** Well-known capability codes (the map keys the gateway emits, uppercase). */
export const FORMS = "FORMS";
export const EMAIL = "EMAIL";
export const SIGNATURES = "SIGNATURES";
export const PHONE = "PHONE";
export const WORKFLOW = "WORKFLOW";

/**
 * Capabilities hidden from the ENTIRE UI until we flip them on — regardless of any grant or
 * subscription. WORKFLOW is off by default; set VITE_WORKFLOW_ENABLED=true to reveal it. Hidden
 * capabilities report level "none" (gating nav + routes) AND are filtered out of the capability
 * catalog / request / my-access lists (see isCapabilityVisible).
 */
const workflowEnabled = String(import.meta.env.VITE_WORKFLOW_ENABLED).toLowerCase() === "true";
export const HIDDEN_CAPABILITIES: ReadonlySet<string> = new Set<string>(workflowEnabled ? [] : [WORKFLOW]);

/** False when a capability is force-hidden (not ready) — filter catalog/access lists by this. */
export function isCapabilityVisible(code: string): boolean {
  return !HIDDEN_CAPABILITIES.has(code);
}

/** The caller's effective level for a capability, or "none" if not granted (or force-hidden). */
export function capabilityLevel(
  session: SessionView | null | undefined,
  code: string,
): CapabilityLevel {
  if (HIDDEN_CAPABILITIES.has(code)) return "none"; // gate nav + routes for not-yet-ready features
  const v = session?.capabilities?.[code];
  return v === "read" || v === "contributor" || v === "read-write" ? v : "none";
}

/** True when the caller can at least view the capability's resource. */
export function canRead(session: SessionView | null | undefined, code: string): boolean {
  return capabilityLevel(session, code) !== "none";
}

/** True when the caller can create/edit within the capability's resource. Both `contributor` and
 *  `read-write` can edit; the privileged actions (publish/delete) are gated server-side, so a
 *  contributor may see those controls but the engine rejects them (#104). */
export function canWrite(session: SessionView | null | undefined, code: string): boolean {
  const lvl = capabilityLevel(session, code);
  return lvl === "read-write" || lvl === "contributor";
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
  contributor: "Contributor",
  "read-write": "Read & write",
};
