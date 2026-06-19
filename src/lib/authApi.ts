// Thin fetch client for the luke-auth-engine `/auth/*` API. The browser holds no
// auth SDK and no provider keys — it talks only to our gateway. The short-lived
// access token lives in memory here; the long-lived refresh token is an HttpOnly
// cookie set by the gateway (sent via credentials:"include").

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

export async function register(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ userId: string; user: WorkosUser; verifyRequired: boolean }> {
  const res = await fetch(url("/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parse(res);
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(url("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = await parse<AuthResult>(res);
  accessToken = data.accessToken ?? null;
  return data;
}

/** Restore a session from the refresh cookie. Returns null when signed out. */
export async function refresh(): Promise<AuthResult | null> {
  const res = await fetch(url("/auth/refresh"), {
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
    await fetch(url("/auth/logout"), {
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
  const res = await fetch(url(path), { ...init, headers, credentials: "include" });
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

export type RoleLevel = "none" | "read" | "read-write";

/** Roles in a member row: tenantAdmin (owner) + the three assignable dimensions. */
export type MemberRoles = {
  tenantAdmin?: RoleLevel;
  tenantUser?: RoleLevel;
  processUser?: RoleLevel;
  taskUser?: RoleLevel;
};

export type OrgMember = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roles: MemberRoles;
  candidateGroups: string[];
  /** True for platform/support accounts (camunda-admin) auto-added to every tenant. */
  platform?: boolean;
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

export type CapabilityGrant = { capabilityCode: string; level: string };

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

export function listOrgUsers(tenantId: string): Promise<OrgMember[]> {
  return authed("/api/org/users", tenantInit(tenantId));
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

export function listGroups(tenantId: string): Promise<OrgGroup[]> {
  return authed("/api/org/candidate-groups", tenantInit(tenantId));
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

export function listCapabilities(tenantId: string): Promise<CapabilityCatalogItem[]> {
  return authed("/api/org/capabilities", tenantInit(tenantId));
}

/** Capabilities active for the caller's tenant (org-level, not capability-gated). */
export function getMySubscriptions(tenantId: string): Promise<SubscribedCapability[]> {
  return authed("/api/my-subscriptions", tenantInit(tenantId));
}

export function getUserCapabilities(tenantId: string, userId: string): Promise<CapabilityGrant[]> {
  return authed(`/api/org/users/${seg(userId)}/capabilities`, tenantInit(tenantId));
}

export function setUserCapability(
  tenantId: string,
  userId: string,
  code: string,
  level: RoleLevel,
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
