import { useEffect, useRef, useState } from "react";
import { connectEmbedFrame, type FrameBridge } from "@lukeflow/form-embed";
import ErrorBoundary from "../../components/common/ErrorBoundary";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import SubmissionSuccess from "../../components/formBuilder/SubmissionSuccess";
import { readSubmitMessage } from "../../lib/formSchema";
import { getEmbedForm, submitEmbed, type EmbedForm } from "../../lib/publicEmbedApi";
import { isAbortError } from "../../lib/abort";

// The public embed renderer — router-free so it mounts BOTH inside the SPA route (FormEmbed) and as
// the standalone bundle (embed-main) that core-engine serves with a per-tenant frame-ancestors header.
// No app chrome, no auth — the signed token is the auth. Submitting posts to the public webhook.
export default function FormEmbedView({ token }: { token?: string }) {
  const [form, setForm] = useState<EmbedForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to re-attempt a failed load

  // The host-page bridge: auto-reports our height and emits ready/submitted/error to the embedding
  // site via @lukeflow/form-embed (a no-op when this page is opened standalone, i.e. not framed).
  const cardRef = useRef<HTMLDivElement>(null);
  const honeypot = useRef<HTMLInputElement>(null); // bot trap — humans never fill it (Route B M5)
  const bridge = useRef<FrameBridge | null>(null);
  useEffect(() => {
    // Measure the CARD, not the min-h-screen root (which would pin height to the iframe's own viewport
    // and never shrink to content).
    const b = connectEmbedFrame({ element: cardRef.current ?? undefined });
    bridge.current = b;
    return () => { b.destroy(); bridge.current = null; };
  }, []);

  useEffect(() => {
    if (!token) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    // getEmbedForm retries transient failures with backoff before rejecting (#39).
    getEmbedForm(token, ctl.signal)
      .then((f) => { setForm(f); setLoading(false); bridge.current?.ready(); })
      .catch((e: unknown) => {
        if (isAbortError(e)) return; // unmounted / re-attempt superseded this one
        setError((e as Error).message);
        setLoading(false);
        bridge.current?.error((e as Error).message);
      });
    return () => ctl.abort();
  }, [token, reloadKey]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      // Carry the honeypot value under the agreed key; the engine drops the submission if it's filled.
      const res = await submitEmbed(token, { ...data, _lukehp: honeypot.current?.value ?? "" });
      setDone(true);
      bridge.current?.submitted(res.instanceId);
    } catch (e) {
      setError((e as Error).message);
      bridge.current?.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div ref={cardRef} className="mx-auto max-w-[640px] rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.03]">
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
            {/* Honeypot bot-trap (M5): hidden from humans (off-screen, not tabbable, aria-hidden),
                tempting to bots. A filled value makes the engine silently drop the submission. */}
            <input
              ref={honeypot}
              type="text"
              name="company_website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", top: "-9999px", width: 1, height: 1, opacity: 0 }}
            />
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
