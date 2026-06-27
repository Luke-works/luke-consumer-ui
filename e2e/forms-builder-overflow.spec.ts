import { test, expect } from "@playwright/test";

// Regression for the "page drifts sideways while dragging" bug. Root cause: the top-bar button
// tooltips (TailAdmin: position:absolute, left-1/2, always rendered) stuck past the viewport on
// the right-edge buttons, making the whole PAGE horizontally scrollable. Invisible at rest under
// macOS overlay scrollbars, but native drag-and-drop edge auto-scroll slid the page mid-drag.
// overflow-x: clip on the FormBuilderPage root contains it. This loads the REAL builder page
// (stubbed auth + form) and asserts the document can't scroll horizontally.
const GATEWAY = "http://localhost:9999";
const FORM_ID = "11111111-1111-1111-1111-111111111111";

const SCHEMA = JSON.stringify({
  root: ["name", "email", "message", "phone"],
  entities: {
    name: { id: "name", type: "textField", attributes: { key: "name", label: "Name", required: true } },
    email: { id: "email", type: "email", attributes: { key: "email", label: "Email", required: true } },
    message: { id: "message", type: "textarea", attributes: { key: "message", label: "Message", required: true } },
    phone: { id: "phone", type: "phoneNumber", attributes: { key: "phone", label: "Phone Number", required: true } },
  },
});
const SESSION = { userId: "u1", provisioned: true, operator: false, tenantAdmin: true, tenant: "t1", tenants: ["t1"], roles: {}, candidateGroups: [], capabilities: { FORMS: "read-write" }, can: ["FORMS"] };
const USER = { id: "u1", email: "gm@example.com", firstName: "GM", lastName: "User", profilePictureUrl: null, emailVerified: true };

test("the form builder page never scrolls horizontally (no drag-slide)", async ({ page }) => {
  await page.route(`${GATEWAY}/**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(`${GATEWAY}/auth/refresh`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accessToken: "x", sid: "s", user: USER, session: SESSION }) }));
  await page.route(`${GATEWAY}/session*`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SESSION) }));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: FORM_ID, code: "CONTACT", name: "Contact us", status: "PUBLISHED", publishedVersion: 18, draftSchema: SCHEMA, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z" }) }));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}/versions`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ version: 18, schema: SCHEMA, checkedInAt: "2026-06-01T00:00:00Z", signedOffAt: "2026-06-01T00:00:00Z" }]) }));

  // A couple of realistic widths, including where right-edge tooltips overhang the most.
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`/forms/${FORM_ID}`);
    await page.locator(".lf-builder").waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `builder page scrolls horizontally by ${overflow}px at ${width}px wide`).toBe(0);
  }
});
