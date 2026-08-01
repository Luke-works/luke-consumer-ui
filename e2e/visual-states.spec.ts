import { expect, test, type Page } from "@playwright/test";
import { stubBackend, expectHealthy, expectSettled, forceTheme, ok, type StubOptions } from "./support/harness";
import { SCREENSHOT_OPTIONS, VISUAL_ENABLED, VISUAL_SKIP_REASON } from "./support/visual";

/**
 * VISUAL REGRESSION — UI STATES.
 *
 * `visual.spec` shoots every route in its resting state. Most of the UI a user actually looks at
 * isn't resting: it's a modal, an open drawer, an expanded row, a field showing an error, a
 * success panel. Those surfaces have their own layout, their own z-index, their own dark-mode
 * tokens — and a route screenshot never reaches any of them, so they were entirely uncovered.
 *
 * Each entry drives the app into a state and shoots it. `setup` is written against the same
 * accessible names the functional specs use, so a state that stops being reachable fails loudly
 * here rather than silently shooting the page behind the thing that didn't open.
 */

const FORM_ID = "11111111-1111-1111-1111-111111111111";
const SCHEMA = JSON.stringify({
  root: ["name", "email"],
  entities: {
    name: { id: "name", type: "textField", attributes: { key: "name", label: "Name", required: true } },
    email: { id: "email", type: "email", attributes: { key: "email", label: "Email", required: true } },
  },
  settings: { submitMessage: "Thanks — we got it." },
});
const FORM_DEF = {
  id: FORM_ID,
  code: "CONTACT",
  name: "Contact us",
  kind: "INBOUND",
  status: "PUBLISHED",
  publishedVersion: 1,
  submissionHandling: "INBOX",
  draftSchema: SCHEMA,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};
const formRoutes = {
  "/api/form-definitions/*": ok(FORM_DEF),
  "/api/form-definitions/by-code/*": ok(FORM_DEF),
  "/api/form-definitions/*/versions": ok([{ version: 1, schema: SCHEMA, checkedInAt: "2026-06-01T00:00:00Z", signedOffAt: "2026-06-01T00:00:00Z" }]),
  "/api/form-instances": ok({ instance: { id: "i1", token: "t", definitionCode: "CONTACT", version: 1, state: "CREATED" }, schema: SCHEMA }),
};

type State = {
  name: string;
  path: string;
  opts?: StubOptions;
  /** Drive the app into the state. Must END with the state visible, not merely requested. */
  setup: (page: Page) => Promise<void>;
  /** Widths this state is meaningful at. A mobile drawer only exists on phone. */
  viewports?: ReadonlyArray<{ name: string; width: number; height: number }>;
};

const PHONE = { name: "phone", width: 390, height: 844 };
const LAPTOP = { name: "laptop", width: 1280, height: 800 };

