/**
 * Manage My Access — the one section every member sees. Shows what the caller holds today,
 * lets them ask for more, and tracks their own requests.
 *
 * LukeExplains sits in the middle of the request form: before submitting, the requester sees
 * exactly what the level they picked would let them do and what it still wouldn't — which is
 * the difference between asking for the right level and asking for "whatever the admin gives
 * me".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, CornerDownLeft, KeyRound, Send, Trash2 } from "lucide-react";
import * as api from "../../lib/authApi";
import type { CapabilityCatalogItem, SubscribedCapability } from "../../lib/authApi";
import {
  cancelAccessRequest,
  createAccessRequest,
  listMyAccessRequests,
  resubmitAccessRequest,
  withdrawAccessRequest,
  type AccessRequest,
  type AccessRequestLevel,
} from "../../lib/accessRequestsApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import LukeExplains from "../../components/access/LukeExplains";
import { explainChange } from "../../lib/lukeExplains";
import {
  GRANTABLE_LEVELS,
  isCapabilityVisible,
  LEVEL_LABEL,
  requestableLevels,
  toLevel,
  type CapabilityLevel,
} from "../../lib/capabilities";
import { card, fmtWhen, LevelBadge, SectionHeader, StatusBadge, TierBadge } from "./shared";

/**
 * A request a resource owner sent back. This is the requester's half of the approval workflow:
 * the reviewer's reason, then the two things the process is waiting for them to choose between —
 * revise and send it back, or withdraw. Both complete the task assigned to them in Camunda.
 */
