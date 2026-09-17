// Client for the PUBLIC outbound recipient surface (unauthenticated). The opaque instance
// token in the path + an OTP-verified short-lived Bearer access token are the auth — no tenant
// header. Routed through the gateway, which forwards /api/public/** without auth. Mirrors
// publicEmbedApi's no-tenant model.
import type { PaymentStart, PaymentSync, PublicPaymentConfig } from "./formPayments";

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
  /** Effective "Developed at Lukeflow" attribution flag (plan already applied server-side). */
  showBranding?: boolean;
  /** Present only when the form takes a payment (public keys only — see publicEmbedApi). */
  payment?: PublicPaymentConfig;
};

/** A refused request, with its HTTP status (e.g. 409: the form is no longer in the state the page assumed). */
export class RespondApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RespondApiError";
  }
}

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
    throw new RespondApiError(message, res.status);
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

/**
 * The submit response. A payment form comes back AWAITING_PAYMENT with the charge — or, if the charge
 * couldn't be started, `payment: null` and why (`paymentRetryable`: retry with startRespondPayment;
 * otherwise the form was reopened, see `state`).
 */
export type RespondSubmitResult = {
  ok: boolean;
  instanceId: string;
  state: string;
  payment?: PaymentStart | null;
  paymentError?: string | null;
  paymentRetryable?: boolean;
};

/** Final submit. */
/** `consentAgreed` carries only the recipient's tick — the server records the wording from the schema it
 *  served, so this cannot assert agreement to different terms. */
export function submitRespond(
  token: string,
  accessToken: string,
  data: Record<string, unknown>,
  consentAgreed?: boolean,
): Promise<RespondSubmitResult> {
  return call(
    `${seg(token)}/submit`,
    { method: "POST", body: JSON.stringify({ data, consentAgreed: consentAgreed === true }) },
    accessToken,
  );
}

/** Resume an unpaid submission's charge (the recipient came back). */
export function startRespondPayment(token: string, accessToken: string): Promise<PaymentStart> {
  return call(`${seg(token)}/payment`, { method: "POST" }, accessToken);
}

/** Ask the server to check the charge with Stripe → the charge's status and the instance's state. */
export function syncRespondPayment(token: string, accessToken: string): Promise<PaymentSync & { state: string }> {
  return call(`${seg(token)}/payment/sync`, { method: "POST" }, accessToken);
}
