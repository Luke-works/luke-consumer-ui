import { test, expect } from "./support/fixtures";
import type { Page, Route } from "@playwright/test";
import { stubBackend, expectHealthy, ok } from "./support/harness";

// Form payments, end to end in a real browser: the public embed takes a card through the REAL
// Stripe adapter (@lukeflow/form-react/stripe), and the settings page completes a Stripe Connect
// round-trip. OFFLINE BY CONSTRUCTION — js.stripe.com is replaced by a fake that honours the calls
// the adapter makes, so nothing reaches Stripe and no account is needed.

const FAKE_STRIPE_JS = `
(() => {
  const calls = (window.__stripe = { factory: [], elements: [], confirm: [] });
  window.Stripe = (pk, opts) => {
    calls.factory.push([pk, opts || null]);
    return {
      elements(options) {
        calls.elements.push(options);
        let input = null;
        return {
          create() {
            const handlers = {};
            return {
              mount(el) {
                input = document.createElement("input");
                input.setAttribute("aria-label", "Card number");
                input.setAttribute("data-fake-stripe", "");
                el.appendChild(input);
                setTimeout(() => handlers.ready && handlers.ready(), 0);
              },
              on(event, h) { handlers[event] = h; },
              destroy() { input && input.remove(); },
            };
          },
          update() {},
          async submit() {
            return input && input.value.length >= 16 ? {} : { error: { message: "Your card number is incomplete." } };
          },
        };
      },
      async confirmPayment(o) {
        calls.confirm.push(o.clientSecret);
        const card = document.querySelector("[data-fake-stripe]").value;
        return card === "4000000000000002"
          ? { error: { type: "card_error", message: "Your card was declined." } }
          : { paymentIntent: { id: "pi_1", status: "succeeded" } };
      },
    };
  };
})();
`;

const SCHEMA = JSON.stringify({
  root: ["name", "qty", "pay"],
  entities: {
    name: { id: "name", type: "textField", attributes: { key: "name", label: "Name", required: true } },
    qty: { id: "qty", type: "number", attributes: { key: "qty", label: "Tickets", required: true } },
    pay: {
      id: "pay",
      type: "payment",
      attributes: { key: "pay", label: "Ticket payment", amountMode: "perUnit", amountMinor: 1500, quantityFrom: "qty", maxQuantity: 10, currency: "USD" },
    },
  },
  settings: { submitMessage: "See you there." },
});

const EMBED = {
  code: "TICKETS", title: "Conference tickets", version: 1, schema: SCHEMA,
  payment: { available: true, provider: "stripe", publishableKey: "pk_test_e2e", accountId: "acct_e2e", scriptUrl: "https://js.stripe.com/v3/" },
};

function capture(bodies: Record<string, unknown>[], respond: unknown) {
  return (route: Route) => {
    const raw = route.request().postData();
    if (raw) bodies.push(JSON.parse(raw) as Record<string, unknown>);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(respond) });
  };
}

async function withFakeStripe(page: Page) {
  await page.route("https://js.stripe.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_STRIPE_JS }),
  );
}

const CHARGE = { status: "requires_payment", clientSecret: "pi_e2e_secret_1", amountMinor: 4500, currency: "USD" };

