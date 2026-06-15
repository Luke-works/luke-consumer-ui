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
  test: {
    // jsdom so component tests (FormRenderer) can mount; the pure-logic suites
    // (formSchema, expression) run fine under it too.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
