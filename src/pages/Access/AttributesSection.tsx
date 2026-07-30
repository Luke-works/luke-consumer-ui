/**
 * Attributes — who someone IS, as distinct from what they can do.
 *
 * Roles and capabilities are decisions Lukeflow makes. Attributes (department, title,
 * location, manager, cost centre) are facts a customer's own identity provider already owns,
 * and they arrive here through the directory-sync bridge rather than being typed in twice.
 * They are therefore rendered read-only, with the source named.
 *
 * IMPORTANT — this screen never invents data. core-engine does not yet return
 * `OrgMember.attributes`, so until a directory is connected and the backend forwards them,
 * every org sees the empty state below rather than a plausible-looking table of made-up
 * departments. When the field starts arriving, the table lights up with no further change here.
 */
import { useEffect, useMemo, useState } from "react";
import { Building2, IdCard } from "lucide-react";
import * as api from "../../lib/authApi";
import type { OrgMember } from "../../lib/authApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import { card, MemberAvatar, memberLabel, SectionHeader, SourceBadge } from "./shared";

/** "costCenter" / "cost_center" / "COST-CENTER" → "Cost center". */
function prettyKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Attributes a directory typically sends — shown in the empty state so admins know what to expect. */
const TYPICAL_ATTRIBUTES = ["Department", "Job title", "Location", "Manager", "Employee number", "Cost centre"];

export default function AttributesSection({ tenant }: { tenant: string }) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPlatform, setShowPlatform] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listOrgUsers(tenant)
      .then((m) => active && setMembers(m))
      .catch((e) => active && setError(getAuthErrorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tenant]);

  const visible = useMemo(
    () => (showPlatform ? members : members.filter((m) => !m.platform)),
    [members, showPlatform],
  );

  // The union of every attribute key any member carries — the directory decides the columns,
  // not us, so a provider that sends extra fields still renders correctly.
  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const m of visible) for (const k of Object.keys(m.attributes ?? {})) keys.add(k);
    return [...keys].sort();
  }, [visible]);

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
          icon={IdCard}
          title="Attributes"
          subtitle="Facts about each member — department, job title, location — as supplied by your identity provider."
        />

        {columns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center dark:border-gray-800">
            <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-white/[0.06]">
              <Building2 className="size-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
              No directory is sending attributes yet
            </p>
            <p className="mx-auto mt-1.5 max-w-lg text-sm text-gray-500 dark:text-gray-400">
              Connect your organization's identity provider — Okta, Microsoft Entra ID, Google
              Workspace and others — and the profile fields it already maintains appear here
              automatically for every member. Attributes stay owned by your provider: Lukeflow
              displays them, and never edits them.
            </p>
            <ul className="mx-auto mt-4 flex max-w-lg flex-wrap justify-center gap-2">
              {TYPICAL_ATTRIBUTES.map((a) => (
                <li
                  key={a}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
                >
                  {a}
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-4 max-w-lg text-xs text-gray-400">
              Attributes are display-only today. Defining your own attributes in Lukeflow, and
              using them as conditions on access, is not available yet — use Roles and
              Capabilities to decide access in the meantime.
            </p>
          </div>
        ) : (
          <>
            {platformCount > 0 && (
              <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={showPlatform}
                  onChange={(e) => setShowPlatform(e.target.checked)}
                  className="size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900"
                />
                Show platform accounts ({platformCount})
              </label>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr>
                    <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Member
                    </th>
                    {columns.map((c) => (
                      <th
                        key={c}
                        className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400"
                      >
                        {prettyKey(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <MemberAvatar member={m} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                              {memberLabel(m)}
                            </p>
                            {m.email && <p className="truncate text-xs text-gray-400">{m.email}</p>}
                          </div>
                          <SourceBadge of={m} />
                        </div>
                      </td>
                      {columns.map((c) => (
                        <td key={c} className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {m.attributes?.[c] || <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-gray-400">
              Read-only — these values are maintained in your identity provider and refresh on its
              next sync.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
