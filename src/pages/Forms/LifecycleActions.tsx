/**
 * The lifecycle action trio — Checkout/Undo-checkout · Check in · Publish — shared by the
 * builder's top bar AND the LukeBuilds (AI) panel so the gating logic lives in one place.
 *
 * The first button is a single conditional toggle (like rollback / commit-to-new-version):
 *   - When you're NOT checked out it reads "Checkout" — start editing (the builder is
 *     view-only until then); this sets the point you can roll back to.
 *   - When you ARE checked out it reads "Undo checkout" — discard the edits made since
 *     checkout and revert to the last checked-in version (or just leave edit mode if clean).
 * Check in snapshots the current draft as a new version (only with edits to commit); Publish
 * promotes a signed-off version live (independent of editing).
 *
 * Buttons are auto-width and wrap, so the row fits both the top bar and the narrow AI panel.
 */
import Tooltip from "../../components/ui/tooltip/Tooltip";

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

export default function LifecycleActions({
  state,
  onCheckout,
  onUndoCheckout,
  onCheckIn,
  onPublish,
}: {
  state: LifecycleState;
  onCheckout: () => void;
  onUndoCheckout: () => void;
  onCheckIn: () => void;
  onPublish: () => void;
}) {
  const { busy, mutating, checkedOut, dirty, version, signedOff, publishedVersion } = state;
  const alreadyLive = version >= 1 && publishedVersion === version;
  const ghost =
    "inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5";
  const brandGhost =
    "inline-flex items-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50 dark:border-brand-500/30 dark:bg-brand-500/10";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Checkout ⇄ Undo-checkout toggle. */}
      {!checkedOut ? (
        <Tooltip content="Check out the form to start editing — it's view-only until you do. Sets the point you can roll back to.">
          <button type="button" onClick={onCheckout} disabled={busy !== null || mutating} className={brandGhost}>
            Checkout
          </button>
        </Tooltip>
      ) : (
        <Tooltip content={version < 1
          ? "Nothing checked in yet to revert to — use the builder's Undo (⌘Z)."
          : dirty
            ? `Discard your changes and revert to the last checked-in version (v${version}).`
            : "Leave edit mode and go back to view-only."}>
          <button
            type="button"
            onClick={onUndoCheckout}
            disabled={busy !== null || mutating || version < 1}
            className={ghost}
          >
            {busy === "undo" ? "Reverting…" : "Undo checkout"}
          </button>
        </Tooltip>
      )}
      <Tooltip content={!checkedOut
        ? "Check out the form to edit it, then check in."
        : dirty
          ? "Snapshot the current form as a new version. Errors / work-in-progress are fine — it won't go live until you sign off and publish."
          : "No changes to check in yet — edit the form first."}>
        <button
          type="button"
          onClick={onCheckIn}
          disabled={busy !== null || mutating || !checkedOut || !dirty}
          className={brandGhost}
        >
          {busy === "checkin" ? "Checking in…" : "Check in"}
        </button>
      </Tooltip>
      <Tooltip content={version < 1
        ? "Check in a version first."
        : alreadyLive
          ? `v${version} is already published — it's the live version.`
          : !signedOff
            ? "Form can't be published — this version isn't signed off yet. Open Test, get a clean run, then Sign off."
            : `Publish v${version} — make it the live version.`}>
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
