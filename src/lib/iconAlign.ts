/**
 * OPTICAL ICON ALIGNMENT — one constant, used everywhere an icon sits beside a label.
 *
 * `items-center` aligns an icon to the text's font box. But a label's visible ink sits in the UPPER part
 * of that box, because the descender space below the baseline is empty for most words ("Embed",
 * "Preview", "Save", "Settings" — none have descenders). So a *correctly centred* icon reads as hanging
 * below the word it belongs to. It is small — measured across the form builder's toolbar, every icon's
 * ink centre sat 2.4–2.6px below its label's — but it is consistent, which is exactly what makes a row
 * of buttons look like the icon is in one place and the text in another.
 *
 * Applied, the same buttons come in under 0.4px.
 *
 * <p><b>In `em`</b> so it scales with the button's font size (≈2px at `text-sm`, ≈1.9px at `text-xs`)
 * rather than needing a different value per size.
 *
 * <p><b>Only where an icon accompanies TEXT.</b> An icon-only button (a square gear, a close button)
 * must NOT have it — with nothing to align to, the nudge just leaves the glyph sitting high in its own
 * box. There is no CSS selector that can tell the two apart (`:only-child` counts elements, so an
 * `<svg/> + text node` button still matches), which is why this is opted into per component rather than
 * applied globally.
 *
 * <p>`leading-none` does not fix this at the root — verified: the inline box comes from the font's
 * metrics, not from `line-height`.
 */
export const ICON_LABEL_NUDGE = "[&>svg]:-translate-y-[0.16em]";

/** Same correction for a wrapper element around the icon (e.g. Button's `<span>` icon slots). */
export const ICON_LABEL_NUDGE_SELF = "-translate-y-[0.16em]";
