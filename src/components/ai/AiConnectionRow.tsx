import { CheckCircle2, CircleAlert, Star } from "lucide-react";
import Button from "../ui/button/Button";
import { ModelOptions } from "./modelOptions";
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
  const checked = when(connection.verifiedAt);

  return (
    <li className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
              invalid
                ? "bg-error-50 text-error-500 dark:bg-error-500/10"
                : "bg-success-50 text-success-600 dark:bg-success-500/10"
            }`}
          >
            {invalid ? <CircleAlert className="size-4" /> : <CheckCircle2 className="size-4" />}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-gray-800 dark:text-white/90">
              {connection.label ?? connection.provider}
              {/* Not on a failing one: it cannot serve a turn, and showing the star there also
                  hid the "Make default" button that would move the default off it. */}
              {connection.preferred && !invalid ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <Star className="size-3" />
                  Default
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 break-all text-sm text-gray-500 dark:text-gray-400">
              Key ending {connection.keyLast4 ?? "••••"}
              {connection.effectiveModel ? ` · ${connection.effectiveModel}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {invalid ? "Not working" : "Working"}
              {checked ? ` · checked ${checked}` : ""}
            </p>
          </div>
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onVerify} disabled={busy}>
              Check
            </Button>
            {/* Only worth offering on one that could actually serve a turn. */}
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

      {canManage && !invalid ? (
        <div className="mt-3">
          <label
            htmlFor={`ai-model-${connection.provider}`}
            className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
          >
            Workspace model
          </label>
          <select
            id={`ai-model-${connection.provider}`}
            className="h-9 w-full max-w-sm rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:text-white/90"
            value={connection.model ?? ""}
            aria-busy={busy}
            // Disabled while any row is saving: the section tracks one in-flight action, so a
            // second change started meanwhile would land on a view rebuilt by the first and
            // appear to revert it.
            disabled={busy}
            // Read live from this provider, and only when someone opens it: fetching for every
            // connected provider on page load would cost a round trip each, for a control most
            // people never touch.
            onFocus={onLoadModels}
            onChange={(e) => onChooseModel(e.target.value)}
          >
            <option value="">
              Provider default
              {connection.effectiveModel && !connection.model ? ` (${connection.effectiveModel})` : ""}
            </option>
            <ModelOptions models={models ?? []} selected={connection.model} />
          </select>
          <p className="mt-1 text-xs text-gray-400">
            What this provider runs when someone hasn't chosen their own model.
          </p>
        </div>
      ) : null}

      {invalid ? (
        <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {/* The provider's own explanation — they know why they refused and we do not. */}
          {connection.lastError || "This provider rejected the stored key."}
        </p>
      ) : null}
    </li>
  );
}
