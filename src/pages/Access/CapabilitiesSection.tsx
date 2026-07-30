/**
 * Capabilities — the entitlement dimension of access, one capability at a time.
 *
 * "Who can publish forms?" is the question this screen answers, and the one the Members screen
 * can't: there, an owner has to open every person in turn. Pick a capability, see everyone's
 * level on it, change any of them, and read exactly what each level allows.
 *
 * Grants are fetched per member because core-engine only exposes
 * GET /api/org/users/{id}/capabilities — there is no bulk read. That's one request per member
 * on mount (then instant for every capability, since a member's response carries all of them);
 * a bulk endpoint would be the natural backend follow-up if orgs get large.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../lib/authApi";
import type { CapabilityCatalogItem, CapabilityGrant, OrgGroupManager, OrgMember } from "../../lib/authApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import LukeExplains from "../../components/access/LukeExplains";
import { explainGrant } from "../../lib/lukeExplains";
import {
  EMAIL,
  GRANTABLE_LEVELS,
  LEVEL_HINT,
  LEVEL_LABEL,
  toLevel,
  type CapabilityLevel,
} from "../../lib/capabilities";
import { isPersonalEmail } from "../../lib/emailDomains";
import Label from "../../components/form/Label";
import Button from "../../components/ui/button/Button";
import {
  card,
  CapabilityLevelSelect,
  isExternallyManaged,
  LevelBadge,
  MemberAvatar,
  memberLabel,
  SectionHeader,
  SourceBadge,
  TierBadge,
  useAccessMutation,
} from "./shared";

/** grants[userId][capabilityCode] — the whole org's entitlements, loaded once. */
type GrantMatrix = Record<string, Record<string, CapabilityGrant>>;

