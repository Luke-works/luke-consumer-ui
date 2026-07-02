import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Clock,
  Inbox,
  KeyRound,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../lib/authApi";
import type {
  CapabilityCatalogItem,
  CapabilityGrant,
  Invitation,
  OrgGroup,
  OrgMember,
  RoleLevel,
  SubscribedCapability,
} from "../../lib/authApi";
import {
  approveAccessRequest,
  cancelAccessRequest,
  createAccessRequest,
  denyAccessRequest,
  listMyAccessRequests,
  listOrgAccessRequests,
  type AccessRequest,
  type AccessRequestLevel,
  type AccessRequestStatus,
} from "../../lib/accessRequestsApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import PageMeta from "../../components/common/PageMeta";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import {
  EMAIL,
  isCapabilityVisible,
  LEVEL_LABEL,
  TIER_BADGE,
  TIER_LABEL,
  type CapabilityLevel,
} from "../../lib/capabilities";
import { isPersonalEmail } from "../../lib/emailDomains";

// Editable role rows: dimension (as returned in member.roles) → the engine role
// group we PUT to. Owner (tenant-admin) is guarded server-side so the last owner
// can't be removed.
const ROLE_ROWS: { dim: keyof OrgMember["roles"]; role: string; label: string }[] = [
  { dim: "tenantAdmin", role: "tenant-admin", label: "Org owner" },
  { dim: "tenantUser", role: "tenant-user", label: "Member" },
  { dim: "processUser", role: "process-operator", label: "Process operator" },
  { dim: "taskUser", role: "task-worker", label: "Task worker" },
];

const card =
  "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";

/** Modern section header: an icon badge + title (+ optional subtitle), with an
 *  optional right-aligned slot (e.g. a count, a toggle). */
function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  right,
}: {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** Round initials avatar for a member row. */
function MemberAvatar({ member }: { member: OrgMember }) {
  const initials = (
    (member.firstName?.[0] ?? "") + (member.lastName?.[0] ?? "") ||
    member.email?.[0] ||
    "?"
  ).toUpperCase();
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
      {initials}
    </span>
  );
}

function LevelSelect({
  value,
  onChange,
  disabled,
}: {
  value: RoleLevel;
  onChange: (v: RoleLevel) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as RoleLevel)}
      className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
    >
      <option value="none">None</option>
      <option value="read">Read</option>
      <option value="read-write">Read &amp; write</option>
    </select>
  );
}

const fullName = (m: OrgMember) =>
  [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || m.id;

const groupName = (id: string, groups: OrgGroup[]) =>
  groups.find((g) => g.id === id)?.name ?? (id.split(":").slice(1).join(":") || id);

/** Pricing/availability tier chip (Free / Standard / Premium). */
function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  const klass = TIER_BADGE[tier] ?? "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${klass}`}>
      {TIER_LABEL[tier] ?? tier}
    </span>
  );
}

/** Colour for a capability level chip in the read-only "My access" view. */
const LEVEL_BADGE: Record<CapabilityLevel, string> = {
  none: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  read: "bg-blue-50 text-blue-600 dark:bg-blue-500/15",
  "read-write": "bg-success-50 text-success-600 dark:bg-success-500/15",
};

/* ───────────────────────── Access-request helpers ───────────────────────── */

const REQUEST_LEVELS: { value: AccessRequestLevel; label: string }[] = [
  { value: "read", label: "Read-only" },
  { value: "read-write", label: "Read & write" },
];

