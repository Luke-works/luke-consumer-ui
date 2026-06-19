import { useEffect, useState } from "react";
import { useParams } from "react-router";
import ErrorBoundary from "../../components/common/ErrorBoundary";
import FormRenderer from "../../components/formBuilder/FormRenderer";
import SubmissionSuccess from "../../components/formBuilder/SubmissionSuccess";
import { readSubmitMessage } from "../../lib/formSchema";
import { getEmbedForm, submitEmbed, type EmbedForm } from "../../lib/publicEmbedApi";
import { isAbortError } from "../../lib/abort";

// Public, standalone page rendered inside the host's <iframe src=".../embed/:token">.
// No app chrome, no auth — the signed token is the auth. Submitting posts to the
// public webhook, which records a response (and starts a process).
export default function FormEmbed() {
  const { token } = useParams();
  const [form, setForm] = useState<EmbedForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to re-attempt a failed load

  useEffect(() => {
    if (!token) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    // getEmbedForm retries transient failures with backoff before rejecting (#39).
    getEmbedForm(token, ctl.signal)
      .then((f) => { setForm(f); setLoading(false); })
      .catch((e: unknown) => {
        if (isAbortError(e)) return; // unmounted / re-attempt superseded this one
        setError((e as Error).message);
        setLoading(false);
      });
    return () => ctl.abort();
  }, [token, reloadKey]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitEmbed(token, data);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div className="mx-auto max-w-[640px] rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <p className="py-12 text-center text-sm text-gray-400">Loading…</p>
        ) : done ? (
          <SubmissionSuccess message={form ? readSubmitMessage(form.schema) : undefined} />
        ) : error && !form ? (
          <div className="py-12 text-center">
            <p className="text-sm text-error-500">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              Try again
            </button>
          </div>
        ) : form ? (
          <>
            <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90">{form.title}</h1>
            {error ? <p className="mb-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-500 dark:bg-error-500/10">{error}</p> : null}
            {/* A bad schema must not blank the host's iframe — degrade to a message. */}
            <ErrorBoundary
              label="form-embed-renderer"
              fallback={(e) => (
                <p className="py-8 text-center text-sm text-error-500">
                  This form couldn't be displayed. {e.message}
                </p>
              )}
            >
              <FormRenderer schema={form.schema} onSubmit={handleSubmit} submitting={submitting} />
            </ErrorBoundary>
          </>
        ) : null}
      </div>
    </div>
  );
}
