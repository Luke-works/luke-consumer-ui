import { test } from "@playwright/test";
import { VIEWPORTS, stubBackend, expectHealthy, expectNoOverflow, expectRendered } from "./support/harness";
import { SCREENS } from "./support/screens";

// Every screen in the app, loaded hermetically and checked at each device width for:
//   • no crash (the app error boundary never appears),
//   • it actually rendered (past the Suspense loader, non-blank),
//   • a screen-specific landmark where we have a stable one,
//   • no horizontal overflow (the responsive guarantee).
// The inventory itself lives in support/screens.ts, shared with the visual suite.

// No video: this is a render matrix, not a flow. Each test is one page load, so a recording shows
// a single frame of nothing happening — the screenshot-on-failure already says everything. It is
// also 120 of the suite's tests, so recording here is where the runtime cost actually lands.
test.use({ video: "off" });

for (const s of SCREENS) {
  test.describe(s.name, () => {
    for (const vp of VIEWPORTS) {
      test(vp.name, async ({ page }) => {
        await stubBackend(page, s.opts);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(s.path);
        if (s.afterGoto) await s.afterGoto(page);
        await expectRendered(page);
        await expectHealthy(page);
        if (s.ready) await s.ready(page);
        await expectNoOverflow(page);
      });
    }
  });
}
