import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../lib/authApi";
import type {
  CapabilityCatalogItem,
  CapabilityGrant,
  Invitation,
  OrgGroup,
  OrgMember,
  RoleLevel,
} from "../../lib/authApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import PageMeta from "../../components/common/PageMeta";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import {
  EMAIL,
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

/**
 * "My access" — the signed-in user's own effective capabilities (from the session)
 * joined with the catalog for friendly names and pricing tiers. Read-only; visible
 * to every member, not just owners.
 */
function MyAccessCard({
  capabilities,
  catalog,
}: {
  capabilities: Record<string, string>;
  catalog: CapabilityCatalogItem[];
}) {
  const codes = Object.keys(capabilities);
  const meta = (code: string) => catalog.find((c) => c.code === code);

  return (
    <section className={card}>
      <h2 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">My access</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        The capabilities granted to you in this organization.
      </p>
      {codes.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          You don't have any capabilities granted yet. Ask an org owner to grant access.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {codes.map((code) => {
            const raw = capabilities[code];
            const level: CapabilityLevel =
              raw === "read" || raw === "read-write" ? raw : "none";
            const m = meta(code);
            return (
              <li key={code} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {m?.name ?? code}
                  </span>
                  <TierBadge tier={m?.tier} />
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_BADGE[level]}`}>
                  {LEVEL_LABEL[level]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
        <h2 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">Invite a teammate</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          They'll get an email with a link to set their password. Add them to this organization from the
          Authorization tab once they've accepted.
        </p>
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
          <Button size="sm" disabled={!email.trim() || status.kind === "sending"} onClick={send}>
            {status.kind === "sending" ? "Sending…" : "Send invite"}
          </Button>
          {status.kind === "ok" && <span className="text-sm text-success-600 dark:text-success-400">{status.msg}</span>}
          {status.kind === "error" && <span className="text-sm text-error-500">{status.msg}</span>}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">Pending invitations</h2>
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
                    className="text-sm text-error-500 hover:text-error-600"
                  >
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
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{fullName(member)}</p>
          {member.email && <p className="truncate text-xs text-gray-400">{member.email}</p>}
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
        <h2 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">Add user to organization</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Add someone who already has a Lukeflow login (invite them first if they don't).
        </p>
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
          <Button size="sm" disabled={!addEmail.trim() || addStatus.kind === "saving"} onClick={addMember}>
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
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Members <span className="text-sm font-normal text-gray-400">({visible.length})</span>
              </h2>
              {platformCount > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={showPlatform}
                    onChange={(e) => setShowPlatform(e.target.checked)}
                    className="size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900"
                  />
                  Show platform accounts ({platformCount})
                </label>
              )}
            </div>
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
        <h2 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">Groups</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Candidate groups for routing tasks. Assign members to groups above.
        </p>
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
          <Button size="sm" disabled={!groupNameInput.trim() || groupStatus.kind === "saving"} onClick={createGroup}>
            {groupStatus.kind === "saving" ? "Creating…" : "Create group"}
          </Button>
        </div>
        {groupStatus.kind === "error" && <p className="mt-3 text-sm text-error-500">{groupStatus.msg}</p>}
      </section>
    </div>
  );
}

/* ───────────────────────────────── Page ─────────────────────────────────── */

export default function AccessManagement() {
  const { session } = useAuth();
  const [tab, setTab] = useState<"auth" | "authz">("auth");
  const [catalog, setCatalog] = useState<CapabilityCatalogItem[]>([]);

  const tenant = session?.tenant ?? null;

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
        title="Authentication & Authorization | Lukeflow"
        description="Manage who can sign in and what they can do in your organization."
      />

      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            Authentication &amp; Authorization
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Invite teammates, add them to your organization, and manage roles, groups, and capabilities.
          </p>
        </div>

        {/* Everyone sees their own access; only owners get the management tabs below. */}
        {session && tenant && (
          <div className="mb-6">
            <MyAccessCard capabilities={session.capabilities ?? {}} catalog={catalog} />
          </div>
        )}

        {!session?.tenantAdmin || !tenant ? (
          <div className={card}>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Only organization owners can manage authentication and authorization.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-700">
              {[
                { id: "auth" as const, label: "Authentication" },
                { id: "authz" as const, label: "Authorization" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                    tab === t.id
                      ? "border-brand-500 text-brand-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "auth" ? <AuthenticationTab tenant={tenant} /> : <AuthorizationTab tenant={tenant} />}
          </>
        )}
      </div>
    </>
  );
}
