import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // `vendor/` holds built third-party dist (the @lukeflow/* packages) — never lint it;
  // its bundled code can carry eslint-disable directives for plugins we don't load.
  { ignores: ['dist', 'vendor'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Off by design: this is a Vite fast-refresh (HMR) hint with no production or
      // correctness impact, and it flags our idiomatic co-location of a context's hook
      // with its provider (e.g. useAuth + AuthProvider). Turning it off lets lint run as
      // a zero-warning gate (`--max-warnings 0`) on the rules that actually matter.
      'react-refresh/only-export-components': 'off',
    },
  },
)
