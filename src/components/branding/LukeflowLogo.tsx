// Lukeflow brand logo — a periodic-element-style "Lu" tile next to the "keflow"
// wordmark, rendered as markup (no image asset) so it follows dark mode and needs
// no asset pipeline. Sized by `size` (the tile's px edge); the symbol/wordmark/
// radius/gap derive from it so the lockup always stays in proportion. Pass
// `iconOnly` for the tile alone (e.g. a collapsed sidebar rail). Tile uses the
// shared `brand-500` token (#465fff).
export default function LukeflowLogo({
  iconOnly = false,
  size = 36,
  className = "",
}: {
  iconOnly?: boolean;
  size?: number;
  className?: string;
}) {
  const symbol = Math.round(size * 0.5); // "Lu" symbol
  const word = Math.round(size * 0.5); // "keflow" wordmark
  const radius = Math.round(size * 0.22);
  const gap = Math.round(size * 0.18);

  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ gap }}
      aria-label="Lukeflow"
      title="Lukeflow"
    >
      <span
        className="inline-flex shrink-0 items-center justify-center bg-brand-500 font-bold text-white"
        style={{ width: size, height: size, borderRadius: radius, fontSize: symbol, lineHeight: 1, letterSpacing: "-0.02em" }}
      >
        Lu
      </span>
      {!iconOnly && (
        <span
          className="font-bold tracking-tight text-gray-900 dark:text-white"
          style={{ fontSize: word, lineHeight: 1 }}
        >
          keflow
        </span>
      )}
    </span>
  );
}
