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
