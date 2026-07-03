// Client for the core-engine access-request workflow, routed through the gateway
// (/api/access-requests/**, /api/my-access-requests, /api/org/access-requests/**).
// Every call is tenant-scoped (X-Tenant-Id); the caller (requester / approver) is
// asserted server-side from the verified session — the browser NEVER sends
// X-User-Id (the auth gateway forbids it). Org endpoints additionally require the
// caller to be a tenant-admin. Mirrors the request/error/timestamp conventions of
// emailApi.ts / formsApi.ts.
import { authed, tenantInit, asArray } from "./authApi";

const BASE = "/api/access-requests";
const MINE = "/api/my-access-requests";
const ORG = "/api/org/access-requests";
const seg = (s: string) => encodeURIComponent(s);

export type AccessRequestLevel = "read" | "read-write";
export type AccessRequestStatus = "PENDING" | "APPROVED" | "DENIED" | "CANCELLED";

/** A capability access request (requester-submitted, owner-decided). */
export type AccessRequest = {
  id: string;
  capabilityCode: string;
  /** Friendly capability name (server-resolved from the catalog), code as fallback. */
  capabilityName?: string;
  level: AccessRequestLevel;
  status: AccessRequestStatus;
  /** Requester's justification. */
  note?: string;
  /** Owner's decision note (on deny). */
  decisionNote?: string;
  requestedAt: number;
  decidedAt?: number;
  /** Requester display name (on the org queue). */
  requesterName?: string;
  /** Engine id of the deciding owner. */
  decidedBy?: string;
};

// requestedAt / decidedAt may arrive as an ISO string, a [Y,M,D,h,m,s] array
// (Jackson), or epoch millis — be tolerant (mirrors emailApi / formInstancesApi).
const ms = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  if (Array.isArray(v) && v.length >= 3) {
    // length >= 3 guarantees Y/Mo/D; the rest default to 0.
    const [Y = 0, Mo = 0, D = 0, h = 0, mi = 0, s = 0] = v as number[];
    return new Date(Y, Mo - 1, D, h, mi, s).getTime();
  }
  return undefined;
};

// Wire shape: the entity serializes the level as `requestedLevel` (not `level`),
// and timestamps as LocalDateTime (ISO string / [Y,M,D,…] array / epoch).
type ApiAccessRequest = Omit<AccessRequest, "level" | "requestedAt" | "decidedAt"> & {
  requestedLevel?: AccessRequestLevel;
  requestedAt?: unknown;
  decidedAt?: unknown;
};

const toAccessRequest = (r: ApiAccessRequest): AccessRequest => ({
  id: r.id,
  capabilityCode: r.capabilityCode,
  capabilityName: r.capabilityName,
  level: r.requestedLevel ?? "read",
  status: r.status,
  note: r.note,
  decisionNote: r.decisionNote,
  requestedAt: ms(r.requestedAt) ?? 0,
  decidedAt: ms(r.decidedAt),
  requesterName: r.requesterName,
  decidedBy: r.decidedBy,
});

function req<T>(tenant: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  // Never send X-User-Id from the browser: the auth gateway rejects it and asserts
  // the user from the verified session instead. Matches formsApi / emailApi.
  return authed<T>(path, tenantInit(tenant, { ...init, headers }));
}

/** Submit a PENDING access request for the caller (422 if not subscribed, 409 if duplicate/already granted). */
export async function createAccessRequest(
  tenant: string,
  input: { capabilityCode: string; level: AccessRequestLevel; note?: string },
): Promise<AccessRequest> {
  const r = await req<ApiAccessRequest>(tenant, BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return toAccessRequest(r);
}

/** The caller's own requests (any status), newest first. */
export async function listMyAccessRequests(tenant: string): Promise<AccessRequest[]> {
  const list = await req<ApiAccessRequest[]>(tenant, MINE);
  return asArray<ApiAccessRequest>(list).map(toAccessRequest);
}

/** Cancel the caller's OWN pending request (403 if not owner, 409 if not PENDING). */
export async function cancelAccessRequest(tenant: string, id: string): Promise<AccessRequest> {
  const r = await req<ApiAccessRequest>(tenant, `${BASE}/${seg(id)}/cancel`, { method: "POST" });
  return toAccessRequest(r);
}

/** The tenant's requests at a given status (owners only; defaults to PENDING). */
export async function listOrgAccessRequests(
  tenant: string,
  status: AccessRequestStatus = "PENDING",
): Promise<AccessRequest[]> {
  const list = await req<ApiAccessRequest[]>(tenant, `${ORG}?status=${seg(status)}`);
  return asArray<ApiAccessRequest>(list).map(toAccessRequest);
}

/** Approve a request, granting access (owners only). Optional level overrides the requested level. */
export async function approveAccessRequest(
  tenant: string,
  id: string,
  level?: AccessRequestLevel,
): Promise<AccessRequest> {
  const r = await req<ApiAccessRequest>(tenant, `${ORG}/${seg(id)}/approve`, {
    method: "POST",
    body: JSON.stringify({ level }),
  });
  return toAccessRequest(r);
}

/** Deny a request (owners only), with an optional decision note. */
export async function denyAccessRequest(
  tenant: string,
  id: string,
  note?: string,
): Promise<AccessRequest> {
  const r = await req<ApiAccessRequest>(tenant, `${ORG}/${seg(id)}/deny`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  return toAccessRequest(r);
}
