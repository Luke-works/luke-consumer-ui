# luke-consumer-ui — working instructions (forms section)

The forms UI consumes **`@lukeflow/form-core` / `form-react` / `form-builder`** as **vendored
built dist** under `vendor/@lukeflow/<pkg>/` (NOT a workspace dep) — the source lives in the
`luke-forms` monorepo. The builder is mounted at `/build-v2` (modal settings mode).

## Forms engineering playbook (work in this style)

1. **Investigate first** — read/`grep` the real code (here AND the `luke-forms` source) before changing it.
2. **Decide vs. ask** — act on clear asks; on a genuine design fork ask ONE focused,
   recommendation-first `AskUserQuestion` with previews, then build.
3. **Source change lives in luke-forms** — feature/bugfix work on the form packages happens in
   the `luke-forms` monorepo; this repo only **re-vendors the built dist** and themes it
   (`src/styles/lukeforms-theme.css`). Keep the package public API stable.
4. **Verify the gauntlet** — for form changes: build the package, vendor it, then
   `npm run build` here (`tsc -b && vite build`) — `tsc -b` passing confirms the public types
   still resolve. Push `develop` and confirm CI (CI + E2E) green.
5. **Adversarially self-review before shipping**; fix confirmed findings; re-verify.
6. **Report faithfully** — exact CI/check results; say "done" only when verified.

## Vendor + ship flow

In `luke-forms`: `npm run build -w @lukeflow/<pkg>`. Here: copy
`index.{js,cjs,d.ts,d.cts}` + `styles.css` into `vendor/@lukeflow/<pkg>/dist` (drop `*.map`) →
`npm run build` → commit to **`develop`** → push → confirm **CI + E2E** green via
`gh run list --branch develop`.

## Public bundles (/embed and /respond) are served by ANOTHER repo

`embed.js/css` and `respond.js/css` are built here and **served by luke-core-engine** from
`src/main/resources/static/{embed,respond}-assets/`. A deploy of *this* app does not ship them —
they only reach users when core-engine is committed and deployed.

After changing the embed/respond pages **or any `@lukeflow/form-*` package vendored into them**:

```
npm run vendor:embed && npm run vendor:respond   # copies into ../luke-core-engine
npm run bundles:lock                             # record the new hashes here
# then commit + push BOTH repos
```

`npm run bundles:check` runs in CI and fails when the built output stops matching
`public-bundles.lock.json` — this exists because the copy was unverified and both bundles once sat
five days stale, serving a form with none of its layout fixes.

Do **not** hand-edit the vendored files, and note the bundles read **no** `.env` (their `envDir`
points at an empty folder): a local `VITE_*` flag would otherwise be compiled into a public
artefact. Values they need are set explicitly via `define:` in the vite configs.

## Gotchas

- Build shows benign `Unexpected ")"` CSS warnings (TailAdmin/simplebar `:is()`); not ours.
- Playwright "Executable doesn't exist" → `npx playwright install chromium`; environmental.

Full persona / rationale: `luke-forms/docs/FORMS_PERSONA.md`. End commit messages with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

<!-- luke-docs-sync -->
## Documentation (luke-docs)

This repo is documented in the **luke-docs** manual (`Luke-works/luke-docs`, private VitePress site).

**If a change here is _doc-visible_** — a new/removed capability, endpoint, package or service; a
change to architecture, auth, deployment or the tech stack; a status move (in-progress ↔ ready); or
a notable test/CI change — **update the matching page in the same PR/session:**

- Page: `luke-docs/apps/consumer-ui.md`
- If status changed, also update `luke-docs/reference/completeness.md` and `luke-docs/guide/fleet-map.md`.

Trivial changes (typos, refactors, dep bumps) don't need a docs edit. Full workflow: `luke-docs/MAINTAINING.md`.
