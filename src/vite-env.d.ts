/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_API_URL: string;
  /** Base URL for the e-signature API. Standalone: the luke-signature-engine (e.g.
   *  http://localhost:8090). Unset → falls back to VITE_AUTH_API_URL (post-merge, via the gateway). */
  readonly VITE_SIGNATURES_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
