import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// The self-contained OUTBOUND RECIPIENT bundle (the "different static serve" for prefilled forms).
// Built separately from the SPA so it has NO shared, hashed chunks: everything inlines into a single
// `respond.js` + `respond.css` with FIXED names, which core-engine vendors and serves at a stable
// path (/respond-assets/*) behind the /respond/:token shell. Entry is the router-only
// `respond-main.tsx` (no app chrome, no auth). Mirrors vite.embed.config.ts.
export default defineConfig({
  plugins: [
    react(),
    svgr({ svgrOptions: { icon: true, exportType: "named", namedExport: "ReactComponent" } }),
  ],
  // The recipient page is served by core-engine at the gateway origin (same origin as the public
  // /api/public/form-instances API), so it must call the API SAME-ORIGIN/relative. Force the public
  // API base to "" — otherwise publicInstanceApi bakes in the build host's VITE_AUTH_API_URL.
  // NO developer environment reaches this bundle. Vite loads .env.local from the project root
  // for every mode and inlines every VITE_* value it finds; this file is committed into
  // luke-core-engine and served to third-party sites, so a stray local flag becomes part of a
  // public artefact and the output stops depending only on committed source. Pointing envDir at
  // an empty folder makes the build byte-identical whoever runs it. See that folder's README.
  envDir: fileURLToPath(new URL("./config/public-bundle-env", import.meta.url)),
  define: {
    "import.meta.env.VITE_AUTH_API_URL": JSON.stringify(""),
  },
  publicDir: false,
  build: {
    outDir: "dist-respond",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: fileURLToPath(new URL("./src/respond-main.tsx", import.meta.url)),
      output: {
        inlineDynamicImports: true, // one JS file, no code-split chunks
        entryFileNames: "respond.js",
        assetFileNames: "respond.[ext]",
      },
    },
  },
});
