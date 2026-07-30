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

  test("a Turnstile-protected form sends the challenge token with the submission", async ({ page }) => {
    // OFFLINE BY CONSTRUCTION. Cloudflare's script is intercepted and replaced with a stub that
    // registers the same window.turnstile API and hands back their published dummy token — the same
    // one the always-passes TEST sitekey emits. Nothing here reaches challenges.cloudflare.com, so
    // this suite stays fast and cannot fail because of someone else's outage.
    const submits: Record<string, unknown>[] = [];

    await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `window.turnstile = {
                 render: (el, o) => { setTimeout(() => o.callback("XXXX.DUMMY.TOKEN.XXXX"), 0); return "w1"; },
                 reset: () => {}, remove: () => {},
               };`,
      }),
    );

    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/embed/*": ok({
          code: "CONTACT", title: "Contact us", version: 1, schema: SCHEMA,
          // Cloudflare's published always-passes TEST sitekey — no account needed.
          captchaEnabled: true, captchaSitekey: "1x00000000000000000000AA",
        }),
        "/api/public/embed/*/submit": capture(submits, { ok: true, instanceId: "inst-9", processStatus: "QUEUED" }),
      },
    });

    await page.goto("/embed/tok_public_1");

    await page.getByRole("textbox", { name: /name/i }).fill("Grace Hopper");
    await page.getByRole("textbox", { name: /email/i }).fill("grace@example.com");
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/thanks — we got it\./i)).toBeVisible();
    await expectHealthy(page);

    expect(submits).toHaveLength(1);
    const payload = submits[0] as { captchaToken?: string; data?: Record<string, unknown> };
    expect(payload.captchaToken).toBe("XXXX.DUMMY.TOKEN.XXXX");
    // The rest of the contract is unchanged — the captcha rides alongside, it does not replace.
    expect(payload.data?.name).toBe("Grace Hopper");
    expect(payload.data?._lukehp ?? "").toBe("");
  });

  test("the CSP core-engine serves actually permits the Turnstile script and frame", async ({ page }) => {
    // WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT.
    //
    // core-engine serves the embed document with a Content-Security-Policy; this suite is served by
    // Vite, which sends none — and Vite's DEV server injects inline module preamble scripts that
    // `script-src 'self'` correctly blocks. Attaching the real policy to the dev page therefore breaks
    // the harness, not the product: production serves a static shell (EmbedPageController.SHELL) whose
    // only script is an external same-origin tag, asserted separately in EmbedPageControllerTest.
    //
    // So this drives a MINIMAL document under the EXACT header instead. That answers the question the
    // policy is actually about — may the Turnstile script execute, and may its challenge frame load —
    // without Vite in the way. Keep the constant in sync with EmbedPageController.SCRIPT_AND_FRAME.
    const CSP =
      "frame-ancestors *; script-src 'self' https://challenges.cloudflare.com; " +
      "frame-src https://challenges.cloudflare.com";

    await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "window.__TURNSTILE_SCRIPT_RAN__ = true;",
      }),
    );
    // The widget renders its challenge in an iframe from the same host — that is the frame-src half.
    await page.route("https://challenges.cloudflare.com/cdn-cgi/challenge-platform/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>challenge</body></html>" }),
    );

    await page.route("**/csp-probe", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: { "content-security-policy": CSP },
        body: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
                 <script>
                   window.__CSP__ = [];
                   document.addEventListener("securitypolicyviolation", (e) =>
                     window.__CSP__.push({ directive: e.violatedDirective, uri: e.blockedURI }));
                 </script>
                 <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
                 <iframe src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x"></iframe>
               </body></html>`,
      }),
    );

    await page.goto("/csp-probe");

    // The Turnstile script was ALLOWED to execute under this policy — the whole point of script-src.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __TURNSTILE_SCRIPT_RAN__?: boolean }).__TURNSTILE_SCRIPT_RAN__))
      .toBe(true);

    // And nothing Cloudflare needs was refused. (The probe's own inline listener is expected to be
    // reported — production has no inline script, so it is filtered rather than asserted away.)
    const reported = await page.evaluate(
      () => (window as unknown as { __CSP__?: { directive: string; uri: string }[] }).__CSP__ ?? [],
    );
    // Compare the blocked URI's HOST exactly. A substring match would also fire on, say,
    // `https://challenges.cloudflare.com.evil.test/x`, which is the whole point of the directive.
    const host = (uri: string) => {
      try {
        return new URL(uri).host;
      } catch {
        return ""; // "inline" / "eval" and friends are not URLs
      }
    };
    const cloudflareBlocks = reported.filter((v) => host(v.uri) === "challenges.cloudflare.com");
    expect(
      cloudflareBlocks,
      `CSP blocked Turnstile: ${cloudflareBlocks.map((v) => `${v.directive}:${v.uri}`).join(", ")}`,
    ).toEqual([]);
  });

  test("a consent-requiring form refuses to submit until the agreement is accepted", async ({ page }) => {
    // The consent record is what makes a submission provable, so the full browser path matters: the
    // statement renders, submit is refused with the answers intact, and the accepted tick reaches the
    // wire. (core-engine refuses a consentAgreed=false submission independently — this pins the client
    // half, so a filler never meets a raw 400 on the good path.)
    const submits: Record<string, unknown>[] = [];
    const CONSENT_SCHEMA = JSON.stringify({
      ...JSON.parse(SCHEMA),
      settings: {
        submitMessage: "Thanks — we got it.",
        consent: { enabled: true, text: "I agree to the Acme terms of service." },
      },
    });

    await stubBackend(page, {
      loggedOut: true,
      routes: {
        "/api/public/embed/*": ok({ code: "CONTACT", title: "Contact us", version: 1, schema: CONSENT_SCHEMA }),
        "/api/public/embed/*/submit": capture(submits, { ok: true, instanceId: "inst-9", processStatus: "QUEUED" }),
      },
    });

    await page.goto("/embed/tok_public_1");

    const agree = page.getByRole("checkbox", { name: /acme terms of service/i });
    await expect(agree).toBeVisible();
    await expect(agree).not.toBeChecked();

    await page.getByRole("textbox", { name: /name/i }).fill("Grace Hopper");
    await page.getByRole("textbox", { name: /email/i }).fill("grace@example.com");
    await page.getByRole("button", { name: /submit/i }).click();

    // Refused, with a reason — and nothing posted.
    await expect(page.getByRole("alert")).toContainText(/accept this before the form can be submitted/i);
    expect(submits, "a form without consent must not be posted").toHaveLength(0);
    // The answers survive the refusal; being sent back to re-type them would be its own defect.
    await expect(page.getByRole("textbox", { name: /name/i })).toHaveValue("Grace Hopper");

    await agree.check();
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/thanks — we got it\./i)).toBeVisible();
    await expectHealthy(page);

    expect(submits).toHaveLength(1);
    const payload = submits[0] as { data?: Record<string, unknown>; consentAgreed?: boolean };
    expect(payload.consentAgreed).toBe(true);
    // The WORDING is never sent — the server resolves it from the version it served, so a tampered
    // client cannot record agreement to different terms.
    expect(JSON.stringify(payload)).not.toContain("Acme terms of service");
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