test.describe("forms — taking a payment on the public embed", () => {
  test("prices on the server, confirms the charge with Stripe, and confirms to the payer", async ({ page }) => {
    const submits: Record<string, unknown>[] = [];
    const syncs: string[] = [];
    await withFakeStripe(page);
    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/embed/*": ok(EMBED),
        "/api/public/embed/*/submit": capture(submits, { ok: true, instanceId: "inst-p1", processStatus: "AWAITING_PAYMENT", payment: CHARGE }),
        "/api/public/embed/*/payments/*/sync": (route) => {
          syncs.push(route.request().url());
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "succeeded", amountMinor: 4500, currency: "USD", processStatus: "QUEUED" }) });
        },
      },
    });

    await page.goto("/embed/tok_pay_1");
    const payment = page.getByRole("group", { name: "Ticket payment" });
    await expect(payment).toContainText("$15.00 each");
    await page.getByRole("textbox", { name: /^name/i }).fill("Ada");
    await page.getByRole("textbox", { name: /tickets/i }).fill("3");
    await expect(payment).toContainText("Total: $45.00");
    await page.getByLabel("Card number").fill("4242424242424242");
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText("See you there.")).toBeVisible();
    await expect(page.getByText("Payment of $45.00 received.")).toBeVisible();
    await expectHealthy(page);

    // The card form ran on the tenant's connected account, card-only.
    const stripe = await page.evaluate(() => (window as unknown as { __stripe: { factory: unknown[]; elements: Array<Record<string, unknown>>; confirm: string[] } }).__stripe);
    expect(stripe.factory[0]).toEqual(["pk_test_e2e", { stripeAccount: "acct_e2e" }]);
    expect(stripe.elements[0]).toMatchObject({ mode: "payment", currency: "usd", paymentMethodTypes: ["card"] });
    expect(stripe.confirm).toEqual(["pi_e2e_secret_1"]);
    // The server priced the answers; the browser only sent them.
    expect(submits).toHaveLength(1);
    expect((submits[0] as { data: Record<string, unknown> }).data.qty).toBe(3);
    // …and said which version it rendered, so a changed price can't be charged behind its back.
    expect((submits[0] as { version: unknown }).version).toBe(1);
    expect(syncs).toHaveLength(1);
    expect(syncs[0]).toContain("/payments/inst-p1/sync");
  });

  test("a declined card can be retried without submitting the form twice", async ({ page }) => {
    const submits: Record<string, unknown>[] = [];
    let syncCount = 0;
    await withFakeStripe(page);
    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/embed/*": ok(EMBED),
        "/api/public/embed/*/submit": capture(submits, { ok: true, instanceId: "inst-p2", processStatus: "AWAITING_PAYMENT", payment: CHARGE }),
        // What Stripe would say: unpaid after the decline and before the second card, then paid.
        "/api/public/embed/*/payments/*/sync": (route) => {
          syncCount += 1;
          const status = syncCount >= 3 ? "succeeded" : "requires_payment";
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status, amountMinor: 4500, currency: "USD" }) });
        },
      },
    });

    await page.goto("/embed/tok_pay_2");
    await page.getByRole("textbox", { name: /^name/i }).fill("Ada");
    await page.getByRole("textbox", { name: /tickets/i }).fill("3");
    await page.getByLabel("Card number").fill("4000000000000002");
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Your card was declined." })).toBeVisible();
    await expect(page.getByText("Your answers are saved. Pay $45.00 to finish.")).toBeVisible();
    await page.getByLabel("Card number").fill("4242424242424242");
    await page.getByRole("button", { name: "Pay $45.00" }).click();

    await expect(page.getByText("Payment of $45.00 received.")).toBeVisible();
    expect(submits).toHaveLength(1);
  });

  test("a charge that differs from the total shown is only taken after the payer approves it", async ({ page }) => {
    let syncCount = 0;
    await withFakeStripe(page);
    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/embed/*": ok(EMBED),
        "/api/public/embed/*/submit": ok({ ok: true, instanceId: "inst-p4", processStatus: "AWAITING_PAYMENT", payment: { ...CHARGE, amountMinor: 50000 } }),
        // Unpaid when the pay step re-checks it, paid once the card is confirmed.
        "/api/public/embed/*/payments/*/sync": (route) => {
          syncCount += 1;
          const status = syncCount >= 2 ? "succeeded" : "requires_payment";
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status, amountMinor: 50000, currency: "USD" }) });
        },
      },
    });

    await page.goto("/embed/tok_pay_4");
    await page.getByRole("textbox", { name: /^name/i }).fill("Ada");
    await page.getByRole("textbox", { name: /tickets/i }).fill("3");
    await page.getByLabel("Card number").fill("4242424242424242");
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/The amount to pay is \$500\.00, not the \$45\.00 shown before/)).toBeVisible();
    await expect(page.getByText("Your answers are saved. Pay $500.00 to finish.")).toBeVisible();
    let stripe = await page.evaluate(() => (window as unknown as { __stripe: { confirm: string[] } }).__stripe);
    expect(stripe.confirm).toEqual([]);
    expect(syncCount).toBe(0); // nothing was confirmed, so nothing to check yet

    await page.getByLabel("Card number").fill("4242424242424242");
    await page.getByRole("button", { name: "Pay $500.00" }).click();
    await expect(page.getByText("Payment of $500.00 received.")).toBeVisible();
    stripe = await page.evaluate(() => (window as unknown as { __stripe: { confirm: string[] } }).__stripe);
    expect(stripe.confirm).toEqual(["pi_e2e_secret_1"]);
    await expectHealthy(page);
  });

  test("an incomplete card is caught before anything is sent", async ({ page }) => {
    const submits: Record<string, unknown>[] = [];
    await withFakeStripe(page);
    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/embed/*": ok(EMBED),
        "/api/public/embed/*/submit": capture(submits, { ok: true }),
      },
    });
    await page.goto("/embed/tok_pay_3");
    await page.getByRole("textbox", { name: /^name/i }).fill("Ada");
    await page.getByRole("textbox", { name: /tickets/i }).fill("1");
    await page.getByLabel("Card number").fill("4242");
    await page.getByRole("button", { name: /submit/i }).click();
    await expect(page.getByText("Your card number is incomplete.")).toBeVisible();
    expect(submits).toHaveLength(0);
  });

  test("when the form can't take payments, nothing loads from Stripe and nothing is submitted", async ({ page }) => {
    const submits: Record<string, unknown>[] = [];
    const stripeRequests: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).hostname.endsWith("stripe.com")) stripeRequests.push(r.url());
    });
    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/embed/*": ok({ ...EMBED, payment: { ...EMBED.payment, available: false, publishableKey: null, accountId: null } }),
        "/api/public/embed/*/submit": capture(submits, { ok: true }),
      },
    });
    await page.goto("/embed/tok_pay_4");
    await expect(page.getByRole("group", { name: "Ticket payment" })).toContainText("aren't available right now");
    await page.getByRole("textbox", { name: /^name/i }).fill("Ada");
    await page.getByRole("textbox", { name: /tickets/i }).fill("1");
    await page.getByRole("button", { name: /submit/i }).click();
    await expect(page.getByRole("group", { name: "Ticket payment" })).toContainText("aren't available");
    expect(submits).toHaveLength(0);
    expect(stripeRequests).toEqual([]);
  });
});

