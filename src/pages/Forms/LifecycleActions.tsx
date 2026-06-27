/**
 * The lifecycle action trio — Checkout/Undo-checkout · Check in · Publish — for the builder's
 * top bar. The first button is a single conditional toggle (rollback / commit-to-new-version):
 *   - When you're NOT checked out it reads "Checkout" — start editing (the builder is
 *     view-only until then); this sets the point you can roll back to.
 *   - When you ARE checked out it reads "Undo checkout" — discard the edits made since
 *     checkout and revert to the last checked-in version (or just leave edit mode if clean).
 *
 * {@link lifecycleGate} is the single source of truth for whether each action is allowed (and
 * why) — shared with the conversational path (LukeBuilds chat) so buttons + chat never disagree.
 */
import { Pencil, RotateCcw, Save, Rocket } from "lucide-react";
import Tooltip from "../../components/ui/tooltip/Tooltip";
import { lifecycleGate, type LifecycleState } from "./lifecycle";

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
  const { busy, mutating, checkedOut, version, publishedVersion } = state;
  const gate = lifecycleGate(state);
  const busyOrMut = busy !== null || mutating;
  const alreadyLive = version >= 1 && publishedVersion === version;
  const brandGhost =
    "inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50 dark:border-brand-500/30 dark:bg-brand-500/10";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Checkout ⇄ Undo-checkout toggle. */}
      {!checkedOut ? (
        <Tooltip content="Check out the form to start editing — it's view-only until you do. Sets the point you can roll back to.">
          <button type="button" onClick={onCheckout} disabled={busyOrMut} className={brandGhost}>
            <Pencil className="size-4" />Checkout
          </button>
        </Tooltip>
      ) : (
        <Tooltip content={gate.undo.reason}>
          <button
            type="button"
            onClick={onUndoCheckout}
            disabled={busyOrMut || !gate.undo.ok}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <RotateCcw className="size-4" />{busy === "undo" ? "Reverting…" : "Undo checkout"}
          </button>
        </Tooltip>
      )}
      <Tooltip content={gate.checkin.reason}>
        <button type="button" onClick={onCheckIn} disabled={busyOrMut || !gate.checkin.ok} className={brandGhost}>
          <Save className="size-4" />{busy === "checkin" ? "Checking in…" : "Check in"}
        </button>
      </Tooltip>
      <Tooltip content={gate.publish.reason}>
        <button
          type="button"
          onClick={onPublish}
          disabled={busyOrMut || !gate.publish.ok}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          <Rocket className="size-4" />{busy === "publish" ? "Publishing…" : alreadyLive ? "Published" : "Publish"}
        </button>
      </Tooltip>
    </div>
  );
}
