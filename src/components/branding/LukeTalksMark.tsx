// Custom LukeTalks logo mark — a speech bubble with an AI spark (the "Talks" +
// intelligence idea). Inline SVG so it inherits `currentColor` and needs no asset
// pipeline; sized via className. To rebrand, swap the two paths below (or drop in
// an <img> with your own asset).
export default function LukeTalksMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* speech bubble */}
      <path
        d="M6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H11l-4 3.2V15H6.5A2.5 2.5 0 0 1 4 12.5v-7A2.5 2.5 0 0 1 6.5 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* 4-point AI spark */}
      <path
        d="M12 5.7l1.3 3.55 3.55 1.3-3.55 1.3-1.3 3.55-1.3-3.55L8.4 11.85l3.55-1.3z"
        fill="currentColor"
      />
    </svg>
  );
}
