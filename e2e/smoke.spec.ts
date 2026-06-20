import { test, expect } from "@playwright/test";

// Hermetic: stub the gateway (VITE_AUTH_API_URL = http://localhost:9999) so no real
// backend is needed (#25). Scoped to that HOST so it can't intercept the dev server's
// own module requests (e.g. src/components/auth/*).
const GATEWAY = "http://localhost:9999";

test.describe("consumer-ui smoke", () => {
  test("renders the sign-in form when logged out", async ({ page }) => {
    // Bootstrap session refresh fails → app stays on the public sign-in.
    await page.route(`${GATEWAY}/**`, (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/signin");
    await expect(page.getByPlaceholder("info@gmail.com")).toBeVisible();
    await expect(page.getByPlaceholder("Enter your password")).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("loads a public embed form (no backend)", async ({ page }) => {
    await page.route(`${GATEWAY}/**`, (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
    );
    // Specific embed route registered AFTER → Playwright checks last-first, so it wins.
    await page.route(`${GATEWAY}/api/public/embed/smoke-token`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: "SMOKE",
          title: "Smoke Form",
          version: 1,
          schema: JSON.stringify({ entities: {}, root: [] }),
        }),
      }),
    );

    await page.goto("/embed/smoke-token");
    // The embed loaded and rendered the authored title (not the terminal error state).
    await expect(page.getByRole("heading", { name: "Smoke Form" })).toBeVisible();
    await expect(page.getByRole("button", { name: /try again/i })).toHaveCount(0);
  });
});
