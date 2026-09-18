// Client for form-payment settings (core-engine PaymentsController, via the gateway).
//   GET    /api/payments/account           → status: enabled / plan / connected account / ready
//   POST   /api/payments/connect           → the Stripe Connect URL to send the owner to     (owner)
//   POST   /api/payments/connect/complete  → finish the round-trip with Stripe's code+state  (owner)
//   POST   /api/payments/account/refresh   → re-read the account from Stripe               (owner)
//   DELETE /api/payments/account           → disconnect                                    (owner)
//   GET    /api/payments/submissions/:id   → a submission's charge (staff view, no secrets)
// Tenant-scoped (X-Tenant-Id); the server checks membership / ownership from the credential.
import { authed, tenantInit } from "./authApi";

export type ConnectedAccount = {
  accountId: string;
  /** DISCONNECTING: a disconnect didn't finish (it can be retried). */
  status: "CONNECTED" | "DISCONNECTING" | "DISCONNECTED";
  livemode: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  displayName: string | null;
  defaultCurrency: string | null;
  country: string | null;
  connectedAt: string | null;
  /** The account was connected in a different Stripe mode than this environment uses. */
  modeMismatch: boolean;
};

export type PaymentsStatus = {
  /** The platform has Stripe configured at all. */
  enabled: boolean;
  /** This environment uses live keys (real money). */
  livemode: boolean;
  /** The workspace's plan includes payments. */
  planAllows: boolean;
  /** The caller is an owner and may connect / disconnect. */
  canManage: boolean;
  /** Payment forms can be published and paid right now. */
  ready: boolean;
  account: ConnectedAccount | null;
  /** On completing a connection: the workspace it was started for (the page may have reloaded into another). */
  tenantId?: string;
};

export type SubmissionPayment = {
  /** `unresolved`: Lukeflow lost access to the charge before it settled — check it in Stripe. */
  status: "requires_payment" | "processing" | "succeeded" | "canceled" | "failed" | "unresolved";
  amountMinor: number;
  currency: string;
  quantity: number | null;
  mode: string;
  description: string | null;
  amountRefunded: number;
  disputed?: boolean;
  livemode: boolean;
  intentId: string | null;
  stripeAccountId: string;
  lastErrorCode: string | null;
  createdAt: string | null;
  paidAt: string | null;
};

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function getPaymentsStatus(tenant: string): Promise<PaymentsStatus> {
  return authed<PaymentsStatus>("/api/payments/account", tenantInit(tenant));
}

export function startStripeConnect(tenant: string): Promise<{ url: string }> {
  return authed<{ url: string }>("/api/payments/connect", tenantInit(tenant, { method: "POST" }));
}

export function completeStripeConnect(tenant: string, code: string, state: string): Promise<PaymentsStatus> {
  return authed<PaymentsStatus>(
    "/api/payments/connect/complete",
    tenantInit(tenant, { method: "POST", ...json({ code, state }) }),
  );
}

export function refreshPaymentsAccount(tenant: string): Promise<PaymentsStatus> {
  return authed<PaymentsStatus>("/api/payments/account/refresh", tenantInit(tenant, { method: "POST" }));
}

export function disconnectStripe(tenant: string): Promise<PaymentsStatus> {
  return authed<PaymentsStatus>("/api/payments/account", tenantInit(tenant, { method: "DELETE" }));
}

export function getSubmissionPayment(tenant: string, instanceId: string): Promise<SubmissionPayment> {
  return authed<SubmissionPayment>(`/api/payments/submissions/${encodeURIComponent(instanceId)}`, tenantInit(tenant));
}

/** The Stripe dashboard page for a charge on the tenant's own account. */
export function stripeDashboardUrl(p: Pick<SubmissionPayment, "intentId" | "livemode">): string | null {
  if (!p.intentId) return null;
  return `https://dashboard.stripe.com/${p.livemode ? "" : "test/"}payments/${encodeURIComponent(p.intentId)}`;
}
