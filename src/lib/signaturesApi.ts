// App glue for the e-signature API. The transport-agnostic client lives in the headless
// @lukeflow/sign-core package (vendored); here we just inject this app's auth (token getter +
// refresh-on-401) and base URL, then re-export the contract types + a ready-to-use client.
//
// Base URL: VITE_SIGNATURES_API_URL points at the standalone engine (e.g. http://localhost:8090);
// unset → falls back to VITE_AUTH_API_URL so it rides the gateway after the capability folds
// into core. Authed calls send Authorization: Bearer + X-Tenant-Id (NEVER X-User-Id — the
// gateway forbids it). The public /api/public/sign/** calls send NO auth/tenant headers.
import { createSignaturesClient } from "@lukeflow/sign-core";
import { getAccessToken, refresh } from "./authApi";

const BASE = (
  import.meta.env.VITE_SIGNATURES_API_URL ||
  import.meta.env.VITE_AUTH_API_URL ||
  ""
).replace(/\/$/, "");

/** The app's e-signature client — auth injected from authApi. */
export const signaturesClient = createSignaturesClient({
  baseUrl: BASE,
  getToken: getAccessToken,
  refresh,
});

// Re-export the contract (types, geometry helpers, ApiError) so app code imports from one place.
export {
  ApiError,
  isRotated,
  cssToPdf,
  fieldToCssRect,
  placeField,
  DEFAULT_FIELD_SIZE,
} from "@lukeflow/sign-core";
export type {
  SignatureStatus,
  VerificationMethod,
  SignatureField,
  SignatureRequest,
  SignatureAuditEvent,
  SignatureDetail,
  SigningSession,
  PdfGeometry,
  CreateSignatureInput,
  SubmitSignatureInput,
} from "@lukeflow/sign-core";
