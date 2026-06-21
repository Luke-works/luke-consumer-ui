import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { ApiError } from "../../lib/authApi";
import PdfView, { type PdfGeometry } from "../../components/signatures/PdfView";
import SignaturePad from "../../components/signatures/SignaturePad";
import { getSigningSession, submitSignature, type SigningSession } from "../../lib/signaturesApi";

const PDF_WIDTH = 600;

/** Public, token-authenticated signing page (outside the authed app shell). */
export default function SignPage() {
  const { token } = useParams<{ token: string }>();

  const [session, setSession] = useState<SigningSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [geom, setGeom] = useState<PdfGeometry | null>(null);
  const [pdfError, setPdfError] = useState(false);

  const [signaturePng, setSignaturePng] = useState("");
  const [consent, setConsent] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    const ctl = new AbortController();
    setLoadError(null);
    getSigningSession(token, ctl.signal)
      .then((s) => {
        setSession(s);
        setTypedName(s.signerName ?? "");
      })
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

  const overlay = useMemo(() => {
    if (!session || !geom) return null;
    const { field } = session;
    const sx = geom.cssW / geom.pdfW;
    const sy = geom.cssH / geom.pdfH;
    return (
      <div
        className="pointer-events-none absolute flex items-center justify-center rounded border-2 border-dashed border-brand-500 bg-brand-500/10 text-[10px] font-medium uppercase text-brand-600"
        style={{ left: field.x * sx, top: field.y * sy, width: field.w * sx, height: field.h * sy }}
      >
        Sign here
      </div>
    );
  }, [session, geom]);

  const canSubmit = !!signaturePng && consent && !!geom && !pdfError && !submitting;

  const submit = async () => {
    if (!token || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitSignature(token, {
        signaturePngBase64: signaturePng,
        consent: true,
        signerNameTyped: typedName.trim() || undefined,
      });
      setDone(true);
    } catch (e) {
      setSubmitError(messageFor(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl">
        {loadError ? (
          <Centered>
            <AlertCircle className="mx-auto mb-3 size-10 text-error-500" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link can’t be opened</h1>
            <p className="mt-1 text-sm text-gray-500">{loadError}</p>
          </Centered>
        ) : done ? (
          <Centered>
            <CheckCircle2 className="mx-auto mb-3 size-10 text-success-500" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Signed — thank you</h1>
            <p className="mt-1 text-sm text-gray-500">
              Your signature has been recorded. You can close this page.
            </p>
          </Centered>
        ) : !session ? (
          <Centered>
            <p className="text-sm text-gray-400">Loading document…</p>
          </Centered>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{session.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {session.signerName}, please review the document and sign below.
            </p>

            <div className="my-5 max-h-[55vh] overflow-auto rounded-lg border border-gray-200 p-2 dark:border-gray-800">
              <PdfView
                source={pdfSource}
                pageNumber={(session.field.page ?? 0) + 1}
                width={PDF_WIDTH}
                onGeometry={(g) => {
                  setPdfError(false);
                  setGeom(g);
                }}
                onError={() => setPdfError(true)}
                overlay={overlay}
              />
            </div>
            {pdfError && (
              <p className="-mt-3 mb-3 text-sm text-error-500">
                This document couldn’t be displayed — please don’t sign. Try reloading the page.
              </p>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Full name
                </label>
                <input
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Draw your signature
                </label>
                <SignaturePad onChange={setSignaturePng} />
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-gray-300"
                />
                <span>I agree to sign this document electronically and that my electronic signature is legally binding.</span>
              </label>

              {submitError && <p className="text-sm text-error-500">{submitError}</p>}

              <button
                onClick={submit}
                disabled={!canSubmit}
                className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Sign document"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {children}
    </div>
  );
}

function messageFor(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return "This signing link is invalid or no longer available.";
    if (e.status === 410) return "This document has already been signed or has been voided.";
    if (e.status === 403) return "Signing is not permitted from your current network.";
    if (e.status === 400) return "Please draw your signature and accept the consent before signing.";
    return e.message;
  }
  return "Something went wrong. Please try again.";
}
