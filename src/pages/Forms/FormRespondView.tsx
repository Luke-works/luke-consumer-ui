import { useMemo, useRef, useState } from "react";
import ErrorBoundary from "../../components/common/ErrorBoundary";
import LukeflowBadge from "../../components/common/LukeflowBadge";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import FormConsentGate, { focusConsent } from "../../components/formBuilder/FormConsentGate";
import SubmissionSuccess from "../../components/formBuilder/SubmissionSuccess";
import PaymentStep from "../../components/formBuilder/PaymentStep";
import { readConsent, readSubmitMessage } from "../../lib/formSchema";
import { schemaForRecipient } from "../../lib/outboundRoles";
import {
  RespondApiError,
  getRespondForm,
  requestOtp,
  startRespondPayment,
  submitRespond,
  syncRespondPayment,
  verifyOtp,
  type RespondForm,
  type RespondSubmitResult,
} from "../../lib/publicInstanceApi";
import {
  completePayment,
  createFormPaymentSession,
  formatMoney,
  previewCharge,
  schemaTakesPayment,
  type CompletePaymentOptions,
  type PaymentStart,
} from "../../lib/formPayments";

const REOPENED_MESSAGE = "Your payment wasn't completed. Please submit the form again.";
const CANT_PAY_NOW = "This payment can't be completed right now. Please try again later.";

/**
 * Public per-recipient outbound fill VIEW (router-free), rendered BOTH by the standalone
 * `respond-main` bundle that core-engine serves at /respond/:token (the primary "different static
 * serve") AND by the SPA route wrapper (FormRespond). No app chrome, no auth — the opaque instance
 * token plus an emailed OTP are the auth. Mirrors FormEmbedView. Phone OTP is deferred (email only).
 */
type Step = "start" | "code" | "fill" | "pay" | "done";

/** The server's state for a submitted-but-unpaid form. */
const AWAITING_PAYMENT = "AWAITING_PAYMENT";

