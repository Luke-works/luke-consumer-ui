// Custom LukeTests logo mark — a lab flask with an AI spark (intelligent testing).
// Inline SVG so it inherits `currentColor` and needs no asset pipeline; sized via
// className. Sibling of LukeBuildsMark; swap the paths (or drop in an <img>) to rebrand.
export default function LukeTestsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* erlenmeyer flask */}
      <path
        d="M9 3h6M10 3v5.4L5.3 17.6A1.8 1.8 0 0 0 6.9 20.4h10.2a1.8 1.8 0 0 0 1.6-2.8L14 8.4V3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 4-point AI spark in the base */}
      <path d="M12 12.4l.85 2.25 2.25.85-2.25.85L12 19.6l-.85-2.25-2.25-.85 2.25-.85z" fill="currentColor" />
    </svg>
  );
}
