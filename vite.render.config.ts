import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// The PDF RENDER HARNESS bundle. Like the embed bundle, it's built separately from the SPA into a
// single render.js + render.css with FIXED names (no hashed chunks), so luke-file-proxy can vendor
// it and assemble a self-contained HTML page (inline CSS + JS + injected window.__LUKE_RENDER__)
// to load in headless Chromium. Entry is render-main.tsx (read-only renderer only, no router/API).
export default defineConfig({
  plugins: [
    react(),
    svgr({ svgrOptions: { icon: true, exportType: "named", namedExport: "ReactComponent" } }),
  ],
  // The harness never calls the API (data is injected), so neutralise any baked API base.
  define: {
    "import.meta.env.VITE_AUTH_API_URL": JSON.stringify(""),
  },
  publicDir: false,
  build: {
    outDir: "dist-render",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: fileURLToPath(new URL("./src/render-main.tsx", import.meta.url)),
      output: {
        inlineDynamicImports: true, // one JS file, no code-split chunks
        entryFileNames: "render.js",
        assetFileNames: "render.[ext]",
      },
    },
  },
});
