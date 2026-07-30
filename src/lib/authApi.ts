// Thin fetch client for the luke-auth-engine `/auth/*` API. The browser holds no
// auth SDK and no provider keys — it talks only to our gateway. The short-lived
// access token lives in memory here; the long-lived refresh token is an HttpOnly
// cookie set by the gateway (sent via credentials:"include").

import { isCapabilityVisible, type CapabilityLevel } from "./capabilities";

const BASE = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");

export type WorkosUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  emailVerified: boolean;
};

export type SessionView = {
  userId: string;
  provisioned: boolean;
  operator: boolean;
  tenantAdmin: boolean;
  tenant: string | null;
  tenants: string[];
  /** Display name per tenant id (for the org switcher). Optional: absent on older backends —
   *  fall back to the id. */
  tenantNames?: Record<string, string>;
  roles: Record<string, string>;
  candidateGroups: string[];
  capabilities: Record<string, string>;
  can: string[];
};

export type AuthResult = {
  accessToken: string;
  sid: string | null;
  user: WorkosUser;
  session: SessionView;
};

export type SocialProvider = "google" | "microsoft";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let accessToken: string | null = null;
export function setAccessToken(t: string | null): void {
  accessToken = t;
}
export function getAccessToken(): string | null {
  return accessToken;
}

const url = (path: string) => `${BASE}${path}`;

/** Default network deadline for gateway/core calls. The agent clients already bound their calls;
 *  the auth/core client had none, so a hung gateway (cold Render dyno, dropped socket) left spinners
 *  hanging forever. 30s is well above any real gateway round-trip (long AI calls use the agent clients). */
const REQUEST_TIMEOUT_MS = 30_000;

/** fetch() with a default deadline: aborts after `ms`, OR when the caller's own signal aborts
 *  (whichever first). Mirrors the per-attempt timeout the agent clients use. */