export default function FormRespondView({ token = "" }: { token?: string }) {
  const [step, setStep] = useState<Step>("start");
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [form, setForm] = useState<RespondForm | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Consent (opt-in per form): the recipient's agreement to the statement this version published.
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);
  // Payments: once submitted, the answers are locked and the recipient pays the server-priced charge —
  // right away with the card they entered, or from the pay step after a decline / when they come back.
  // `charge` is null on the pay step while the charge couldn't be started (the step offers "Try again").
  const [charge, setCharge] = useState<PaymentStart | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ status: "succeeded" | "processing"; amount: string } | null>(null);

  // Read from the served schema — the same setting the server enforces against, so what the recipient is
  // asked and what gets recorded cannot diverge.
  const consent = useMemo(() => readConsent(form?.schema), [form?.schema]);

  const initialValues = useMemo(
    () => (form ? { ...(form.prefill ?? {}), ...(form.data ?? {}) } : undefined),
    [form],
  );

  // Fields the PREPARER owns are shown to the recipient but not editable by them — the values are
  // context for the answer they're being asked for, not part of it. (The server enforces this too;
  // a disabled input is a courtesy to honest users, not the boundary.)
  const recipientSchema = useMemo(
    () => (form ? schemaForRecipient(form.schema, form.outboundRoles) : ""),
    [form],
  );

  const takesPayment = useMemo(() => schemaTakesPayment(form?.schema), [form?.schema]);
  const payment = form?.payment;
  const paymentSession = useMemo(
    () => createFormPaymentSession(takesPayment, payment),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [takesPayment, payment?.available, payment?.publishableKey, payment?.accountId, payment?.scriptUrl, payment?.alreadyPaid],
  );

  const finishPaid = (status: "succeeded" | "processing", money: { amountMinor: number; currency: string }) => {
    setPaid({ status, amount: formatMoney(money.amountMinor, money.currency) });
    setCharge(null);
    setStep("done");
  };

  // The charge can't be paid any more and the server has reopened the form: reload it and fill again.
  const reopen = async (tok: string, message: string) => {
    paymentSession?.setError(null);
    try {
      setForm(await getRespondForm(token, tok));
    } catch {
      /* keep what we have; submitting again will say what's wrong */
    }
    setCharge(null);
    setStep("fill");
    setError(message);
  };

  const pay = (start: PaymentStart) => {
    setCharge(start);
    setChargeError(null);
    setStep("pay");
  };

  const payCharge = async (tok: string, start: PaymentStart, options?: CompletePaymentOptions) => {
    if (!paymentSession) return;
    const outcome = await completePayment(paymentSession, start, () => syncRespondPayment(token, tok), options);
    if (outcome === "succeeded" || outcome === "processing") finishPaid(outcome, start);
    // retry → pay the same charge again; confirm → approve the server's amount first (the field says why).
    else if (outcome === "retry" || outcome === "confirm") pay(start);
    else await reopen(tok, REOPENED_MESSAGE);
  };

  const cantPayYet = (message: string) => {
    setCharge(null);
    setChargeError(message);
    setStep("pay");
  };

  // Act on the server's reading of a saved charge. True when it can be paid now (the caller pays it).
  const applyStart = async (tok: string, start: PaymentStart): Promise<boolean> => {
    if (start.status === "succeeded" || start.status === "processing") finishPaid(start.status, start);
    else if (start.status === "requires_payment" && start.clientSecret) return true;
    else if (start.status === "requires_payment") cantPayYet(CANT_PAY_NOW); // being checked; not payable now
    else await reopen(tok, REOPENED_MESSAGE);
    return false;
  };

  // The server refused to start the charge. It may have been paid elsewhere (another tab, a response that
  // never arrived): ask before telling the recipient anything.
  const onStartRefused = async (tok: string, e: unknown) => {
    const now = await syncRespondPayment(token, tok).catch(() => null);
    if (now && (now.status === "succeeded" || now.status === "processing")) {
      finishPaid(now.status, now);
      return;
    }
    if (e instanceof RespondApiError && (e.status === 409 || e.status === 410)) await reopen(tok, REOPENED_MESSAGE);
    else cantPayYet((e as Error).message); // couldn't reach it right now — offer to try again
  };

  // Pick up a saved, unpaid submission: the server re-reads its charge from Stripe.
  const resumeCharge = async (tok: string) => {
    try {
      const start = await startRespondPayment(token, tok);
      if (await applyStart(tok, start)) pay(start);
    } catch (e) {
      await onStartRefused(tok, e);
    }
  };

  // The pay step: resume the saved charge (the server re-reads it from Stripe) and pay it.
  const payNow = async () => {
    if (!accessToken || !paymentSession) return;
    setBusy(true);
    setError(null);
    try {
      if (!charge) {
        await resumeCharge(accessToken); // the charge couldn't be started before: try again
        return;
      }
      // Re-read the charge FIRST: it may have gone through (or ended) since the step was shown.
      let start: PaymentStart;
      try {
        start = await startRespondPayment(token, accessToken);
      } catch (e) {
        await onStartRefused(accessToken, e);
        return;
      }
      if (!(await applyStart(accessToken, start))) return;
      if (await paymentSession.validate()) return; // the reason is on the payment field
      // The step showed `charge`; any other amount must be approved again before it is charged.
      await payCharge(accessToken, start, { expected: charge });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await requestOtp(token);
      setSentTo(r.sentTo);
      setStep("code");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { accessToken: tok } = await verifyOtp(token, code.trim());
      const f = await getRespondForm(token, tok);
      setAccessToken(tok);
      setForm(f);
      // The code is spent from here on: never leave the recipient on the code screen.
      if (f.state === AWAITING_PAYMENT) await resumeCharge(tok); // they submitted but didn't finish paying
      else setStep("fill");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    if (!accessToken) return;
    // Enforced server-side; this only spares the recipient a round-trip and a generic error.
    if (consent.enabled && !consentAgreed) {
      setConsentError(true);
      focusConsent(consentRef);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (paymentSession) {
        paymentSession.setError(null);
        if (await paymentSession.validate()) {
          setError("Check your payment details below."); // the reason is on the payment field
          return;
        }
      }
      let res: RespondSubmitResult;
      try {
        res = await submitRespond(token, accessToken, data, consentAgreed);
      } catch (e) {
        setError((e as Error).message);
        // A payment form may have been saved before the failure: if so, carry on to its charge rather
        // than letting every resubmit bounce off "no longer open".
        if (takesPayment) {
          const fresh = await getRespondForm(token, accessToken).catch(() => null);
          if (fresh?.state === AWAITING_PAYMENT) {
            setForm(fresh);
            setError(null);
            await resumeCharge(accessToken);
          }
        }
        return;
      }
      if (res.state === AWAITING_PAYMENT) {
        if (res.payment && paymentSession) {
          // Charge without asking only if it is exactly what the payment field showed (priced from the
          // same schema the server uses).
          await payCharge(accessToken, res.payment, { expected: previewCharge(form?.schema, data) });
        } else {
          setCharge(null);
          setChargeError(res.paymentError || "The payment couldn't be started.");
          setStep("pay");
        }
        return;
      }
      if (res.paymentError) {
        // Refused outright: the server reopened the form.
        await reopen(accessToken, res.paymentError);
        return;
      }
      setStep("done");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div className="mx-auto max-w-[640px] rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.03]">
        {error ? (
          <p className="mb-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-500 dark:bg-error-500/10">{error}</p>
        ) : null}

        {step === "start" ? (
          <div className="py-6 text-center">
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Verify it's you</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
              To open this form, we'll email a one-time code to the address it was sent to.
            </p>
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="mt-5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </div>
        ) : step === "code" ? (
          <div className="py-6 text-center">
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Enter your code</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
              We sent a 6-digit code {sentTo ? <>to <span className="font-medium">{sentTo}</span></> : "to your email"}. It
              expires in 10 minutes.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoFocus
              placeholder="123456"
              className="mx-auto mt-5 block w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-gray-800 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-white/5 dark:text-white/90"
            />
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={verify}
                disabled={busy || code.length < 6}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {busy ? "Verifying…" : "Verify & continue"}
              </button>
              <button
                type="button"
                onClick={sendCode}
                disabled={busy}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Resend
              </button>
            </div>
          </div>
        ) : step === "done" ? (
          <>
            <SubmissionSuccess message={form ? readSubmitMessage(form.schema) : undefined} />
            {paid ? (
              <p className="-mt-6 pb-4 text-center text-sm text-gray-500 dark:text-gray-400">
                {paid.status === "succeeded"
                  ? `Payment of ${paid.amount} received.`
                  : `Your payment of ${paid.amount} is being processed.`}
              </p>
            ) : null}
          </>
        ) : step === "pay" && form && paymentSession ? (
          <>
            <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90">{form.name}</h1>
            <PaymentStep
              start={charge}
              session={paymentSession}
              busy={busy}
              onPay={() => void payNow()}
              error={chargeError}
              onRetry={() => void payNow()}
            />
          </>
        ) : form ? (
          <>
            <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90">{form.name}</h1>
            {consent.enabled ? (
              <FormConsentGate
                text={consent.text}
                agreed={consentAgreed}
                onChange={(v) => { setConsentAgreed(v); if (v) setConsentError(false); }}
                error={consentError}
                disabled={busy}
                inputRef={consentRef}
              />
            ) : null}
            <ErrorBoundary
              label="form-respond-renderer"
              fallback={(e) => (
                <p className="py-8 text-center text-sm text-error-500">This form couldn't be displayed. {e.message}</p>
              )}
            >
              {/* Public per-recipient fill (token+OTP auth): author is untrusted vs the filler → no author JS. */}
              {/* The payment previews against the SERVED schema: the recipient copy locks the preparer's
                  fields, which the pricing rules would otherwise read as conditional. */}
              <FormRenderer schema={recipientSchema} initialValues={initialValues} onSubmit={onSubmit} submitting={busy} allowJs={false} payments={paymentSession} pricingSchema={form.schema} />
            </ErrorBoundary>
          </>
        ) : null}
      </div>
      {/* Attribution, from the same server-resolved flag as the embed surface. It can only appear once
          the recipient is verified and the form payload has arrived — the OTP challenge screens have no
          form to attribute yet. The badge is centered on the page, which lines it up under the card. */}
      {form?.showBranding ? <LukeflowBadge surface="respond" /> : null}
    </div>
  );
}