test.describe("forms — connecting Stripe", () => {
  test("Stripe's return is completed once and the account shows as ready", async ({ page }) => {
    const completes: Record<string, unknown>[] = [];
    await stubBackend(page, {
      routes: {
        "/api/payments/account": ok({ enabled: true, livemode: false, planAllows: true, canManage: true, ready: false, account: null }),
        "/api/payments/connect/complete": capture(completes, {
          enabled: true, livemode: false, planAllows: true, canManage: true, ready: true,
          account: {
            accountId: "acct_1Example", status: "CONNECTED", livemode: false, chargesEnabled: true, detailsSubmitted: true,
            displayName: "Ada's Tickets", defaultCurrency: "USD", country: "US", connectedAt: "2026-06-01T00:00:00", modeMismatch: false,
          },
        }),
      },
    });
    await page.goto("/forms/payments?code=ac_e2e&state=st_e2e&scope=read_write");
    await expect(page.getByText("Stripe is connected. Your forms can take payments.")).toBeVisible();
    await expect(page.getByText(/Ready to take payments · settles in USD/)).toBeVisible();
    await expect(page).toHaveURL(/\/forms\/payments$/);
    expect(completes).toEqual([{ code: "ac_e2e", state: "st_e2e" }]);
    await expectHealthy(page);
  });

  test("Connect Stripe hands the owner to Stripe's consent page", async ({ page }) => {
    await page.route("https://connect.stripe.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Stripe consent (stub)</h1>" }),
    );
    await stubBackend(page, {
      routes: {
        "/api/payments/account": ok({ enabled: true, livemode: false, planAllows: true, canManage: true, ready: false, account: null }),
        "/api/payments/connect": ok({ url: "https://connect.stripe.com/oauth/authorize?response_type=code&client_id=ca_x&state=st" }),
      },
    });
    await page.goto("/forms/payments");
    await page.getByRole("button", { name: "Connect Stripe" }).click();
    await expect(page.getByRole("heading", { name: "Stripe consent (stub)" })).toBeVisible();
    expect(page.url()).toContain("connect.stripe.com/oauth/authorize");
  });

  test("the Forms page links to Payments", async ({ page }) => {
    await stubBackend(page, {
      routes: {
        "/api/payments/account": ok({ enabled: true, livemode: false, planAllows: true, canManage: true, ready: false, account: null }),
      },
    });
    await page.goto("/forms");
    await page.getByRole("button", { name: "Payments" }).click();
    await expect(page.getByRole("heading", { name: /^payments$/i })).toBeVisible();
  });
});
