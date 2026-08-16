// Client for self-serve billing (core-engine BillingController, via the gateway).
//   GET  /api/billing/config   → whether Stripe checkout is wired, and which tiers are buyable.
//   POST /api/billing/checkout → a hosted Stripe Checkout URL to redirect the browser to.
// Tenant-scoped (X-Tenant-Id). The whole feature is config-gated server-side: when Stripe is not
// configured, `enabled` is false and the UI simply shows no checkout affordance. Mirrors planApi.ts.
import { authed, tenantInit } from "./authApi";

/** Whether checkout is available, and the tier ids a tenant can buy right now (FREE/ENTERPRISE never). */
export type BillingConfig = {
  enabled: boolean;
  purchasableTiers: string[];
};

/** The current tenant's billing config. */
export async function getBillingConfig(tenant: string): Promise<BillingConfig> {
  return authed<BillingConfig>("/api/billing/config", tenantInit(tenant));
}

/** Start Stripe Checkout for a tier; returns the hosted URL to send the browser to. */
export async function startCheckout(tenant: string, tier: string): Promise<{ url: string }> {
  return authed<{ url: string }>(
    "/api/billing/checkout",
    tenantInit(tenant, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    }),
  );
}
