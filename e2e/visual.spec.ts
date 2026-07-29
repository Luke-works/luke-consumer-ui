import { expect, test } from "@playwright/test";
import { stubBackend, expectHealthy, expectRendered } from "./support/harness";
import { SCREENS } from "./support/screens";

/**
 * VISUAL REGRESSION — a pixel baseline for every screen.
 *
 * The render matrix (screens.spec) proves each route mounts, isn't blank, and doesn't scroll
 * sideways. All three can hold while the page looks wrong: a toolbar that wrapped, a modal that
 * lost its padding, a dark-mode token that stopped resolving, a column that collapsed to zero
 * width. Nothing in the suite could see any of that. This can.
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

const VISUAL_VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 800 },
] as const;

test.describe("visual", () => {
  test.skip(
    process.platform !== BASELINE_PLATFORM,
    `visual baselines are ${BASELINE_PLATFORM}-only (font rendering is platform-specific) — run via the Playwright Docker image`,
  );

  for (const screen of SCREENS) {
    test.describe(screen.name, () => {
      for (const vp of VISUAL_VIEWPORTS) {
        test(vp.name, async ({ page }) => {
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

          await expect(page).toHaveScreenshot(`${screen.name}-${vp.name}.png`, {
            fullPage: true, // below-the-fold layout is exactly what the other checks can't see
            animations: "disabled",
            // Tolerate antialiasing noise; a real layout break moves far more than 1% of pixels.
            maxDiffPixelRatio: 0.01,
          });
        });
      }
    });
  }
});