const STATES: State[] = [
  {
    name: "forms-create-modal",
    path: "/forms",
    setup: async (page) => {
      await page.getByRole("button", { name: "Create form" }).click();
      await expect(page.getByText("Form type")).toBeVisible();
    },
  },
  {
    name: "forms-row-expanded",
    path: "/forms",
    opts: { routes: { "/api/form-definitions*": ok([FORM_DEF]) } },
    viewports: [PHONE], // the card/expand affordance only exists once the table collapses
    setup: async (page) => {
      await page.getByRole("button", { name: /show details/i }).first().click();
      await expect(page.getByText("Form ID")).toBeVisible();
    },
  },
  {
    name: "mobile-nav-drawer",
    path: "/dashboard",
    viewports: [PHONE],
    setup: async (page) => {
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("link", { name: /forms/i }).first()).toBeVisible();
    },
  },
  {
    // The desktop sidebar defaults to COLLAPSED (SidebarContext: useState(false)), so it renders as
    // icons in every other shot and no baseline contained a single navigation LABEL. Renaming a nav
    // item was therefore pixel-free on desktop — the primary navigation of the product was the one
    // surface the visual suite could not see. Expanding it here covers that.
    name: "desktop-nav-expanded",
    path: "/dashboard",
    viewports: [LAPTOP], // the lock control is lg-only; below that the sidebar is the drawer above
    setup: async (page) => {
      // Click the lock, not hover: a hover-held state is not reliably captured in a screenshot.
      await page.getByRole("button", { name: "Lock sidebar open" }).click();

      const inbox = page.getByRole("link", { name: /^inbox$/i });
      // toBeInViewport, NOT toBeVisible. Sub-menus live in an overflow-hidden container animated
      // to height 0, and toBeVisible is not clipping-aware: the clipped link still reports a
      // 24x40 box and passes, so an assertion written that way verifies nothing. Measured, not
      // assumed — toBeVisible() returned true here while the item was invisible.
      await expect(inbox).not.toBeInViewport();
      await page.getByRole("button", { name: /^forms$/i }).click();
      // Open the sub-menu so the shot actually CONTAINS the nav labels it exists to protect.
      await expect(inbox).toBeInViewport();
    },
  },
  {
    name: "fill-validation-errors",
    path: "/forms/CONTACT/fill",
    opts: { routes: formRoutes },
    setup: async (page) => {
      // Submitting an empty required form is the most-seen error state in the product and has
      // its own colours, spacing and dark-mode tokens — none of which a resting shot covers.
      await expect(page.getByRole("textbox", { name: /name/i })).toBeVisible();
      await page.getByRole("button", { name: /submit/i }).click();
      await expect(page.getByText(/required/i).first()).toBeVisible();
    },
  },
  {
    name: "fill-completed",
    path: "/forms/CONTACT/fill",
    opts: {
      routes: {
        ...formRoutes,
        "/api/form-instances/*/submit": ok({ instance: { id: "i1", state: "SUBMITTED" }, schema: SCHEMA }),
        "/api/form-instances/*": ok({ instance: { id: "i1", token: "t", definitionCode: "CONTACT", version: 1, state: "IN_PROGRESS" }, schema: SCHEMA }),
      },
    },
    setup: async (page) => {
      await page.getByRole("textbox", { name: /name/i }).fill("Ada Lovelace");
      await page.getByRole("textbox", { name: /email/i }).fill("ada@example.com");
      await page.getByRole("button", { name: /submit/i }).click();
      await expect(page.getByText(/thanks — we got it\./i)).toBeVisible();
    },
  },
  {
    name: "embed-submitted",
    path: "/embed/tok-1",
    opts: {
      loggedOut: true,
      routes: {
        "/api/public/embed/*/submit": ok({ ok: true, instanceId: "i9", processStatus: "QUEUED" }),
        "/api/public/embed/*": ok({ code: "CONTACT", title: "Contact us", version: 1, schema: SCHEMA }),
      },
    },
    setup: async (page) => {
      await page.getByRole("textbox", { name: /name/i }).fill("Grace Hopper");
      await page.getByRole("textbox", { name: /email/i }).fill("grace@example.com");
      await page.getByRole("button", { name: /submit/i }).click();
      await expect(page.getByText(/thanks — we got it\./i)).toBeVisible();
    },
  },
  {
    name: "respond-code-step",
    path: "/respond/tok-1",
    opts: {
      loggedOut: true,
      routes: {
        "/api/public/form-instances/*/otp": ok({ ok: true, emailStatus: "SENT", sentTo: "j***@acme.com" }),
        "/api/public/form-instances/*": ok({ code: "CONTACT", name: "Contact us", version: 1, schema: SCHEMA, prefill: {}, data: {}, outboundRoles: {}, recipient: {}, state: "SENT" }),
      },
    },
    setup: async (page) => {
      await page.getByRole("button", { name: /email me a code/i }).click();
      await expect(page.getByRole("heading", { name: /enter your code/i })).toBeVisible();
    },
  },
  {
    name: "signin-error",
    path: "/signin",
    opts: {
      loggedOut: true,
      routes: {
        "/auth/login": (route) =>
          route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ message: "Those credentials didn't work." }),
          }),
      },
    },
    setup: async (page) => {
      // The error state of the one screen every user meets first, and the one most likely to be
      // styled once and never looked at again.
      await page.getByPlaceholder("info@gmail.com").fill("nobody@example.com");
      await page.getByPlaceholder("Enter your password").fill("wrong-password");
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await expect(page.getByText("Those credentials didn't work.")).toBeVisible();
    },
  },
  {
    name: "forms-empty",
    path: "/forms",
    // The catch-all already answers [] — an empty list is a real, frequently-seen state (every
    // new tenant starts here) with its own illustration and copy that nothing else screenshots.
    setup: async (page) => {
      await expect(page.getByRole("heading", { name: /^forms$/i }).first()).toBeVisible();
    },
  },
  {
    name: "form-inbox-empty",
    path: "/forms/inbox",
    setup: async (page) => {
      await expect(page.getByRole("heading", { name: /^inbox$/i }).first()).toBeVisible();
    },
  },
  {
    name: "embed-unavailable",
    path: "/embed/bad-token",
    opts: {
      loggedOut: true,
      routes: {
        "/api/public/embed/*": (route) =>
          route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ message: "This form is no longer available." }),
          }),
      },
    },
    setup: async (page) => {
      // What a stranger sees when a link rots — on a public surface, with no app chrome to
      // soften it. Worth a baseline precisely because nobody looks at it.
      await expect(page.getByText(/no longer available|couldn't|error/i).first()).toBeVisible();
    },
  },
  {
    name: "forms-list-populated",
    path: "/forms",
    opts: { routes: { "/api/form-definitions*": ok([FORM_DEF]) } },
    setup: async (page) => {
      await expect(page.getByText("Contact us")).toBeVisible();
    },
  },
  {
    name: "respond-preparer-readonly",
    path: "/respond/tok-1",
    opts: {
      loggedOut: true,
      routes: {
        "/api/public/form-instances/*/otp": ok({ ok: true, emailStatus: "SENT", sentTo: "j***@acme.com" }),
        "/api/public/form-instances/*/verify": ok({ accessToken: "acc-tok" }),
        "/api/public/form-instances/*": ok({
          code: "QUOTE",
          name: "Accept your quote",
          version: 1,
          schema: JSON.stringify({
            root: ["price", "ref"],
            entities: {
              price: { id: "price", type: "textField", attributes: { key: "price", label: "Quoted price" } },
              ref: { id: "ref", type: "textField", attributes: { key: "ref", label: "Your reference", required: true } },
            },
          }),
          prefill: { price: "1250.00" },
          data: {},
          outboundRoles: { price: "PREPARER", ref: "RECIPIENT" },
          recipient: { firstName: "Jordan" },
          state: "SENT",
        }),
      },
    },
    setup: async (page) => {
      // Pins how a preparer-owned field LOOKS to the recipient. The rule is covered functionally;
      // this covers the thing functional tests can't assert — that a disabled field reads as
      // deliberately locked rather than broken, in both themes.
      await page.getByRole("button", { name: /email me a code/i }).click();
      await page.getByPlaceholder("123456").fill("123456");
      await page.getByRole("button", { name: /verify & continue/i }).click();
      await expect(page.getByRole("textbox", { name: /quoted price/i })).toBeDisabled();
    },
  },
];

