import { useState } from "react";
import { useNavigate } from "react-router";
import { ChevronsUpDown, Check } from "lucide-react";
import { Dropdown } from "../components/ui/dropdown/Dropdown";
import { useAuth } from "../context/AuthContext";
import { useSidebar } from "../context/SidebarContext";

/**
 * The active organization (tenant), shown under the logo. For users in more than one org it's a
 * dropdown that switches the active tenant (re-scopes the whole app); for a single-org user it's
 * just a static label. The name comes from `session.tenantNames` — falls back to the opaque
 * tenant id if an older backend hasn't supplied names yet.
 */
export default function SidebarTenantSwitcher() {
  const { session, switchTenant } = useAuth();
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const expanded = isExpanded || isHovered || isMobileOpen;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const tenant = session?.tenant ?? null;
  if (!tenant) return null; // unprovisioned user (no org yet) — nothing to show

  const tenants = session?.tenants ?? [];
  const names = session?.tenantNames ?? {};
  const nameOf = (id: string) => names[id] || id;
  const current = nameOf(tenant);
  const multi = tenants.length > 1;
  const initialOf = (id: string) => (nameOf(id).trim()[0] ?? "?").toUpperCase();

  const select = async (id: string) => {
    setOpen(false);
    if (id === tenant || busy) return;
    setBusy(true);
    try {
      await switchTenant(id);
      // The previous page may reference a resource scoped to the old tenant — land on the
      // dashboard, which is tenant-agnostic, and let its data reload for the new tenant.
      navigate("/");
    } catch (e) {
      // Membership is server-verified; a failure here means the tenant became unavailable.
      // Stay put rather than navigating into a broken state.
      console.error("Failed to switch organization", e);
    } finally {
      setBusy(false);
    }
  };

  const badge = (id: string, size: "sm" | "md") => (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg bg-brand-500 font-semibold text-white ${
        size === "md" ? "size-9 text-sm" : "size-6 text-[11px]"
      }`}
    >
      {initialOf(id)}
    </span>
  );

  const menu = (
    <Dropdown
      isOpen={open}
      onClose={() => setOpen(false)}
      className={`top-full z-50 flex max-h-[60vh] flex-col overflow-y-auto rounded-2xl p-2 ${
        expanded ? "left-0" : "left-0 w-[220px]"
      }`}
    >
      <span className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        Switch organization
      </span>
      {tenants.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => void select(id)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-gray-100 dark:hover:bg-white/5"
        >
          {badge(id, "sm")}
          <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">{nameOf(id)}</span>
          {id === tenant && <Check className="size-4 shrink-0 text-brand-500" />}
        </button>
      ))}
    </Dropdown>
  );

  // Collapsed icon rail: just the org badge (title = name). Multi-org users can still open the menu.
  if (!expanded) {
    return (
      <div className="relative flex justify-center py-3">
        {multi ? (
          <button type="button" onClick={() => setOpen((v) => !v)} disabled={busy} title={current} className="dropdown-toggle" aria-label={`Organization: ${current}. Switch organization`}>
            {badge(tenant, "md")}
          </button>
        ) : (
          <span title={current} aria-label={`Organization: ${current}`}>{badge(tenant, "md")}</span>
        )}
        {multi && menu}
      </div>
    );
  }

  // Expanded: badge + org name, with a switch affordance when there's more than one.
  return (
    <div className="relative py-3">
      {multi ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          title={current}
          className="dropdown-toggle flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-gray-100 dark:hover:bg-white/5"
        >
          {badge(tenant, "md")}
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">Organization</span>
            <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">{busy ? "Switching…" : current}</span>
          </span>
          <ChevronsUpDown className={`size-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <div className="flex w-full items-center gap-2.5 px-2 py-2" title={current}>
          {badge(tenant, "md")}
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">Organization</span>
            <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">{current}</span>
          </span>
        </div>
      )}
      {multi && menu}
    </div>
  );
}
