/**
 * WHERE AND WHEN THE VISUAL BASELINES RUN — the single rule, shared by `visual.spec.ts` and
 * `visual-states.spec.ts` so the two can never disagree.
 *
 * Two conditions, for two different reasons:
 *
 * 1. **Linux only.** Font rasterisation and subpixel antialiasing are platform-specific, so a
 *    baseline shot on macOS can never match the ubuntu runner. On any other platform the suites skip
 *    rather than failing with a wall of diffs that mean nothing.
 *
 * 2. **Parity branches only** (`develop` / `qa` / `prod`) — plus the manual baseline job. A committed
 *    baseline is a binary a human has to re-approve on every intended redesign, and running that gate
 *    on feature branches made every legitimate UI change a two-step dance: push, watch the visual
 *    suite fail, dispatch the baseline workflow, download an artifact, commit PNGs, push again. The
 *    gate's real job is to catch UNINTENDED drift reaching a deployed environment, and the parity
 *    branches are exactly where that matters. Feature PRs still run the full functional + render +
 *    overflow matrix, which is what catches "this page is broken"; visual catches "this page looks
 *    different", and that question is worth asking once the change is heading for an environment.
 *
 * Set `VISUAL=1` to run them locally on Linux (or in the Playwright Docker image — see README).
 */

/** Where a baseline is meaningful — see (1) above. */
export const BASELINE_PLATFORM = "linux";

const onBaselinePlatform = process.platform === BASELINE_PLATFORM;
const requested = process.env.VISUAL === "1";

/** True only when a pixel comparison is both meaningful and asked for. */
export const VISUAL_ENABLED = onBaselinePlatform && requested;

/** Why the suite skipped, so a skipped run is never mistaken for a passing one. */
export const VISUAL_SKIP_REASON = !onBaselinePlatform
  ? `visual baselines are ${BASELINE_PLATFORM}-only (font rendering is platform-specific) — run via the Playwright Docker image`
  : "visual baselines run on the parity branches (develop/qa/prod) and the manual baseline job — set VISUAL=1 to run them here";

/**
 * HOW STRICTLY A SCREENSHOT IS COMPARED — one definition, used by both suites.
 *
 * The previous policy was `maxDiffPixelRatio: 0.01`, justified as "tolerate antialiasing noise;
 * a real layout break moves far more than 1% of pixels". Both halves of that were wrong, and the
 * combination made the suites blind to content changes:
 *
 * 1. **A ratio is the wrong knob for antialiasing.** AA noise is *many pixels differing by a tiny
 *    amount*, which is exactly what Playwright's per-pixel {@link threshold} (YIQ colour distance)
 *    exists for. `maxDiffPixelRatio` instead permits some share of pixels to differ by ANY amount —
 *    a budget for arbitrary content, not for noise.
 *
 * 2. **A ratio scales with the image, so sensitivity depends on viewport.** 1% of a 390x844 phone
 *    shot is ~3.3k pixels; 1% of a 1280x800 laptop shot is ~10.2k. The identical text edit trips
 *    the threshold on phone and passes on laptop.
 *
 * That is not hypothetical. Renaming the inbox heading (2026-07-31) regenerated
 * `form-inbox-phone-*` but left `form-inbox-laptop-*` committed with the OLD wording, still green —
 * passing by tolerance rather than by matching. A laptop-only copy change was invisible.
 *
 * So: keep `threshold` for genuine AA noise, and make the budget ABSOLUTE so a laptop shot is no
 * more forgiving than a phone one. The value is calibrated against the measured noise floor of
 * this runner — see the PR that introduced it — not guessed.
 */
export const SCREENSHOT_OPTIONS = {
  fullPage: true, // below-the-fold layout is exactly what the other checks can't see
  animations: "disabled",
  /**
   * Per-pixel colour distance below which two pixels count as equal. This is the antialiasing
   * allowance; Playwright's default is 0.2 and it is the right tool for the job.
   */
  threshold: 0.2,
  /**
   * ABSOLUTE cap on pixels that differ by more than `threshold` — deliberately not a ratio, so a
   * tall page or a wide viewport does not buy extra blindness.
   *
   * MEASURED, not guessed. With this pinned to 0 and every baseline freshly shot, all 202 shots
   * compared exactly equal on the ubuntu runner: the noise floor here is genuinely zero. 20 is
   * pure headroom for a stray antialiased edge — roughly 0.002% of a laptop shot, and an order of
   * magnitude below the ink of a single character, so no real copy change can hide under it.
   *
   * If this ever starts flaking, the honest fix is to find the nondeterminism (an unhidden caret,
   * a live timestamp, a random avatar), not to raise the number: every pixel added here is a
   * pixel of the product nobody is looking at.
   */
  maxDiffPixels: 20,
} as const;
