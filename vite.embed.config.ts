import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// Route B M2 — the self-contained EMBED bundle. Built separately from the SPA so it has NO shared,
// hashed chunks: everything inlines into a single `embed.js` + `embed.css` with FIXED names, which
// core-engine vendors and serves at a stable path (/embed-assets/*) alongside the per-tenant
// frame-ancestors shell. Entry is the renderer-only `embed-main.tsx` (no router, no app chrome).
export default defineConfig({
  plugins: [
    react(),
    svgr({ svgrOptions: { icon: true, exportType: "named", namedExport: "ReactComponent" } }),
  ],
  // The embed renderer is ALWAYS served by core-engine at the gateway origin (same origin as the
  // public /api/public/embed API), so it must call the API SAME-ORIGIN/relative. Force the public
  // API base to "" here — otherwise publicEmbedApi bakes in the build host's VITE_AUTH_API_URL
  // (e.g. http://localhost:8083 from a local build), which the iframe then can't reach.
  define: {
    "import.meta.env.VITE_AUTH_API_URL": JSON.stringify(""),
  },
  // Don't copy public/ (favicons, images, and the form-embed SDK's own embed.js) into this output —
  // we only want embed.js + embed.css here, and public/embed.js would otherwise collide with the bundle.
  publicDir: false,
  build: {
    outDir: "dist-embed",
    emptyOutDir: true,
    // The form runs in a third-party iframe; a couple hundred KB is expected for a full renderer.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: fileURLToPath(new URL("./src/embed-main.tsx", import.meta.url)),
      output: {
        inlineDynamicImports: true, // one JS file, no code-split chunks
        entryFileNames: "embed.js",
        assetFileNames: "embed.[ext]",
      },
    },
  },
});
