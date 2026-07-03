/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  build: {
    // Hidden source maps: uploadable to Sentry for readable prod stack traces, but
    // not referenced from (or served with) the shipped JS.
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        // Keep the stable React runtime (react, react-dom, router, scheduler) in its own
        // long-cached chunk so ordinary app churn doesn't invalidate it on every deploy.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) {
            return "react-vendor";
          }
        },
      },
    },
  },
  test: {
    // jsdom so component tests (FormRenderer) can mount; the pure-logic suites
    // (formSchema, expression) run fine under it too.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // e2e/ holds Playwright specs (run via `npm run test:e2e`), not vitest.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    // 8 GB machine: vitest otherwise spawns one fork per CPU core (~8) and
    // thrashes swap. Cap the pool so a run can't starve the system.
    maxWorkers: 2,
  },
});
