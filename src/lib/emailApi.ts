// Client for the capability-engine email setup, routed through the gateway
// (/api/email-verification/** and /api/email-servers/** → core-engine proxy →
// capability-engine). Phase 1: prove the org controls an official mailbox via an
// OTP, then the tenant's Postmark server is auto-provisioned. Tenant-scoped
// (X-Tenant-Id) and EMAIL-capability-gated server-side.
import { ApiError, authed, tenantInit } from "./authApi";

const VERIFY_BASE = "/api/email-verification";
const SERVER_BASE = "/api/email-servers";

export type VerificationStatus = "PENDING" | "VERIFIED" | "EXPIRED" | "FAILED";

/** An OTP challenge's public state (never carries the code). */
export type Verification = {
  id: string;
  status: VerificationStatus;
  email: string;
  domain: string;
  orgName: string;
  attemptsRemaining: number;
  expiresAt?: number;
};

/** The tenant's provisioned sending identity. */
export type EmailServer = {
  id: string;
  companySlug: string;
  senderDomain: string;
  defaultFrom: string;
  serverName?: string;
  messageStream: string;
  status: string;
  verifiedEmail?: string;
  verifiedDomain?: string;
  verifiedAt?: number;
  createdAt?: number;
};

/** Verify outcome: the challenge + the auto-provisioned server (or a provisioning error). */
export type VerifyResult = {
  verification: Verification;
  server: EmailServer | null;
  provisioningError: string | null;
};

// LocalDateTime may arrive as an ISO string, a [Y,M,D,h,m,s] array (Jackson), or
// epoch millis — be tolerant (mirrors formInstancesApi).
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

type ApiVerification = Omit<Verification, "expiresAt"> & { expiresAt?: unknown };
type ApiServer = Omit<EmailServer, "verifiedAt" | "createdAt"> & {
  verifiedAt?: unknown;
  createdAt?: unknown;
};

const toVerification = (v: ApiVerification): Verification => ({
  id: v.id,
  status: v.status,
  email: v.email,
  domain: v.domain,
  orgName: v.orgName,
  attemptsRemaining: v.attemptsRemaining ?? 0,
  expiresAt: ms(v.expiresAt),
});

const toServer = (s: ApiServer): EmailServer => ({
  id: s.id,
  companySlug: s.companySlug,
  senderDomain: s.senderDomain,
  defaultFrom: s.defaultFrom,
  serverName: s.serverName,
  messageStream: s.messageStream,
  status: s.status,
  verifiedEmail: s.verifiedEmail,
  verifiedDomain: s.verifiedDomain,
  verifiedAt: ms(s.verifiedAt),
  createdAt: ms(s.createdAt),
});

function req<T>(tenant: string, path: string, init: RequestInit = {}, userId?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (userId) headers.set("X-User-Id", userId);
  return authed<T>(path, tenantInit(tenant, { ...init, headers }));
}

/** GET helper that resolves to null on a 404 (not-yet-set-up), rethrows otherwise. */
async function optional<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Send a one-time code to the org's official email. */
export async function startVerification(
  tenant: string,
  input: { orgName: string; email: string },
  userId?: string,
): Promise<Verification> {
  const v = await req<ApiVerification>(
    tenant,
    `${VERIFY_BASE}/start`,
    { method: "POST", body: JSON.stringify(input) },
    userId,
  );
  return toVerification(v);
}

/** Confirm the code; on success the tenant's email server is auto-provisioned. */
export async function verifyCode(tenant: string, code: string, userId?: string): Promise<VerifyResult> {
  const r = await req<{ verification: ApiVerification; server: ApiServer | null; provisioningError: string | null }>(
    tenant,
    `${VERIFY_BASE}/verify`,
    { method: "POST", body: JSON.stringify({ code }) },
    userId,
  );
  return {
    verification: toVerification(r.verification),
    server: r.server ? toServer(r.server) : null,
    provisioningError: r.provisioningError ?? null,
  };
}

/** Current verification status, or null if none started. */
export async function getVerification(tenant: string, userId?: string): Promise<Verification | null> {
  const v = await optional(req<ApiVerification>(tenant, VERIFY_BASE, {}, userId));
  return v ? toVerification(v) : null;
}

/** The tenant's provisioned email server, or null if not set up yet. */
export async function getEmailServer(tenant: string, userId?: string): Promise<EmailServer | null> {
  const s = await optional(req<ApiServer>(tenant, SERVER_BASE, {}, userId));
  return s ? toServer(s) : null;
}
