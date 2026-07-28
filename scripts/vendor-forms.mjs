// Vendors the built @lukeflow/form-* packages from the luke-forms monorepo into vendor/@lukeflow/,
// and verifies that tree hasn't drifted.
//
// WHY THIS EXISTS: vendoring used to be a manual copy of a hand-picked FILE LIST, with a
// hand-maintained package.json. That silently dropped form-core's "./quickjs" subpath — the
// isolated-JS evaluator was built, tested and shipped in luke-forms, then simply never arrived
// here, so the app kept running author JS through `new Function` with no way to opt out. Nothing
// failed; the capability was just absent. This script copies the WHOLE dist and derives the
// package.json from source, so a new entry point cannot be lost in transit.
//
//   node scripts/vendor-forms.mjs          # copy from ../luke-forms (override: LUKE_FORMS_DIR)
//   node scripts/vendor-forms.mjs --check  # verify vendor/ matches its manifest (CI; no source needed)
//
// The --check mode is what CI runs. It cannot compare against luke-forms (a separate private repo
// that isn't checked out here), but it proves the vendored tree is exactly what the last vendor run
// produced — catching hand-edits, partial copies, and missing files.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = ["form-core", "form-react", "form-builder", "form-embed"];

/** package.json fields that belong in a vendored copy. `exports` is the one that matters most —
 *  dropping it is how the quickjs subpath went missing. */
const MANIFEST_FIELDS = [
  "name", "version", "description", "license", "type", "sideEffects",
  "files", "main", "module", "types", "exports", "dependencies", "peerDependencies",
];

/** Extra top-level files (beside dist/) a package ships. */
const EXTRA_FILES = ["styles.css"];

/** The form-embed IIFE build is ALSO served as a static asset for customer sites; keep it in step. */
const GLOBAL_BUNDLE = { pkg: "form-embed", from: "dist/embed.global.js", to: "public/embed.js" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = join(root, "vendor/@lukeflow");
const manifestPath = join(vendorRoot, ".vendor-manifest.json");
const check = process.argv.includes("--check");

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Every file under `dir`, relative to it, excluding source maps (never shipped). */
function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else if (!entry.endsWith(".map")) out.push(relative(base, full));
  }
  return out.sort();
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// ── verify mode ────────────────────────────────────────────────────────────────────────
if (check) {
  if (!existsSync(manifestPath)) {
    fail("vendor/@lukeflow/.vendor-manifest.json is missing — run `npm run vendor:forms` and commit the result.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const problems = [];

  for (const [pkg, entry] of Object.entries(manifest.packages)) {
    const pkgDir = join(vendorRoot, pkg);
    for (const [file, expected] of Object.entries(entry.files)) {
      const full = join(pkgDir, file);
      if (!existsSync(full)) problems.push(`${pkg}/${file} is missing`);
      else if (sha256(full) !== expected) problems.push(`${pkg}/${file} does not match the manifest`);
    }
    // An UNLISTED file is drift too — it means someone added something by hand.
    const onDisk = [...walk(join(pkgDir, "dist"), pkgDir), ...EXTRA_FILES.filter((f) => existsSync(join(pkgDir, f)))];
    for (const file of onDisk) {
      if (!(file in entry.files)) problems.push(`${pkg}/${file} is not in the manifest`);
    }
  }

  const globalTarget = join(root, GLOBAL_BUNDLE.to);
  if (manifest.globalBundle) {
    if (!existsSync(globalTarget)) problems.push(`${GLOBAL_BUNDLE.to} is missing`);
    else if (sha256(globalTarget) !== manifest.globalBundle) {
      problems.push(`${GLOBAL_BUNDLE.to} does not match the manifest — the embed SDK served to customer sites has drifted`);
    }
  }

  if (problems.length) {
    fail(`Vendored @lukeflow/form-* tree has drifted:\n  - ${problems.join("\n  - ")}\n\n` +
      `Re-vendor from luke-forms (\`npm run vendor:forms\`) and commit, rather than editing vendor/ by hand.`);
  }
  console.log(`✓ vendor/@lukeflow matches its manifest (${Object.keys(manifest.packages).length} packages, revendored ${manifest.vendoredAt})`);
  process.exit(0);
}

// ── copy mode ──────────────────────────────────────────────────────────────────────────
const formsDir = resolve(process.env.LUKE_FORMS_DIR ?? join(root, "../luke-forms"));
if (!existsSync(formsDir)) {
  fail(`luke-forms not found at:\n  ${formsDir}\nSet LUKE_FORMS_DIR to your luke-forms checkout and retry.`);
}

// No absolute source path here on purpose — it's committed, and a machine-specific path would
// churn the diff for every developer without telling anyone anything useful.
const manifest = { vendoredAt: new Date().toISOString(), packages: {} };

for (const pkg of PACKAGES) {
  const srcDir = join(formsDir, "packages", pkg);
  const srcDist = join(srcDir, "dist");
  if (!existsSync(srcDist)) {
    fail(`${pkg} has no dist/ — build it first:\n  (cd ${formsDir} && npm run build -w @lukeflow/${pkg})`);
  }

  const destDir = join(vendorRoot, pkg);
  const destDist = join(destDir, "dist");
  // Replace rather than merge, so a file DELETED upstream doesn't linger here forever.
  rmSync(destDist, { recursive: true, force: true });
  mkdirSync(destDist, { recursive: true });

  const files = {};
  for (const rel of walk(srcDist)) {
    const dest = join(destDist, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(srcDist, rel), dest);
    files[join("dist", rel)] = sha256(dest);
  }

  for (const extra of EXTRA_FILES) {
    const src = join(srcDir, extra);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(destDir, extra));
    files[extra] = sha256(join(destDir, extra));
  }

  // Derive package.json from source (whitelisted) — never hand-maintained, so `exports` and every
  // subpath it names come across intact.
  const srcPkg = JSON.parse(readFileSync(join(srcDir, "package.json"), "utf8"));
  const vendored = {};
  for (const field of MANIFEST_FIELDS) {
    if (srcPkg[field] !== undefined) vendored[field] = srcPkg[field];
  }
  writeFileSync(join(destDir, "package.json"), `${JSON.stringify(vendored, null, 2)}\n`);

  // Every subpath the package advertises must actually be present, or consumers get a cryptic
  // ERR_MODULE_NOT_FOUND at build time instead of a clear failure here.
  for (const [subpath, target] of Object.entries(vendored.exports ?? {})) {
    for (const file of typeof target === "string" ? [target] : Object.values(target)) {
      if (!existsSync(join(destDir, file))) {
        fail(`${pkg} advertises "${subpath}" → ${file}, but that file is not in the build output.`);
      }
    }
  }

  manifest.packages[pkg] = { version: srcPkg.version, files };
  console.log(`  ${pkg.padEnd(12)} ${Object.keys(files).length} files, exports: ${Object.keys(vendored.exports ?? {}).join(", ")}`);
}

// The standalone <script src="…/embed.js"> build customer sites load.
const globalSrc = join(formsDir, "packages", GLOBAL_BUNDLE.pkg, GLOBAL_BUNDLE.from);
if (existsSync(globalSrc)) {
  copyFileSync(globalSrc, join(root, GLOBAL_BUNDLE.to));
  manifest.globalBundle = sha256(join(root, GLOBAL_BUNDLE.to));
  console.log(`  ${GLOBAL_BUNDLE.to} ← ${GLOBAL_BUNDLE.pkg}/${GLOBAL_BUNDLE.from}`);
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n✓ Vendored ${PACKAGES.length} packages. Run \`npm run build\` next, then commit vendor/ + public/embed.js.`);
