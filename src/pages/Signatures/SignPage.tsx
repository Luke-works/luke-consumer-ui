import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { DocumentViewer, SignaturePad, fieldToCssRect, type PdfGeometry } from "@lukeflow/sign-react";
import { ApiError, signatureInstances, type RecipientSession } from "../../lib/signaturesApi";

/** Public per-recipient signing page (token-authenticated, outside the app shell). */
export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<RecipientSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signaturePng, setSignaturePng] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    const ctl = new AbortController();
    setLoadError(null);
    signatureInstances
      .getRecipientSession(token, ctl.signal)
      .then(setSession)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setLoadError(messageFor(e));
      });
    return () => ctl.abort();
  }, [token]);

  const pdfSource = useMemo(
    () => (session ? `data:application/pdf;base64,${session.pdfBase64}` : ""),
    [session],
  );
  const firstFieldPage = session?.fields?.[0]?.page ?? 0;
  const canSubmit = !!signaturePng && consent && !submitting;

  const submit = async () => {
    if (!token || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await signatureInstances.signAsRecipient(token, { signaturePngBase64: signaturePng, consent: true });
      setDone(true);
    } catch (e) {
      setSubmitError(messageFor(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <Centered>
        <AlertCircle className="mx-auto mb-3 size-10 text-error-500" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link can’t be opened</h1>
        <p className="mt-1 text-sm text-gray-500">{loadError}</p>
      </Centered>
    );
  }
  if (done) {
    return (
      <Centered>
        <CheckCircle2 className="mx-auto mb-3 size-10 text-success-500" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Signed — thank you</h1>
        <p className="mt-1 text-sm text-gray-500">Your signature has been recorded. You can close this page.</p>
      </Centered>
    );
  }
  if (!session) {
    return <Centered><p className="text-sm text-gray-400">Loading document…</p></Centered>;
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{session.documentName ?? "Document"}</h1>
          <p className="mt-1 text-sm text-gray-500">{session.signerName}, please review and sign below.</p>

          <div className="my-5">
            <DocumentViewer
              source={pdfSource}
              fieldPage={firstFieldPage}
              renderOverlay={({ page, geometry }: { page: number; geometry: PdfGeometry }) => (
                <>
                  {session.fields.filter((f) => f.page === page).map((f) => {
                    const r = fieldToCssRect(geometry, f);
                    return (
                      <div
                        key={f.id}
                        className="pointer-events-none absolute flex items-center justify-center rounded border-2 border-dashed border-brand-500 bg-brand-500/10 text-[10px] font-semibold uppercase text-brand-600"
                        style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
                      >
                        Sign here
                      </div>
                    );
                  })}
                </>
              )}
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Draw your signature</label>
              <SignaturePad onChange={setSignaturePng} />
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 rounded border-gray-300" />
              <span>I agree to sign this document electronically and that my electronic signature is legally binding.</span>
            </label>
            {submitError && <p className="text-sm text-error-500">{submitError}</p>}
            <button onClick={submit} disabled={!canSubmit} className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? "Submitting…" : "Sign document"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {children}
      </div>
    </div>
  );
}

function messageFor(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return "This signing link is invalid or no longer available.";
    if (e.status === 410) return "This document has already been signed or is no longer active.";
    if (e.status === 409) return "It’s not your turn to sign yet — you’ll be notified when it is.";
    if (e.status === 400) return "Please draw your signature and accept the consent before signing.";
    return e.message;
  }
  return "Something went wrong. Please try again.";
}
