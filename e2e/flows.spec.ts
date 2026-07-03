import { test, expect } from "@playwright/test";
import { GATEWAY, stubBackend, makeSession, USER, ok, expectNoOverflow } from "./support/harness";

// Deep per-screen functional flows layered on the screen-matrix backbone: real
// interactions (submit, open modal, expand row, open the mobile drawer), all
// hermetic. Where a flow is responsive, it also asserts no horizontal overflow.

const FORM_ID = "11111111-1111-1111-1111-111111111111";
const SCHEMA = JSON.stringify({
  root: ["name"],
  entities: { name: { id: "name", type: "textField", attributes: { key: "name", label: "Name", required: true } } },
});
const FORM_DEF = {
  id: FORM_ID, code: "CONTACT", name: "Contact us", kind: "INBOUND", status: "PUBLISHED",
  publishedVersion: 3, submissionHandling: "INBOX", draftSchema: SCHEMA,
  createdBy: "u1", createdByName: "GM User", updatedBy: "u1", updatedByName: "GM User",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
};
const VERSIONS = [{ version: 3, schema: SCHEMA, checkedInAt: "2026-06-01T00:00:00Z", signedOffAt: "2026-06-01T00:00:00Z" }];
const builderRoutes = {
  "/api/form-definitions/*": ok(FORM_DEF),
  "/api/form-definitions/*/versions": ok(VERSIONS),
};

test.describe("sign-in flow", () => {
  test("valid credentials sign in and leave the sign-in page", async ({ page }) => {
    await stubBackend(page, { loggedOut: true });
    // Login succeeds → a signed-in, provisioned session; the app then routes into itself.
    await page.route(`${GATEWAY}/auth/login`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accessToken: "tok", sid: "s", user: USER, session: makeSession() }) }));
    await page.route(`${GATEWAY}/session*`, ok(makeSession()));

    await page.goto("/signin");
    await page.getByPlaceholder("info@gmail.com").fill("gm@example.com");
    await page.getByPlaceholder("Enter your password").fill("hunter2hunter2");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await page.waitForURL((u) => !u.pathname.includes("/signin"), { timeout: 10_000 });
    await expect(page).not.toHaveURL(/signin/);
  });
});

test.describe("forms — create modal", () => {
  test("opens the create-form modal, shows both kinds, and closes on Escape", async ({ page }) => {
    await stubBackend(page, { routes: { "/api/form-definitions": ok([]) } });
    await page.goto("/forms");

    await page.getByRole("button", { name: "Create form" }).click();
    await expect(page.getByText("Form type")).toBeVisible();
    await expect(page.getByPlaceholder("Contact request")).toBeVisible();
    await expect(page.getByText("Inbound", { exact: false })).toBeVisible();
    await expect(page.getByText("Outbound", { exact: false })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("Form type")).toHaveCount(0);
  });
});

