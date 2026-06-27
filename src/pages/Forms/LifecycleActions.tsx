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
import { lifecycleGate, TOOLBAR_BTN_NEUTRAL, TOOLBAR_BTN_PRIMARY, type LifecycleState } from "./lifecycle";

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
  // Exactly one button carries the solid "primary" treatment — the next logical step:
  // Checkout while view-only, Publish once you're editing. Everything else is uniform neutral.
  const checkoutCls = checkedOut ? TOOLBAR_BTN_NEUTRAL : TOOLBAR_BTN_PRIMARY;
  const publishCls = checkedOut ? TOOLBAR_BTN_PRIMARY : TOOLBAR_BTN_NEUTRAL;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Checkout ⇄ Undo-checkout toggle. */}
      {!checkedOut ? (
        <Tooltip content="Check out the form to start editing — it's view-only until you do. Sets the point you can roll back to.">
          <button type="button" onClick={onCheckout} disabled={busyOrMut} className={checkoutCls}>
            <Pencil className="size-4" />Checkout
          </button>
        </Tooltip>
      ) : (
        <Tooltip content={gate.undo.reason}>
          <button type="button" onClick={onUndoCheckout} disabled={busyOrMut || !gate.undo.ok} className={checkoutCls}>
            <RotateCcw className="size-4" />{busy === "undo" ? "Reverting…" : "Undo checkout"}
          </button>
        </Tooltip>
      )}
      <Tooltip content={gate.checkin.reason}>
        <button type="button" onClick={onCheckIn} disabled={busyOrMut || !gate.checkin.ok} className={TOOLBAR_BTN_NEUTRAL}>
          <Save className="size-4" />{busy === "checkin" ? "Checking in…" : "Check in"}
        </button>
      </Tooltip>
      <Tooltip content={gate.publish.reason}>
        <button type="button" onClick={onPublish} disabled={busyOrMut || !gate.publish.ok} className={publishCls}>
          <Rocket className="size-4" />{busy === "publish" ? "Publishing…" : alreadyLive ? "Published" : "Publish"}
        </button>
      </Tooltip>
    </div>
  );
}
