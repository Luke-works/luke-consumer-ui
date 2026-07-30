/**
 * Approve Requests — owner-only pending queue.
 *
 * The approver's LukeExplains panel is the point of this screen: "Ada requested FORMS
 * read-write" tells an owner nothing about what they're handing over, so every row states in
 * plain language what the level they're about to grant allows, what it doesn't, and — for
 * read & write — that it carries publish and permanent-delete rights that Contributor doesn't.
 * The panel re-computes as the owner changes the grant level, so downgrading to Contributor
 * visibly shrinks what they're approving.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CornerDownLeft, Inbox } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  approveAccessRequest,
  denyAccessRequest,
  listOrgAccessRequests,
  type AccessRequest,
  type AccessRequestLevel,
} from "../../lib/accessRequestsApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import LukeExplains from "../../components/access/LukeExplains";
import { explainGrant } from "../../lib/lukeExplains";
import { GRANTABLE_LEVELS, LEVEL_LABEL, toLevel } from "../../lib/capabilities";
import { card, fmtWhen, SectionHeader } from "./shared";

export default function ApproveRequestsSection({ tenant }: { tenant: string }) {
  const { refreshSession } = useAuth();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Per-row UI state: pending level override + deny note + busy flag.
  const [levels, setLevels] = useState<Record<string, AccessRequestLevel>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    listOrgAccessRequests(tenant, "PENDING")
      .then((rs) => {
        setRequests(rs);
        setLevels(Object.fromEntries(rs.map((r) => [r.id, r.level])));
      })
      .catch((e) => setError(getAuthErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [tenant]);

  useEffect(() => reload(), [reload]);

  async function approve(r: AccessRequest) {
    setBusyId(r.id);
    setResult(null);
    try {
      await approveAccessRequest(tenant, r.id, levels[r.id] ?? r.level);
      setResult({ kind: "ok", msg: `Approved access for ${r.requesterName ?? "member"}.` });
      reload();
      // The grant may be for the signed-in owner themselves — refresh so it shows.
      await refreshSession({ fresh: true });
    } catch (e) {
      setResult({ kind: "error", msg: getAuthErrorMessage(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function deny(r: AccessRequest) {
    setBusyId(r.id);
    setResult(null);
    try {
      await denyAccessRequest(tenant, r.id, notes[r.id]?.trim() || undefined);
      setResult({
        kind: "ok",
        msg: `Sent back to ${r.requesterName ?? "the requester"} to revise or withdraw.`,
      });
      reload();
    } catch (e) {
      setResult({ kind: "error", msg: getAuthErrorMessage(e) });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="flex h-[40vh] items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <section className={card}>
        <SectionHeader
          icon={Inbox}
          title={
            <>
              Pending requests{" "}
              <span className="text-sm font-normal text-gray-400">({requests.length})</span>
            </>
          }
          subtitle="Approve to grant the access, or send it back with a reason — the requester can revise it and return it to you."
        />
        {result && (
          <p
            className={`mb-4 text-sm ${
              result.kind === "ok" ? "text-success-600 dark:text-success-400" : "text-error-500"
            }`}
          >
            {result.msg}
          </p>
        )}
        {requests.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No pending requests.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => {
              const busy = busyId === r.id;
              const granting = levels[r.id] ?? r.level;
              const overridden = granting !== r.level;
              return (
                <div key={r.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {r.requesterName ?? "Member"}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      requested {r.capabilityName ?? r.capabilityCode}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-white/10 dark:text-gray-400">
                      {LEVEL_LABEL[toLevel(r.level)]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Requested {fmtWhen(r.requestedAt)}</p>
                  {r.note && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">“{r.note}”</p>
                  )}

                  <LukeExplains
                    className="mt-3"
                    title={
                      overridden
                        ? `LukeExplains — what you'd grant instead (${LEVEL_LABEL[toLevel(granting)]})`
                        : "LukeExplains — what you're approving"
                    }
                    explanation={explainGrant({
                      code: r.capabilityCode,
                      name: r.capabilityName ?? r.capabilityCode,
                      level: toLevel(granting),
                      audience: "approver",
                      subject: r.requesterName ?? undefined,
                    })}
                  />

                  <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-end">
                    <div>
                      <Label htmlFor={`grant-${r.id}`}>Grant level</Label>
                      <select
                        id={`grant-${r.id}`}
                        value={granting}
                        disabled={busy}
                        onChange={(e) =>
                          setLevels((p) => ({ ...p, [r.id]: e.target.value as AccessRequestLevel }))
                        }
                        className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                      >
                        {GRANTABLE_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {LEVEL_LABEL[l]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:flex-1">
                      <Label htmlFor={`deny-${r.id}`}>Reason for sending back (optional)</Label>
                      <Input
                        id={`deny-${r.id}`}
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                        placeholder="What should they change?"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        startIcon={<CheckCircle2 className="size-4" />}
                        disabled={busy}
                        onClick={() => approve(r)}
                      >
                        Approve
                      </Button>
                      {/* Not destructive: this returns the request to the requester rather than
                          ending it, so it reads as a hand-back, not a rejection. */}
                      <Button
                        size="sm"
                        variant="outline"
                        startIcon={<CornerDownLeft className="size-4" />}
                        disabled={busy}
                        onClick={() => deny(r)}
                      >
                        Send back
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
