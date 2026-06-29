// MinionClient factories for the secure form "minions" proxy (e.g. address-autocomplete geocoding).
// The browser only names an operation + passes params; auth/authz and any provider token live
// SERVER-SIDE in core-engine. Two surfaces, mirroring the rest of the app:
//   - authed   → /api/minions/{minion}            (gateway asserts the user; X-Tenant-Id scopes it)
//   - public   → /api/public/minions/{token}/{minion}  (embed token IS the auth; no user)
import type { MinionClient } from "@lukeflow/form-core";
import { authed } from "./authApi";

const seg = (s: string) => encodeURIComponent(s);
const PUBLIC_BASE = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");

/** Authenticated minion client for internal form surfaces (FormFill). Routed through the gateway
 *  with the user's bearer token; the tenant scopes the call. */
export function createAuthedMinionClient(tenant: string): MinionClient {
  return {
    request: (minion, params, signal) =>
      authed<unknown>(`/api/minions/${seg(minion)}`, {
        method: "POST",
        headers: { "X-Tenant-Id": tenant, "Content-Type": "application/json" },
        body: JSON.stringify(params ?? {}),
        signal,
      }),
  };
}

/** Public, token-scoped minion client for the embedded form. No auth header — the signed embed token
 *  in the path is the auth (the engine resolves the tenant from it and rate-limits per token). */
export function createPublicMinionClient(token: string): MinionClient {
  return {
    request: async (minion, params, signal) => {
      const res = await fetch(`${PUBLIC_BASE}/api/public/minions/${seg(token)}/${seg(minion)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params ?? {}),
        signal,
      });
      if (!res.ok) throw new Error(`minion ${minion} failed (HTTP ${res.status})`);
      return res.json();
    },
  };
}
