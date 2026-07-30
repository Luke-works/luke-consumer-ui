/**
 * Shared building blocks for the Access section — the chrome, badges, level pickers and the
 * one mutation helper every access surface uses. Extracted so the person-centric views
 * (Members) and the entitlement-centric views (Roles / Attributes / Capabilities) render and
 * mutate access identically instead of drifting apart.
 */
import { useCallback, useState, type ReactNode } from "react";
import { Building2, type LucideIcon } from "lucide-react";
import type { AccessProvenance, OrgGroup, OrgMember, RoleLevel } from "../../lib/authApi";
import {
  GRANTABLE_LEVELS,
  LEVEL_HINT,
  LEVEL_LABEL,
  TIER_BADGE,
  TIER_LABEL,
  toLevel,
  type CapabilityLevel,
} from "../../lib/capabilities";
import type { AccessRequestStatus } from "../../lib/accessRequestsApi";
import { getAuthErrorMessage } from "../../components/auth/authError";

export const card =
  "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";

/**
 * Editable role rows: dimension (as returned in member.roles) → the engine role group we PUT
 * to. Owner (tenant-admin) is guarded server-side so the last owner can't be removed. Ids
 * mirror core-engine RoleCatalog.
 */
export const ROLE_ROWS: { dim: keyof OrgMember["roles"]; role: string; label: string }[] = [
  { dim: "tenantAdmin", role: "tenant-admin", label: "Org owner" },
  { dim: "tenantUser", role: "tenant-user", label: "Member" },
  { dim: "processUser", role: "process-operator", label: "Process operator" },
  { dim: "taskUser", role: "task-worker", label: "Task worker" },
];

/** Modern section header: an icon badge + title (+ optional subtitle), with an
 *  optional right-aligned slot (e.g. a count, a toggle). */
export function SectionHeader({
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
export function MemberAvatar({ member }: { member: OrgMember }) {
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

const selectClass =
  "rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";

/**
 * Level picker for ROLES. Roles are a none/read/read-write dimension — `contributor` is a
 * capability level only (core-engine CapabilityLevel) and the role API would reject it, so it
 * is deliberately absent here.
 */
export function RoleLevelSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: RoleLevel;
  onChange: (v: RoleLevel) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as RoleLevel)}
      className={selectClass}
    >
      <option value="none">None</option>
      <option value="read">Read</option>
      <option value="read-write">Read &amp; write</option>
    </select>
  );
}

/** Level picker for CAPABILITY grants — the full set, including `contributor`. */
export function CapabilityLevelSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: CapabilityLevel;
  onChange: (v: CapabilityLevel) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={label}
      title={LEVEL_HINT[value]}
      onChange={(e) => onChange(e.target.value as CapabilityLevel)}
      className={selectClass}
    >
      <option value="none">No access</option>
      {GRANTABLE_LEVELS.map((l) => (
        <option key={l} value={l}>
          {LEVEL_LABEL[l]}
        </option>
      ))}
    </select>
  );
}

export const fullName = (m: OrgMember) =>
  [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || m.id;

/** Display label for a member: full name, else email, else id. */
export function memberLabel(m: OrgMember): string {
  const name = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return name || m.email || m.id;
}

export const groupName = (id: string, groups: OrgGroup[]) =>
  groups.find((g) => g.id === id)?.name ?? (id.split(":").slice(1).join(":") || id);

/** Pricing/availability tier chip (Free / Standard / Premium). */
export function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  const klass = TIER_BADGE[tier] ?? "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${klass}`}>
      {TIER_LABEL[tier] ?? tier}
    </span>
  );
}

/** Colour for a capability level chip. */
export const LEVEL_BADGE: Record<CapabilityLevel, string> = {
  none: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  read: "bg-blue-50 text-blue-600 dark:bg-blue-500/15",
  contributor: "bg-purple-50 text-purple-600 dark:bg-purple-500/15",
  "read-write": "bg-success-50 text-success-600 dark:bg-success-500/15",
};

/** Level chip for read-only displays. */
export function LevelBadge({ level }: { level: CapabilityLevel }) {
  return (
    <span
      title={LEVEL_HINT[level]}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_BADGE[level]}`}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

/**
 * Who owns a piece of access. Today the backend never stamps a source, so this renders
 * nothing at all rather than claiming "managed in Lukeflow" on data that simply has no
 * provenance yet. Once directory-sourced grants arrive it labels them and the surrounding
 * control is disabled — editing one here would be undone by the next sync.
 */
export function SourceBadge({ of }: { of: AccessProvenance | undefined }) {
  if (!of?.source || of.source === "LOCAL") return null;
  const name = of.sourceName?.trim() || "your identity provider";
  return (
    <span
      title={of.sourceRef ? `From ${name}: ${of.sourceRef}` : `Managed by ${name}`}
      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/10 dark:text-gray-400"
    >
      <Building2 className="size-3" aria-hidden="true" />
      {name}
    </span>
  );
}

/** True when an external system owns this access and Lukeflow must not edit it. */
export const isExternallyManaged = (of: AccessProvenance | undefined): boolean =>
  !!of?.managedExternally || (!!of?.source && of.source !== "LOCAL");

/** Colour + label for an access-request status chip. */
export const STATUS_BADGE: Record<AccessRequestStatus, { label: string; klass: string }> = {
  PENDING: { label: "Awaiting approval", klass: "bg-amber-50 text-amber-600 dark:bg-amber-500/15" },
  APPROVED: { label: "Approved", klass: "bg-success-50 text-success-600 dark:bg-success-500/15" },
  DENIED: { label: "Denied", klass: "bg-error-50 text-error-600 dark:bg-error-500/15" },
  CANCELLED: { label: "Cancelled", klass: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400" },
  // Not terminal: the request is back with the requester, waiting on them.
  RETURNED: { label: "Needs your attention", klass: "bg-purple-50 text-purple-600 dark:bg-purple-500/15" },
};

export function StatusBadge({ status }: { status: AccessRequestStatus }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.klass}`}>{s.label}</span>
  );
}

export const fmtWhen = (ms?: number) => (ms ? new Date(ms).toLocaleString() : "");

/** Read a member's current level for a capability out of a grants map. */
export const grantLevel = (grants: Record<string, string> | undefined, code: string): CapabilityLevel =>
  toLevel(grants?.[code]);

/**
 * Runs an access mutation with busy/error state, refreshing the caller's own session when the
 * change targets the signed-in user so new access takes effect without a re-login. Every
 * access surface mutates through this so the behaviour can't drift between them.
 */
export function useAccessMutation({
  memberId,
  currentUserId,
  refreshSession,
}: {
  memberId: string;
  currentUserId: string;
  refreshSession: (opts?: { fresh?: boolean }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = useCallback(
    async (fn: () => Promise<unknown>, after?: () => void) => {
      setBusy(true);
      setErr("");
      try {
        await fn();
        after?.();
        if (memberId === currentUserId) await refreshSession({ fresh: true });
      } catch (e) {
        setErr(getAuthErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [memberId, currentUserId, refreshSession],
  );

  return { run, busy, err };
}
