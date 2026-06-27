// App glue for the e-signature capability. The headless contract + transport live in the
// vendored @lukeflow/sign-core; here we inject this app's auth (token getter + refresh-on-401)
// and base URL, then expose ready-to-use clients + re-export the schema/lifecycle helpers.
//
// Base URL: VITE_SIGNATURES_API_URL → the standalone engine (http://localhost:8090); unset →
// VITE_AUTH_API_URL so it rides the gateway post-merge. Authed calls send Authorization +
// X-Tenant-Id (never X-User-Id). Public per-recipient signing uses the token alone.
import {
  createSignatureDefinitionsClient,
  createSignatureInstancesClient,
} from "@lukeflow/sign-core";
import { getAccessToken, refresh } from "./authApi";

const BASE = (
  import.meta.env.VITE_SIGNATURES_API_URL ||
  import.meta.env.VITE_AUTH_API_URL ||
  ""
).replace(/\/$/, "");

const auth = { baseUrl: BASE, getToken: getAccessToken, refresh };

/** Phase 1 — design-time signature definitions (CRUD + checkout/check-in/sign-off/publish + docs). */
export const signatureDefinitions = createSignatureDefinitionsClient(auth);

/** Phase 2 — runtime campaigns/instances (start, track, cancel, download sealed) + public signing. */
export const signatureInstances = createSignatureInstancesClient(auth);

/** Build the public signing link for a recipient token (recipients deliver this). */
export const recipientSignUrl = (token: string): string =>
  `${window.location.origin}/sign/${encodeURIComponent(token)}`;

// Re-export contract + helpers so app code imports from one place.
export {
  ApiError,
  parseSignatureSchema,
  repairSignatureSchema,
  defaultSignatureSchema,
  validateSignatureSchema,
  isSchemaSignable,
  lifecycleGate,
  FIELD_TYPE_LABEL,
  isTerminalInstanceState,
} from "@lukeflow/sign-core";
export type {
  StoredSignatureDefinition,
  SignatureArtifact,
  SignatureDefinitionAudit,
  SignatureSchema,
  SchemaVariable,
  SignerRole,
  SignatureDefinitionStatus,
  LifecycleState,
  SignatureInstance,
  SignatureInstanceDetail,
  InstanceRecipient,
  SignatureInstanceState,
  RecipientSession,
  CampaignInput,
} from "@lukeflow/sign-core";
