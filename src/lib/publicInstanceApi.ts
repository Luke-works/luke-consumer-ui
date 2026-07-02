// Client for the PUBLIC outbound recipient surface (unauthenticated). The opaque instance
// token in the path + an OTP-verified short-lived Bearer access token are the auth — no tenant
// header. Routed through the gateway, which forwards /api/public/** without auth. Mirrors
// publicEmbedApi's no-tenant model.
const BASE = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");
const seg = (s: string) => encodeURIComponent(s);

export type RespondForm = {
  code: string;
  name: string;
  version: number;
  schema: string;
  prefill: Record<string, unknown>;
  data: Record<string, unknown>;
  outboundRoles: Record<string, "PREPARER" | "RECIPIENT" | "EITHER">;
  recipient: { firstName?: string; lastName?: string };
  state: string;
};

async function call<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/public/form-instances/${path}`, { ...init, headers });
  } catch {
    throw new Error("Couldn’t reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* keep the default */
    }
    if (res.status === 404) message = "This form link is invalid or no longer available.";
    throw new Error(message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Mail a one-time code to the recipient. */
export function requestOtp(token: string): Promise<{ ok: boolean; emailStatus: string; sentTo: string }> {
  return call(`${seg(token)}/otp`, { method: "POST" });
}

/** Verify the code → a short-lived access token. */
export function verifyOtp(token: string, code: string): Promise<{ accessToken: string }> {
  return call(`${seg(token)}/verify`, { method: "POST", body: JSON.stringify({ code }) });
}

/** Load the prefilled form (requires the access token). */
export function getRespondForm(token: string, accessToken: string): Promise<RespondForm> {
  return call(`${seg(token)}`, {}, accessToken);
}

/** Final submit. */
export function submitRespond(
  token: string,
  accessToken: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; instanceId: string; state: string }> {
  return call(`${seg(token)}/submit`, { method: "POST", body: JSON.stringify({ data }) }, accessToken);
}
