import { ICON_LABEL_NUDGE } from "../../lib/iconAlign";
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
/** Geometry every toolbar button shares. Deliberately carries NO horizontal padding and no icon nudge —
 *  each variant adds what it needs, because Tailwind utilities of the same property do not reliably
 *  override one another by class order (a `px-0` appended after `px-3` lost the cascade and squeezed the
 *  icon-only button's content box to 10px, shrinking its glyph to 10x10 while every other icon was 16). */
const TOOLBAR_BTN_SHARED =
  "inline-flex h-9 items-center gap-1.5 rounded-lg text-sm font-medium transition focus:outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Base for a LABELLED toolbar button.
 *
 * The `[&>svg]` nudge is an optical correction, not a fudge: `items-center` aligns the icon to the
 * text's LINE box, but a label's visible ink sits in the upper part of that box — the descender space
 * below the baseline is empty for words like "Embed" and "Preview". Measured, every icon's ink centre
 * sat 2.4–2.6px BELOW its label's; -2px brings them all under 0.65px, i.e. optically aligned. Without
 * it the icon reads as hanging below the word it belongs to.
 */
export const TOOLBAR_BTN_BASE = `${TOOLBAR_BTN_SHARED} px-3 ${ICON_LABEL_NUDGE}`;

/** Icon-ONLY toolbar button (the settings gear). Same h-9 as every labelled button, and built from
 *  TOOLBAR_BTN_SHARED rather than _BASE so it never inherits the nudge — that correction aligns an icon
 *  to adjacent TEXT, and this button has none, so inheriting it leaves the glyph sitting high in its
 *  own square. Note both omissions rely on _SHARED carrying neither, not on overriding. */
export const TOOLBAR_BTN_ICON =
  `${TOOLBAR_BTN_SHARED} w-9 justify-center border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200`;
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
