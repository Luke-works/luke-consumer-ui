// Copies a built standalone public bundle (respond / embed) into core-engine's static assets, so
// core serves it. These bundles are BUILT here but SERVED by core-engine — without this copy a
// change to the recipient/embed page never reaches users even after a consumer-ui deploy. Run via
// `npm run vendor:respond` / `npm run vendor:embed` (each builds first), then commit + push core.
//
// Assumes luke-core-engine is a sibling of this repo; override with CORE_STATIC_DIR when it isn't
// (point it at core-engine's src/main/resources).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The recipient PORTAL bundle moved to its own repo (luke-portal); it vendors itself into
// static/portal-assets via its own scripts/vendor-portal.mjs. This script serves the bundles that
// are still BUILT in consumer-ui.
const BUNDLES = {
  respond: { dist: "dist-respond", files: ["respond.js", "respond.css"], target: "static/respond-assets" },
  embed: { dist: "dist-embed", files: ["embed.js", "embed.css"], target: "static/embed-assets" },
};

const name = process.argv[2];
const cfg = BUNDLES[name];
if (!cfg) {
  console.error(`Unknown bundle "${name ?? ""}". Use one of: ${Object.keys(BUNDLES).join(", ")}`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreResources = process.env.CORE_STATIC_DIR
  ? resolve(process.env.CORE_STATIC_DIR)
  : resolve(root, "../luke-core-engine/src/main/resources");

if (!existsSync(coreResources)) {
  console.error(
    `core-engine resources not found at:\n  ${coreResources}\n` +
      `Set CORE_STATIC_DIR to your luke-core-engine/src/main/resources and retry.`,
  );
  process.exit(1);
}

const distDir = join(root, cfg.dist);
if (!existsSync(distDir)) {
  console.error(`Build output ${cfg.dist}/ not found — build the bundle first (npm run build:${name}).`);
  process.exit(1);
}

const targetDir = join(coreResources, cfg.target);
mkdirSync(targetDir, { recursive: true });
for (const f of cfg.files) {
  const src = join(distDir, f);
  if (!existsSync(src)) {
    console.error(`Missing built file: ${src}`);
    process.exit(1);
  }
  copyFileSync(src, join(targetDir, f));
  console.log(`  ✓ ${cfg.dist}/${f} → ${cfg.target}/${f}`);
}
console.log(`\nVendored the ${name} bundle into core-engine.\n→ Now commit + push luke-core-engine to deploy it.`);
