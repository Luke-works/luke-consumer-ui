import { test, expect } from "./support/fixtures";
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

test.describe("inbox — an inbound email is work, not a broken row", () => {
  test("opens the message in the reading pane and never fetches it as a submission", async ({ page }) => {
    const EMAIL_TASK = {
      taskId: "task-email", name: "Review: Refund request", created: 1717200000000, assignee: null,
      kind: "email", emailMessageId: "msg-1", emailFrom: "jo@example.com",
      emailBox: "support@acme.com", instanceId: null, definitionCode: null,
    };
    // If the page regresses to treating email as a form, it hits this route — and the test fails
    // on the call itself, not on a downstream symptom.
    let submissionFetched = false;
    await stubBackend(page, {
      routes: {
        "/api/form-inbox*": ok({ items: [EMAIL_TASK], total: 1, firstResult: 0, maxResults: 200 }),
        "/api/form-instances/*": (route) => { submissionFetched = true; return route.fulfill({ status: 404, body: "{}" }); },
        "/api/emails/*/inbound": ok({
          id: "msg-1", tenantId: "t1", boxId: "b1", boxAddress: "support@acme.com",
          mailboxHash: "support", fromName: "Jo Bloggs", toFull: "support@acme.com",
          ccAddresses: null, replyTo: null,
          textBody: "I was charged twice and would like a refund.",
          htmlBody: null, strippedTextReply: null, messageIdHeader: "<a@b>", inReplyTo: null,
          attachments: JSON.stringify([{ name: "receipt.pdf", contentType: "application/pdf", contentLength: 2048 }]),
          headers: null, attachmentCount: 1,
        }),
      },
    });
    await page.addInitScript(() => localStorage.setItem("lk.inbox.view", "split"));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/forms/inbox");

    // The box is a source in its own right, and the message is readable.
    await expect(page.getByText("support@acme.com").first()).toBeVisible();
    await expect(page.getByTestId("email-message")).toBeVisible();
    await expect(page.getByText("I was charged twice and would like a refund.")).toBeVisible();
    await expect(page.getByText("Jo Bloggs <jo@example.com>")).toBeVisible();
    await expect(page.getByText("receipt.pdf")).toBeVisible();

    expect(submissionFetched).toBe(false);
    await expectNoOverflow(page);
  });
});

test.describe("form inbox — by form definition (two-section left pane)", () => {
  test("lists every form (incl. task-less) and picking one shows its tasks", async ({ page }) => {
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

    // The first form with tasks (Contact us) is active by default → its tasks show on the right.
    await expect(page.getByRole("button", { name: /Alice submission/ })).toBeVisible();
    // Pick the task-less "Survey" form → its (empty) task section shows; Alice's task is gone.
    await page.getByRole("button", { name: /Survey/ }).click();
    await expect(page.getByText("No open tasks here.")).toBeVisible();
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

test.describe("access — sections and LukeExplains", () => {
  // An org owner with an empty org: every owner-only section must render its own empty
  // state rather than blanking, and LukeExplains must appear where access is chosen.
  const CATALOG = [
    { code: "FORMS", name: "Forms", tier: "STANDARD", status: "ACTIVE", description: "Design and collect forms." },
  ];

  test("owner can move between Roles, Attributes and Capabilities", async ({ page }) => {
    await stubBackend(page, { routes: { "/api/org/capabilities": ok(CATALOG) } });
    await page.goto("/access");

    // Roles — the catalog is explained even before anyone holds a role.
    await page.getByRole("button", { name: /^Roles$/ }).click();
    await expect(page.getByText(/What each role means/i)).toBeVisible();
    await expect(page.getByText(/LukeExplains — Org owner/i)).toBeVisible();

    // Attributes — no directory connected, so an honest empty state (never invented rows).
    await page.getByRole("button", { name: /^Attributes$/ }).click();
    await expect(page.getByText(/No directory is sending attributes yet/i)).toBeVisible();

    // Capabilities — the capability picker plus the level legend, including Contributor.
    await page.getByRole("button", { name: /^Capabilities$/ }).click();
    await expect(page.getByRole("button", { name: "Forms Standard" })).toBeVisible();
    await expect(page.getByText(/cannot publish or delete/i).first()).toBeVisible();

    await expectNoOverflow(page);
  });

  test("a member's own access is explained in plain language", async ({ page }) => {
    await stubBackend(page);
    await page.goto("/access");

    // "Manage My Access" is the default section for everyone.
    await expect(page.getByRole("heading", { name: /^My access$/ })).toBeVisible();
    const explains = page.getByRole("button", { name: /LukeExplains — what this lets you do/i }).first();
    await expect(explains).toBeVisible();

    // The explanation is a disclosure: closed until asked, then it states what the level allows.
    await explains.click();
    await expect(page.getByText(/What this allows/i).first()).toBeVisible();
    await expectNoOverflow(page);
  });
});
