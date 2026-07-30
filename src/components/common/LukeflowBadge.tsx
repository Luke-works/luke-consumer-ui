// The "Developed at Lukeflow" attribution badge shown under a form on our PUBLIC surfaces — the
// embed iframe (/embed/:token) and the outbound recipient page (/respond/:token).
//
// Whether it renders is decided by the SERVER (see BrandingPolicy in core-engine): free-plan tenants
// always show it, paying tenants may switch it off per form. This component only draws it.
//
// Deliberately dependency-free (no lucide, no UI-lib, no external image): both bundles it ships in are
// single-file and loaded on third-party sites, so the mark is inline SVG and the styling is plain
// Tailwind. Nothing here can trigger a network request from a customer's page.

/** Which public surface the badge is on — kept in the outbound link so marketing can attribute it. */
export type BadgeSurface = "embed" | "respond" | "portal";

const HREF = "https://lukeflow.com";

export default function LukeflowBadge({
  surface,
  className = "",
}: {
  surface: BadgeSurface;
  className?: string;
}) {
  const href = `${HREF}/?utm_source=lukeflow-form&utm_medium=${surface}`;
  return (
    <div className={`mt-5 flex justify-center ${className}`}>
      {/* Two details worth keeping: the pill carries ONE accessible name (the inner spans are
          aria-hidden, so a screen reader doesn't stutter "Developed at / Lukeflow"), and its padding is
          logical (ps-/pe-, not pl-/pr-) so the tighter side stays next to the mark when a form renders
          RTL — which the form engine supports. */}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Developed at Lukeflow — opens lukeflow.com in a new tab"
        title="Developed at Lukeflow"
        className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/70 py-1.5 ps-2 pe-3 shadow-theme-xs backdrop-blur-sm transition duration-200 hover:-translate-y-px hover:border-brand-200 hover:bg-white hover:shadow-theme-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-brand-500/40 dark:hover:bg-white/[0.08]"
      >
        <span
          aria-hidden="true"
          className="flex size-4 items-center justify-center rounded-[5px] bg-gradient-to-br from-brand-400 to-brand-600 shadow-[0_1px_2px_rgba(70,95,255,0.35)] transition duration-200 group-hover:shadow-[0_2px_6px_rgba(70,95,255,0.45)]"
        >
          {/* The Lukeflow flow-mark (node → line → node), from public/images/logo/logo-icon.svg. */}
          <svg viewBox="0 0 32 32" width="11" height="11" fill="none" aria-hidden="true">
            <path
              d="M10 9V20C10 21.1046 10.8954 22 12 22H23"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="9" r="3.4" fill="white" />
            <circle cx="23" cy="22" r="3.4" fill="white" />
          </svg>
        </span>
        <span aria-hidden="true" className="text-[11px] font-normal leading-none text-gray-400 dark:text-gray-500">
          Developed at
        </span>
        <span
          aria-hidden="true"
          className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-[11px] font-semibold leading-none text-transparent dark:from-brand-300 dark:to-brand-500"
        >
          Lukeflow
        </span>
      </a>
    </div>
  );
}
