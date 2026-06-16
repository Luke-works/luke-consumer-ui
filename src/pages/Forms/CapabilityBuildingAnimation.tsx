// Sleek "form materializing" loader shown briefly while LukeBuilds builds the
// form: skeleton field rows (label + input) rise in, staggered, under a
// brand-tinted shimmer sweep. Pure CSS — no assets, theme-agnostic.

const ROWS = [{ label: "38%" }, { label: "54%" }, { label: "30%" }];

export default function CapabilityBuildingAnimation() {
  return (
    <div className="w-48" role="img" aria-label="Building your form">
      <style>{`
        @keyframes lt-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
        @keyframes lt-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        .lt-bar {
          background-image: linear-gradient(90deg,
            rgba(99,102,241,.13) 25%, rgba(139,92,246,.45) 50%, rgba(99,102,241,.13) 75%);
          background-size: 200% 100%;
          animation: lt-shimmer 1.5s linear infinite;
        }
        .lt-row { animation: lt-rise .55s cubic-bezier(.22,1,.36,1) both; }
      `}</style>
      <div className="space-y-3.5">
        {ROWS.map((r, i) => (
          <div key={i} className="lt-row space-y-1.5" style={{ animationDelay: `${i * 0.16}s` }}>
            <div className="lt-bar h-2 rounded-full" style={{ width: r.label }} />
            <div className="lt-bar h-7 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
