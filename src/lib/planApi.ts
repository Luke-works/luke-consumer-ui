// Client for the tenant's commercial plan (core-engine PlanController, routed through the gateway).
//   GET /api/plan → the CURRENT tenant's tier + limits + feature entitlements.
// Tenant-scoped (X-Tenant-Id); the plan is resolved server-side and fails closed to FREE when there is
// no row. Mirrors the request conventions of accessRequestsApi / emailApi.
import { authed, tenantInit } from "./authApi";

/** Monthly usage limits for a tier. `null` = unlimited / custom (Enterprise). */
export type PlanLimits = {
  monthlySubmissions: number | null;
  monthlyAiActions: number | null;
  monthlyEmails: number | null;
  storageGb: number | null;
  seats: number | null;
};

/** Feature entitlements a tier unlocks. */
export type PlanFeatureFlags = {
  removableBranding: boolean;
  sso: boolean;
  voice: boolean;
  selfHost: boolean;
  attachments: boolean;
};

/** The tenant's resolved plan, as returned by `GET /api/plan` (core-engine `PlanCatalog.toView()`). */
export type TenantPlan = {
  /** Tier id: FREE | PRO | BUSINESS | ENTERPRISE. */
  plan: string;
  displayName: string;
  rank: number;
  /** Monthly USD price; `null` = custom (Enterprise). */
  priceUsd: number | null;
  limits: PlanLimits;
  features: PlanFeatureFlags;
  /** Capability codes this tier may subscribe to (FORMS, EMAIL, …). */
  capabilities: string[];
};

/** The current tenant's plan + entitlements. Fails closed to FREE server-side. */
export async function getMyPlan(tenant: string): Promise<TenantPlan> {
  return authed<TenantPlan>("/api/plan", tenantInit(tenant));
}
