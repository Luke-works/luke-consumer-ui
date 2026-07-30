/**
 * Members — the PERSON-centric view of access: who is in the organization, and everything
 * one person holds (roles, groups, capabilities) in a single expandable row. The
 * entitlement-centric counterparts — one screen per access dimension — live in
 * RolesSection / AttributesSection / CapabilitiesSection.
 */
import { useCallback, useEffect, useState } from "react";
import { UserPlus, Users, UsersRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../lib/authApi";
import type { CapabilityCatalogItem, CapabilityGrant, OrgGroup, OrgMember, RoleLevel } from "../../lib/authApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import LukeExplains from "../../components/access/LukeExplains";
import { EMAIL, toLevel, type CapabilityLevel } from "../../lib/capabilities";
import { explainChange, roleAsExplanation } from "../../lib/lukeExplains";
import { isPersonalEmail } from "../../lib/emailDomains";
import {
  card,
  CapabilityLevelSelect,
  fullName,
  groupName,
  isExternallyManaged,
  MemberAvatar,
  ROLE_ROWS,
  RoleLevelSelect,
  SectionHeader,
  SourceBadge,
  TierBadge,
  useAccessMutation,
} from "./shared";

/**
 * One member, expandable into their roles, groups and capability grants.
 *
 * Every level control carries a LukeExplains preview of the change it would make, so an owner
 * sees what a level means BEFORE they pick it rather than discovering it from a support ticket.
 */
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
  const [grants, setGrants] = useState<Record<string, CapabilityGrant>>({});
  /** Capability code whose LukeExplains preview is expanded. */
  const [explaining, setExplaining] = useState<string | null>(null);
  const { run, busy, err } = useAccessMutation({ memberId: member.id, currentUserId, refreshSession });

  const loadGrants = useCallback(() => {
    api
      .getUserCapabilities(tenant, member.id)
      .then((list: CapabilityGrant[]) =>
        setGrants(Object.fromEntries(list.map((g) => [g.capabilityCode, g]))),
      )
      .catch(() => setGrants({}));
  }, [tenant, member.id]);

  useEffect(() => {
    if (open) loadGrants();
  }, [open, loadGrants]);

  const inGroup = (gid: string) => member.candidateGroups.includes(gid);
  const levelOf = (code: string): CapabilityLevel => toLevel(grants[code]?.level);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
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
          <SourceBadge of={member} />
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
                  <RoleLevelSelect
                    label={`${label} level for ${fullName(member)}`}
                    value={(member.roles[dim] as RoleLevel) ?? "none"}
                    disabled={busy || isExternallyManaged(member)}
                    onChange={(level) =>
                      run(() => api.setUserRole(tenant, member.id, role, level), onChanged)
                    }
                  />
                </div>
              ))}
            </div>
            {member.roles.tenantAdmin && member.roles.tenantAdmin !== "none" && (
              <LukeExplains
                className="mt-3"
                title="LukeExplains — this member is an org owner"
                collapsible
                defaultOpen={false}
                explanation={roleAsExplanation("tenant-admin", "Org owner")}
              />
            )}
          </div>

          {/* Groups */}
          {groups.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Groups</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const isMember = inGroup(g.id);
                  return (
                    <button
                      key={g.id}
                      disabled={busy}
                      aria-pressed={isMember}
                      onClick={() =>
                        run(
                          () =>
                            isMember
                              ? api.removeUserFromGroup(tenant, member.id, g.id)
                              : api.addUserToGroup(tenant, member.id, g.id),
                          onChanged,
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        isMember
                          ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10"
                          : "border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700"
                      } disabled:opacity-50`}
                    >
                      {isMember ? "✓ " : "+ "}
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
              (c) => c.code !== EMAIL || !personal || levelOf(c.code) !== "none",
            );
            if (visibleCaps.length === 0) return null;
            return (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Capabilities</p>
                <div className="space-y-2">
                  {visibleCaps.map((c) => {
                    const level = levelOf(c.code);
                    const external = isExternallyManaged(grants[c.code]);
                    return (
                      <div key={c.code}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            {c.name}
                            <TierBadge tier={c.tier} />
                            <SourceBadge of={grants[c.code]} />
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExplaining((p) => (p === c.code ? null : c.code))}
                              aria-expanded={explaining === c.code}
                              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                            >
                              {explaining === c.code ? "Hide" : "What does this mean?"}
                            </button>
                            <CapabilityLevelSelect
                              label={`${c.name} level for ${fullName(member)}`}
                              value={level}
                              disabled={busy || external}
                              onChange={(next) =>
                                run(
                                  () => api.setUserCapability(tenant, member.id, c.code, next),
                                  loadGrants,
                                )
                              }
                            />
                          </div>
                        </div>
                        {explaining === c.code && (
                          <LukeExplains
                            className="mt-2"
                            explanation={explainChange({
                              code: c.code,
                              name: c.name,
                              from: "none",
                              to: level,
                              audience: "admin",
                              subject: fullName(member),
                            })}
                          />
                        )}
                        {external && (
                          <p className="mt-1 text-xs text-gray-400">
                            Managed by your identity provider — change it there, or the next sync will
                            undo it here.
                          </p>
                        )}
                      </div>
                    );
                  })}
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

export default function MembersSection({ tenant }: { tenant: string }) {
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

      {/* Groups — created & managed in the dedicated Candidate Groups tab. Here we
          just surface what exists and let owners assign members via the pills above. */}
      <section className={card}>
        <SectionHeader
          icon={UsersRound}
          title="Candidate groups"
          subtitle="Assign members to groups using the group pills on each member above. Create, rename, delete groups and appoint group owners in the Candidate Groups tab."
        />
        <div className="flex flex-wrap gap-2">
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
      </section>
    </div>
  );
}
