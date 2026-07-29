import { expect, test } from "@playwright/test";
import { stubBackend, expectHealthy, expectRendered, forceTheme } from "./support/harness";
import { SCREENS } from "./support/screens";

/**
 * VISUAL REGRESSION — a pixel baseline for every screen.
 *
 * The render matrix (screens.spec) proves each route mounts, isn't blank, and doesn't scroll
 * sideways. All three can hold while the page looks wrong: a toolbar that wrapped, a modal that
 * lost its padding, a dark-mode token that stopped resolving, a column that collapsed to zero
 * width. Nothing in the suite could see any of that. This can.
 *
 * WHY BOTH THEMES. Dark mode is a second full rendering of every surface, built from CSS custom
 * properties rather than the light values — so it fails independently and in ways nothing else in
 * the suite can see. A token that stops resolving, a hard-coded hex that never got a dark variant,
 * white-on-white text: all render, all pass every structural check, all are obvious in a pixel
 * diff. This is the single highest-yield axis to duplicate, which is why it is duplicated and the
 * viewport count is not.
 *
 * WHY TWO WIDTHS, NOT FOUR. The render matrix runs 4 viewports because overflow is cheap to
 * check. A baseline is a committed binary that a human must re-approve on every intended
 * redesign, so each extra width is a permanent tax on legitimate change. Phone (390) is where
 * layout actually breaks; laptop (1280) is where the product is really used. Tablet and desktop
 * are interpolations between them and have historically caught nothing the other two didn't.
 *
 * WHY BASELINES ARE LINUX-ONLY. Font rasterisation and subpixel antialiasing differ per OS, so a
 * macOS baseline can never match an ubuntu CI run — Playwright encodes this by suffixing snapshot
 * files with the platform. The committed baselines are generated in the Playwright Docker image
 * that matches CI (see e2e/README.md); on any other platform this suite skips rather than failing
 * with a wall of diffs that mean nothing.
 */

/** Where a baseline is meaningful. Everything else skips — see the note above. */
const BASELINE_PLATFORM = "linux";

const THEMES = ["light", "dark"] as const;

const VISUAL_VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 800 },
] as const;

// No video here. A visual failure is explained by the three images the report already gives you —
// expected, actual, and a highlighted diff — so a recording adds nothing but time, and these two
// files are 168 of the suite's 305 tests. Video stays on for the FUNCTIONAL specs, where the
// question is "what did it do" rather than "what does it look like".
test.use({ video: "off" });

test.describe("visual", () => {
  test.skip(
    process.platform !== BASELINE_PLATFORM,
    `visual baselines are ${BASELINE_PLATFORM}-only (font rendering is platform-specific) — run via the Playwright Docker image`,
  );

  for (const screen of SCREENS) {
    test.describe(screen.name, () => {
      for (const vp of VISUAL_VIEWPORTS) {
        for (const theme of THEMES) {
        test(`${vp.name}-${theme}`, async ({ page }) => {
          await forceTheme(page, theme);
          await stubBackend(page, screen.opts);
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(screen.path);
          if (screen.afterGoto) await screen.afterGoto(page);

          // Only shoot a page that genuinely rendered — a baseline of a crash or a loading
          // spinner would lock the broken state in as "correct" and pass forever after.
          await expectRendered(page);
          await expectHealthy(page);
          if (screen.ready) await screen.ready(page);

          // Webfonts swapping in after the shot is the classic source of phantom diffs.
          await page.evaluate(() => document.fonts.ready);

          await expect(page).toHaveScreenshot(`${screen.name}-${vp.name}-${theme}.png`, {
            fullPage: true, // below-the-fold layout is exactly what the other checks can't see
            animations: "disabled",
            // Tolerate antialiasing noise; a real layout break moves far more than 1% of pixels.
            maxDiffPixelRatio: 0.01,
          });
        });
        }
      }
    });
  }
});
