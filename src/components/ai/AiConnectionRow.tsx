import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, CircleAlert, Star } from "lucide-react";
import Button from "../ui/button/Button";
import Listbox, { type ListboxOption } from "../ui/select/Listbox";
import type { AiConnection, AiModel } from "../../lib/aiProviderApi";

function when(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

/**
 * One connected provider, with the state of the thing rather than a bare name.
 *
 * A workspace can hold several, and they fail independently: a revoked Anthropic key says
 * nothing about a healthy Groq one. So each row carries its own verdict, its own last check,
 * and — when a provider has refused — that provider's own words, which are the only actionable
 * part of a refusal.
 */
export default function AiConnectionRow({
  connection,
  canManage,
  busy,
  models,
  onLoadModels,
  onChooseModel,
  onVerify,
  onMakeDefault,
  onRemove,
}: {
  connection: AiConnection;
  canManage: boolean;
  busy: boolean;
  /** This provider's models, once someone has asked for them. */
  models: AiModel[] | null;
  onLoadModels: () => void;
  onChooseModel: (model: string) => void;
  onVerify: () => void;
  onMakeDefault: () => void;
  onRemove: () => void;
}) {
  const invalid = connection.status === "INVALID";
  // The key works and the workspace is connected — this is about their balance, so it is shown
  // rather than acted on. Reconnecting would not fix it.
  const dry = !invalid && !!connection.exhausted;
  const checked = when(connection.verifiedAt);
  const panelId = useId();
  // Open when it needs attention: a failing provider should not hide its own explanation behind
  // a click. Otherwise collapsed — a workspace with four providers is a list to scan, not four
  // stacked forms.
  const [open, setOpen] = useState(invalid || dry);
  // …and RE-open it if this provider fails later. `useState(invalid)` only reads its argument on
  // the first render, so a connection that was healthy at mount and then failed a Check kept its
  // own explanation collapsed — the one case this disclosure exists to reveal. Tracked against
  // the previous value so it opens on the TRANSITION, leaving someone free to collapse a row
  // that is still failing.
  const wasInvalid = useRef(invalid || dry);
  useEffect(() => {
    const needsAttention = invalid || dry;
    if (needsAttention && !wasInvalid.current) setOpen(true);
    wasInvalid.current = needsAttention;
  }, [invalid, dry]);

  const pinned = connection.model;
  const modelOptions: ListboxOption[] = [
    {
      value: "",
      label: "Provider default",
      // Only when nothing is pinned. `effectiveModel` is what a turn WOULD use, so once a model
      // is pinned it equals that model — and showing it here made "Provider default" claim to
      // resolve to the very model sitting selected below it, with no way to tell what reverting
      // would do. The native markup guarded this with `!connection.model`; the port dropped it.
      hint: !connection.model ? (connection.effectiveModel ?? undefined) : undefined,
    },
    // A stored choice stays SELECTABLE even when the provider's list has not arrived (it is
    // fetched on open) or came back without it — the same fallback the native version carried.
    ...(pinned && !(models ?? []).some((m) => m.id === pinned)
      ? [{ value: pinned, label: pinned, group: "Current choice" }]
      : []),
    ...(models ?? []).map((m) => ({
      value: m.id,
      label: m.id,
      // Grouped the same way everywhere: what can build, and what would fail if chosen.
      group: m.chat ? "Chat models" : "May not work for building",
    })),
  ];

  return (
    <li className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/20"
        >
          <ChevronRight
            aria-hidden
            className={`size-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
              invalid
                ? "bg-error-50 text-error-500 dark:bg-error-500/10"
                : dry
                  ? "bg-warning-50 text-warning-600 dark:bg-warning-500/10"
                  : "bg-success-50 text-success-600 dark:bg-success-500/10"
            }`}
          >
            {invalid || dry ? <CircleAlert className="size-4" /> : <CheckCircle2 className="size-4" />}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-medium text-gray-800 dark:text-white/90">
              {connection.label ?? connection.provider}
              {/* Not on a failing one: it cannot serve a turn, and the star is what hides the
                  "Make default" button that would move the default off it. */}
              {connection.preferred && !invalid ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <Star className="size-3" />
                  Default
                </span>
              ) : null}
            </span>
            {/* The one line worth seeing without expanding: is it working, and since when. */}
            <span
              className={`mt-0.5 block truncate text-xs ${dry ? "text-warning-600 dark:text-warning-400" : "text-gray-400"}`}
            >
              {invalid ? "Not working" : dry ? "Out of credit — top up with your provider" : "Working"}
              {connection.keyLast4 ? ` · key ending ${connection.keyLast4}` : ""}
              {checked ? ` · checked ${checked}` : ""}
            </span>
          </span>
        </button>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onVerify} disabled={busy}>
              Check
            </Button>
            {!connection.preferred && !invalid ? (
              <Button size="sm" variant="outline" onClick={onMakeDefault} disabled={busy}>
                Make default
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onRemove} disabled={busy}>
              Remove
            </Button>
          </div>
        ) : null}
      </div>

      {open ? (
        <div id={panelId} className="border-t border-gray-100 px-4 py-4 dark:border-gray-800">
          {invalid ? (
            <p className="mb-3 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {/* The provider's own explanation — they know why they refused and we do not. */}
              {connection.lastError || "This provider rejected the stored key."}
            </p>
          ) : null}

          <dl className="mb-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-400">Model in use</dt>
              <dd className="text-gray-700 dark:text-gray-200">{connection.effectiveModel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Connected</dt>
              <dd className="text-gray-700 dark:text-gray-200">
                {when(connection.connectedAt) ?? "—"}
                {connection.connectedBy ? ` by ${connection.connectedBy}` : ""}
              </dd>
            </div>
          </dl>

          {canManage && !invalid ? (
            <div className="max-w-sm">
              <label
                htmlFor={`ai-model-${connection.provider}`}
                className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                Workspace model
              </label>
              <Listbox
                id={`ai-model-${connection.provider}`}
                ariaLabel={`Workspace model for ${connection.label ?? connection.provider}`}
                size="sm"
                value={connection.model ?? ""}
                options={modelOptions}
                        // Read live from this provider, and only when someone opens it: fetching for
                // every connected provider on page load would cost a round trip each, for a
                // control most people never touch.
                onOpen={onLoadModels}
                onChange={onChooseModel}
              />
              <p className="mt-1.5 text-xs text-gray-400">
                What this provider runs when someone hasn't chosen their own model.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