async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  ms = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const ctl = new AbortController();
  const caller = init.signal ?? undefined;
  const timer = setTimeout(
    () => ctl.abort(new DOMException("Request timed out", "TimeoutError")),
    ms,
  );
  const onAbort = () => ctl.abort(caller?.reason);
  if (caller) {
    if (caller.aborted) ctl.abort(caller.reason);
    else caller.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", onAbort);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

/** Coerce an API result to an array. A list endpoint whose body arrives empty (e.g. a
 *  dropped/empty response that parse() turns into {}) would otherwise crash callers on
 *  .map/.filter; treat any non-array as an empty list so the page renders empty instead. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function register(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ userId: string; user: WorkosUser; verifyRequired: boolean }> {
  const res = await fetchWithTimeout(url("/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parse(res);
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await fetchWithTimeout(url("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = await parse<AuthResult>(res);
  accessToken = data.accessToken ?? null;
  return data;
}

let refreshInFlight: Promise<AuthResult | null> | null = null;

/** Restore a session from the refresh cookie. Returns null when signed out.
 *
 *  SINGLE-FLIGHT: data-heavy pages fire many authed() calls at once (users/groups/grants/…), so on
 *  token expiry each 401 would trigger its own POST /auth/refresh, rotating the refresh cookie N
 *  times in parallel — a classic refresh race that can invalidate sibling requests. All concurrent
 *  callers now share ONE in-flight refresh; the promise clears when it settles. */
export async function refresh(): Promise<AuthResult | null> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<AuthResult | null> {
  const res = await fetchWithTimeout(url("/auth/refresh"), {
    method: "POST",
    credentials: "include",
  });
  if (res.status === 401) {
    accessToken = null;
    return null;
  }
  const data = await parse<AuthResult>(res);
  accessToken = data.accessToken ?? null;
  return data;
}

export async function logout(): Promise<void> {
  try {
    await fetchWithTimeout(url("/auth/logout"), {
      method: "POST",
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
  } finally {
    accessToken = null;
  }
}

export function socialUrl(provider: SocialProvider): string {
  return url(`/auth/social?provider=${encodeURIComponent(provider)}`);
}

// ── Authed calls (Bearer access token, with one refresh-on-401 retry) ──────

export async function authed<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetchWithTimeout(url(path), { ...init, headers, credentials: "include" });
  if (res.status === 401 && retry) {
    const r = await refresh();
    if (r) return authed<T>(path, init, false);
  }
  return parse<T>(res);
}

export function getSession(
  tenantId?: string,
  opts?: { fresh?: boolean; signal?: AbortSignal },
): Promise<SessionView> {
  // fresh=true bypasses the gateway's per-(user,tenant) session cache — use it right
  // after changing access so the new roles/capabilities show without waiting the TTL.
  return authed(opts?.fresh ? "/session?fresh=true" : "/session", {
    headers: tenantId ? { "X-Tenant-Id": tenantId } : undefined,
    signal: opts?.signal,
  });
}

export function updateProfile(input: {
  firstName?: string;
  lastName?: string;
}): Promise<{ user: WorkosUser }> {
  return authed("/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await authed("/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function deleteAccount(): Promise<void> {
  await authed("/auth/account", { method: "DELETE" });
  accessToken = null;
}

export type CreateOrgResult = { tenantId: string; name: string; role: string };

/**
 * Create an organization (tenant) and become its owner. Proxied through the
 * gateway to core-engine's POST /api/organizations — allowed even for a brand-new
 * (unprovisioned) user, since creating the org is what provisions them.
 */
export function createOrganization(input: {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}): Promise<CreateOrgResult> {
  return authed("/api/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// ── Org admin (Auth & Access page) ──────────────────────────────────────────
// All of these act within the caller's active tenant (X-Tenant-Id) and require
// the caller to be a tenant-admin. Invite/add-member hit luke-auth directly
// (they touch WorkOS); the rest are proxied through to core-engine's /api/org/*.

export type RoleLevel = "none" | "read" | "contributor" | "read-write";

/** Roles in a member row: tenantAdmin (owner) + the three assignable dimensions. */
export type MemberRoles = {
  tenantAdmin?: RoleLevel;
  tenantUser?: RoleLevel;
  processUser?: RoleLevel;
  taskUser?: RoleLevel;
};

/**
 * Where a piece of access came from. Today every grant is decided in Lukeflow, so the backend
 * does not yet stamp a source and callers should treat "absent" as {@link LOCAL_SOURCE}. The
 * field exists so that when access starts arriving from a customer's own identity system
 * (WorkOS Directory Sync bridging Okta/Entra/Google groups), the UI can show who owns a grant
 * and stop admins editing one that the directory will simply overwrite on its next sync.
 */
export type AccessSource = "LOCAL" | "DIRECTORY" | "SSO" | "SCIM";

export const LOCAL_SOURCE: AccessSource = "LOCAL";

/** Provenance fields shared by anything that can be directory-managed. All optional today. */
export type AccessProvenance = {
  /** Absent on the current backend — treat as "LOCAL". */
  source?: AccessSource;
  /** Display name of the external system when known, e.g. "Okta" or "Microsoft Entra ID". */
  sourceName?: string;
  /** The external group/role that produced this access, for "why do I have this?". */
  sourceRef?: string;
  /** True when the external system owns it and Lukeflow must not edit it. */
  managedExternally?: boolean;
};

export type OrgMember = AccessProvenance & {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roles: MemberRoles;
  candidateGroups: string[];
  /** True for platform/support accounts (camunda-admin) auto-added to every tenant. */
  platform?: boolean;
  /**
   * Directory-synced profile attributes (department, title, location, manager, …), as sent by
   * the identity provider. Absent until a directory is connected — the UI must render an empty
   * state rather than inventing values.
   */
  attributes?: Record<string, string | null>;
};

export type OrgGroup = { id: string; name: string };

export type CapabilityCatalogItem = {
  code: string;
  name: string;
  description?: string;
  icon?: string;
  route?: string;
  status?: string;
  tier?: string;
};

export type CapabilityGrant = AccessProvenance & { capabilityCode: string; level: string };

/**
 * A capability the caller's tenant is subscribed to (active for the org). Shape
 * mirrors core-engine's SubscribedCapability from /api/my-subscriptions.
 */
export type SubscribedCapability = {
  code: string;
  name: string;
  description?: string;
  icon?: string;
  route?: string;
  tier?: string;
  status: string;
};

export type Invitation = {
  id: string;
  email: string;
  state: string | null;
  expiresAt: string | null;
};

const seg = (s: string) => encodeURIComponent(s);

export function tenantInit(tenantId: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("X-Tenant-Id", tenantId);
  return { ...init, headers };
}

// Authentication tab — invitations (luke-auth → WorkOS)

export function invite(
  tenantId: string,
  input: { firstName?: string; lastName?: string; email: string },
): Promise<{ ok: boolean; invitation: Invitation }> {
  return authed(
    "/auth/org/invitations",
    tenantInit(tenantId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export function listInvitations(tenantId: string): Promise<{ invitations: Invitation[] }> {
  return authed("/auth/org/invitations", tenantInit(tenantId));
}

export function revokeInvitation(tenantId: string, id: string): Promise<{ ok: boolean }> {
  return authed(`/auth/org/invitations/${seg(id)}/revoke`, tenantInit(tenantId, { method: "POST" }));
}

// Authorization tab — members / roles / groups / capabilities

export function addMember(
  tenantId: string,
  input: { email: string; role?: string; accessLevel?: string },
): Promise<{ id: string; tenant: string }> {
  return authed(
    "/auth/org/members",
    tenantInit(tenantId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function listOrgUsers(tenantId: string): Promise<OrgMember[]> {
  return asArray<OrgMember>(await authed("/api/org/users", tenantInit(tenantId)));
}

export function setUserRole(
  tenantId: string,
  userId: string,
  role: string,
  level: RoleLevel,
): Promise<unknown> {
  return authed(
    `/api/org/users/${seg(userId)}/roles/${seg(role)}`,
    tenantInit(tenantId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level }),
    }),
  );
}

export async function listGroups(tenantId: string): Promise<OrgGroup[]> {
  return asArray<OrgGroup>(await authed("/api/org/candidate-groups", tenantInit(tenantId)));
}

export function createGroup(tenantId: string, name: string): Promise<OrgGroup> {
  return authed(
    "/api/org/candidate-groups",
    tenantInit(tenantId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

export function addUserToGroup(tenantId: string, userId: string, groupId: string): Promise<void> {
  return authed(
    `/api/org/users/${seg(userId)}/candidate-groups/${seg(groupId)}`,
    tenantInit(tenantId, { method: "PUT" }),
  );
}

export function removeUserFromGroup(tenantId: string, userId: string, groupId: string): Promise<void> {
  return authed(
    `/api/org/users/${seg(userId)}/candidate-groups/${seg(groupId)}`,
    tenantInit(tenantId, { method: "DELETE" }),
  );
}

/** Rename a candidate group's display name (owner-only; the id is immutable). */
export function renameGroup(tenantId: string, groupId: string, name: string): Promise<OrgGroup> {
  return authed(
    `/api/org/candidate-groups/${seg(groupId)}`,
    tenantInit(tenantId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

/** Delete a candidate group and its delegated-owners group (owner-only; idempotent). */
export function deleteGroup(tenantId: string, groupId: string): Promise<void> {
  return authed(
    `/api/org/candidate-groups/${seg(groupId)}`,
    tenantInit(tenantId, { method: "DELETE" }),
  );
}

/** A delegated owner (manager) of a candidate group — someone who may edit its membership. */
export type OrgGroupManager = { id: string; firstName: string | null; lastName: string | null };

/**
 * Resource owners of a capability: who an access request for it is routed to for approval.
 * When empty, core-engine falls back to the tenant owners, so requests never strand.
 */
export async function listCapabilityOwners(
  tenantId: string,
  code: string,
): Promise<OrgGroupManager[]> {
  return asArray<OrgGroupManager>(
    await authed(`/api/org/capabilities/${seg(code)}/owners`, tenantInit(tenantId)),
  );
}

export function addCapabilityOwner(tenantId: string, code: string, userId: string): Promise<void> {
  return authed(`/api/org/capabilities/${seg(code)}/owners/${seg(userId)}`,
    tenantInit(tenantId, { method: "PUT" }));
}

export function removeCapabilityOwner(tenantId: string, code: string, userId: string): Promise<void> {
  return authed(`/api/org/capabilities/${seg(code)}/owners/${seg(userId)}`,
    tenantInit(tenantId, { method: "DELETE" }));
}

/** List the owners (delegated managers) of a candidate group. */
export async function listGroupOwners(tenantId: string, groupId: string): Promise<OrgGroupManager[]> {
  return asArray<OrgGroupManager>(
    await authed(`/api/org/candidate-groups/${seg(groupId)}/managers`, tenantInit(tenantId)),
  );
}

/** Appoint a member as an owner of a candidate group (owner-only; idempotent). */
export function addGroupOwner(tenantId: string, groupId: string, userId: string): Promise<void> {
  return authed(
    `/api/org/candidate-groups/${seg(groupId)}/managers/${seg(userId)}`,
    tenantInit(tenantId, { method: "PUT" }),
  );
}

/** Remove a member as an owner of a candidate group (owner-only; idempotent). */
export function removeGroupOwner(tenantId: string, groupId: string, userId: string): Promise<void> {
  return authed(
    `/api/org/candidate-groups/${seg(groupId)}/managers/${seg(userId)}`,
    tenantInit(tenantId, { method: "DELETE" }),
  );
}

export async function listCapabilities(tenantId: string): Promise<CapabilityCatalogItem[]> {
  const all = asArray<CapabilityCatalogItem>(await authed("/api/org/capabilities", tenantInit(tenantId)));
  // Drop force-hidden capabilities (e.g. WORKFLOW until launch) so they never appear in the
  // admin grant selector or the request-access list.
  return all.filter((c) => isCapabilityVisible(c.code));
}

/** Capabilities active for the caller's tenant (org-level, not capability-gated). */
export async function getMySubscriptions(tenantId: string): Promise<SubscribedCapability[]> {
  const all = asArray<SubscribedCapability>(await authed("/api/my-subscriptions", tenantInit(tenantId)));
  return all.filter((s) => isCapabilityVisible(s.code));
}

export async function getUserCapabilities(tenantId: string, userId: string): Promise<CapabilityGrant[]> {
  return asArray<CapabilityGrant>(await authed(`/api/org/users/${seg(userId)}/capabilities`, tenantInit(tenantId)));
}

/**
 * Set a member's level on one capability. Accepts the full capability level set — including
 * `contributor` (core-engine #104: create/edit but not publish/purge) — which is wider than
 * the role level set, so it is deliberately NOT typed as RoleLevel. "none" revokes.
 */
export function setUserCapability(
  tenantId: string,
  userId: string,
  code: string,
  level: CapabilityLevel,
): Promise<unknown> {
  return authed(
    `/api/org/users/${seg(userId)}/capabilities/${seg(code)}`,
    tenantInit(tenantId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level }),
    }),
  );
}