const THEMES = ["light", "dark"] as const;
const DEFAULT_VIEWPORTS = [PHONE, LAPTOP] as const;

// No video here. A visual failure is explained by the three images the report already gives you —
// expected, actual, and a highlighted diff — so a recording adds nothing but time, and these two
// files are 168 of the suite's 305 tests. Video stays on for the FUNCTIONAL specs, where the
// question is "what did it do" rather than "what does it look like".
test.use({ video: "off" });

test.describe("visual states", () => {
  // Baselines are linux-only (font rendering is platform-specific). VERIFY_SETUP=1 runs the suite
  // anyway on any OS: the screenshots won't match, but every `setup` still executes, which is how
  // you check a NEW state is actually reachable before asking CI to bless a baseline for it.
  // VERIFY_SETUP=1 still runs the setups anywhere, so a state that stops being REACHABLE can be
  // caught locally without a baseline — that half of this spec is a functional check, not a pixel one.
  test.skip(
    process.env.VERIFY_SETUP !== "1" && !VISUAL_ENABLED,
    `${VISUAL_SKIP_REASON} (VERIFY_SETUP=1 to check the setups here)`,
  );

  for (const state of STATES) {
    test.describe(state.name, () => {
      for (const vp of state.viewports ?? DEFAULT_VIEWPORTS) {
        for (const theme of THEMES) {
          test(`${vp.name}-${theme}`, async ({ page }) => {
            await forceTheme(page, theme);
            await stubBackend(page, state.opts);
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto(state.path);

            await state.setup(page);
            await expectHealthy(page);
            await page.evaluate(() => document.fonts.ready);
            await expectSettled(page);

            await expect(page).toHaveScreenshot(`${state.name}-${vp.name}-${theme}.png`, SCREENSHOT_OPTIONS);
          });
        }
      }
    });
  }
});
