// The typed variable / merge contract editor. Shows every {{var}} the email uses
// (reconciled from the doc + any stored declarations) and lets the operator declare
// its type, whether it's required, a default, and a label. The declared contract is
// persisted on doc.variables and is the interface a Camunda outbound task binds to
// before Postmark merges — this package never sends.
import { EMAIL_VAR_TYPES, type EmailVariable, type EmailVarType } from "@lukeflow/email-core";

/** Coerce the free-text default input into the declared type (empty → cleared). */
function coerceDefault(raw: string, type: EmailVarType): EmailVariable["default"] {
  if (raw === "") return undefined;
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw; // keep raw so validate can flag the mismatch
  }
  if (type === "boolean") return raw === "true";
  return raw;
}

export default function EmailVariablesPanel({
  contract,
  usedNames,
  onChange,
  disabled = false,
}: {
  /** The reconciled contract (used ∪ declared), in canonical order. */
  contract: EmailVariable[];
  /** Names actually referenced in the doc — used to badge declared-but-unused vars. */
  usedNames: Set<string>;
  /** Called with the full next contract to persist onto doc.variables. */
  onChange: (next: EmailVariable[]) => void;
  disabled?: boolean;
}) {
  if (contract.length === 0) return null;

  const patch = (name: string, changes: Partial<EmailVariable>) =>
    onChange(contract.map((v) => (v.name === name ? { ...v, ...changes } : v)));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Variables — merge contract</span>
        <span className="text-[11px] text-gray-400">{contract.length} field{contract.length === 1 ? "" : "s"}</span>
      </div>
      <p className="mb-3 text-xs text-gray-400">
        Declared per-field types the send step validates before merging. Values are supplied at send time — the template keeps <span className="font-mono">{"{{vars}}"}</span> literal.
      </p>

      <div className="space-y-2">
        {contract.map((v) => {
          const unused = !usedNames.has(v.name);
          return (
            <div key={v.name} className="grid grid-cols-[minmax(0,1.4fr)_auto_auto_minmax(0,1.6fr)] items-center gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-xs text-brand-600 dark:text-brand-300">{`{{${v.name}}}`}</span>
                {unused && (
                  <span className="shrink-0 rounded bg-amber-50 px-1 text-[10px] text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" title="Declared but not used in the email">
                    unused
                  </span>
                )}
              </div>

              <select
                aria-label={`Type for ${v.name}`}
                value={v.type}
                disabled={disabled}
                onChange={(e) => patch(v.name, { type: e.target.value as EmailVarType })}
                className="rounded-lg border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
              >
                {EMAIL_VAR_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={v.required}
                  disabled={disabled}
                  onChange={(e) => patch(v.name, { required: e.target.checked })}
                  className="size-3.5 rounded border-gray-300 dark:border-gray-600"
                />
                required
              </label>

              <input
                aria-label={`Default for ${v.name}`}
                value={v.default === undefined ? "" : String(v.default)}
                disabled={disabled}
                placeholder={v.type === "boolean" ? "true / false" : `default (${v.type})`}
                onChange={(e) => patch(v.name, { default: coerceDefault(e.target.value, v.type) })}
                className="min-w-0 rounded-lg border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
