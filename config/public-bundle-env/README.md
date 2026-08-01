# Deliberately empty env directory

`vite.embed.config.ts` and `vite.respond.config.ts` point `envDir` here so that building the
public bundles picks up **no developer environment at all**.

Vite loads `.env.local` from the project root for every mode, and inlines every `VITE_*` value it
finds into the output. These two bundles are committed into **luke-core-engine** and served to
third-party websites, so anything inlined at build time becomes part of a public artefact and
depends on *whose machine built it*.

That is not hypothetical. On 2026-08-01 a bundle built on a laptop carrying
`VITE_ANALYTICS_ENABLED=true` in `.env.local` differed from the CI build by exactly six bytes —
a feature flag baked into a public file. The embed config had already patched `VITE_AUTH_API_URL`
by hand for the same reason; this directory fixes the whole class instead of one variable.

With `envDir` pointed at this folder (which contains no `.env*` files), the bundles depend only on
committed source, so they are byte-identical no matter who builds them — which is what makes
`public-bundles.lock.json` a meaningful check.

Values the public bundles genuinely need are set explicitly via `define:` in each config.
