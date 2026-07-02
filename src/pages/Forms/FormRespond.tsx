import { useMemo, useState } from "react";
import { useParams } from "react-router";
import ErrorBoundary from "../../components/common/ErrorBoundary";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import SubmissionSuccess from "../../components/formBuilder/SubmissionSuccess";
import { readSubmitMessage } from "../../lib/formSchema";
import { getRespondForm, requestOtp, submitRespond, verifyOtp, type RespondForm } from "../../lib/publicInstanceApi";

/**
 * Public per-recipient outbound fill page (/respond/:token). No app chrome, no auth — the opaque
 * instance token plus an emailed OTP are the auth. The recipient verifies their email, then fills
 * the prefilled form and submits. Mirrors the embed page's shape; renders through the one shared
 * FormRenderer. Phone OTP is deferred (no SMS gateway) — email only.
 */
type Step = "start" | "code" | "fill" | "done";

export default function FormRespond() {
  const { token = "" } = useParams();
  const [step, setStep] = useState<Step>("start");
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [form, setForm] = useState<RespondForm | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialValues = useMemo(
    () => (form ? { ...(form.prefill ?? {}), ...(form.data ?? {}) } : undefined),
    [form],
  );

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
      setStep("fill");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await submitRespond(token, accessToken, data);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
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
          <SubmissionSuccess message={form ? readSubmitMessage(form.schema) : undefined} />
        ) : form ? (
          <>
            <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90">{form.name}</h1>
            <ErrorBoundary
              label="form-respond-renderer"
              fallback={(e) => (
                <p className="py-8 text-center text-sm text-error-500">This form couldn't be displayed. {e.message}</p>
              )}
            >
              <FormRenderer schema={form.schema} initialValues={initialValues} onSubmit={onSubmit} submitting={busy} />
            </ErrorBoundary>
          </>
        ) : null}
      </div>
    </div>
  );
}
