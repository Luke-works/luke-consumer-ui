import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { ChevronDown, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSidebar } from "../context/SidebarContext";

/**
 * The active organization (tenant), shown in the header next to the logo — name only, no icon.
 * For users in more than one org it's a dropdown that switches the active tenant (re-scopes the
 * whole app); a single-org user just sees the name. Names come from `session.tenantNames`,
 * falling back to the opaque tenant id if an older backend hasn't supplied them yet.
 *
 * Only rendered when the sidebar is expanded (the collapsed rail is logo-only). The menu is
 * portaled to <body> with fixed positioning so the header's `overflow-hidden` can't clip it.
 */
export default function SidebarTenantSwitcher() {
  const { session, switchTenant } = useAuth();
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const expanded = isExpanded || isHovered || isMobileOpen;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Close the menu on any outside interaction / escape / scroll / resize.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tenant = session?.tenant ?? null;
  if (!tenant || !expanded) return null; // unprovisioned, or the collapsed icon rail

  const tenants = session?.tenants ?? [];
  const names = session?.tenantNames ?? {};
  const nameOf = (id: string) => names[id] || id;
  const current = nameOf(tenant);
  const multi = tenants.length > 1;

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 200) });
    setOpen((v) => !v);
  };

  const select = async (id: string) => {
    setOpen(false);
    if (id === tenant || busy) return;
    setBusy(true);
    try {
      await switchTenant(id);
      // Land on the (tenant-agnostic) dashboard so no stale tenant-scoped page is left open.
      navigate("/");
    } catch (e) {
      console.error("Failed to switch organization", e);
    } finally {
      setBusy(false);
    }
  };

  const nameText = (
    <span className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{busy ? "Switching…" : current}</span>
  );

  if (!multi) {
    return (
      <div className="ml-auto flex min-w-0 items-center pl-3" title={current}>
        {nameText}
      </div>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        disabled={busy}
        title={current}
        aria-haspopup="menu"
        aria-expanded={open}
        className="ml-auto flex min-w-0 items-center gap-1 rounded-lg py-1 pl-2 pr-1.5 hover:bg-gray-100 dark:hover:bg-white/5"
      >
        {nameText}
        <ChevronDown className={`size-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              role="menu"
              style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
              className="fixed z-[61] flex max-h-[60vh] flex-col overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
            >
              <span className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">Switch organization</span>
              {tenants.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  onClick={() => void select(id)}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">{nameOf(id)}</span>
                  {id === tenant && <Check className="size-4 shrink-0 text-brand-500" />}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
