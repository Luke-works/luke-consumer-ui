/**
 * LukeExplains — the visual half of the plain-language access explainer.
 *
 * Renders an {@link AccessExplanation} (built by src/lib/lukeExplains.ts) as a branded panel:
 * a headline sentence, then what's gained / lost / still blocked / worth a second look. Used
 * wherever access is chosen or decided — the request form, the approval queue, and the grant
 * editors — so requesters and approvers see the same explanation of the same change.
 */
import { useId, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Lock, Minus, Sparkles } from "lucide-react";
import type { AccessExplanation } from "../../lib/lukeExplains";

/** One labelled group of bullets, hidden entirely when empty. */
function Group({
  items,
  label,
  icon: Icon,
  klass,
}: {
  items: string[];
  label: string;
  icon: typeof Check;
  klass: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Icon className={`mt-0.5 size-4 shrink-0 ${klass}`} aria-hidden="true" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LukeExplains({
  explanation,
  title = "LukeExplains",
  collapsible = false,
  defaultOpen = true,
  className = "",
}: {
  explanation: AccessExplanation;
  /** Header text next to the badge. */
  title?: string;
  /** Render as a disclosure (used in dense lists like the approval queue). */
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const shown = !collapsible || open;
  const { headline, gains, losses, limits, cautions } = explanation;

  return (
    <div
      className={`rounded-xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-500/20 dark:bg-brand-500/[0.06] ${className}`}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <span className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden="true" />
            <span>
              <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">{title}</span>
              <span className="mt-0.5 block text-sm text-gray-700 dark:text-gray-200">{headline}</span>
            </span>
          </span>
          <ChevronDown
            className={`mt-0.5 size-4 shrink-0 text-brand-500 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">{title}</p>
            <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-200">{headline}</p>
          </div>
        </div>
      )}

      {shown && (gains.length > 0 || losses.length > 0 || limits.length > 0 || cautions.length > 0) && (
        <div id={bodyId} className="mt-4 space-y-4 border-t border-brand-100 pt-4 dark:border-brand-500/20">
          <Group items={gains} label="What this allows" icon={Check} klass="text-success-500" />
          <Group items={losses} label="What is taken away" icon={Minus} klass="text-error-500" />
          <Group items={limits} label="Still not allowed" icon={Lock} klass="text-gray-400" />
          {cautions.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10">
              <ul className="space-y-1.5">
                {cautions.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
