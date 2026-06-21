// Lukeflow brand logo — the "Lu" element box + "keflow" wordmark, rendered as
// markup (not an image asset) so it scales with font-size, inherits dark mode, and
// needs no asset pipeline. Size it by setting a text-size on `className`
// (e.g. `text-[26px]`); pass `iconOnly` for the compact "Lu" box alone (e.g. a
// collapsed sidebar rail). Padding/rounding are in `em` so the box always tracks
// the wordmark. Brand box uses the shared `brand-500` token (#465fff).
export default function LukeflowLogo({
  iconOnly = false,
  className = "",
}: {
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center font-bold leading-none tracking-tight ${className}`}
      aria-label="Lukeflow"
      title="Lukeflow"
    >
      <span className="rounded-[0.22em] bg-brand-500 px-[0.3em] py-[0.14em] text-white">
        Lu
      </span>
      {!iconOnly && (
        <span className="ml-[0.07em] text-gray-900 dark:text-white">keflow</span>
      )}
    </span>
  );
}
