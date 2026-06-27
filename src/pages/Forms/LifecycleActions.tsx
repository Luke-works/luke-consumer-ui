/**
 * The lifecycle action trio — Undo checkout · Check in · Publish — shared by the builder's
 * top bar AND the LukeBuilds (AI) panel so the gating logic lives in one place:
 *   - Undo checkout reverts the draft to the last checked-in version, discarding the edits
 *     you've made since you opened it (enabled only once there's something to undo).
 *   - Check in is enabled only once the draft has changed since you opened it (a snapshot;
 *     errors / WIP are fine — it never goes live on its own).
 *   - Publish is enabled only when the latest version is signed off and isn't already the
 *     live one (shows "Published" + disabled when it is).
 *
 * Buttons are auto-width and wrap, so the row fits both the top bar and the narrow AI panel.
 */
import Tooltip from "../../components/ui/tooltip/Tooltip";

export type LifecycleBusy = null | "checkin" | "publish" | "undo";

export type LifecycleState = {
  busy: LifecycleBusy;
  mutating: boolean;
  /** Has the draft changed since it was opened/checked out? */
  dirty: boolean;
  version: number;
  signedOff: boolean;
  publishedVersion: number | null;
};

export default function LifecycleActions({
  state,
  onUndoCheckout,
  onCheckIn,
  onPublish,
}: {
  state: LifecycleState;
  onUndoCheckout: () => void;
  onCheckIn: () => void;
  onPublish: () => void;
}) {
  const { busy, mutating, dirty, version, signedOff, publishedVersion } = state;
  const alreadyLive = version >= 1 && publishedVersion === version;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tooltip
        content={version < 1
          ? "Nothing checked in yet to revert to — use the builder's Undo (⌘Z) instead."
          : !dirty
            ? "No changes to undo since you opened the form."
            : `Discard your changes and revert to the last checked-in version (v${version}).`}
      >
        <button
          type="button"
          onClick={onUndoCheckout}
          disabled={busy !== null || mutating || !dirty || version < 1}
          className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          {busy === "undo" ? "Reverting…" : "Undo checkout"}
        </button>
      </Tooltip>
      <Tooltip
        content={dirty
          ? "Snapshot the current form as a new version. Errors / work-in-progress are fine — it won't go live until you sign off and publish."
          : "No changes to check in yet — edit the form first."}
      >
        <button
          type="button"
          onClick={onCheckIn}
          disabled={busy !== null || mutating || !dirty}
          className="inline-flex items-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50 dark:border-brand-500/30 dark:bg-brand-500/10"
        >
          {busy === "checkin" ? "Checking in…" : "Check in"}
        </button>
      </Tooltip>
      <Tooltip
        content={version < 1
          ? "Check in a version first."
          : alreadyLive
            ? `v${version} is already published — it's the live version.`
            : !signedOff
              ? "Form can't be published — this version isn't signed off yet. Open Test, get a clean run, then Sign off."
              : `Publish v${version} — make it the live version.`}
      >
        <button
          type="button"
          onClick={onPublish}
          disabled={busy !== null || mutating || version < 1 || !signedOff || alreadyLive}
          className="inline-flex items-center rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy === "publish" ? "Publishing…" : alreadyLive ? "Published" : "Publish"}
        </button>
      </Tooltip>
    </div>
  );
}
