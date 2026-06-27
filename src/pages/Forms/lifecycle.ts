/**
 * Form lifecycle gating — the single source of truth for whether each action (Check in,
 * Publish, Undo checkout) is currently allowed and why. Shared by the top-bar buttons
 * ({@link LifecycleActions}) AND the conversational path (LukeBuilds chat), so they never
 * disagree. Kept in a plain module (no component export) for clean Fast Refresh.
 */
export type LifecycleBusy = null | "checkin" | "publish" | "undo";

export type LifecycleState = {
  busy: LifecycleBusy;
  mutating: boolean;
  /** In an editing session (checked out)? The builder is view-only when false. */
  checkedOut: boolean;
  /** Has the draft changed since checkout / the last check-in? */
  dirty: boolean;
  version: number;
  signedOff: boolean;
  publishedVersion: number | null;
};

export type LifecycleAction = "checkin" | "publish" | "undo";
export type Gate = { ok: boolean; reason: string };

/**
 * Shared toolbar button styling — the single source of truth so every button in the builder's
 * top bar is pixel-consistent (same height, padding, radius, font weight, icon gap, focus ring,
 * disabled treatment), whether it's rendered here-adjacent in {@link LifecycleActions} or over in
 * FormBuilderPage (Preview / Test / Embed / back). The row uses exactly ONE solid "primary"
 * button — the next logical step in the workflow — and a uniform neutral style for everything
 * else, instead of three competing treatments.
 */
export const TOOLBAR_BTN_BASE =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition focus:outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50";
export const TOOLBAR_BTN_NEUTRAL =
  `${TOOLBAR_BTN_BASE} border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5`;
export const TOOLBAR_BTN_PRIMARY =
  `${TOOLBAR_BTN_BASE} border border-transparent bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:hover:bg-brand-500`;

/** Whether each lifecycle action is currently allowed + a human reason (tooltip / chat reply). */
export function lifecycleGate(state: LifecycleState): Record<LifecycleAction, Gate> {
  const { checkedOut, dirty, version, signedOff, publishedVersion } = state;
  const alreadyLive = version >= 1 && publishedVersion === version;
  return {
    checkin: !checkedOut
      ? { ok: false, reason: "Check out the form to edit it, then check in." }
      : !dirty
        ? { ok: false, reason: "No changes to check in yet — edit the form first." }
        : { ok: true, reason: "Snapshot the current form as a new version. Errors / work-in-progress are fine — it won't go live until you sign off and publish." },
    publish: version < 1
      ? { ok: false, reason: "Check in a version first." }
      : alreadyLive
        ? { ok: false, reason: `v${version} is already published — it's the live version.` }
        : !signedOff
          ? { ok: false, reason: "Form can't be published — this version isn't signed off yet. Open Test, get a clean run, then Sign off." }
          : { ok: true, reason: `Publish v${version} — make it the live version.` },
    undo: !checkedOut
      ? { ok: false, reason: "You're not editing — nothing to undo." }
      : version < 1
        ? { ok: false, reason: "Nothing checked in yet to revert to — use the builder's Undo (⌘Z)." }
        : dirty
          ? { ok: true, reason: `Discard your changes and revert to the last checked-in version (v${version}).` }
          : { ok: true, reason: "Leave edit mode and go back to view-only." },
  };
}
