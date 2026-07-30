import { defineConfig, devices } from "@playwright/test";

// Hermetic E2E: Playwright starts the Vite dev server itself and the specs stub all
// network calls (page.route), so no real backend is needed. VITE_AUTH_API_URL must be
// set or App.tsx throws at boot — a dummy value is fine since requests are stubbed.
const PORT = 4319;

/** RECORD=1 produces a human-paced walkthrough instead of the fastest possible run. */
const RECORDING = process.env.RECORD === "1";
/** Milliseconds between actions while recording — enough to see each step land. */
const SLOW_MO = Number(process.env.RECORD_SPEED ?? 450);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Terse terminal output, but ALSO write the HTML report — it is what embeds the trace, video
  // and screenshot for a failure. Without it `playwright-report/` never exists and the CI
  // "upload on failure" step silently uploads nothing, which is what it had been doing: a run
  // with 168 failures produced no diagnostic artifact at all.
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // retain-on-failure, NOT on-first-retry: the latter captures the RETRY, so a failure that
    // doesn't reproduce leaves nothing, and locally (retries: 0) it never captures at all.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Recorded for every test and discarded unless it fails. Individual specs opt OUT where a
    // recording explains nothing (the render matrix, the visual suites) — see their headers.
    // RECORD=1 keeps video for every test, for producing a walkthrough of a flow on demand.
    video: RECORDING
      ? { mode: "on", size: { width: 1280, height: 800 } } // legible when played back full-size
      : "retain-on-failure",
    // Pace the actions APART so a person can follow them. A test at full speed fills three fields
    // and submits in under a second, which is correct and unwatchable.
    //
    // Recording-only, deliberately: this buys watchability, not correctness. Adding it to the real
    // suite would put half a second between every action across 305 tests — minutes of wall clock
    // to make output nobody watches slower. Tune with RECORD_SPEED (ms between actions).
    launchOptions: RECORDING ? { slowMo: SLOW_MO } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/signin`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Reveal the post-MVP capabilities so their screens stay reachable in the E2E suite.
    // They're hidden by default in the shipped UI (MVP = Forms + Email + Access) but the
    // pages still exist and must keep full route coverage here.
    env: {
      VITE_AUTH_API_URL: "http://localhost:9999",
      VITE_PHONE_ENABLED: "true",
      VITE_SIGNATURES_ENABLED: "true",
      VITE_WORKFLOW_ENABLED: "true",
      VITE_ANALYTICS_ENABLED: "true",
    },
  },
});
