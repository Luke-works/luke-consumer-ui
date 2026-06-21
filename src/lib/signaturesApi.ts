// Client for the e-signature API (luke-signature-engine). Built to the shared SIGNATURES
// contract. The base URL is configurable: VITE_SIGNATURES_API_URL points at the standalone
// service (e.g. http://localhost:8090) now; unset → falls back to VITE_AUTH_API_URL so it
// rides the gateway after the capability folds into core.
//
// Authed calls send Authorization: Bearer + X-Tenant-Id (NEVER X-User-Id — the gateway
// forbids it and asserts the user from the session). The public /api/public/sign/** calls
// send NO auth/tenant headers — the unguessable token in the path is the sole auth.
import { ApiError, getAccessToken, refresh, asArray } from "./authApi";

const BASE = (
  import.meta.env.VITE_SIGNATURES_API_URL ||
  import.meta.env.VITE_AUTH_API_URL ||
  ""
).replace(/\/$/, "");

const seg = (s: string) => encodeURIComponent(s);

// Timestamps may arrive as epoch millis, an ISO string, or a Jackson [Y,M,D,h,m,s] array.
const ms = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  if (Array.isArray(v) && v.length >= 3) {
    const [Y, Mo, D, h = 0, mi = 0, s = 0] = v as number[];
    return new Date(Y, Mo - 1, D, h, mi, s).getTime();
  }
  return undefined;
};

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

/** Authed fetch against the signatures base: Bearer + X-Tenant-Id, one refresh-on-401 retry. */
async function authedFetch(
  tenant: string,
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-Tenant-Id", tenant);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Set JSON content-type only for non-FormData bodies (let the browser set multipart boundary).
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
  if (res.status === 401 && retry) {
    const r = await refresh();
    if (r) return authedFetch(tenant, path, init, false);
  }
  return res;
}

function reqJson<T>(tenant: string, path: string, init: RequestInit = {}): Promise<T> {
  return authedFetch(tenant, path, init).then(parse<T>);
}

// ── Types (view models; wire DTOs are adapted below) ───────────────────────────────

export type SignatureStatus = "DRAFT" | "SENT" | "VIEWED" | "SIGNED" | "COMPLETED" | "VOIDED";
export type VerificationMethod = "NONE" | "EMAIL_OTP" | "SMS_OTP" | "IDV";

/** Field placement in UI coordinates (origin top-left); the engine flips Y for the PDF. */
export type SignatureField = { page: number; x: number; y: number; w: number; h: number };

export type SignatureRequest = {
  id: string;
  code: string;
  name: string;
  status: SignatureStatus;
  signerEmail: string;
  signerName: string;
  verificationMethod: VerificationMethod;
  field: SignatureField;
  createdBy?: string;
  createdByName?: string;
  retainUntil?: number;
  createdAt?: number;
  sentAt?: number;
  signedAt?: number;
};

export type SignatureAuditEvent = {
  action: string;
  actor?: string;
  ipAddress?: string;
  userAgent?: string;
  geoCountry?: string;
  geoCity?: string;
  ipRisk?: string;
  at?: number;
};

export type SignatureDetail = { request: SignatureRequest; audit: SignatureAuditEvent[] };

// ── Wire shapes + adapters ─────────────────────────────────────────────────────────

type ApiSignature = Omit<SignatureRequest, "retainUntil" | "createdAt" | "sentAt" | "signedAt"> & {
  retainUntil?: unknown;
  createdAt?: unknown;
  sentAt?: unknown;
  signedAt?: unknown;
};

type ApiAudit = Omit<SignatureAuditEvent, "at"> & { at?: unknown };

const toSignature = (a: ApiSignature): SignatureRequest => ({
  id: a.id,
  code: a.code,
  name: a.name,
  status: a.status,
  signerEmail: a.signerEmail,
  signerName: a.signerName,
  verificationMethod: a.verificationMethod ?? "NONE",
  field: a.field,
  createdBy: a.createdBy,
  createdByName: a.createdByName,
  retainUntil: ms(a.retainUntil),
  createdAt: ms(a.createdAt),
  sentAt: ms(a.sentAt),
  signedAt: ms(a.signedAt),
});

const toAudit = (a: ApiAudit): SignatureAuditEvent => ({
  action: a.action,
  actor: a.actor,
  ipAddress: a.ipAddress,
  userAgent: a.userAgent,
  geoCountry: a.geoCountry,
  geoCity: a.geoCity,
  ipRisk: a.ipRisk,
  at: ms(a.at),
});

// ── Authenticated (tenant-scoped) operations ───────────────────────────────────────

/** Create a DRAFT request from a PDF + metadata (multipart). */
export async function createSignature(
  tenant: string,
  file: File,
  meta: {
    name: string;
    signerEmail: string;
    signerName: string;
    field: SignatureField;
    verificationMethod?: VerificationMethod;
    signerPhone?: string;
  },
): Promise<SignatureRequest> {
  const form = new FormData();
  form.append("file", file);
  form.append("json", JSON.stringify(meta));
  const a = await reqJson<ApiSignature>(tenant, "/api/signatures", { method: "POST", body: form });
  return toSignature(a);
}

/** The tenant's requests, newest first. */
export async function listSignatures(tenant: string): Promise<SignatureRequest[]> {
  const list = await reqJson<ApiSignature[]>(tenant, "/api/signatures");
  return asArray<ApiSignature>(list).map(toSignature);
}

/** A single request + its IP-stamped audit trail. */
export async function getSignature(tenant: string, id: string): Promise<SignatureDetail> {
  const d = await reqJson<{ request: ApiSignature; audit: ApiAudit[] }>(
    tenant,
    `/api/signatures/${seg(id)}`,
  );
  return { request: toSignature(d.request), audit: (d.audit ?? []).map(toAudit) };
}

/** Mint + return the public signing link. */
export async function sendSignature(tenant: string, id: string): Promise<string> {
  const r = await reqJson<{ signUrl: string }>(tenant, `/api/signatures/${seg(id)}/send`, {
    method: "POST",
  });
  return r.signUrl;
}

/** Cancel a request. */
export async function voidSignature(tenant: string, id: string): Promise<SignatureRequest> {
  const a = await reqJson<ApiSignature>(tenant, `/api/signatures/${seg(id)}/void`, { method: "POST" });
  return toSignature(a);
}

/** Download the sealed PDF (COMPLETED only) as a Blob. */
export async function downloadSigned(tenant: string, id: string): Promise<Blob> {
  const res = await authedFetch(tenant, `/api/signatures/${seg(id)}/signed.pdf`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || `Download failed (${res.status})`, text);
  }
  return res.blob();
}

// ── Public signing surface (token-authenticated; NO auth/tenant headers) ────────────

export type SigningSession = {
  name: string;
  signerName: string;
  field: SignatureField;
  pdfBase64: string;
  verification: { required: boolean; method: VerificationMethod; sentTo?: string | null };
};

/** Load a signing session by token (marks VIEWED). Throws ApiError(404|410) for bad links. */
export async function getSigningSession(token: string, signal?: AbortSignal): Promise<SigningSession> {
  const res = await fetch(`${BASE}/api/public/sign/${seg(token)}`, { signal });
  return parse<SigningSession>(res);
}

/** Submit the drawn signature. Throws ApiError on 400/403/404/410. */
export async function submitSignature(
  token: string,
  input: { signaturePngBase64: string; consent: boolean; signerNameTyped?: string },
  signal?: AbortSignal,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/public/sign/${seg(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  return parse<{ ok: boolean }>(res);
}
