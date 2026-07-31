import { test, expect, type Page } from "@playwright/test";

/**
 * The EMBED dialog's allowed-websites editor is a CSS grid, and grid placement is exactly the kind of
 * thing jsdom cannot check — it has no layout engine, so every unit test passed while the editor was
 * visibly scrambled on screen.
 *
 * The bug: the third header cell used `sr-only`, which is `position:absolute`. An absolutely
 * positioned grid child occupies no cell, so the header claimed two columns instead of three and
 * every input after it auto-placed one column late — the Name box flew to the far right, the Website
 * box wrapped under "Name", and the delete button landed under "Website".
 *
 * These assertions are geometric on purpose. "The inputs exist" was already true when it was broken.
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

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function openEmbed(page: Page, allowed = "https://acme.com", names: Record<string, string> = { "https://acme.com": "Acme main site" }) {
  await page.route(`${GATEWAY}/**`, (route) => route.fulfill(json([])));
  await page.route(`${GATEWAY}/auth/refresh`, (route) =>
    route.fulfill(json({ accessToken: "x", sid: "s", user: USER, session: SESSION })));
  await page.route(`${GATEWAY}/session*`, (route) => route.fulfill(json(SESSION)));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}`, (route) =>
    route.fulfill(json({
      id: FORM_ID, code: "FM-KOHV-30JUL26", name: "TCC contact Us form", status: "PUBLISHED",
      kind: "INBOUND", submissionHandling: "COLLECT", publishedVersion: 7, draftSchema: SCHEMA,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
    })));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}/versions`, (route) =>
    route.fulfill(json([{ version: 7, schema: SCHEMA, checkedInAt: "2026-06-01T00:00:00Z", signedOffAt: "2026-06-01T00:00:00Z" }])));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}/embed-token`, (route) =>
    route.fulfill(json({ token: "tok_1", code: "FM-KOHV-30JUL26", allowedEmbedOrigins: allowed, embedOriginNames: names })));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}/embed-version`, (route) =>
    route.fulfill(json({ mode: "AUTO", pinnedVersion: null, publishedVersion: 7, servingVersion: 7, updateAvailable: false })));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}/embed-sites`, (route) => route.fulfill(json([])));

  await page.goto(`/forms/${FORM_ID}`);
  await page.getByRole("button", { name: /^embed$/i }).click();
  await expect(page.getByRole("heading", { name: /embed this form/i })).toBeVisible();
  await page.getByRole("tab", { name: /websites/i }).click();
}

/** Boxes for one row's three controls, left to right as the grid should place them. */
async function rowBoxes(page: Page, i: number) {
  const name = await page.getByLabel(`Website ${i} name`).boundingBox();
  const site = await page.getByLabel(`Website ${i} address`).boundingBox();
  const del = await page.getByRole("button", { name: `Remove website ${i}` }).boundingBox();
  expect(name, `row ${i} name box`).not.toBeNull();
  expect(site, `row ${i} address box`).not.toBeNull();
  expect(del, `row ${i} remove box`).not.toBeNull();
  return { name: name!, site: site!, del: del! };
}

test.describe("embed dialog — allowed websites editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("lays each row out as Name | Website | remove, on ONE line", async ({ page }) => {
    await openEmbed(page);
    const { name, site, del } = await rowBoxes(page, 1);

    // Left-to-right in that order. When the header stole a column, `name` sat to the RIGHT of both.
    expect(name.x + name.width, "Name must end before Website starts").toBeLessThanOrEqual(site.x + 1);
    expect(site.x + site.width, "Website must end before the remove button").toBeLessThanOrEqual(del.x + 1);

    // ...and all three share a row. The broken layout wrapped Website onto the next line, which a
    // left-to-right check alone would not have caught.
    expect(Math.abs(name.y - site.y), "Name and Website must be on the same line").toBeLessThan(8);
    expect(Math.abs(site.y - del.y), "remove must be on the same line as Website").toBeLessThan(8);
  });

  test("puts each input under its own column heading", async ({ page }) => {
    // The headings are the promise the row layout has to keep; the bug broke exactly this pairing.
    await openEmbed(page);
    const { name, site } = await rowBoxes(page, 1);
    // Scope to the dialog: the builder canvas behind it has its own "Name" field label.
    const panel = page.getByRole("tabpanel");
    const nameHead = (await panel.getByText("Name", { exact: true }).boundingBox())!;
    const siteHead = (await panel.getByText("Website", { exact: true }).boundingBox())!;

    expect(Math.abs(name.x - nameHead.x), "Name input must sit under the Name heading").toBeLessThan(4);
    expect(Math.abs(site.x - siteHead.x), "Website input must sit under the Website heading").toBeLessThan(4);
  });

  test("keeps the columns aligned after Add another", async ({ page }) => {
    await openEmbed(page);
    await page.getByRole("button", { name: /add another/i }).click();
    const first = await rowBoxes(page, 1);
    const second = await rowBoxes(page, 2);

    expect(second.name.x, "row 2 Name must line up with row 1").toBeCloseTo(first.name.x, 0);
    expect(second.site.x, "row 2 Website must line up with row 1").toBeCloseTo(first.site.x, 0);
    expect(second.name.y, "row 2 must be BELOW row 1").toBeGreaterThan(first.name.y);
  });

  test("shows the saved name beside its website, not adrift", async ({ page }) => {
    await openEmbed(page);
    await expect(page.getByLabel("Website 1 name")).toHaveValue("Acme main site");
    await expect(page.getByLabel("Website 1 address")).toHaveValue("https://acme.com");
  });

  test("nothing in the dialog spills outside the card", async ({ page }) => {
    await openEmbed(page);
    const dialog = page.getByRole("dialog");
    const spill = await dialog.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(spill, "content spills out of the embed card").toBe(0);
  });
});