function ReturnedRequestCard({
  tenant,
  request,
  onDone,
}: {
  tenant: string;
  request: AccessRequest;
  onDone: () => void;
}) {
  const [level, setLevel] = useState<AccessRequestLevel>(request.level);
  const [note, setNote] = useState(request.note ?? "");
  const [busy, setBusy] = useState<"resubmit" | "withdraw" | null>(null);
  const [error, setError] = useState("");
  const name = request.capabilityName ?? request.capabilityCode;

  async function act(kind: "resubmit" | "withdraw") {
    setBusy(kind);
    setError("");
    try {
      if (kind === "resubmit") {
        await resubmitAccessRequest(tenant, request.id, { level, note: note.trim() || undefined });
      } else {
        await withdrawAccessRequest(tenant, request.id);
      }
      onDone();
    } catch (e) {
      setError(getAuthErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 dark:border-purple-500/25 dark:bg-purple-500/[0.06]">
      <div className="flex flex-wrap items-center gap-2">
        <CornerDownLeft className="size-4 shrink-0 text-purple-500" aria-hidden="true" />
        <span className="text-sm font-medium text-gray-800 dark:text-white/90">{name}</span>
        <StatusBadge status={request.status} />
        {(request.resubmitCount ?? 0) > 0 && (
          <span className="text-xs text-gray-400">
            revised {request.resubmitCount} {request.resubmitCount === 1 ? "time" : "times"}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {request.decidedByName ?? "A resource owner"} sent this back
        {request.decidedAt ? ` on ${fmtWhen(request.decidedAt)}` : ""}.
      </p>
      {request.decisionNote && (
        <p className="mt-1 border-l-2 border-purple-300 pl-3 text-sm italic text-gray-600 dark:border-purple-500/40 dark:text-gray-300">
          “{request.decisionNote}”
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`redo-level-${request.id}`}>Revised level</Label>
          <select
            id={`redo-level-${request.id}`}
            value={level}
            onChange={(e) => setLevel(e.target.value as AccessRequestLevel)}
            className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            {GRANTABLE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`redo-note-${request.id}`}>Justification</Label>
          <Input
            id={`redo-note-${request.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Address the reviewer's comment"
          />
        </div>
      </div>

      {level !== request.level && (
        <LukeExplains
          className="mt-4"
          title="LukeExplains — what you'd be asking for now"
          collapsible
          defaultOpen={false}
          explanation={explainChange({
            code: request.capabilityCode,
            name,
            from: toLevel(request.level),
            to: toLevel(level),
            audience: "requester",
          })}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-purple-200/60 pt-4 dark:border-purple-500/20">
        <Button size="sm" disabled={busy !== null} onClick={() => act("resubmit")}>
          {busy === "resubmit" ? "Sending…" : "Revise & resubmit"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("withdraw")}>
          {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
        </Button>
        {error && <span className="text-sm text-error-500">{error}</span>}
      </div>
    </div>
  );
}

export default function ManageMyAccessSection({
  tenant,
  capabilities,
  catalog,
}: {
  tenant: string;
  capabilities: Record<string, string>;
  catalog: CapabilityCatalogItem[];
}) {
  const [subscriptions, setSubscriptions] = useState<SubscribedCapability[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Request form
  const [code, setCode] = useState("");
  const [level, setLevel] = useState<AccessRequestLevel>("read");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "ok" | "error"; msg?: string }>({
    kind: "idle",
  });

  const reloadRequests = useCallback(
    () => listMyAccessRequests(tenant).then(setRequests).catch(() => setRequests([])),
    [tenant],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.getMySubscriptions(tenant), listMyAccessRequests(tenant)])
      .then(([subs, reqs]) => {
        if (!active) return;
        setSubscriptions(Array.isArray(subs) ? subs : []);
        setRequests(reqs);
      })
      .catch((e) => active && setError(getAuthErrorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tenant]);

  // The caller's effective level for a capability ("none" when not granted).
  const myLevel = useCallback((c: string): CapabilityLevel => toLevel(capabilities[c]), [capabilities]);

  const hasPending = useCallback(
    (c: string) => requests.some((r) => r.capabilityCode === c && r.status === "PENDING"),
    [requests],
  );

  // Subscribed capabilities the caller could still ask for something on. "Something" is
  // whatever the backend would actually accept from their current level — see
  // requestableLevels — so we never offer an option that comes back 409.
  const requestable = useMemo(
    () => subscriptions.filter((s) => requestableLevels(myLevel(s.code)).length > 0),
    [subscriptions, myLevel],
  );

  const selected = requestable.find((s) => s.code === code);
  const currentLevel = code ? myLevel(code) : "none";
  const options = useMemo(() => requestableLevels(currentLevel), [currentLevel]);

  // Keep the selected capability valid as the candidate list resolves.
  useEffect(() => {
    if (requestable.length === 0) {
      if (code) setCode("");
      return;
    }
    if (!requestable.some((s) => s.code === code)) setCode(requestable[0]!.code); // length === 0 returned above
  }, [requestable, code]);

  // Keep the level valid for whichever capability is selected.
  useEffect(() => {
    if (options.length > 0 && !options.includes(level)) setLevel(options[0] as AccessRequestLevel);
  }, [options, level]);

  const selectedPending = code ? hasPending(code) : false;

  async function submit() {
    if (!code) return;
    setStatus({ kind: "sending" });
    try {
      await createAccessRequest(tenant, { capabilityCode: code, level, note: note.trim() || undefined });
      setStatus({ kind: "ok", msg: "Request submitted." });
      setNote("");
      reloadRequests();
    } catch (e) {
      setStatus({ kind: "error", msg: getAuthErrorMessage(e) });
    }
  }

  async function cancel(id: string) {
    try {
      await cancelAccessRequest(tenant, id);
      reloadRequests();
    } catch {
      reloadRequests();
    }
  }

  // Exclude force-hidden capabilities (e.g. WORKFLOW until launch) even if the session still
  // carries a grant for them, so they don't surface in "My access".
  const codes = Object.keys(capabilities).filter(isCapabilityVisible);
  const meta = (c: string) => catalog.find((x) => x.code === c);

  // Requests a resource owner handed back — the process is waiting on the requester, so these
  // lead the page rather than sitting at the bottom of the history list.
  const returned = requests.filter((r) => r.status === "RETURNED");

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {/* Sent back to you — the process is waiting on the requester, so it leads. */}
      {returned.length > 0 && (
        <section className={card}>
          <SectionHeader
            icon={CornerDownLeft}
            title={
              <>
                Sent back to you{" "}
                <span className="text-sm font-normal text-gray-400">({returned.length})</span>
              </>
            }
            subtitle="A resource owner reviewed these and asked for a change. Revise and send back, or withdraw."
          />
          <div className="space-y-3">
            {returned.map((r) => (
              <ReturnedRequestCard key={r.id} tenant={tenant} request={r} onDone={reloadRequests} />
            ))}
          </div>
        </section>
      )}

      {/* Current access */}
      <section className={card}>
        <SectionHeader
          icon={KeyRound}
          title="My access"
          subtitle="The capabilities granted to you in this organization."
        />
        {codes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You don't have any capabilities granted yet. Request access below.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {codes.map((c) => {
              const lvl = myLevel(c);
              const m = meta(c);
              return (
                <li key={c} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        {m?.name ?? c}
                      </span>
                      <TierBadge tier={m?.tier} />
                    </div>
                    <LevelBadge level={lvl} />
                  </div>
                  <LukeExplains
                    className="mt-2"
                    title="LukeExplains — what this lets you do"
                    collapsible
                    defaultOpen={false}
                    explanation={explainChange({
                      code: c,
                      name: m?.name ?? c,
                      from: "none",
                      to: lvl,
                      audience: "requester",
                    })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Request access */}
      <section className={card}>
        <SectionHeader
          icon={Send}
          title="Request access"
          subtitle="Ask an org owner to grant you a capability your organization is subscribed to."
        />
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : requestable.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            There's nothing left for you to request right now.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="req-cap">Capability</Label>
                <select
                  id="req-cap"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                >
                  {requestable.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="req-level">Level</Label>
                <select
                  id="req-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as AccessRequestLevel)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                >
                  {options.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABEL[l]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {code && (
              <LukeExplains
                className="mt-5"
                title="LukeExplains — what you're asking for"
                explanation={explainChange({
                  code,
                  name: selected?.name ?? code,
                  from: currentLevel,
                  to: toLevel(level),
                  audience: "requester",
                })}
              />
            )}

            <div className="mt-5">
              <Label htmlFor="req-note">Note (optional)</Label>
              <Input
                id="req-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why you need this access"
              />
            </div>
            <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-5 dark:border-gray-800">
              <Button
                size="sm"
                startIcon={<Send className="size-4" />}
                disabled={!code || selectedPending || status.kind === "sending"}
                onClick={submit}
              >
                {status.kind === "sending" ? "Submitting…" : "Submit request"}
              </Button>
              {selectedPending && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  You already have a pending request for this capability.
                </span>
              )}
              {status.kind === "ok" && (
                <span className="text-sm text-success-600 dark:text-success-400">{status.msg}</span>
              )}
              {status.kind === "error" && <span className="text-sm text-error-500">{status.msg}</span>}
            </div>
          </>
        )}

      </section>

      {/* My requests */}
      <section className={card}>
        <SectionHeader icon={Clock} title="My requests" />
        {requests.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">You haven't requested any access yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {requests.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {r.capabilityName ?? r.capabilityCode}
                    </span>
                    <span className="text-xs text-gray-400">{LEVEL_LABEL[toLevel(r.level)]}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">Requested {fmtWhen(r.requestedAt)}</p>
                  {r.decisionNote && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{r.decisionNote}</p>
                  )}
                </div>
                {r.status === "PENDING" && (
                  <button
                    onClick={() => cancel(r.id)}
                    className="flex shrink-0 items-center gap-1.5 text-sm text-error-500 hover:text-error-600"
                  >
                    <Trash2 className="size-3.5" />
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
