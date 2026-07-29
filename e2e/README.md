# E2E suite

Hermetic Playwright. Playwright starts the Vite dev server itself and every spec stubs the gateway
(`page.route`), so **no backend is required** and runs are deterministic. `npm run test:e2e`.

| Spec | What it covers |
| --- | --- |
| `screens.spec.ts` | Render matrix — every route × 4 widths: no crash, not blank, no horizontal overflow |
| `visual.spec.ts` | Pixel baseline for every route × 2 widths (see below) |
| `flows.spec.ts` | List/modal/table interactions |
| `forms-submit.spec.ts` | Fill → submit, and the anonymous embed submit |
| `forms-respond.spec.ts` | Outbound recipient journey: verify by code → fill → submit, incl. field ownership |
| `smoke.spec.ts` | Signed-out landing + public embed |
| `forms-builder-overflow.spec.ts` | The builder's own overflow guarantees |

The screen inventory lives once in `support/screens.ts`. Add a route there and it is **automatically
both smoke-checked and pixel-checked** — the two suites can't drift about what "every screen" means.

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
