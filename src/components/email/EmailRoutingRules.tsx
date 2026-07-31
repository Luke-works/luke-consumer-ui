import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Filter, Trash2 } from "lucide-react";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import * as rulesApi from "../../lib/emailIntakeApi";
import { describeMatch, type EmailRoutingRule, type RuleField, type RuleOperator } from "../../lib/emailIntakeApi";
import type { EmailBox } from "../../lib/emailBoxesApi";

/**
 * Rules that decide what an arriving email becomes.
 *
 * Without them every inbound message produces the same unassigned "Review inbound email" task —
 * a queue, not a workflow. A rule moves that decision to receipt: invoices to finance at high
 * priority, bounce notifications never becoming a task at all.
 *
 * ORDER IS THE SEMANTICS. Rules are evaluated top-down and the FIRST match decides everything;
 * later rules do not stack on top of it. That is stated in the UI, not just the docs, because a
 * user who assumes actions accumulate will write two rules that quietly contradict each other.
 */
export default function EmailRoutingRules({ tenant, boxes }: { tenant: string; boxes: EmailBox[] }) {
  const inboundBoxes = boxes.filter((b) => b.direction === "INBOUND");

  const [rules, setRules] = useState<EmailRoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New-rule form.
  const [name, setName] = useState("");
  const [boxId, setBoxId] = useState<string>("");
  const [matchField, setMatchField] = useState<RuleField>("SUBJECT");
  const [matchOperator, setMatchOperator] = useState<RuleOperator>("CONTAINS");
  const [matchValue, setMatchValue] = useState("");
  const [candidateGroup, setCandidateGroup] = useState("");
  const [priority, setPriority] = useState("");
  const [suppress, setSuppress] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    rulesApi
      .listRules(tenant)
      .then((r) => { setRules(r); setError(null); })
      .catch((e: unknown) => setError(messageOf(e)))
      .finally(() => setLoading(false));
  }, [tenant]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const created = await rulesApi.createRule(tenant, {
        name: name.trim(),
        boxId: boxId || null,
        matchField,
        matchOperator,
        matchValue,
        // Sort to the END: a new rule must never silently pre-empt one that already works.
        sortOrder: rules.length,
        actionCandidateGroup: candidateGroup.trim() || null,
        actionPriority: priority.trim() ? Number(priority) : null,
        actionSuppressTask: suppress,
      });
      setRules((prev) => [...prev, created]);
      setName(""); setMatchValue(""); setCandidateGroup(""); setPriority(""); setSuppress(false);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = rules;
    setRules((r) => r.filter((x) => x.id !== id));
    try {
      await rulesApi.deleteRule(tenant, id);
    } catch (e) {
      setRules(prev); // rollback
      setError(messageOf(e));
    }
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    const prev = rules;
    setRules(next); // optimistic: reordering is the whole interaction, it must feel instant
    try {
      setRules(await rulesApi.reorderRules(tenant, next.map((r) => r.id)));
    } catch (e) {
      setRules(prev);
      setError(messageOf(e));
    }
  }

  async function toggle(rule: EmailRoutingRule) {
    try {
      const updated = await rulesApi.updateRule(tenant, rule.id, { ...rule, enabled: !rule.enabled });
      setRules((r) => r.map((x) => (x.id === rule.id ? updated : x)));
    } catch (e) {
      setError(messageOf(e));
    }
  }

  const boxName = (id: string | null) =>
    id ? (inboundBoxes.find((b) => b.id === id)?.address ?? "a removed box") : "All inbound boxes";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
          <Filter className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Routing rules</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Decide what happens to mail as it arrives. Rules run top to bottom and the{" "}
            <strong className="font-semibold text-gray-700 dark:text-gray-300">first match wins</strong> — later
            rules are not applied.
          </p>
        </div>
      </div>

      {inboundBoxes.length === 0 && (
        <p className="mt-4 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
          Register an inbound box above before adding rules — there is nothing to route yet.
        </p>
      )}

      {/* Add */}
      <div className="mt-6 space-y-4 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="sm:flex-1">
            <Label htmlFor="rule-name">Rule name</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Invoices to finance" />
          </div>
          <div className="sm:w-56">
            <Label htmlFor="rule-box">Applies to</Label>
            <Select id="rule-box" value={boxId} onChange={setBoxId}>
              <option value="">All inbound boxes</option>
              {inboundBoxes.map((b) => (
                <option key={b.id} value={b.id}>{b.address}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-36">
            <Label htmlFor="rule-field">When</Label>
            <Select id="rule-field" value={matchField} onChange={(v) => setMatchField(v as RuleField)}>
              <option value="SUBJECT">Subject</option>
              <option value="FROM">From</option>
              <option value="TO">To</option>
              <option value="BODY">Body</option>
              <option value="ANY">Anything</option>
            </Select>
          </div>
          <div className="sm:w-40">
            <Label htmlFor="rule-op">Condition</Label>
            <Select id="rule-op" value={matchOperator} onChange={(v) => setMatchOperator(v as RuleOperator)}>
              <option value="CONTAINS">contains</option>
              <option value="EQUALS">is exactly</option>
              <option value="STARTS_WITH">starts with</option>
              <option value="ENDS_WITH">ends with</option>
              <option value="REGEX">matches regex</option>
            </Select>
          </div>
          <div className="sm:flex-1">
            <Label htmlFor="rule-value">Value</Label>
            <Input id="rule-value" value={matchValue} onChange={(e) => setMatchValue(e.target.value)} placeholder="invoice" />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:flex-1">
            <Label htmlFor="rule-group">Assign to group (optional)</Label>
            <Input id="rule-group" value={candidateGroup} onChange={(e) => setCandidateGroup(e.target.value)} placeholder="finance" />
          </div>
          <div className="sm:w-40">
            <Label htmlFor="rule-priority">Priority (0–1000)</Label>
            <Input id="rule-priority" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="50" />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={suppress}
            onChange={(e) => setSuppress(e.target.checked)}
            className="size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900"
          />
          Do not create a task (store the mail only)
        </label>

        <Button size="sm" disabled={!name.trim() || !matchValue.trim() || busy} onClick={() => void add()}>
          {busy ? "Adding…" : "Add rule"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-error-500">{error}</p>}

      {/* List */}
      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-gray-400">Loading rules…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No rules yet — every inbound message becomes an unassigned review task.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {rules.map((r, i) => (
              <li key={r.id} className="flex items-start gap-3 py-3" data-testid="routing-rule">
                <span className="mt-0.5 w-5 shrink-0 text-center text-xs font-medium text-gray-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${r.enabled ? "text-gray-800 dark:text-gray-200" : "text-gray-400 line-through"}`}>
                    {r.name}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{describeMatch(r)}</p>
                  <p className="truncate text-xs text-gray-400">
                    {boxName(r.boxId)} · {summariseActions(r)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn label="Move up" disabled={i === 0} onClick={() => void move(i, -1)}>
                    <ArrowUp className="size-4" />
                  </IconBtn>
                  <IconBtn label="Move down" disabled={i === rules.length - 1} onClick={() => void move(i, 1)}>
                    <ArrowDown className="size-4" />
                  </IconBtn>
                  <button
                    type="button"
                    onClick={() => void toggle(r)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.03]"
                  >
                    {r.enabled ? "Disable" : "Enable"}
                  </button>
                  <IconBtn label={`Delete ${r.name}`} onClick={() => void remove(r.id)}>
                    <Trash2 className="size-4 text-error-500" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Plain-language summary of what a rule DOES — the list is useless if you must open each one. */
export function summariseActions(r: EmailRoutingRule): string {
  if (r.actionSuppressTask) return "No task created";
  const parts: string[] = [];
  if (r.actionAssignee) parts.push(`assign to ${r.actionAssignee}`);
  if (r.actionCandidateGroup) parts.push(`to group ${r.actionCandidateGroup}`);
  if (r.actionPriority != null) parts.push(`priority ${r.actionPriority}`);
  if (r.actionProcessKey) parts.push(`run ${r.actionProcessKey}`);
  if (r.actionTaskName) parts.push(`named “${r.actionTaskName}”`);
  return parts.length ? parts.join(", ") : "Standard review task";
}

function Select({
  id, value, onChange, children,
}: {
  id: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
    >
      {children}
    </select>
  );
}

function IconBtn({
  label, onClick, disabled, children,
}: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.03]"
    >
      {children}
    </button>
  );
}

function messageOf(e: unknown): string {
  return (e as { message?: string })?.message ?? "Something went wrong.";
}
