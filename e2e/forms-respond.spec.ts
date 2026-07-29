import { test, expect, type Route } from "@playwright/test";
import { stubBackend, expectHealthy, ok } from "./support/harness";

// The OUTBOUND recipient journey, end to end: verify by emailed code → fill → submit.
//
// This is the flow with the least margin for error in the product. The person using it is not a
// tenant user, has no account, arrived from an email, and gets exactly one attempt to understand
// what's being asked. It also carries per-field ownership: an outbound form is completed by two
// people, and the fields the PREPARER already answered must be visible-but-not-editable to the
// recipient. Nothing covered any of it.
//
// The ownership rule is enforced twice — the schema is rewritten so those inputs render disabled,
// and core-engine independently drops recipient writes to them. This spec covers the first half;
// PublicFormInstanceServiceTest covers the second. Both halves matter: the disabled input is what
// an honest recipient experiences, the server check is what a tampered request meets.

const SCHEMA = JSON.stringify({
  root: ["price", "accept", "notes"],
  entities: {
    // The preparer quoted this before sending. The recipient must see it — it's the thing they're
    // agreeing to — but must not be able to restate it.
    price: { id: "price", type: "textField", attributes: { key: "price", label: "Quoted price" } },
    accept: { id: "accept", type: "textField", attributes: { key: "accept", label: "Your reference", required: true } },
    notes: { id: "notes", type: "textarea", attributes: { key: "notes", label: "Notes" } },
  },
  settings: { submitMessage: "Thanks — your response is recorded." },
});

const RESPOND = {
  code: "QUOTE",
  name: "Accept your quote",
  version: 1,
  schema: SCHEMA,
  prefill: { price: "1250.00" },
  data: {},
  outboundRoles: { price: "PREPARER", accept: "RECIPIENT", notes: "EITHER" },
  recipient: { firstName: "Jordan" },
  state: "SENT",
};

function capture(bodies: Record<string, unknown>[], respond: unknown) {
  return (route: Route) => {
    const raw = route.request().postData();
    if (raw) bodies.push(JSON.parse(raw) as Record<string, unknown>);
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(respond) });
  };
}

async function verifyAndOpen(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /email me a code/i }).click();
  await page.getByPlaceholder("123456").fill("123456");
  await page.getByRole("button", { name: /verify & continue/i }).click();
}

test.describe("forms — outbound recipient journey", () => {
  test("verifies by code, then fills and submits", async ({ page }) => {
    const submits: Record<string, unknown>[] = [];

    await stubBackend(page, {
      loggedOut: true, // no session: the emailed token + a one-time code are the auth
      routes: {
        "/api/public/form-instances/*/otp": ok({ ok: true, emailStatus: "SENT", sentTo: "j***@acme.com" }),
        "/api/public/form-instances/*/verify": ok({ accessToken: "acc-tok" }),
        "/api/public/form-instances/*/submit": capture(submits, { ok: true, instanceId: "i1", state: "SUBMITTED" }),
        "/api/public/form-instances/*": ok(RESPOND),
      },
    });

    await page.goto("/respond/inv_abc123");

    // Gate first: the form is not reachable before proving control of the email.
    await expect(page.getByRole("heading", { name: /verify it's you/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /your reference/i })).toHaveCount(0);

    await verifyAndOpen(page);

    await expect(page.getByRole("heading", { name: /accept your quote/i })).toBeVisible();
    await page.getByRole("textbox", { name: /your reference/i }).fill("PO-99");
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/thanks — your response is recorded\./i)).toBeVisible();
    await expectHealthy(page);

    expect(submits).toHaveLength(1);
    const payload = submits[0] as { data?: Record<string, unknown> };
    expect(payload.data?.accept).toBe("PO-99");
  });

  test("the preparer's field is shown but not editable; the recipient's are", async ({ page }) => {
    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/form-instances/*/otp": ok({ ok: true, emailStatus: "SENT", sentTo: "j***@acme.com" }),
        "/api/public/form-instances/*/verify": ok({ accessToken: "acc-tok" }),
        "/api/public/form-instances/*": ok(RESPOND),
      },
    });

    await page.goto("/respond/inv_abc123");
    await verifyAndOpen(page);

    // PREPARER: visible, carrying the quoted value, and not editable — the recipient is agreeing
    // to this number, so they must be able to read it and must not be able to change it.
    const price = page.getByRole("textbox", { name: /quoted price/i });
    await expect(price).toBeVisible();
    await expect(price).toHaveValue("1250.00");
    await expect(price).toBeDisabled();

    // RECIPIENT: theirs to answer.
    await expect(page.getByRole("textbox", { name: /your reference/i })).toBeEnabled();

    // EITHER: the preparer may seed it and the recipient may still correct it. This is the case
    // `disabled` alone could never express, and the reason the role map exists at all.
    await expect(page.getByRole("textbox", { name: /notes/i })).toBeEnabled();
  });

  test("a wrong code keeps the form closed", async ({ page }) => {
    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/form-instances/*/otp": ok({ ok: true, emailStatus: "SENT", sentTo: "j***@acme.com" }),
        "/api/public/form-instances/*/verify": (route: Route) =>
          route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ message: "That code isn't right." }),
          }),
        "/api/public/form-instances/*": ok(RESPOND),
      },
    });

    await page.goto("/respond/inv_abc123");
    await verifyAndOpen(page);

    await expect(page.getByText(/that code isn't right/i)).toBeVisible();
    // Still on the code step — a failed verification must not leak the form's contents.
    await expect(page.getByRole("textbox", { name: /quoted price/i })).toHaveCount(0);
    await expectHealthy(page);
  });
});
