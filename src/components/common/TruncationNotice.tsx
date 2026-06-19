/**
 * Shows an explicit "showing the most recent N of M" banner when a list was
 * fetched with a hard server cap and more rows exist than were returned — so a
 * capped list no longer SILENTLY hides data (#26). Renders nothing when the full
 * set was returned (`shown >= total`).
 */
export default function TruncationNotice({
  shown,
  total,
  noun = "results",
}: {
  shown: number;
  total: number;
  noun?: string;
}) {
  if (shown >= total) return null;
  return (
    <div
      role="status"
      className="mb-3 rounded-lg border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
    >
      Showing the most recent {shown} of {total} {noun} — refine by form or status to narrow the list.
    </div>
  );
}
