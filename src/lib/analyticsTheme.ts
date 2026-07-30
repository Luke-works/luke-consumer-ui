// Chart palette + Nivo theme for the analytics dashboard, in the app's own brand tokens.
//
// The two series colors were VALIDATED against the surfaces these charts actually render on
// (the card background, not a generic white/black), for both modes:
//
//   light  #465fff brand-500 + #fb6514 orange-500  on #ffffff   → all six checks PASS
//   dark   #465fff brand-500 + #ec4a0a orange-600  on #171f2e   → all six checks PASS
//
// Dark is SELECTED, not an automatic flip: orange-500 sits at OKLCH L 0.689, outside the dark
// band (0.48–0.67), so dark steps down to orange-600. Blue is in band for both, so it does not
// move. Re-run the validator (dataviz skill) against these surfaces before changing a hex.
//
// #171f2e is the effective dark card colour: the card is `dark:bg-white/[0.03]` composited over
// the gray-900 (#101828) page plane — validating against #101828 would measure a surface that is
// never actually behind a chart.

export type ChartPalette = {
  /** Counts — the default sequential hue for "how many". */
  series1: string;
  /** A second, different measure family (duration), so it can't be misread as more counts. */
  series2: string;
  surface: string;
  grid: string;
  axis: string;
  text: string;
  tooltipBg: string;
  tooltipText: string;
};

const LIGHT: ChartPalette = {
  series1: "#465fff", // brand-500
  series2: "#fb6514", // orange-500
  surface: "#ffffff",
  grid: "#e4e7ec", // gray-200 — hairline, one step off surface
  axis: "#e4e7ec",
  text: "#667085", // gray-500 — recessive axis ink
  tooltipBg: "#ffffff",
  tooltipText: "#344054", // gray-700
};

const DARK: ChartPalette = {
  series1: "#465fff", // brand-500 — in band on the dark surface too
  series2: "#ec4a0a", // orange-600 — stepped down for the dark band
  surface: "#171f2e",
  grid: "#1d2939", // gray-800
  axis: "#1d2939",
  text: "#98a2b3", // gray-400
  tooltipBg: "#101828", // gray-900
  tooltipText: "#e4e7ec", // gray-200
};

export const chartPalette = (theme: "light" | "dark"): ChartPalette =>
  theme === "dark" ? DARK : LIGHT;

/**
 * Nivo theme: recessive chrome so the data carries the ink. Gridlines are hairline and SOLID
 * (never dashed), axis text sits in muted ink rather than the series color.
 */
export function nivoTheme(p: ChartPalette) {
  return {
    text: { fill: p.text, fontSize: 11, fontFamily: "inherit" },
    axis: {
      domain: { line: { stroke: p.axis, strokeWidth: 1 } },
      ticks: {
        line: { stroke: p.axis, strokeWidth: 1 },
        text: { fill: p.text, fontSize: 11 },
      },
      legend: { text: { fill: p.text, fontSize: 11 } },
    },
    grid: { line: { stroke: p.grid, strokeWidth: 1 } },
    tooltip: {
      container: {
        background: p.tooltipBg,
        color: p.tooltipText,
        fontSize: 12,
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(16,24,40,0.16)",
      },
    },
  };
}

/**
 * Integer tick values for a COUNT axis. A linear scale over a max of 2 happily ticks 0.2, 0.4,
 * 0.6 … which reads as "1.8 submissions" — a quantity that cannot exist. Ticks (and the
 * gridlines drawn from them) are therefore whole numbers only.
 */
export function integerTicks(max: number): number[] {
  const top = Math.max(1, Math.ceil(max));
  const step = Math.max(1, Math.ceil(top / 5));
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  if (out[out.length - 1] !== top) out.push(top);
  return out;
}

/**
 * Bar padding that keeps marks thin (~24px) instead of letting two categories each fill half the
 * card. Nivo has no max-thickness prop — padding is a FRACTION of the band — so this converts the
 * target thickness into that fraction using the card's approximate inner width. An approximation
 * is fine here: the only failure mode of a stale width is a slightly wider or thinner bar, never
 * a wrong value, and it is clamped so it can't collapse the mark to a hairline.
 */
export function barPadding(categories: number, innerWidthPx: number): number {
  if (categories <= 0) return 0.35;
  const band = innerWidthPx / categories;
  return Math.min(0.9, Math.max(0.35, 1 - 24 / band));
}

/** Approximate inner plot widths, for {@link barPadding}. */
export const CARD_WIDTH = { half: 460, full: 1030 } as const;

/**
 * Shared Nivo options per mark type, carrying the mark spec: 4px rounded data-ends on bars, a
 * 2px line with 8px markers ringed in the surface color so they stay legible where they cross,
 * and an area fill as a ~10% wash rather than a saturated block. Bar padding is what separates
 * touching bars — a gap in the surface, never a stroke drawn around the mark.
 */
export function barOptions(p: ChartPalette, color: string, horizontal = false) {
  return {
    colors: [color],
    theme: nivoTheme(p),
    borderRadius: 4,
    padding: 0.35,
    enableLabel: false, // the axis + tooltip carry values; a number on every bar goes unread
    enableGridX: horizontal,
    enableGridY: !horizontal,
    layout: horizontal ? ("horizontal" as const) : ("vertical" as const),
    animate: false, // deterministic for the visual baselines; the data is not a transition story
  };
}

export function areaOptions(p: ChartPalette, color: string) {
  return {
    colors: [color],
    theme: nivoTheme(p),
    lineWidth: 2,
    pointSize: 8,
    pointBorderWidth: 2,
    pointColor: color,
    pointBorderColor: p.surface, // the 2px surface ring
    enableArea: true,
    areaOpacity: 0.1,
    enableGridX: false,
    // Anchor the scale at 0. With `auto` both ends, a series whose values are all equal (three
    // quiet days of one submission each) collapses the domain to a single value — the line lands
    // on the axis, the fill has no height, and the chart reads as "zero" instead of "steady".
    yScale: { type: "linear" as const, min: 0, max: "auto" as const, stacked: false },
    useMesh: true, // crosshair + tooltip anywhere on the plot, not only exactly on a point
    curve: "monotoneX" as const,
    animate: false,
  };
}
