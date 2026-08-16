import { useEffect, useState } from "react";
import { Check, Minus } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { getMyPlan, type TenantPlan } from "../../lib/planApi";
import { getMyUsage, type TenantUsage, type UsageMetric } from "../../lib/usageApi";

/**
 * Plans & billing. Shows the tenant's CURRENT plan + entitlements (resolved server-side by
 * core-engine `GET /api/plan`, fail-closed to Free) and a comparison of all tiers.
 *
 * The comparison table mirrors core-engine `PlanCatalog` (the SSOT); keep the two in sync when
 * pricing changes. Checkout is Phase 2 — for now upgrade CTAs open a contact link.
 */

type Tier = {
  code: string;
  name: string;
  priceLabel: string;
  tagline: string;
  limits: { subs: string; ai: string; emails: string; storage: string; seats: string };
  caps: string;
  features: { removableBranding: boolean; sso: boolean; voice: boolean; selfHost: boolean; attachments: boolean };
};

const TIERS: Tier[] = [
  { code: "FREE", name: "Free", priceLabel: "$0", tagline: "Get started",
    limits: { subs: "100", ai: "10", emails: "60", storage: "0.5 GB", seats: "1" }, caps: "Forms",
    features: { removableBranding: false, sso: false, voice: false, selfHost: false, attachments: false } },
  { code: "PRO", name: "Pro", priceLabel: "$39", tagline: "For small teams",
    limits: { subs: "2,000", ai: "500", emails: "2,000", storage: "5 GB", seats: "3" }, caps: "Forms · Email",
    features: { removableBranding: true, sso: false, voice: false, selfHost: false, attachments: true } },
  { code: "BUSINESS", name: "Business", priceLabel: "$149", tagline: "For growing teams",
    limits: { subs: "15,000", ai: "2,000", emails: "15,000", storage: "25 GB", seats: "10" }, caps: "Forms · Email · Signatures · Calendars",
    features: { removableBranding: true, sso: true, voice: false, selfHost: false, attachments: true } },
  { code: "ENTERPRISE", name: "Enterprise", priceLabel: "Custom", tagline: "Compliance & scale",
    limits: { subs: "Unlimited", ai: "Unlimited", emails: "Unlimited", storage: "Unlimited", seats: "Unlimited" }, caps: "Everything",
    features: { removableBranding: true, sso: true, voice: true, selfHost: true, attachments: true } },
];

const FEATURE_ROWS: { key: keyof Tier["features"]; label: string }[] = [
  { key: "removableBranding", label: "Remove Lukeflow branding" },
  { key: "attachments", label: "File attachments" },
  { key: "sso", label: "SSO / SCIM" },
  { key: "voice", label: "Voice (Phone)" },
  { key: "selfHost", label: "Self-hosting" },
];

function contactHref(tier: Tier): string {
  const subject = tier.code === "ENTERPRISE" ? "Enterprise enquiry" : `Upgrade to ${tier.name}`;
  return `mailto:sales@lukeflow.com?subject=${encodeURIComponent(subject)}`;
}

