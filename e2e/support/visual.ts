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
