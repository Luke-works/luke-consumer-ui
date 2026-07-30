import { test, expect, type Page } from "@playwright/test";

/**
 * The FORM SETTINGS dialog must contain its own scrolling.
 *
 * The Activity trail rendered straight out of the bottom of the dialog, and the unit tests could not
 * see it: jsdom has no layout engine, so `scrollHeight`, `clientHeight` and overflow behaviour are all
 * meaningless there. Only a real browser can answer "does this actually scroll", which is why this
 * lives in Playwright rather than beside the component.
 *
 * What it pins, on the tab with the most content:
 *   - the dialog never grows past the viewport,
 *   - the panel genuinely overflows (so there is something to scroll),
 *   - scrolling it MOVES,
 *   - the last entry is reachable, and the header/tabs/footer stay put while it scrolls.
 */
const GATEWAY = "http://localhost:9999";
const FORM_ID = "11111111-1111-1111-1111-111111111111";

const SCHEMA = JSON.stringify({
  root: ["name"],
  entities: { name: { id: "name", type: "textField", attributes: { key: "name", label: "Name" } } },
});
const SESSION = {
  userId: "u1", provisioned: true, operator: false, tenantAdmin: true, tenant: "t1", tenants: ["t1"],
  roles: {}, candidateGroups: [], capabilities: { FORMS: "read-write" }, can: ["FORMS"],
};
const USER = { id: "u1", email: "gm@example.com", firstName: "GM", lastName: "User", profilePictureUrl: null, emailVerified: true };

/** A long trail, like a form that has actually been worked on — the case that overflowed. */
const AUDIT = Array.from({ length: 40 }, (_, i) => ({
  action: ["checked_out", "checked_in", "tested", "published"][i % 4],
  detail: `v${40 - i}`,
  actor: "workos:u1",
  actorName: "Gowtham Murududdi",
  // Spread across several days so the day groupings (and their sticky headings) are exercised too.
  at: new Date(Date.UTC(2026, 6, 30 - Math.floor(i / 6), 9, i % 60)).toISOString(),
}));

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function openSettings(page: Page) {
  await page.route(`${GATEWAY}/**`, (route) => route.fulfill(json([])));
  await page.route(`${GATEWAY}/auth/refresh`, (route) =>
    route.fulfill(json({ accessToken: "x", sid: "s", user: USER, session: SESSION })));
  await page.route(`${GATEWAY}/session*`, (route) => route.fulfill(json(SESSION)));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}`, (route) =>
    route.fulfill(json({
      id: FORM_ID, code: "FM-KOHV-30JUL26", name: "TCC contact Us form", status: "PUBLISHED",
      publishedVersion: 7, draftSchema: SCHEMA, showBranding: true, brandingLocked: true,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
    })));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}/versions`, (route) =>
    route.fulfill(json([{ version: 7, schema: SCHEMA, checkedInAt: "2026-06-01T00:00:00Z", signedOffAt: "2026-06-01T00:00:00Z" }])));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}/audit`, (route) => route.fulfill(json(AUDIT)));

  await page.goto(`/forms/${FORM_ID}`);
  await page.getByRole("button", { name: /form settings/i }).click();
  await expect(page.getByRole("heading", { name: /form settings/i })).toBeVisible();
}

test.describe("form settings dialog", () => {
  test("the Activity trail scrolls inside the dialog instead of growing out of it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSettings(page);
    await page.getByRole("tab", { name: /activity/i }).click();

    const dialog = page.getByRole("dialog");
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("listitem").first()).toBeVisible();

    // 1. The dialog itself stays within the viewport — this is what visibly broke.
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(800);

    // 2. There is genuinely more content than fits...
    const metrics = await panel.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(metrics.scroll, "40 events should overflow the panel").toBeGreaterThan(metrics.client);

    // 3. ...and scrolling it actually moves. This is the assertion jsdom could never make: the
    //    original bug was a flex child that could not shrink below its content, so the panel had
    //    nothing to scroll — it had grown to fit instead.
    const moved = await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    expect(moved, "the panel must scroll").toBeGreaterThan(0);

    // 4. The last entry is reachable, and the chrome did not scroll away with it.
    await expect(panel.getByRole("listitem").last()).toBeInViewport();
    await expect(page.getByRole("tab", { name: /activity/i })).toBeInViewport();
    await expect(page.getByRole("button", { name: /^close$|^cancel$/i })).toBeInViewport();
  });

  test("every tab keeps its content inside the dialog", async ({ page }) => {
    // The overflow was reported on Activity, but nothing about the cause was Activity-specific — any
    // tab taller than the dialog would have done the same. Checked at a SHORT viewport, where even
    // the ordinary tabs have more content than fits.
    await page.setViewportSize({ width: 1280, height: 620 });
    await openSettings(page);

    for (const tab of [/general/i, /submission/i, /legal/i, /appearance/i, /activity/i]) {
      await page.getByRole("tab", { name: tab }).click();
      const dialog = page.getByRole("dialog");
      const box = (await dialog.boundingBox())!;
      expect(box.y, `dialog top is off-screen on ${tab}`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `dialog bottom overflows the viewport on ${tab}`).toBeLessThanOrEqual(620);

      // Nothing may paint outside the card: the panel is the only thing allowed to scroll.
      const spill = await dialog.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(spill, `content spills out of the card on ${tab}`).toBe(0);
    }
  });
});
