// DRIFT GUARD for the public bundles that are BUILT here and SERVED by luke-core-engine
// (/embed and /respond). Records the SHA-256 of each built file in public-bundles.lock.json and
// fails when a fresh build no longer matches it.
//
// WHY THIS EXISTS. `scripts/vendor-bundle.mjs` copies these bundles into core-engine's
// static/ directory, and that copy is a MANUAL step someone has to remember after changing
// anything the bundles include — the embed page, the respond page, or any @lukeflow/form-*
// package vendored into them. Nothing verified it, so it silently rotted: on 2026-08-01 both
// committed bundles turned out to be five days and several features stale, missing the ENTIRE
// forms layout fix set (the scoped box-sizing reset, the hidden-label column collapse, the
// checkbox alignment) plus the submission-validation tightening. Those layout bugs are invisible
// wherever the host page ships a CSS reset — so the third-party embed was the one surface where
// they showed, and the one surface still serving the old code.
//
// This turns "nobody noticed for five days" into "CI fails the moment the output changes". It
// does NOT check core-engine directly — the two repos have no shared CI — but it fires exactly
// when a re-vendor becomes necessary, which is the moment the obligation is easy to forget.
//
//   npm run bundles:check   verify (CI; assumes `npm run build` already ran)
//   npm run bundles:lock    rebuild + record, after an INTENDED bundle change
//
// The lock is a hash, not a copy: committing two 350 KB minified blobs into this repo as well as
// core-engine's would double the review noise for zero extra signal.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(root, "public-bundles.lock.json");

/** Must stay in step with BUNDLES in vendor-bundle.mjs — same dists, same files. */
const BUNDLES = {
  embed: { dist: "dist-embed", files: ["embed.js", "embed.css"], served: "static/embed-assets" },
  respond: { dist: "dist-respond", files: ["respond.js", "respond.css"], served: "static/respond-assets" },
};

const write = process.argv.includes("--write");

const actual = {};
const missing = [];
for (const [name, cfg] of Object.entries(BUNDLES)) {
  for (const file of cfg.files) {
    const path = join(root, cfg.dist, file);
    if (!existsSync(path)) {
      missing.push(`${cfg.dist}/${file}`);
      continue;
    }
    actual[`${name}/${file}`] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
}

if (missing.length) {
  console.error(
    `Built bundles not found:\n  ${missing.join("\n  ")}\n\n` +
      `Run \`npm run build\` first (it builds both), or \`npm run bundles:lock\` to build and record.`,
  );
  process.exit(1);
}

if (write) {
  const lock = {
    // Read by humans first: say what this file is for right inside it.
    _comment:
      "SHA-256 of the public bundles built here and SERVED by luke-core-engine. If `npm run " +
      "bundles:check` fails, the bundles changed: run `npm run vendor:embed` and " +
      "`npm run vendor:respond` to copy them into core-engine, commit BOTH repos, then " +
      "`npm run bundles:lock` to record the new hashes.",
    bundles: actual,
  };
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(actual).length} bundle hashes in public-bundles.lock.json`);
  process.exit(0);
}

if (!existsSync(LOCK)) {
  console.error(`Missing public-bundles.lock.json — create it with \`npm run bundles:lock\`.`);
  process.exit(1);
}

const expected = JSON.parse(readFileSync(LOCK, "utf8")).bundles ?? {};
const drifted = Object.keys(actual).filter((k) => expected[k] !== actual[k]);
const vanished = Object.keys(expected).filter((k) => !(k in actual));

if (drifted.length === 0 && vanished.length === 0) {
  console.log(`Public bundles match the lock (${Object.keys(actual).length} files).`);
  process.exit(0);
}

console.error("The public bundles no longer match public-bundles.lock.json.\n");
for (const k of drifted) {
  console.error(`  ${k}`);
  console.error(`    locked: ${expected[k] ?? "(absent)"}`);
  console.error(`    built:  ${actual[k]}`);
}
for (const k of vanished) console.error(`  ${k}: in the lock but no longer built`);
console.error(
  "\nThese files are served by luke-core-engine, NOT by this app, so a deploy here does not\n" +
    "ship them. If the change is intended:\n" +
    "  1. npm run vendor:embed && npm run vendor:respond   (copies into ../luke-core-engine)\n" +
    "  2. commit + push luke-core-engine                   (this is what actually deploys them)\n" +
    "  3. npm run bundles:lock                             (record the new hashes here)\n",
);
process.exit(1);
