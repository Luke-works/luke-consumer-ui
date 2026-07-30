import { test, expect } from "./support/fixtures";
import type { Route } from "@playwright/test";
import { stubBackend, expectHealthy, ok } from "./support/harness";

// The form CRITICAL PATH, end to end: render a stored schema → fill it → submit → success.
//
// This is the one flow the whole Forms capability exists to perform, and until now nothing
// exercised it. `screens.spec` proves the fill route RENDERS; `flows.spec` covers list/modal
// interactions. Neither ever typed into a form or submitted one, so a regression that broke
// submission — a renderer prop dropped in a re-vendor, a changed request shape, a validation
// gate that never releases — would have shipped green.
//
// It also pins the SUBMITTED PAYLOAD. core-engine validates every submission against the
// published schema (stripping undeclared keys, enforcing required, checking value shape), so
// what the client sends is a contract, not an implementation detail: send a key the schema
// doesn't declare and the server silently drops it; omit a required one and it 400s.

const SCHEMA = JSON.stringify({
  root: ["name", "email"],
  entities: {
    name: { id: "name", type: "textField", attributes: { key: "name", label: "Name", required: true } },
    email: { id: "email", type: "email", attributes: { key: "email", label: "Email", required: true } },
  },
  settings: { submitMessage: "Thanks — we got it." },
});

const INSTANCE = {
  id: "inst-1",
  token: "inv_abc123",
  definitionCode: "CONTACT",
  version: 1,
  state: "CREATED",
  data: {},
  createdAt: "2026-06-01T00:00:00Z",
};

/** Capture every request body posted to a path, so a test can assert the payload. */
function capture(bodies: Record<string, unknown>[], respond: unknown) {
  return (route: Route) => {
    const raw = route.request().postData();
    if (raw) bodies.push(JSON.parse(raw) as Record<string, unknown>);
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(respond) });
  };
}

test.describe("forms — authenticated fill → submit", () => {
  test("renders the stored schema, submits the answers, and confirms", async ({ page }) => {
    const submits: Record<string, unknown>[] = [];

    await stubBackend(page, {
      routes: {
        // Entering /fill creates the runtime instance for the published version.
        "/api/form-instances": ok({ instance: INSTANCE, schema: SCHEMA }),
        "/api/form-instances/*/submit": capture(submits, {
          instance: { ...INSTANCE, state: "SUBMITTED" },
          schema: SCHEMA,
        }),
        // Debounced autosave — answer it so a save in flight can't fail the run.
        "/api/form-instances/*": ok({ instance: { ...INSTANCE, state: "IN_PROGRESS" }, schema: SCHEMA }),
      },
    });

    await page.goto("/forms/CONTACT/fill");

    // The schema's fields are really rendered (not a fallback or an empty shell).
    const name = page.getByRole("textbox", { name: /name/i });
    const email = page.getByRole("textbox", { name: /email/i });
    await expect(name).toBeVisible();
    await expect(email).toBeVisible();

    await name.fill("Ada Lovelace");
    await email.fill("ada@example.com");
    await page.getByRole("button", { name: /submit/i }).click();

    // The success state is the user-visible proof the submit completed.
    await expect(page.getByText(/thanks — we got it\./i)).toBeVisible();
    await expectHealthy(page);

    // …and the payload matches the schema's declared keys. The server strips anything else,
    // so a drifted client shape would lose data silently rather than error.
    expect(submits).toHaveLength(1);
    expect(submits[0]?.data).toEqual({ name: "Ada Lovelace", email: "ada@example.com" });
  });

  test("a required field blocks submission client-side", async ({ page }) => {
    const submits: Record<string, unknown>[] = [];

    await stubBackend(page, {
      routes: {
        "/api/form-instances": ok({ instance: INSTANCE, schema: SCHEMA }),
        "/api/form-instances/*/submit": capture(submits, { instance: INSTANCE, schema: SCHEMA }),
        "/api/form-instances/*": ok({ instance: INSTANCE, schema: SCHEMA }),
      },
    });

    await page.goto("/forms/CONTACT/fill");
    await page.getByRole("textbox", { name: /name/i }).fill("Ada Lovelace"); // email left empty
    await page.getByRole("button", { name: /submit/i }).click();

    // The renderer gates on its own validation, so nothing reaches the network. The server
    // enforces required too, but a client that posted an incomplete form would surface a raw
    // 400 instead of a field-level error — this asserts the good path stays the good path.
    await expect(page.getByText(/thanks — we got it\./i)).toHaveCount(0);
    expect(submits, "an incomplete form must not be posted").toHaveLength(0);
    await expectHealthy(page);
  });
});

