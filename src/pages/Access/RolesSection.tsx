/**
 * Roles — the RBAC dimension of access, on its own screen.
 *
 * Members answers "what does this person have?"; this answers "who has this role?", which is
 * the question an auditor or an owner doing a quarterly review actually asks. Roles are the
 * platform's coarse permissions (core-engine RoleCatalog) and are deliberately separate from
 * capabilities (what product areas someone can use) and attributes (who they are).
 */
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../lib/authApi";
import type { OrgMember, RoleLevel } from "../../lib/authApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import LukeExplains from "../../components/access/LukeExplains";
import { roleAsExplanation } from "../../lib/lukeExplains";
import {
  card,
  isExternallyManaged,
  MemberAvatar,
  memberLabel,
  ROLE_ROWS,
  RoleLevelSelect,
  SectionHeader,
  SourceBadge,
  useAccessMutation,
} from "./shared";

/** One member's row in the role matrix — every assignable role, inline. */
function RoleRow({
  tenant,
  member,
  currentUserId,
  refreshSession,
  onChanged,
}: {
  tenant: string;
  member: OrgMember;
  currentUserId: string;
  refreshSession: (opts?: { fresh?: boolean }) => Promise<void>;
  onChanged: () => void;
}) {
  const { run, busy, err } = useAccessMutation({ memberId: member.id, currentUserId, refreshSession });
  const external = isExternallyManaged(member);

  return (
    <>
      <tr className="border-t border-gray-100 dark:border-gray-800">
        <td className="py-3 pr-4">
          <div className="flex items-center gap-3">
            <MemberAvatar member={member} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {memberLabel(member)}
              </p>
              {member.email && <p className="truncate text-xs text-gray-400">{member.email}</p>}
            </div>
            <SourceBadge of={member} />
          </div>
        </td>
        {ROLE_ROWS.map(({ dim, role, label }) => (
          <td key={role} className="px-3 py-3">
            <RoleLevelSelect
              label={`${label} level for ${memberLabel(member)}`}
              value={(member.roles[dim] as RoleLevel) ?? "none"}
              disabled={busy || external}
              onChange={(level) => run(() => api.setUserRole(tenant, member.id, role, level), onChanged)}
            />
          </td>
        ))}
      </tr>
      {err && (
        <tr>
          <td colSpan={ROLE_ROWS.length + 1} className="pb-3 text-sm text-error-500">
            {err}
          </td>
        </tr>
      )}
    </>
  );
}

export default function RolesSection({ tenant }: { tenant: string }) {
  const { session, refreshSession } = useAuth();
  const currentUserId = session?.userId ?? "";
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPlatform, setShowPlatform] = useState(false);

  const reload = useCallback(
    () =>
      api
        .listOrgUsers(tenant)
        .then(setMembers)
        .catch((e) => setError(getAuthErrorMessage(e))),
    [tenant],
  );

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  if (loading) {
    return <div className="flex h-[40vh] items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  const platformCount = members.filter((m) => m.platform).length;
  const visible = showPlatform ? members : members.filter((m) => !m.platform);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {/* What the roles mean */}
      <section className={card}>
        <SectionHeader
          icon={ShieldCheck}
          title="What each role means"
          subtitle="Roles decide what someone can do on the platform itself. Capabilities decide which product areas they can use."
        />
        <div className="space-y-3">
          {ROLE_ROWS.map(({ role, label }) => (
            <LukeExplains
              key={role}
              title={`LukeExplains — ${label}`}
              collapsible
              defaultOpen={false}
              explanation={roleAsExplanation(role, label)}
            />
          ))}
        </div>
      </section>

      {/* Who holds what */}
      <section className={card}>
        <SectionHeader
          icon={Users}
          title={
            <>
              Role assignments <span className="text-sm font-normal text-gray-400">({visible.length})</span>
            </>
          }
          subtitle="Every member and the roles they hold. Changes apply immediately."
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr>
                  <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Member
                  </th>
                  {ROLE_ROWS.map(({ role, label }) => (
                    <th
                      key={role}
                      className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <RoleRow
                    key={m.id}
                    tenant={tenant}
                    member={m}
                    currentUserId={currentUserId}
                    refreshSession={refreshSession}
                    onChanged={reload}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
