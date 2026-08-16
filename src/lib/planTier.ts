// A module-level cache of the active tenant's plan tier (FREE | PRO | BUSINESS | ENTERPRISE).
//
// The agent-egress clients (formAgentApi / emailAgentApi / workflowAgentApi) are plain functions,
// not React components, so they can't read the tier from context. They read it here and attach it
// as `X-Tenant-Tier`, which luke-agents uses to size a tenant's daily AI token budget by plan.
//
// Populated best-effort by AuthProvider when the tenant is established (and cleared on sign-out /
// tenant switch). `null` until then — and luke-agents treats a missing/unknown tier as its flat-cap
// fallback, so an un-cached tier can never block a request. Mirrors how authApi holds the access
// token in a module variable.
let currentTier: string | null = null;

/** Set (or clear, with `null`) the active tenant's plan tier. */
export function setCurrentTier(tier: string | null): void {
  currentTier = tier;
}

/** The active tenant's plan tier, or `null` when unknown (agents then use their flat cap). */
export function getCurrentTier(): string | null {
  return currentTier;
}
