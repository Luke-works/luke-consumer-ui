import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ChevronLeft, CreditCard, ExternalLink } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import {
  completeStripeConnect,
  disconnectStripe,
  getPaymentsStatus,
  refreshPaymentsAccount,
  startStripeConnect,
  type PaymentsStatus,
} from "../../lib/paymentsApi";
import { ApiError } from "../../lib/authApi";

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.message) return e.message;
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * Forms → Payments. Where a workspace connects the Stripe account its forms charge into.
 *
 * Bring-your-own-account: the owner signs in to THEIR Stripe and approves Lukeflow; payments then go
 * straight to that account (their receipts, payouts, refunds and disputes). Lukeflow keeps only the
 * account id and takes no fee. Stripe sends the owner back HERE with `?code=&state=`, which this page
 * hands to the server to finish connecting — as the signed-in owner of the workspace that started it.
 */
export default function PaymentsSettings() {
  const { session, switchTenant } = useAuth();
  const tenant = session?.tenant ?? null;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "connect" | "refresh" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The OAuth return must be completed exactly once — the server consumes the state on first use —
  // but StrictMode runs the effect twice and discards the first run. So the one request is SHARED:
  // whichever run is still live when it settles uses its answer.
  const completion = useRef<Promise<PaymentsStatus> | null>(null);

  useEffect(() => {
    if (!tenant) return;
    let live = true;
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    const clearQuery = () => navigate("/forms/payments", { replace: true });

    const load = async () => {
      setLoading(true);
      try {
        if (code && state) {
          completion.current ??= completeStripeConnect(tenant, code, state);
          const s = await completion.current;
          if (!live) return;
          setNotice(s.ready ? "Stripe is connected. Your forms can take payments." : "Stripe is connected.");
          clearQuery();
          // The page reloaded on the way back and may have come up in another workspace: the server
          // completed it for the one that STARTED the connection. Never show that workspace's account
          // here — this page's buttons act on the current one. Switch; the switch reloads the status.
          if (s.tenantId && s.tenantId !== tenant) {
            try {
              await switchTenant(s.tenantId);
            } catch {
              if (!live) return;
              setError("Stripe is connected, but we couldn't switch to that workspace. Choose it from the workspace menu.");
              const own = await getPaymentsStatus(tenant).catch(() => null);
              if (live && own) setStatus(own);
            }
            return;
          }
          setStatus(s);
          return;
        }
        if (oauthError) {
          setError(oauthError === "access_denied" ? "Connecting Stripe was cancelled." : "Stripe couldn't complete the connection. Please try again.");
          clearQuery();
        }
        const s = await getPaymentsStatus(tenant);
        if (live) setStatus(s);
      } catch (e) {
        if (!live) return;
        setError(messageOf(e, "Couldn't load your payment settings."));
        if (code) {
          clearQuery();
          getPaymentsStatus(tenant).then((s) => live && setStatus(s)).catch(() => {});
        }
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    return () => { live = false; };
    // Run on arrival (and on a tenant switch); the query is cleared once handled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const run = async (kind: "connect" | "refresh" | "disconnect") => {
    if (!tenant || busy) return;
    if (kind === "disconnect" && !window.confirm(
      "Disconnect Stripe? Forms that take a payment will stop accepting submissions until an account is connected again.",
    )) return;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "connect") {
        const { url } = await startStripeConnect(tenant);
        window.location.assign(url); // Stripe's consent page; it sends the owner back here
        return;
      }
      const s = kind === "refresh" ? await refreshPaymentsAccount(tenant) : await disconnectStripe(tenant);
      setStatus(s);
      if (kind === "disconnect") setNotice("Stripe was disconnected.");
    } catch (e) {
      setError(messageOf(e, "Something went wrong. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const account = status?.account ?? null;
  // A disconnect that didn't finish still has an account to show (and to disconnect again).
  const connected = account?.status === "CONNECTED" || account?.status === "DISCONNECTING";

  return (
    <>
      <PageMeta title="Payments | Lukeflow" description="Take card payments on your forms with your own Stripe account." />
      <div className="mx-auto max-w-[760px]">
        <button
          type="button"
          onClick={() => navigate("/forms")}
          className="mb-4 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
        >
          <ChevronLeft className="size-4" />Forms
        </button>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Payments</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Take card payments on your forms. Money goes straight to your own Stripe account — Lukeflow never
            holds it and takes no fee.
          </p>
        </div>

        {error ? (
          <p role="alert" className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</p>
        ) : null}
        {notice ? (
          <p role="status" className="mb-4 rounded-lg bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/15 dark:text-success-500">{notice}</p>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          {loading && !status ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : !status ? null : !status.enabled ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">Payments aren't available on this Lukeflow environment yet.</p>
          ) : !status.planAllows ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">Taking payments is included on the Pro plan and above.</p>
              <Link to="/plans" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">See plans</Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
                    <CreditCard className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-white/90">
                      {connected ? account?.displayName || "Stripe account" : "Stripe"}
                      {!status.livemode ? (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-600 dark:bg-amber-500/15">Test mode</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 break-all text-sm text-gray-500 dark:text-gray-400">
                      {connected
                        ? account?.accountId
                        : account?.status === "DISCONNECTED"
                          ? "Disconnected. Connect an account to take payments again."
                          : "No account connected."}
                    </p>
                  </div>
                </div>
                {status.canManage ? (
                  connected ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void run("refresh")} disabled={busy !== null}>
                        {busy === "refresh" ? "Checking…" : "Check again"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void run("disconnect")} disabled={busy !== null}>
                        {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => void run("connect")} disabled={busy !== null}>
                      {busy === "connect" ? "Opening Stripe…" : "Connect Stripe"}
                    </Button>
                  )
                ) : null}
              </div>

              {connected && account ? (
                account.status === "DISCONNECTING" ? (
                  <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    Disconnecting didn't finish, so this account takes no payments. Choose “Disconnect” to try again.
                  </p>
                ) : account.modeMismatch ? (
                  <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                    This account was connected in {account.livemode ? "live" : "test"} mode, but this environment uses{" "}
                    {status.livemode ? "live" : "test"} mode. Disconnect it and connect again.
                  </p>
                ) : status.ready ? (
                  <p className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/15 dark:text-success-500">
                    Ready to take payments{account.defaultCurrency ? ` · settles in ${account.defaultCurrency}` : ""}.
                  </p>
                ) : (
                  <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    Stripe needs more details before this account can take payments. Finish setting it up in your{" "}
                    <a href="https://dashboard.stripe.com/account/onboarding" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium underline">
                      Stripe dashboard<ExternalLink className="size-3.5" />
                    </a>
                    , then choose “Check again”.
                  </div>
                )
              ) : !status.canManage ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Ask a workspace owner to connect Stripe.</p>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">How it works</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-600 dark:text-gray-300">
            <li>Add a <b className="font-medium">Payment</b> field to a form and choose how it's priced: a fixed amount, a price per unit, or an amount the payer enters.</li>
            <li>The payer fills in the form and pays by card before it's submitted. The amount is always worked out by Lukeflow from your settings, never by the browser.</li>
            <li>The submission reaches your workflows only once Stripe confirms the payment. Unpaid attempts are cancelled automatically.</li>
            <li>Receipts, payouts, refunds and disputes are handled in your Stripe dashboard.</li>
          </ol>
          {status && status.enabled && !status.livemode ? (
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              Test mode: pay with Stripe's test card 4242 4242 4242 4242, any future date and any CVC.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