test.describe("data-table card view (mobile)", () => {
  test("a row collapses to a card and expands to reveal detail columns", async ({ page }) => {
    // The list call carries a query (?deleted=false); `*` matches it (but not a "/id" detail path).
    await stubBackend(page, { routes: { "/api/form-definitions*": ok([FORM_DEF]) } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/forms");

    // Card title = the first column (Form Name); a detail column is hidden until expand.
    await expect(page.getByText("Contact us")).toBeVisible();
    await expect(page.getByText("Form ID")).toHaveCount(0);

    await page.getByRole("button", { name: /show details/i }).first().click();
    await expect(page.getByText("Form ID")).toBeVisible();
    await expectNoOverflow(page);
  });
});

test.describe("mobile navigation drawer", () => {
  test("the hamburger opens the sidebar and a nav link navigates", async ({ page }) => {
    await stubBackend(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");

    // The mobile header (and its menu button) exist only below lg.
    const menu = page.getByRole("button", { name: "Open menu" });
    await expect(menu).toBeVisible();
    await menu.click();

    await page.getByRole("link", { name: /signatures/i }).first().click();
    await page.waitForURL(/\/signatures/, { timeout: 10_000 });
    await expectNoOverflow(page);
  });
});

test.describe("form inbox — complete task (split view)", () => {
  test("completing removes the task and advances, even if the server list lags", async ({ page }) => {
    const TASKS = [
      { taskId: "task-1", name: "Review Alice", created: 1717200000000, assignee: null, instanceId: null },
      { taskId: "task-2", name: "Review Bob", created: 1717300000000, assignee: null, instanceId: null },
    ];
    // getInbox keeps returning BOTH tasks (simulating server-side completion lag);
    // the UI must still drop the completed one and not let the refetch re-add it.
    await stubBackend(page, {
      routes: {
        "/api/form-inbox*": ok({ items: TASKS, total: 2, firstResult: 0, maxResults: 50 }),
        "/api/form-inbox/*/complete": (route) =>
          route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, taskId: "task-1" }) }),
      },
    });
    await page.addInitScript(() => localStorage.setItem("lk.inbox.view", "split"));
    await page.goto("/forms/inbox");

    // Split view auto-opens the first task in the reading pane (its name as a heading).
    await expect(page.getByRole("heading", { name: "Review Alice" })).toBeVisible();

    await page.getByRole("button", { name: /complete task/i }).click();

    // Alice leaves the list AND the reading pane; the view advances to Bob.
    await expect(page.getByText("Review Alice")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Review Bob" })).toBeVisible();
  });
});

test.describe("form inbox — by form definition (unified master pane)", () => {
  test("lists every form (incl. ones with no tasks) and expands/collapses its tasks", async ({ page }) => {
    const TASKS = [
      { taskId: "t1", name: "Alice submission", created: 1717200000000, assignee: null, instanceId: "i1", definitionCode: "CONTACT" },
      { taskId: "t2", name: "Bob submission", created: 1717300000000, assignee: null, instanceId: "i2", definitionCode: "CONTACT" },
    ];
    const form = (code: string, name: string) => ({ id: code, code, name, status: "PUBLISHED", publishedVersion: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
    await stubBackend(page, {
      routes: {
        "/api/form-inbox*": ok({ items: TASKS, total: 2, firstResult: 0, maxResults: 200 }),
        // SURVEY and NDA have NO open tasks but must still be listed.
        "/api/form-definitions*": ok([form("CONTACT", "Contact us"), form("SURVEY", "Survey"), form("NDA", "NDA agreement")]),
      },
    });
    await page.addInitScript(() => localStorage.setItem("lk.inbox.view", "split"));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/forms/inbox");

    // Every form definition is listed by name + code — including the task-less ones.
    await expect(page.getByRole("button", { name: /Contact us/ })).toBeVisible();
    await expect(page.getByText("SURVEY", { exact: true })).toBeVisible(); // the code, task-less form
    await expect(page.getByText("NDA agreement", { exact: true })).toBeVisible();

    // The form with tasks is expanded by default → its task shows in the list;
    // collapsing the form hides its tasks (the reading-pane heading is a separate <h2>).
    await expect(page.getByRole("button", { name: /Alice submission/ })).toBeVisible();
    await page.getByRole("button", { name: /Contact us/ }).click();
    await expect(page.getByRole("button", { name: /Alice submission/ })).toHaveCount(0);
    await expectNoOverflow(page);
  });
});

test.describe("form builder responsive shell", () => {
  test("phone shows the desktop-recommended notice, not the DnD canvas", async ({ page }) => {
    await stubBackend(page, { routes: builderRoutes });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/forms/${FORM_ID}`);

    await expect(page.getByText(/best on a larger screen/i)).toBeVisible();
    await expect(page.locator(".lf-builder")).toBeHidden();
    await expectNoOverflow(page);
  });

  test("desktop shows the DnD canvas, not the notice", async ({ page }) => {
    await stubBackend(page, { routes: builderRoutes });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/forms/${FORM_ID}`);

    await page.locator(".lf-builder").waitFor({ timeout: 15_000 });
    await expect(page.getByText(/best on a larger screen/i)).toBeHidden();
  });
});
