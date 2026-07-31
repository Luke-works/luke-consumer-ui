/**
 * FormStatusPopover — one icon, next to the settings gear, answering "what state is this form in?".
 *
 * <p>It replaces a row of chips (status · version · signed-off · save state) plus a full-width
 * view-only banner. Those told you the same few facts in four places and pushed the builder itself
 * down the page, while the toolbar read as one undifferentiated line of status and actions.
 *
 * <p>The icon still carries the answer at a glance — colour and glyph encode published / unpublished
 * / view-only — so consolidating costs no information; only the detail moves behind a click.
 *
 * <p>Deliberately NOT here: the "someone else is editing this form" warning. That one is
 * time-critical and destructive if missed (your changes may overwrite theirs), so it stays an inline
 * banner. A conflict warning nobody opened is a conflict warning that did not work.
 */
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Info } from "lucide-react";
import { Dropdown } from "../../components/ui/dropdown/Dropdown";
import Button from "../../components/ui/button/Button";
import Tooltip from "../../components/ui/tooltip/Tooltip";
import type { FormStatus } from "../../lib/formsApi";

export type FormStatusInfo = {
  status: FormStatus;
  version: number;
  /** Live version the public surfaces serve; null = never published. */
  publishedVersion: number | null;
  /** Is the LATEST checked-in version signed off (⟺ Publish is allowed)? */
  signedOff: boolean;
  /** When it was signed off (epoch ms), for the detail line. */
  lastTestedAt?: number | null;
  /** Does this user have write access at all? */
  canEdit: boolean;
  /** Is there an editing session in progress (checked out)? */
  checkedOut: boolean;
  /** Autosave state text ("Saved" / "Saving…" / "Save failed"). */
  saveLabel: string;
  saveError: boolean;
};

/**
 * The three states the icon distinguishes, in the order they matter to the author.
 *
 * <p>The GLYPH is always the info mark — it is "information about this form", and swapping the shape
 * per state made it read as three unrelated controls (a dashed circle in particular looked like a
 * spinner or a disabled button rather than a status). State is carried by COLOUR and by the
 * accessible name, so it is still answerable at a glance without the shape moving under you.
 */
function summarize(info: FormStatusInfo) {
  if (info.canEdit && !info.checkedOut) {
    return { tone: "text-gray-400", label: "View only", hint: "You're not editing this form yet." };
  }
  if (info.publishedVersion != null) {
    return {
      tone: "text-success-500",
      label: `Published v${info.publishedVersion}`,
      hint: "Live on your public surfaces.",
    };
  }
  return { tone: "text-amber-500", label: "Not published", hint: "No version is live yet." };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-right text-xs font-medium text-gray-700 dark:text-gray-200">{value}</span>
    </div>
  );
}

export default function FormStatusPopover({
  info,
  onCheckout,
  checkoutDisabled = false,
}: {
  info: FormStatusInfo;
  /** Offered straight from the popover, since "view only" and "how do I edit" are the same question. */
  onCheckout?: () => void;
  checkoutDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const summary = summarize(info);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Escape closes it. Dropdown already handles the outside click; without this the popover survived
  // a keyboard dismissal, which is the one way a keyboard user has to back out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <Tooltip content={`${summary.label} — ${summary.hint} Click for details.`}>
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Form status: ${summary.label}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="dropdown-toggle inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 focus:outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/20 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
        >
          <Info className={`size-4 ${summary.tone}`} />
        </button>
      </Tooltip>

      <Dropdown isOpen={open} onClose={() => setOpen(false)} className="left-0 right-auto w-72 p-4">
        <div role="dialog" aria-label="Form status">
          <div className="flex items-center gap-2">
            <Info className={`size-4 shrink-0 ${summary.tone}`} />
            <span className="text-sm font-semibold text-gray-800 dark:text-white/90">{summary.label}</span>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{summary.hint}</p>

          <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-1 dark:divide-gray-800 dark:border-gray-800">
            <Row label="Editing" value={`v${info.version}`} />
            <Row
              label="Live"
              value={info.publishedVersion != null ? `v${info.publishedVersion}` : "Not published"}
            />
            <Row
              label="Sign-off"
              value={
                info.signedOff ? (
                  <span className="inline-flex items-center gap-1 text-success-600 dark:text-success-400">
                    <BadgeCheck className="size-3.5" />
                    {info.lastTestedAt ? new Date(info.lastTestedAt).toLocaleDateString() : "Signed off"}
                  </span>
                ) : (
                  <span className="text-gray-400">Not signed off</span>
                )
              }
            />
            <Row
              label="Status"
              value={<span className="capitalize">{info.status}</span>}
            />
            {info.canEdit && info.checkedOut ? (
              <Row
                label="Changes"
                value={<span className={info.saveError ? "text-error-500" : undefined}>{info.saveLabel}</span>}
              />
            ) : null}
          </div>

          {/* The view-only message and its way out, in one place — "read-only" and "how do I edit
              this" were previously a banner and a toolbar button at opposite ends of the page. */}
          {info.canEdit && !info.checkedOut ? (
            <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-white/5">
              <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                You're looking at v{info.version}. Your edits won't be saved until you check the form out.
              </p>
              {onCheckout ? (
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  disabled={checkoutDisabled}
                  onClick={() => { setOpen(false); onCheckout(); }}
                >
                  Checkout to edit
                </Button>
              ) : null}
            </div>
          ) : null}

          {!info.canEdit ? (
            <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 dark:bg-white/5 dark:text-gray-300">
              You have read access to this form. Ask an owner for edit access to make changes.
            </p>
          ) : null}
        </div>
      </Dropdown>
    </div>
  );
}