export default function Plans() {
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;
  const [plan, setPlan] = useState<TenantPlan | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    // Usage is best-effort — a usage hiccup must not hide the plan.
    Promise.all([getMyPlan(tenant), getMyUsage(tenant).catch(() => null)])
      .then(([p, u]) => { if (live) { setPlan(p); setUsage(u); setError(null); } })
      .catch(() => { if (live) setError("Couldn't load your plan."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [tenant]);

  const currentCode = plan?.plan ?? "FREE";

  return (
    <>
      <PageMeta title="Plans | Lukeflow" description="Your Lukeflow plan and pricing tiers." />

      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Plans</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your current plan and everything each tier includes.
          </p>
        </div>

        {/* Current plan summary — server truth from /api/plan */}
        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading your plan…</p>
          ) : error ? (
            <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
          ) : plan ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Your plan</p>
                <p className="mt-0.5 text-xl font-semibold text-gray-800 dark:text-white/90">
                  {plan.displayName}
                  {plan.priceUsd != null && (
                    <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">${plan.priceUsd}/mo</span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
                <span><b className="font-semibold text-gray-800 dark:text-white/90">{fmt(plan.limits.monthlySubmissions)}</b> submissions/mo</span>
                <span><b className="font-semibold text-gray-800 dark:text-white/90">{fmt(plan.limits.monthlyEmails)}</b> emails/mo</span>
                <span><b className="font-semibold text-gray-800 dark:text-white/90">{fmt(plan.limits.monthlyAiActions)}</b> AI actions/mo</span>
                <span><b className="font-semibold text-gray-800 dark:text-white/90">{plan.limits.storageGb == null ? "Unlimited" : `${plan.limits.storageGb} GB`}</b> storage</span>
                <span><b className="font-semibold text-gray-800 dark:text-white/90">{fmt(plan.limits.seats)}</b> seats</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No active tenant.</p>
          )}
        </div>

        {/* Usage this month — from /api/usage (best-effort) */}
        {usage && (
          <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Usage this month</h2>
              <span className="text-xs text-gray-400">{usage.period}</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <UsageBar label="Submissions" metric={usage.usage.submissions} />
              <UsageBar label="Emails" metric={usage.usage.emails} />
            </div>
          </div>
        )}

        {/* Tier comparison */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => {
            const isCurrent = tier.code === currentCode;
            return (
              <div
                key={tier.code}
                className={`flex flex-col rounded-2xl border bg-white p-5 dark:bg-white/[0.03] ${
                  isCurrent ? "border-brand-500 ring-1 ring-brand-500" : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{tier.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-white/90">
                    {tier.priceLabel}
                    {tier.priceLabel.startsWith("$") && tier.priceLabel !== "$0" && (
                      <span className="text-sm font-normal text-gray-500 dark:text-gray-400">/mo</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{tier.tagline}</p>
                </div>

                <dl className="mb-4 space-y-1.5 text-sm">
                  <Row label="Submissions / mo" value={tier.limits.subs} />
                  <Row label="Emails / mo" value={tier.limits.emails} />
                  <Row label="AI actions / mo" value={tier.limits.ai} />
                  <Row label="Storage" value={tier.limits.storage} />
                  <Row label="Seats" value={tier.limits.seats} />
                </dl>

                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Modules:</span> {tier.caps}
                </p>

                <ul className="mb-5 space-y-1.5">
                  {FEATURE_ROWS.map((f) => (
                    <li key={f.key} className="flex items-center gap-2 text-sm">
                      {tier.features[f.key] ? (
                        <Check className="size-4 shrink-0 text-success-500" />
                      ) : (
                        <Minus className="size-4 shrink-0 text-gray-300 dark:text-gray-600" />
                      )}
                      <span className={tier.features[f.key] ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-500"}>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 text-sm font-medium text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400"
                    >
                      Current plan
                    </button>
                  ) : (
                    <a
                      href={contactHref(tier)}
                      className={`block w-full rounded-lg py-2 text-center text-sm font-medium ${
                        tier.code === "ENTERPRISE"
                          ? "border border-brand-500 text-brand-600 hover:bg-brand-100 dark:text-brand-400 dark:hover:bg-brand-500/20"
                          : "bg-brand-500 text-white hover:bg-brand-600"
                      }`}
                    >
                      {tier.code === "ENTERPRISE" ? "Contact sales" : `Upgrade to ${tier.name}`}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
          Usage above a plan's included allotment is metered. Voice minutes are billed per-minute on every plan.
          Need to change plans? <a className="text-brand-500 hover:underline" href="mailto:sales@lukeflow.com">Contact us</a>.
        </p>
      </div>
    </>
  );
}

/** A number from the API, or "Unlimited" for null (Enterprise). */
function fmt(n: number | null): string {
  return n == null ? "Unlimited" : n.toLocaleString();
}

function UsageBar({ label, metric }: { label: string; metric: UsageMetric }) {
  const { used, limit } = metric;
  const unlimited = limit == null;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const atCap = !unlimited && pct >= 100;
  const barColor = atCap ? "bg-error-500" : "bg-brand-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-300">{label}</span>
        <span className="font-medium text-gray-800 dark:text-white/90">
          {used.toLocaleString()}
          {unlimited ? "" : ` / ${limit.toLocaleString()}`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {!unlimited && <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />}
      </div>
      {atCap && <p className="mt-1 text-xs text-error-600 dark:text-error-400">Limit reached — upgrade to keep going.</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}
