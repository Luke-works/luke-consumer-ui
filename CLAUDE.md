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

## Gotchas

- Build shows benign `Unexpected ")"` CSS warnings (TailAdmin/simplebar `:is()`); not ours.
- Playwright "Executable doesn't exist" → `npx playwright install chromium`; environmental.

Full persona / rationale: `luke-forms/docs/FORMS_PERSONA.md`. End commit messages with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
