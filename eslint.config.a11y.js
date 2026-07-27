// Accessibility lint pass (D14) — the base config PLUS eslint-plugin-jsx-a11y's recommended ruleset.
//
// Run non-gating for now (`npm run lint:a11y`) because there is an existing baseline of ~38 findings
// (a mix of live MVP pages and post-MVP Phone/Signatures/Workflow surfaces), several of which are
// UX-opinionated (autofocus, div-onclick). CI runs it informationally so regressions are VISIBLE
// without blocking delivery. Once the baseline is cleared, fold these rules into eslint.config.js so
// the zero-warning gate enforces them — tracked as a follow-up.
import jsxA11y from 'eslint-plugin-jsx-a11y'
import base from './eslint.config.js'

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
  },
]
