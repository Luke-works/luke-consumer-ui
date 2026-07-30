// Helpers for reading capability access off the session. The gateway returns
// `session.capabilities` as a { CODE: level } map (e.g. { FORMS: "read-write" })
// and `session.can` as a flattened list (e.g. ["forms:read", "forms:write"]).
// Levels and tiers mirror the capability-engine (read | contributor | read-write;
// FREE/STANDARD/PREMIUM).
import type { SessionView } from "./authApi";

/**
 * A capability access level. Mirrors core-engine `CapabilityLevel` (#104), plus the
 * client-only "none" for "not granted".
 *
 * - `read` — look only.
 * - `contributor` — create/edit ordinary content, but NOT the privileged actions
 *   (publish/sign-off/seal, hard-delete/purge).
 * - `read-write` — everything, including the privileged actions (grandfathered).
 */
export type CapabilityLevel = "none" | "read" | "contributor" | "read-write";

/** The levels an admin can actually grant (i.e. every level except "not granted"). */
export const GRANTABLE_LEVELS: readonly Exclude<CapabilityLevel, "none">[] = [
  "read",
  "contributor",
  "read-write",
] as const;

/** Ascending privilege order — use to compare two levels (is this an upgrade or a downgrade?). */
export const LEVEL_RANK: Record<CapabilityLevel, number> = {
  none: 0,
  read: 1,
  contributor: 2,
  "read-write": 3,
};

/**
 * A named action a route can require, finer-grained than the read/write split.
 * Mirrors core-engine `CapabilityLevel.Action` (read by `@RequiresCapabilityAction`).
 */
export type CapabilityAction = "read" | "write" | "publish" | "delete";

/** Narrow an arbitrary wire value to a known level ("none" when unset/unknown). */
export function toLevel(raw: unknown): CapabilityLevel {
  return raw === "read" || raw === "contributor" || raw === "read-write" ? raw : "none";
}

/**
 * Does `level` permit `action`? Mirrors core-engine `CapabilityLevel.permits` —
 * `read-write` permits everything, `contributor` permits read + ordinary write only,
 * `read` permits reads only.
 */
export function permits(level: CapabilityLevel, action: CapabilityAction): boolean {
  switch (action) {
    case "read":
      return level !== "none";
    case "write":
      return level === "contributor" || level === "read-write";
    case "publish":
    case "delete":
      return level === "read-write";
    default:
      return false;
  }
}

/** Well-known capability codes (the map keys the gateway emits, uppercase). */
export const FORMS = "FORMS";
export const EMAIL = "EMAIL";
export const SIGNATURES = "SIGNATURES";
export const PHONE = "PHONE";
export const WORKFLOW = "WORKFLOW";

/**
 * Capabilities hidden from the ENTIRE UI until we flip them on — regardless of any grant or
 * subscription. The MVP surface is Forms + Email + Access only; PHONE, SIGNATURES and WORKFLOW are
 * post-MVP and stay hidden until their env flag is set. Each is revealed by opting in:
 * VITE_PHONE_ENABLED / VITE_SIGNATURES_ENABLED / VITE_WORKFLOW_ENABLED = true. Hidden capabilities
 * report level "none" (gating nav + routes) AND are filtered out of the capability catalog /
 * request / my-access lists (see isCapabilityVisible). (DOCUMENTS has no UI capability, so nothing
 * to gate there.)
 */
const flagOn = (v: unknown) => String(v).toLowerCase() === "true";
export const HIDDEN_CAPABILITIES: ReadonlySet<string> = new Set<string>(
  [
    flagOn(import.meta.env.VITE_PHONE_ENABLED) ? null : PHONE,
    flagOn(import.meta.env.VITE_SIGNATURES_ENABLED) ? null : SIGNATURES,
    flagOn(import.meta.env.VITE_WORKFLOW_ENABLED) ? null : WORKFLOW,
  ].filter((c): c is string => c !== null),
);

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
  return toLevel(session?.capabilities?.[code]);
}

/** True when the caller can at least view the capability's resource. */
export function canRead(session: SessionView | null | undefined, code: string): boolean {
  return permits(capabilityLevel(session, code), "read");
}

/** True when the caller can create/edit within the capability's resource. Both `contributor` and
 *  `read-write` can edit; the privileged actions (publish/delete) are gated server-side, so a
 *  contributor may see those controls but the engine rejects them (#104).
 *
 *  The follow-on that closes that gap is per-screen, not here: move each privileged control onto
 *  {@link canPublish} / {@link canDelete} and the remaining edit controls onto
 *  {@link canContribute}, then this flag stops gating anything privileged. */
export function canWrite(session: SessionView | null | undefined, code: string): boolean {
  const lvl = capabilityLevel(session, code);
  return lvl === "read-write" || lvl === "contributor";
}

/**
 * True when the caller may make ordinary edits — the TRUE backend contract for writing
 * (`contributor` or `read-write`). Use this to gate create/edit controls on a screen that has
 * already moved its publish/delete controls onto {@link canPublish} / {@link canDelete}.
 */
export function canContribute(session: SessionView | null | undefined, code: string): boolean {
  return permits(capabilityLevel(session, code), "write");
}

/** True when the caller can perform privileged/finalizing actions: publish, sign-off, seal, retire. */
export function canPublish(session: SessionView | null | undefined, code: string): boolean {
  return permits(capabilityLevel(session, code), "publish");
}

/** True when the caller can irreversibly hard-delete/purge within the capability's resource. */
export function canDelete(session: SessionView | null | undefined, code: string): boolean {
  return permits(capabilityLevel(session, code), "delete");
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

/**
 * The levels a member holding `current` can submit an access request for: anything strictly
 * more privileged than what they already hold.
 *
 * Mirrors core-engine `CapabilityLevel.atLeast`, which the request endpoint uses for its
 * duplicate check. (It previously compared ACTION CLASSES instead of rank, which rejected every
 * upgrade through the middle level — a `read` holder could not ask for `contributor`, and a
 * `contributor` could not ask for anything. Fixed in core-engine alongside the approval
 * workflow; this must stay in step with it.)
 */
export function requestableLevels(current: CapabilityLevel): CapabilityLevel[] {
  return GRANTABLE_LEVELS.filter((l) => LEVEL_RANK[l] > LEVEL_RANK[current]);
}

/** Human label for a capability level. */
export const LEVEL_LABEL: Record<CapabilityLevel, string> = {
  none: "No access",
  read: "Read-only",
  contributor: "Contributor",
  "read-write": "Read & write",
};

/** One-line description of a level, for pickers and legends (non-engineer wording). */
export const LEVEL_HINT: Record<CapabilityLevel, string> = {
  none: "No access at all — the section stays hidden.",
  read: "Can view, but cannot change anything.",
  contributor: "Can create and edit, but cannot publish or delete.",
  "read-write": "Full access, including publishing and deleting.",
};
