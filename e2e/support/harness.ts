import { expect, type Page, type Route } from "@playwright/test";

// Shared hermetic harness for the per-screen E2E suite. Everything is stubbed at the
// gateway host (VITE_AUTH_API_URL = http://localhost:9999) so no real backend is needed.
// Routes are scoped to that HOST so they never intercept the Vite dev server's own
// module requests (localhost:4319).

export const GATEWAY = "http://localhost:9999";

/** The device widths we guarantee every screen works at (the user's targets). */
export const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1536, height: 900 },
] as const;

export const USER = {
  id: "u1",
  email: "gm@example.com",
  firstName: "GM",
  lastName: "User",
  profilePictureUrl: null,
  emailVerified: true,
};

type SessionOverrides = Partial<ReturnType<typeof makeSession>>;

/** A provisioned tenant-admin with read-write on every capability, so no route/nav is gated off. */
export function makeSession(over: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    provisioned: true,
    operator: false,
    tenantAdmin: true,
    tenant: "t1",
    tenants: ["t1"],
    tenantNames: { t1: "Acme Inc" },
    roles: { tenantAdmin: "read-write" },
    candidateGroups: [],
    capabilities: {
      FORMS: "read-write",
      EMAIL: "read-write",
      SIGNATURES: "read-write",
      PHONE: "read-write",
      WORKFLOW: "read-write",
    },
    can: ["FORMS", "EMAIL", "SIGNATURES", "PHONE", "WORKFLOW"],
    ...over,
  };
}

export type StubOptions = {
  /** Simulate a signed-out visitor (refresh → 401). Use for /signin, /signup, public pages. */
  loggedOut?: boolean;
  /** Override the stub session (e.g. provisioned:false to reach onboarding). */
  session?: SessionOverrides;
  /** Per-endpoint overrides. Keys are gateway paths (may include globs), e.g.
   *  "/api/form-definitions/*". Registered AFTER the catch-all so they win. */
  routes?: Record<string, (route: Route) => void>;
};

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: typeof body === "string" ? body : JSON.stringify(body),
});

/**
 * Install auth + a permissive gateway. The catch-all returns an empty JSON list (`[]`),
 * which is the correct shape for the many list endpoints these pages hit — so list/index
 * screens render their empty state instead of crashing. Detail/builder screens that fetch
 * a single object supply a `routes` override for their endpoint.
 *
 * Playwright checks routes in reverse registration order, so we register the catch-all
 * FIRST and the specific handlers LAST; the specific ones take precedence.
 */
export async function stubBackend(page: Page, opts: StubOptions = {}): Promise<void> {
  const session = makeSession(opts.session);

  await page.route(`${GATEWAY}/**`, (route) => route.fulfill(json("[]")));

  if (opts.loggedOut) {
    await page.route(`${GATEWAY}/auth/refresh`, (route) => route.fulfill(json("{}", 401)));
    await page.route(`${GATEWAY}/session*`, (route) => route.fulfill(json("{}", 401)));
  } else {
    await page.route(`${GATEWAY}/auth/refresh`, (route) =>
      route.fulfill(json({ accessToken: "tok", sid: "s", user: USER, session })),
    );
    await page.route(`${GATEWAY}/session*`, (route) => route.fulfill(json(session)));
  }

  for (const [path, handler] of Object.entries(opts.routes ?? {})) {
    await page.route(`${GATEWAY}${path}`, handler);
  }
}

/** The app's top-level error boundary fallback (role="alert" + "Something went wrong"). */
export async function expectHealthy(page: Page): Promise<void> {
  await expect(
    page.getByRole("alert").filter({ hasText: /something went wrong/i }),
    "route rendered the app error boundary (a component threw)",
  ).toHaveCount(0);
}

/** Assert the route got past its Suspense loader and rendered real (non-blank) content. */
export async function expectRendered(page: Page): Promise<void> {
  // Every lazy route's Suspense fallback is a lone line starting with "Loading".
  await expect(
    page.getByText(/^Loading[….]*$/i),
    "route stuck on its loading fallback",
  ).toHaveCount(0);
  const len = await page.evaluate(() => document.body.innerText.trim().length);
  expect(len, "route rendered blank").toBeGreaterThan(0);
}

/** The responsive guarantee: the document must not scroll sideways at any width. */
export async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `page overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

/** Helper for a JSON 200 route handler. */
export const ok = (body: unknown) => (route: Route) => route.fulfill(json(body));

/**
 * Force a theme before the app boots.
 *
 * ThemeContext reads `localStorage.theme` on mount and toggles `.dark` on <html>. Setting it via
 * an init script means the very first paint is already correct — flipping it after load would
 * screenshot a light-mode frame mid-transition and produce diffs that come and go.
 */
export async function forceTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem("theme", t as string);
    } catch {
      /* storage can be unavailable; the app falls back to its default */
    }
  }, theme);
}
