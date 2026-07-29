# E2E suite

Hermetic Playwright. Playwright starts the Vite dev server itself and every spec stubs the gateway
(`page.route`), so **no backend is required** and runs are deterministic. `npm run test:e2e`.

| Spec | What it covers |
| --- | --- |
| `screens.spec.ts` | Render matrix — every route × 4 widths: no crash, not blank, no horizontal overflow |
| `visual.spec.ts` | Pixel baseline for every route × 2 widths × **both themes** |
| `visual-states.spec.ts` | Pixel baseline for UI **states** — modals, drawers, errors, success, empty |
| `flows.spec.ts` | List/modal/table interactions |
| `forms-submit.spec.ts` | Fill → submit, and the anonymous embed submit |
| `forms-respond.spec.ts` | Outbound recipient journey: verify by code → fill → submit, incl. field ownership |
| `smoke.spec.ts` | Signed-out landing + public embed |
| `forms-builder-overflow.spec.ts` | The builder's own overflow guarantees |

The screen inventory lives once in `support/screens.ts`. Add a route there and it is **automatically
both smoke-checked and pixel-checked** — the two suites can't drift about what "every screen" means.

## When something fails

A failing test keeps four things: a **video** of the run, a **trace** (step-by-step with DOM
snapshots and network), a **screenshot** at the moment of failure, and an HTML report that embeds
all three. CI uploads them as the `playwright-report` artifact, kept 14 days.

```bash
npm run e2e:report                      # open the HTML report
npx playwright show-trace test-results/<test>/trace.zip   # replay it action by action
```

Video is deliberately NOT recorded everywhere. It's on for the multi-step **flow** specs, and off
for the render matrix and the visual suites — a recording of a single page load, or of a pixel
diff that already ships expected/actual/diff images, costs runtime and explains nothing.

> A video is evidence, not a guarantee. Nothing diffs videos frame-to-frame; what makes a flow
> *guaranteed* is the assertions inside it. The recording only tells you why one broke.

### Recording a walkthrough

```bash
npm run e2e:record     # RECORD=1 — keeps video for every flow test, pass or fail
```

Writes `.webm` per test under `test-results/`, useful for showing a journey to someone rather than
describing it.

## Visual regression

The render matrix proves a page mounts and doesn't scroll sideways. All of that can hold while the
page looks wrong — a wrapped toolbar, a modal that lost its padding, a dark-mode token that stopped
resolving. `visual.spec.ts` is what sees those.

**Baselines are Linux-only.** Font rasterisation and subpixel antialiasing are platform-specific, so
a macOS baseline can never match the ubuntu CI runner; Playwright encodes this by suffixing snapshot
filenames with the platform. On any non-Linux machine the suite **skips itself** rather than
producing a wall of meaningless diffs. Locally you get the other specs; CI is where pixels are judged.

### After an intended visual change

The baselines are committed, so a deliberate redesign will (correctly) fail the visual suite. To
re-approve:

1. **Actions → E2E → Run workflow** on your branch. The `Update visual baselines (manual)` job
   regenerates them on the same OS CI uses.
2. Download the `visual-baselines` artifact.
3. Unzip it over `e2e/visual.spec.ts-snapshots/` and commit.

The job deliberately **uploads** rather than pushing. A job that committed its own baselines would
approve every regression automatically and the suite would only ever confirm the last run — the
human looking at the diff *is* the test.

### What's covered

| Axis | Why |
| --- | --- |
| **Both themes** | Dark mode is a second full rendering built from CSS custom properties, so it fails independently. A token that stops resolving or a hard-coded hex with no dark variant renders fine and passes every structural check — and is obvious in a pixel diff. Highest-yield axis to duplicate. |
| **UI states** | Most of what a user looks at isn't a resting route: it's a modal, an open drawer, a validation error, a success panel. Those have their own layout and z-index and were entirely uncovered. |
| **Two widths** | See below. |

`visual-states.spec.ts` drives the app into each state before shooting it. A state must END visible,
asserted against the same accessible names the functional specs use — so a state that stops being
reachable fails loudly rather than silently screenshotting the page behind it.

On a non-Linux machine the suite skips. `VERIFY_SETUP=1 npx playwright test e2e/visual-states.spec.ts`
runs it anyway: the screenshots won't match, but every `setup` executes, which is how you confirm a
NEW state is reachable before asking CI to bless a baseline for it.

A state that can't be opened **reliably** is left out rather than made flaky — the header
notification panel is one; it opens or not depending on interaction order, and a visual test that
diffs at random is worse than no test.

### Two widths, not four

The render matrix runs 4 viewports because an overflow check is free. A baseline is a committed
binary a human must re-approve on every intended change, so each extra width is a permanent tax on
legitimate work. Phone (390) is where layout actually breaks; laptop (1280) is where the product is
used. Tablet and desktop sit between them.

### If a screen is inherently unstable

Nothing in the app renders relative timestamps, charts or random data under stubs, which is why this
works at all. If that changes, mask the region rather than deleting the test:

```ts
await expect(page).toHaveScreenshot("name.png", {
  mask: [page.getByTestId("live-timestamp")],
});
```

## The live lane (`e2e-live/`)

`npm run test:e2e:live` runs the same browser automation against a **real core-engine** on embedded
H2 — no Postgres, no Docker, no secrets. Playwright boots the engine, a gateway stand-in and the dev
server itself.

It exists for one class of bug the hermetic suite structurally cannot see: **the app and the server
disagreeing.** If the engine starts rejecting or stripping a field the app still sends, every
hermetic test stays green while real submissions quietly lose data. Breadth belongs in the hermetic
suite; this lane stays small and pointed.

### Why there's a gateway stand-in

The first attempt injected `X-User-Id` into the browser's requests and could never have worked —
core-engine's CORS allows only `Authorization`, `Content-Type`, `Accept` and `X-Tenant-Id`, so the
preflight strips it. That is deliberate: in deployment luke-auth-engine verifies the session token,
**discards any client-supplied `X-User-Id`** and injects the verified one server-side, so a browser
can never assert who it is.

`support/gateway.mjs` reproduces that topology — browser → gateway → engine — doing exactly the two
things the real gateway does here: serve `/auth/refresh` + `/session`, and proxy everything else
with identity injected. It asserts an identity rather than verifying one, which is why:

> **The live lane proves the DATA contract, not the AUTH contract.** A regression in who-may-see-what
> will not surface here. Covering that needs the real gateway and real WorkOS credentials.

### Capability access is real

`permitAll` in Spring Security makes the API look open in dev. It isn't — `CapabilityAccessInterceptor`
answers 403 first, and a request needs BOTH an active tenant subscription and a user grant. The
fixture provisions those through the same endpoints an operator would, so the lane can't drift from
how access actually works.