test.describe("forms — public embed submit", () => {
  test("an anonymous filler can submit an embedded form", async ({ page }) => {
    const submits: Record<string, unknown>[] = [];

    await stubBackend(page, {
      loggedOut: true, // the embed surface has no session — the signed token is the auth
      routes: {
        "/api/public/embed/*": ok({ code: "CONTACT", title: "Contact us", version: 1, schema: SCHEMA }),
        "/api/public/embed/*/submit": capture(submits, { ok: true, instanceId: "inst-9", processStatus: "QUEUED" }),
      },
    });

    await page.goto("/embed/tok_public_1");

    await page.getByRole("textbox", { name: /name/i }).fill("Grace Hopper");
    await page.getByRole("textbox", { name: /email/i }).fill("grace@example.com");
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/thanks — we got it\./i)).toBeVisible();
    await expectHealthy(page);

    // The honeypot rides along on every embed submit and must stay EMPTY for a real user —
    // the engine drops any submission where it's filled, so a stray autofill here would
    // silently discard genuine submissions.
    expect(submits).toHaveLength(1);
    const payload = submits[0] as { data?: Record<string, unknown> };
    expect(payload.data?.name).toBe("Grace Hopper");
    expect(payload.data?._lukehp ?? "").toBe("");
  });

  test("the “Developed at Lukeflow” badge renders below the form and survives submission", async ({ page }) => {
    await stubBackend(page, {
      loggedOut: true,
      routes: {
        // showBranding is the EFFECTIVE flag: core-engine has already applied the tenant's plan.
        "/api/public/embed/*": ok({
          code: "CONTACT", title: "Contact us", version: 1, schema: SCHEMA, showBranding: true,
        }),
        "/api/public/embed/*/submit": ok({ ok: true, instanceId: "inst-9", processStatus: "QUEUED" }),
      },
    });
    await page.goto("/embed/tok_public_1");

    const badge = page.getByRole("link", { name: /developed at lukeflow/i });
    await expect(badge).toBeVisible();

    // It sits BELOW the form card and inside the element the iframe host measures for auto-height —
    // if it escaped that box, embedding sites would crop it off.
    const card = page.locator(".rounded-2xl").first();
    const cardBox = (await card.boundingBox())!;
    const badgeBox = (await badge.boundingBox())!;
    expect(badgeBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
    const measured = page.locator(".max-w-\\[640px\\]").first();
    const measuredBox = (await measured.boundingBox())!;
    expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(measuredBox.y + measuredBox.height + 1);

    // And it stays through the thank-you state (attribution outlives the form).
    await page.getByRole("textbox", { name: /name/i }).fill("Grace Hopper");
    await page.getByRole("textbox", { name: /email/i }).fill("grace@example.com");
    await page.getByRole("button", { name: /submit/i }).click();
    await expect(page.getByText(/thanks — we got it\./i)).toBeVisible();
    await expect(badge).toBeVisible();
    await expectHealthy(page);
  });

  test("no badge when a paying tenant has switched it off", async ({ page }) => {
    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/embed/*": ok({
          code: "CONTACT", title: "Contact us", version: 1, schema: SCHEMA, showBranding: false,
        }),
      },
    });
    await page.goto("/embed/tok_public_1");
    await expect(page.getByRole("heading", { name: /contact us/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /developed at lukeflow/i })).toHaveCount(0);
    await expectHealthy(page);
  });
});
