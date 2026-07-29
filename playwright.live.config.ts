import { defineConfig, devices } from "@playwright/test";

/**
 * LIVE E2E — the same browser automation, but against a REAL core-engine.
 *
 * The hermetic suite (playwright.config.ts) stubs every backend call, which is what makes it fast
 * and never flaky. It also means it structurally cannot catch the app and the server disagreeing:
 * if core-engine starts rejecting or stripping a field the app still sends, all 197 hermetic tests
 * stay green while real submissions quietly lose data. This lane exists for exactly that class of
 * bug, and for nothing else — breadth belongs in the hermetic suite.
 *
 * WHAT IS REAL HERE: core-engine (embedded H2, no external services), its Flyway migrations, its
 * validation, the outbox, and every /api/** call the browser makes.
 *
 * WHAT IS STILL FAKED: identity only. A session normally comes from the WorkOS gateway
 * (luke-auth-engine), which needs real credentials no test should hold, so the two identity
 * endpoints are stubbed in the browser and everything else is left to reach the real server. The
 * engine accepts this in its local-dev posture: security is permitAll, gateway JWT verification is
 * off by default, and tenancy is carried by the X-Tenant-Id header the app already sends.
 *
 * Consequence worth stating plainly: this proves the DATA contract, not the AUTH contract. A
 * regression in who-may-see-what would not be caught here.
 */
const UI_PORT = 4320; // distinct from the hermetic lane's 4319 so both can run at once
const ENGINE = "http://localhost:8080";
const GATEWAY_PORT = 8099;
const GATEWAY = `http://localhost:${GATEWAY_PORT}`;
// One tenant per run, shared by the gateway stand-in and the specs.
const TENANT = process.env.LIVE_TENANT ?? "e2e-live-local";

export default defineConfig({
  testDir: "./e2e-live",
  // A real engine + a real database is simply slower than a stub; a submit round-trip includes
  // JPA, an outbox write and a Camunda process start.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // Serial by design: these specs share one database. Parallel workers would race on tenant state
  // and produce failures that look like product bugs but are test-harness collisions.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Keep the terminal output terse, but ALSO write the HTML report — it is what embeds the trace,
  // video and screenshot for a failure. Without it `playwright-report/` never exists, and the
  // "upload report on failure" CI step silently uploads nothing (which is exactly what it had been
  // doing: a run with 168 failures produced no diagnostic artifact at all).
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${UI_PORT}`,
    // retain-on-failure, NOT on-first-retry: on-first-retry captures the RETRY, so a failure that
    // doesn't reproduce leaves you with nothing, and locally (retries: 0) it never captures at all.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // RECORD=1 keeps video for every test — for producing a walkthrough of a flow on demand.
    // Otherwise video is recorded and thrown away unless the test fails.
    video: process.env.RECORD === "1" ? "on" : "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Boot the engine from source. `spring-boot:run` with no profile uses embedded H2, so this
      // needs no Postgres, no Docker and no secrets — the same posture a developer gets locally.
      command: "./mvnw -q spring-boot:run",
      cwd: "../luke-core-engine",
      url: `${ENGINE}/actuator/health`,
      reuseExistingServer: true, // reuse an engine you already have running; don't fight it
      timeout: 240_000, // a cold Maven start is genuinely this slow
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // The gateway stand-in. The browser talks to THIS, not the engine — mirroring deployment,
      // where identity is asserted server-side because the engine's CORS refuses X-User-Id from a
      // browser on purpose. See e2e-live/support/gateway.mjs.
      command: "node e2e-live/support/gateway.mjs",
      url: `${GATEWAY}/session`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { LIVE_GATEWAY_PORT: String(GATEWAY_PORT), LIVE_ENGINE: ENGINE, LIVE_TENANT: TENANT },
    },
    {
      command: `npm run dev -- --port ${UI_PORT} --strictPort`,
      url: `http://localhost:${UI_PORT}/signin`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Point the app at the gateway stand-in, exactly as it points at luke-auth-engine in
      // deployment. Everything under /api/** is proxied through to the real engine.
      env: { VITE_AUTH_API_URL: GATEWAY, VITE_WORKFLOW_ENABLED: "true" },
    },
  ],
});
