import { defineConfig, devices } from "@playwright/test";

// Hermetic E2E: Playwright starts the Vite dev server itself and the specs stub all
// network calls (page.route), so no real backend is needed. VITE_AUTH_API_URL must be
// set or App.tsx throws at boot — a dummy value is fine since requests are stubbed.
const PORT = 4319;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
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
    },
  },
});
