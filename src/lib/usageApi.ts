// Client for the tenant's current-month usage (core-engine UsageController, via the gateway).
//   GET /api/usage → used-vs-limit per metered dimension for this billing month.
// Tenant-scoped (X-Tenant-Id); resolved server-side, fail-closed to the Free tier. Mirrors planApi.ts.
import { authed, tenantInit } from "./authApi";

/** Used vs limit for one metric. `limit` is `null` when the plan is unlimited (Enterprise). */
export type UsageMetric = { used: number; limit: number | null };

/** The tenant's metered usage this month, as returned by `GET /api/usage`. */
export type TenantUsage = {
  /** Tier id: FREE | PRO | BUSINESS | ENTERPRISE. */
  plan: string;
  /** Billing month, `YYYY-MM` (UTC). */
  period: string;
  usage: {
    submissions: UsageMetric;
    emails: UsageMetric;
  };
};

/** The current tenant's usage this month. */
export async function getMyUsage(tenant: string): Promise<TenantUsage> {
  return authed<TenantUsage>("/api/usage", tenantInit(tenant));
}