function GrantRow({
  tenant,
  member,
  capability,
  grant,
  currentUserId,
  refreshSession,
  onChanged,
}: {
  tenant: string;
  member: OrgMember;
  capability: CapabilityCatalogItem;
  grant: CapabilityGrant | undefined;
  currentUserId: string;
  refreshSession: (opts?: { fresh?: boolean }) => Promise<void>;
  onChanged: (userId: string) => void;
}) {
  const { run, busy, err } = useAccessMutation({ memberId: member.id, currentUserId, refreshSession });
  const level = toLevel(grant?.level);
  const external = isExternallyManaged(grant);
  // The company-sending EMAIL capability can't be verified for a personal email domain —
  // keep it visible only when already granted, so an owner can still revoke it.
  const blocked = capability.code === EMAIL && isPersonalEmail(member.email) && level === "none";

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
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <LevelBadge level={level} />
            <SourceBadge of={grant} />
          </div>
        </td>
        <td className="py-3 pl-3 text-right">
          {blocked ? (
            <span className="text-xs text-gray-400">Personal email domain</span>
          ) : (
            <CapabilityLevelSelect
              label={`${capability.name} level for ${memberLabel(member)}`}
              value={level}
              disabled={busy || external}
              onChange={(next) =>
                run(
                  () => api.setUserCapability(tenant, member.id, capability.code, next),
                  () => onChanged(member.id),
                )
              }
            />
          )}
        </td>
      </tr>
      {(err || external) && (
        <tr>
          <td colSpan={3} className="pb-3 text-xs">
            {err && <span className="text-error-500">{err}</span>}
            {external && !err && (
              <span className="text-gray-400">
                Managed by your identity provider — change it there, or the next sync will undo it here.
              </span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Who approves access to this capability.
 *
 * These people receive the approval task when someone requests the capability — core-engine
 * routes it to the `capowner:<tenant>:<CODE>` group. Leaving it empty is a valid choice, not an
 * unfinished one: requests then fall back to the org owners, which is what every org gets by
 * default. Saying so here stops an admin assigning owners "just in case" and accidentally
 * narrowing who can approve.
 */
function ResourceOwners({
  tenant,
  capability,
  members,
}: {
  tenant: string;
  capability: CapabilityCatalogItem;
  members: OrgMember[];
}) {
  const [owners, setOwners] = useState<OrgGroupManager[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api
      .listCapabilityOwners(tenant, capability.code)
      .then(setOwners)
      .catch(() => setOwners([]));
  }, [tenant, capability.code]);

  useEffect(() => reload(), [reload]);

  const ownerIds = new Set(owners.map((o) => o.id));
  const candidates = members.filter((m) => !m.platform && !ownerIds.has(m.id));

  // Keep the picker on a member who can actually be added.
  useEffect(() => {
    if (candidates.length === 0) {
      if (pick) setPick("");
      return;
    }
    if (!candidates.some((m) => m.id === pick)) setPick(candidates[0]!.id);
  }, [candidates, pick]);

  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      reload();
    } catch (e) {
      setError(getAuthErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card}>
      <SectionHeader
        icon={ShieldCheck}
        title={`Who approves ${capability.name} requests`}
        subtitle={
          owners.length === 0
            ? "No resource owners assigned — requests go to your org owners."
            : "Requests for this capability are routed to these people for approval."
        }
      />

      {owners.length > 0 && (
        <ul className="mb-4 divide-y divide-gray-100 dark:divide-gray-800">
          {owners.map((o) => {
            const label = [o.firstName, o.lastName].filter(Boolean).join(" ") || o.id;
            return (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-gray-700 dark:text-gray-200">{label}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => mutate(() => api.removeCapabilityOwner(tenant, capability.code, o.id))}
                  className="text-sm text-error-500 hover:text-error-600 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:flex-1">
          <Label htmlFor={`owner-${capability.code}`}>Add a resource owner</Label>
          <select
            id={`owner-${capability.code}`}
            value={pick}
            disabled={busy || candidates.length === 0}
            onChange={(e) => setPick(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            {candidates.length === 0 ? (
              <option value="">Everyone is already an owner</option>
            ) : (
              candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberLabel(m)}
                </option>
              ))
            )}
          </select>
        </div>
        <Button
          size="sm"
          disabled={busy || !pick}
          onClick={() => mutate(() => api.addCapabilityOwner(tenant, capability.code, pick))}
        >
          Add
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-error-500">{error}</p>}
    </section>
  );
}

export default function CapabilitiesSection({ tenant }: { tenant: string }) {
  const { session, refreshSession } = useAuth();
  const currentUserId = session?.userId ?? "";
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [catalog, setCatalog] = useState<CapabilityCatalogItem[]>([]);
  const [matrix, setMatrix] = useState<GrantMatrix>({});
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPlatform, setShowPlatform] = useState(false);

  /** Reload one member's grants after a change (cheaper than refetching the org). */
  const reloadMember = useCallback(
    (userId: string) => {
      api
        .getUserCapabilities(tenant, userId)
        .then((list) =>
          setMatrix((prev) => ({
            ...prev,
            [userId]: Object.fromEntries(list.map((g) => [g.capabilityCode, g])),
          })),
        )
        .catch(() => {
          /* a failed refresh leaves the previous value — the mutation itself already reported */
        });
    },
    [tenant],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.listOrgUsers(tenant), api.listCapabilities(tenant)])
      .then(async ([m, c]) => {
        if (!active) return;
        setMembers(m);
        setCatalog(Array.isArray(c) ? c : []);
        const grants = await Promise.all(
          m.map((mem) =>
            api
              .getUserCapabilities(tenant, mem.id)
              .then((list) => [mem.id, Object.fromEntries(list.map((g) => [g.capabilityCode, g]))] as const)
              .catch(() => [mem.id, {}] as const),
          ),
        );
        if (active) setMatrix(Object.fromEntries(grants));
      })
      .catch((e) => active && setError(getAuthErrorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tenant]);

  // Keep a valid capability selected as the catalog resolves.
  useEffect(() => {
    if (catalog.length === 0) return;
    if (!catalog.some((c) => c.code === code)) setCode(catalog[0]!.code);
  }, [catalog, code]);

  const selected = catalog.find((c) => c.code === code);

  const visible = useMemo(
    () => (showPlatform ? members : members.filter((m) => !m.platform)),
    [members, showPlatform],
  );

  /** How many members hold each level of the selected capability — the at-a-glance answer. */
  const tally = useMemo(() => {
    const t: Record<CapabilityLevel, number> = { none: 0, read: 0, contributor: 0, "read-write": 0 };
    for (const m of visible) t[toLevel(matrix[m.id]?.[code]?.level)] += 1;
    return t;
  }, [visible, matrix, code]);

  if (loading) {
    return <div className="flex h-[40vh] items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  const platformCount = members.filter((m) => m.platform).length;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <section className={card}>
        <SectionHeader
          icon={Layers}
          title="Capabilities"
          subtitle="Pick a capability to see and change who can use it, and at what level."
        />
        {catalog.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No capabilities are available to this organization yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {catalog.map((c) => {
                const active = c.code === code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCode(c.code)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {c.name}
                    <TierBadge tier={c.tier} />
                  </button>
                );
              })}
            </div>

            {selected?.description && (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{selected.description}</p>
            )}

            {/* Level legend — the same three levels, explained once, in plain language. */}
            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {GRANTABLE_LEVELS.map((l) => (
                <div
                  key={l}
                  className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                >
                  <dt className="flex items-center gap-2">
                    <LevelBadge level={l} />
                    <span className="text-xs text-gray-400">{tally[l]} member{tally[l] === 1 ? "" : "s"}</span>
                  </dt>
                  <dd className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">{LEVEL_HINT[l]}</dd>
                </div>
              ))}
            </dl>

            {/* Honest about the current state: a contributor CAN edit (canWrite includes them), but
                the product screens still gate their privileged controls on that same flag, so those
                buttons are visible and the server refuses them. Better an owner reads this here than
                discovers it from a confused member. Delete this note once each screen moves
                publish/retire/purge onto canPublish/canDelete. */}
            <p className="mt-3 text-xs text-gray-400">
              A contributor can create and edit right away. Publishing, retiring and purging are
              refused by the API — but the product screens still show those buttons today, so they
              will error rather than being hidden.
            </p>

            {selected && (
              <LukeExplains
                className="mt-5"
                title={`LukeExplains — ${LEVEL_LABEL["read-write"]} on ${selected.name}`}
                collapsible
                defaultOpen={false}
                explanation={explainGrant({
                  code: selected.code,
                  name: selected.name,
                  level: "read-write",
                  audience: "admin",
                  subject: "A member with this level",
                })}
              />
            )}
          </>
        )}
      </section>

      {selected && (
        <ResourceOwners tenant={tenant} capability={selected} members={members} />
      )}

      {selected && (
        <section className={card}>
          <SectionHeader
            icon={Users}
            title={
              <>
                Who can use {selected.name}{" "}
                <span className="text-sm font-normal text-gray-400">({visible.length})</span>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr>
                    <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Member
                    </th>
                    <th className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Current
                    </th>
                    <th className="pb-2 pl-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Change to
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => (
                    <GrantRow
                      key={m.id}
                      tenant={tenant}
                      member={m}
                      capability={selected}
                      grant={matrix[m.id]?.[selected.code]}
                      currentUserId={currentUserId}
                      refreshSession={refreshSession}
                      onChanged={reloadMember}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