/** Colour + label for an access-request status chip. */
const STATUS_BADGE: Record<AccessRequestStatus, { label: string; klass: string }> = {
  PENDING: { label: "Pending", klass: "bg-amber-50 text-amber-600 dark:bg-amber-500/15" },
  APPROVED: { label: "Approved", klass: "bg-success-50 text-success-600 dark:bg-success-500/15" },
  DENIED: { label: "Denied", klass: "bg-error-50 text-error-600 dark:bg-error-500/15" },
  CANCELLED: { label: "Cancelled", klass: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400" },
};

function StatusBadge({ status }: { status: AccessRequestStatus }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.klass}`}>{s.label}</span>
  );
}

const fmtWhen = (ms?: number) => (ms ? new Date(ms).toLocaleString() : "");

/* ────────────────────────── Manage My Access section ─────────────────────── */

/**
 * "Manage My Access" — visible to every member. Shows the caller's current
 * capabilities (read-only, from the session), a form to request access to a
 * subscribed capability they lack, and the caller's own request history with a
 * cancel action on pending ones.
 */
function ManageMyAccessSection({
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
  const myLevel = (c: string): CapabilityLevel => {
    const raw = capabilities[c];
    return raw === "read" || raw === "read-write" ? raw : "none";
  };

  const hasPending = useCallback(
    (c: string) => requests.some((r) => r.capabilityCode === c && r.status === "PENDING"),
    [requests],
  );

  // Subscribed capabilities the caller doesn't already hold at full (read-write)
  // level — the candidates worth requesting.
  const requestable = useMemo(
    () => subscriptions.filter((s) => myLevel(s.code) !== "read-write"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subscriptions, capabilities],
  );

  // Keep the selected capability valid as the candidate list resolves.
  useEffect(() => {
    if (requestable.length === 0) {
      if (code) setCode("");
      return;
    }
    if (!requestable.some((s) => s.code === code)) setCode(requestable[0].code);
  }, [requestable, code]);

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

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
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
                <li key={c} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {m?.name ?? c}
                    </span>
                    <TierBadge tier={m?.tier} />
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_BADGE[lvl]}`}>
                    {LEVEL_LABEL[lvl]}
                  </span>
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
            You already have full access to every capability your organization is subscribed to.
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
                  {REQUEST_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
                    <span className="text-xs text-gray-400">{LEVEL_LABEL[r.level]}</span>
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

/* ────────────────────────── Approve Requests section ─────────────────────── */

/** Owner-only pending queue: approve (with an optional level override) or deny. */
function ApproveRequestsSection({ tenant }: { tenant: string }) {
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
      setResult({ kind: "ok", msg: `Denied request from ${r.requesterName ?? "member"}.` });
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
          subtitle="Approve to grant the access immediately, or deny with a note."
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
                      {LEVEL_LABEL[r.level]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Requested {fmtWhen(r.requestedAt)}</p>
                  {r.note && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">“{r.note}”</p>
                  )}

                  <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-end">
                    <div>
                      <Label htmlFor={`grant-${r.id}`}>Grant level</Label>
                      <select
                        id={`grant-${r.id}`}
                        value={levels[r.id] ?? r.level}
                        disabled={busy}
                        onChange={(e) =>
                          setLevels((p) => ({ ...p, [r.id]: e.target.value as AccessRequestLevel }))
                        }
                        className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                      >
                        {REQUEST_LEVELS.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:flex-1">
                      <Label htmlFor={`deny-${r.id}`}>Deny note (optional)</Label>
                      <Input
                        id={`deny-${r.id}`}
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                        placeholder="Reason for denial"
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
                      <Button
                        size="sm"
                        variant="danger"
                        startIcon={<XCircle className="size-4" />}
                        disabled={busy}
                        onClick={() => deny(r)}
                      >
                        Deny
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

/* ─────────────────────────── Authentication tab ─────────────────────────── */

function AuthenticationTab({ tenant }: { tenant: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "ok" | "error"; msg?: string }>({
    kind: "idle",
  });
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const reload = useCallback(() => {
    api
      .listInvitations(tenant)
      .then((r) => setInvitations(r.invitations ?? []))
      .catch(() => setInvitations([]));
  }, [tenant]);

  useEffect(() => reload(), [reload]);

  async function send() {
    if (!email.trim()) return;
    setStatus({ kind: "sending" });
    try {
      await api.invite(tenant, { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() });
      setStatus({ kind: "ok", msg: `Invitation sent to ${email.trim()}.` });
      setFirstName("");
      setLastName("");
      setEmail("");
      reload();
    } catch (err) {
      setStatus({ kind: "error", msg: getAuthErrorMessage(err) });
    }
  }

  async function revoke(id: string) {
    try {
      await api.revokeInvitation(tenant, id);
      reload();
    } catch {
      reload();
    }
  }

  return (
    <div className="space-y-6">
      <section className={card}>
        <SectionHeader
          icon={UserPlus}
          title="Invite a teammate"
          subtitle="They'll get an email with a link to set their password. Add them to this organization from the Authorization tab once they've accepted."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <Label htmlFor="inv-first">First name</Label>
            <Input id="inv-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ada" />
          </div>
          <div>
            <Label htmlFor="inv-last">Last name</Label>
            <Input id="inv-last" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Lovelace" />
          </div>
          <div>
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ada@company.com"
            />
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-5 dark:border-gray-800">
          <Button
            size="sm"
            startIcon={<Send className="size-4" />}
            disabled={!email.trim() || status.kind === "sending"}
            onClick={send}
          >
            {status.kind === "sending" ? "Sending…" : "Send invite"}
          </Button>
          {status.kind === "ok" && <span className="text-sm text-success-600 dark:text-success-400">{status.msg}</span>}
          {status.kind === "error" && <span className="text-sm text-error-500">{status.msg}</span>}
        </div>
      </section>

      <section className={card}>
        <SectionHeader icon={Clock} title="Pending invitations" />
        {invitations.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No invitations yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{inv.email}</p>
                  <p className="text-xs text-gray-400">{inv.state ?? "pending"}</p>
                </div>
                {inv.state === "pending" && (
                  <button
                    onClick={() => revoke(inv.id)}
                    className="flex items-center gap-1.5 text-sm text-error-500 hover:text-error-600"
                  >
                    <Trash2 className="size-3.5" />
                    Revoke
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

/* ─────────────────────────── Authorization tab ──────────────────────────── */

function MemberRow({
  tenant,
  member,
  groups,
  capabilities,
  onChanged,
  currentUserId,
  refreshSession,
}: {
  tenant: string;
  member: OrgMember;
  groups: OrgGroup[];
  capabilities: CapabilityCatalogItem[];
  onChanged: () => void;
  currentUserId: string;
  refreshSession: (opts?: { fresh?: boolean }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [grants, setGrants] = useState<Record<string, string>>({});

  const loadGrants = useCallback(() => {
    api
      .getUserCapabilities(tenant, member.id)
      .then((list: CapabilityGrant[]) =>
        setGrants(Object.fromEntries(list.map((g) => [g.capabilityCode, g.level]))),
      )
      .catch(() => setGrants({}));
  }, [tenant, member.id]);

  useEffect(() => {
    if (open) loadGrants();
  }, [open, loadGrants]);

  async function run(fn: () => Promise<unknown>, reloadGrants = false) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      if (reloadGrants) loadGrants();
      else onChanged();
      // When the change is to the signed-in user themselves, refresh their session
      // (bypassing the cache) so the new access reflects immediately — no re-login.
      if (member.id === currentUserId) await refreshSession({ fresh: true });
    } catch (e) {
      setErr(getAuthErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const inGroup = (gid: string) => member.candidateGroups.includes(gid);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <MemberAvatar member={member} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{fullName(member)}</p>
            {member.email && <p className="truncate text-xs text-gray-400">{member.email}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {member.platform && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-400">
              Platform
            </span>
          )}
          {member.roles.tenantAdmin && member.roles.tenantAdmin !== "none" && (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/10">
              Owner
            </span>
          )}
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-5 border-t border-gray-100 px-4 py-4 dark:border-gray-800">
          {/* Roles */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Roles</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ROLE_ROWS.map(({ dim, role, label }) => (
                <div key={role} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  <LevelSelect
                    value={(member.roles[dim] as RoleLevel) ?? "none"}
                    disabled={busy}
                    onChange={(level) => run(() => api.setUserRole(tenant, member.id, role, level))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Groups */}
          {groups.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Groups</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const member_ = inGroup(g.id);
                  return (
                    <button
                      key={g.id}
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          member_
                            ? api.removeUserFromGroup(tenant, member.id, g.id)
                            : api.addUserToGroup(tenant, member.id, g.id),
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        member_
                          ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10"
                          : "border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700"
                      } disabled:opacity-50`}
                    >
                      {member_ ? "✓ " : "+ "}
                      {groupName(g.id, groups)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Capabilities */}
          {(() => {
            // Hide the company-sending EMAIL capability for members on a personal
            // email domain (gmail/yahoo/…) — they can't verify a business sender. Keep
            // it shown if already granted, so an admin can still revoke it.
            const personal = isPersonalEmail(member.email);
            const visibleCaps = capabilities.filter(
              (c) => c.code !== EMAIL || !personal || (grants[c.code] && grants[c.code] !== "none"),
            );
            if (visibleCaps.length === 0) return null;
            return (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Capabilities</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleCaps.map((c) => (
                    <div key={c.code} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        {c.name}
                        <TierBadge tier={c.tier} />
                      </span>
                      <LevelSelect
                        value={(grants[c.code] as RoleLevel) ?? "none"}
                        disabled={busy}
                        onChange={(level) =>
                          run(() => api.setUserCapability(tenant, member.id, c.code, level), true)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {err && <p className="text-sm text-error-500">{err}</p>}
        </div>
      )}
    </div>
  );
}

function AuthorizationTab({ tenant }: { tenant: string }) {
  const { session, refreshSession } = useAuth();
  const currentUserId = session?.userId ?? "";
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Platform (admin/support) accounts are auto-added to every tenant — hidden by
  // default so the owner sees their real teammates; a toggle reveals them.
  const [showPlatform, setShowPlatform] = useState(false);

  // Add member by email
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("tenant-user");
  const [addStatus, setAddStatus] = useState<{ kind: "idle" | "saving" | "ok" | "error"; msg?: string }>({
    kind: "idle",
  });

  // New group
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupStatus, setGroupStatus] = useState<{ kind: "idle" | "saving" | "error"; msg?: string }>({
    kind: "idle",
  });

  const reloadMembers = useCallback(() => {
    api
      .listOrgUsers(tenant)
      .then(setMembers)
      .catch((e) => setError(getAuthErrorMessage(e)));
  }, [tenant]);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.listOrgUsers(tenant), api.listGroups(tenant), api.listCapabilities(tenant)])
      .then(([m, g, c]) => {
        setMembers(m);
        setGroups(g);
        setCapabilities(Array.isArray(c) ? c : []);
      })
      .catch((e) => setError(getAuthErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [tenant]);

  async function addMember() {
    if (!addEmail.trim()) return;
    setAddStatus({ kind: "saving" });
    try {
      await api.addMember(tenant, { email: addEmail.trim(), role: addRole });
      setAddStatus({ kind: "ok", msg: `${addEmail.trim()} added.` });
      setAddEmail("");
      reloadMembers();
    } catch (err) {
      setAddStatus({ kind: "error", msg: getAuthErrorMessage(err) });
    }
  }

  async function createGroup() {
    if (!groupNameInput.trim()) return;
    setGroupStatus({ kind: "saving" });
    try {
      const g = await api.createGroup(tenant, groupNameInput.trim());
      setGroups((prev) => (prev.some((x) => x.id === g.id) ? prev : [...prev, g]));
      setGroupNameInput("");
      setGroupStatus({ kind: "idle" });
    } catch (err) {
      setGroupStatus({ kind: "error", msg: getAuthErrorMessage(err) });
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

      {/* Add user to organization */}
      <section className={card}>
        <SectionHeader
          icon={UserPlus}
          title="Add user to organization"
          subtitle="Add someone who already has a Lukeflow login (invite them first if they don't)."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:flex-1">
            <Label htmlFor="add-email">Email</Label>
            <Input
              id="add-email"
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="ada@company.com"
            />
          </div>
          <div>
            <Label htmlFor="add-role">Role</Label>
            <select
              id="add-role"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="tenant-user">Member</option>
              <option value="process-operator">Process operator</option>
              <option value="task-worker">Task worker</option>
              <option value="tenant-admin">Org owner</option>
            </select>
          </div>
          <Button
            size="sm"
            startIcon={<UserPlus className="size-4" />}
            disabled={!addEmail.trim() || addStatus.kind === "saving"}
            onClick={addMember}
          >
            {addStatus.kind === "saving" ? "Adding…" : "Add"}
          </Button>
        </div>
        {addStatus.kind === "ok" && (
          <p className="mt-3 text-sm text-success-600 dark:text-success-400">{addStatus.msg}</p>
        )}
        {addStatus.kind === "error" && <p className="mt-3 text-sm text-error-500">{addStatus.msg}</p>}
      </section>

      {/* Members */}
      {(() => {
        const platformCount = members.filter((m) => m.platform).length;
        const visible = showPlatform ? members : members.filter((m) => !m.platform);
        return (
          <section className={card}>
            <SectionHeader
              icon={Users}
              title={
                <>
                  Members <span className="text-sm font-normal text-gray-400">({visible.length})</span>
                </>
              }
              right={
                platformCount > 0 ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showPlatform}
                      onChange={(e) => setShowPlatform(e.target.checked)}
                      className="size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900"
                    />
                    Show platform accounts ({platformCount})
                  </label>
                ) : undefined
              }
            />
            {visible.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No members yet.</p>
            ) : (
              <div className="space-y-2">
                {visible.map((m) => (
                  <MemberRow
                    key={m.id}
                    tenant={tenant}
                    member={m}
                    groups={groups}
                    capabilities={capabilities}
                    onChanged={reloadMembers}
                    currentUserId={currentUserId}
                    refreshSession={refreshSession}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {/* Groups */}
      <section className={card}>
        <SectionHeader
          icon={UsersRound}
          title="Groups"
          subtitle="Candidate groups for routing tasks. Assign members to groups above."
        />
        <div className="mb-4 flex flex-wrap gap-2">
          {groups.length === 0 ? (
            <span className="text-sm text-gray-400">No groups yet.</span>
          ) : (
            groups.map((g) => (
              <span
                key={g.id}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
              >
                {g.name}
              </span>
            ))
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:flex-1">
            <Label htmlFor="group-name">New group name</Label>
            <Input
              id="group-name"
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              placeholder="Sales"
            />
          </div>
          <Button
            size="sm"
            startIcon={<UsersRound className="size-4" />}
            disabled={!groupNameInput.trim() || groupStatus.kind === "saving"}
            onClick={createGroup}
          >
            {groupStatus.kind === "saving" ? "Creating…" : "Create group"}
          </Button>
        </div>
        {groupStatus.kind === "error" && <p className="mt-3 text-sm text-error-500">{groupStatus.msg}</p>}
      </section>
    </div>
  );
}

/* ───────────────────────────────── Page ─────────────────────────────────── */

type SectionId = "my-access" | "approve" | "members" | "invitations";

type Section = { id: SectionId; label: string; icon: LucideIcon; ownerOnly: boolean };

const SECTIONS: Section[] = [
  { id: "my-access", label: "Manage My Access", icon: KeyRound, ownerOnly: false },
  { id: "approve", label: "Approve Requests", icon: Inbox, ownerOnly: true },
  { id: "members", label: "Members", icon: Users, ownerOnly: true },
  { id: "invitations", label: "Invitations", icon: UserPlus, ownerOnly: true },
];

export default function AccessManagement() {
  const { session } = useAuth();
  const [section, setSection] = useState<SectionId>("my-access");
  const [catalog, setCatalog] = useState<CapabilityCatalogItem[]>([]);

  const tenant = session?.tenant ?? null;
  const isOwner = !!session?.tenantAdmin;

  // Non-owners only ever see "Manage My Access". Owners get the full rail.
  const sections = SECTIONS.filter((s) => !s.ownerOnly || isOwner);

  // If a non-owner somehow lands on an owner-only section (e.g. role changed),
  // snap back to the always-available "Manage My Access".
  useEffect(() => {
    if (!sections.some((s) => s.id === section)) setSection("my-access");
  }, [sections, section]);

  // Catalog is used to label/tier the "My access" capabilities. It's a best-effort
  // read — non-owners may not be allowed to list it, in which case we fall back to
  // showing the raw capability codes without a tier.
  useEffect(() => {
    if (!tenant) return;
    let active = true;
    api
      .listCapabilities(tenant)
      .then((c) => active && setCatalog(Array.isArray(c) ? c : []))
      .catch(() => active && setCatalog([]));
    return () => {
      active = false;
    };
  }, [tenant]);

  return (
    <>
      <PageMeta
        title="Access | Lukeflow"
        description="Manage your access, approve requests, and administer your organization."
      />

      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Access</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage your own access and request more. Owners can approve requests, manage members, and
              send invitations.
            </p>
          </div>
        </div>

        {!tenant ? (
          <div className={card}>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Join or create an organization to manage access.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Left internal sub-sidebar */}
            <nav className="shrink-0 lg:w-56">
              <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
                {sections.map((s) => {
                  const active = section === s.id;
                  return (
                    <li key={s.id} className="shrink-0">
                      <button
                        onClick={() => setSection(s.id)}
                        className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                          active
                            ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                            : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        }`}
                      >
                        <s.icon className="size-4 shrink-0" />
                        {s.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Content pane */}
            <div className="min-w-0 flex-1">
              {section === "my-access" && (
                <ManageMyAccessSection
                  tenant={tenant}
                  capabilities={session?.capabilities ?? {}}
                  catalog={catalog}
                />
              )}
              {section === "approve" && isOwner && <ApproveRequestsSection tenant={tenant} />}
              {section === "members" && isOwner && <AuthorizationTab tenant={tenant} />}
              {section === "invitations" && isOwner && <AuthenticationTab tenant={tenant} />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
