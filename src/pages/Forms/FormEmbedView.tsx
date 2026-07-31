import { useEffect, useMemo, useRef, useState } from "react";
import { MinionProvider } from "@lukeflow/form-react";
import { connectEmbedFrame, type FrameBridge } from "@lukeflow/form-embed";
import { createPublicMinionClient } from "../../lib/minionsApi";
import ErrorBoundary from "../../components/common/ErrorBoundary";
import LukeflowBadge from "../../components/common/LukeflowBadge";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import FormConsentGate, { focusConsent } from "../../components/formBuilder/FormConsentGate";
import TurnstileGate from "../../components/formBuilder/TurnstileGate";
import SubmissionSuccess from "../../components/formBuilder/SubmissionSuccess";
import { readAttachmentsEnabled, readConsent, readSubmitMessage } from "../../lib/formSchema";
import { getEmbedForm, submitEmbed, type EmbedForm } from "../../lib/publicEmbedApi";
import { linkEmbedDocuments } from "../../lib/publicDocumentsApi";
import EmbedAttachments from "./EmbedAttachments";
import { isAbortError } from "../../lib/abort";

// High-entropy case-file key for this fill session (Flow-A): attachments upload under it before the
// form is submitted, then bind to the created instance on submit. Unguessable so no other session can
// target it; the embed token still scopes everything to the form's tenant.
function newAttachmentRef(): string {
  const c = globalThis.crypto as Crypto | undefined;
  const id = c?.randomUUID ? c.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return "embed-" + id.replace(/-/g, "");
}

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
  const [attachmentRef] = useState(newAttachmentRef); // stable per fill session
  const [tab, setTab] = useState<"form" | "files">("form"); // Attachments is a TAB, not an inline field
  const [attachmentCount, setAttachmentCount] = useState(0); // drives the tab badge
  // Consent (opt-in per form): the filler's agreement to the statement published with this version.
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);
  // Cloudflare Turnstile. Platform-wide (the server decides), not a per-form setting. The token is
  // single-use and short-lived, so it is state — not something we can capture once and reuse.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  // The host-page bridge: auto-reports our height and emits ready/submitted/error to the embedding
  // site via @lukeflow/form-embed (a no-op when this page is opened standalone, i.e. not framed).
  const cardRef = useRef<HTMLDivElement>(null);
  const honeypot = useRef<HTMLInputElement>(null); // bot trap — humans never fill it (Route B M5)
  const bridge = useRef<FrameBridge | null>(null);
  useEffect(() => {
    // Measure the CARD + badge wrapper, not the min-h-screen root (which would pin height to the
    // iframe's own viewport and never shrink to content). The ref sits on the wrapper rather than the
    // card itself so the attribution badge BELOW the card is inside the reported height — measuring
    // only the card would let the host iframe crop the badge off.
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

  // The agreement this VERSION published — read from the served schema, the same setting the server
  // enforces against, so what the filler is asked and what gets recorded cannot diverge.
  const consent = useMemo(() => readConsent(form?.schema), [form?.schema]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    if (!token) return;
    // Consent is enforced server-side (a submit without it is refused); catching it here just spares the
    // filler a round-trip and a generic error. Send them back to the box rather than only colouring it —
    // it sits above the form, so after a long fill it may well be off-screen.
    if (consent.enabled && !consentAgreed) {
      setConsentError(true);
      focusConsent(consentRef);
      return;
    }
    // The server refuses a submission without a verified challenge, so catching it here only spares
    // the filler a round-trip and a generic 400. With `interaction-only` the widget is usually
    // invisible and the token is already there, so this rarely fires.
    if (form?.captchaEnabled && !captchaToken) {
      setError("Please wait a moment for the security check to finish, then try again.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Carry the honeypot value under the agreed key; the engine drops the submission if it's filled.
      // attachmentRef is bound server-side at submit so the formMetaData snapshot captures the uploads.
      const res = await submitEmbed(
        token,
        { ...data, _lukehp: honeypot.current?.value ?? "" },
        attachmentRef,
        consentAgreed,
        captchaToken,
      );
      // Belt-and-suspenders: re-bind any attachments to the created instance (idempotent; never blocks).
      if (res.instanceId) void linkEmbedDocuments(token, attachmentRef, res.instanceId);
      setDone(true);
      bridge.current?.submitted(res.instanceId);
    } catch (e) {
      setError((e as Error).message);
      bridge.current?.error((e as Error).message);
      // Turnstile tokens are single-use: whatever failed, the one we just sent is spent. Without a
      // fresh challenge the retry would be refused for a reason the filler cannot see or fix.
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  };

  // Attachments are opt-in per form (Form settings → "Allow file attachments"). The tab only appears
  // when the published schema enables it; otherwise the form renders on its own with no tabs.
  // The SERVER decides: attachments are a paid feature, so the effective flag already has the
  // tenant's plan applied. Fall back to the schema only for an engine that predates the field —
  // re-reading it here on a modern engine would re-open the tab for a free tenant whose uploads the
  // upload endpoint is going to refuse anyway.
  const showAttachments =
    !!form && token != null &&
    (form.attachmentsEnabled ?? readAttachmentsEnabled(form.schema));

  // Secure minion client for this embed: token-scoped, no auth header. Powers server-side field
  // features (e.g. address autocomplete) without exposing any provider key to the browser.
  const minionClient = useMemo(() => (token ? createPublicMinionClient(token) : null), [token]);

  // The security check, handed to the renderer's `beforeSubmit` slot so it sits directly above the
  // Submit button — where the filler is looking when they go to submit. Invisible for most of them
  // (`interaction-only`); it only shows itself when Cloudflare actually wants a challenge.
  //
  // It lives in the Form tab, which is also the only tab with a Submit button, so nothing is ever
  // stranded behind an inactive tab.
  const captchaGate =
    form?.captchaEnabled && form.captchaSitekey ? (
      <TurnstileGate
        sitekey={form.captchaSitekey}
        onToken={setCaptchaToken}
        onError={setError}
        resetSignal={captchaReset}
      />
    ) : null;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div ref={cardRef} className="mx-auto max-w-[640px]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.03]">
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

              {/* The agreement, ABOVE the tabs so it stays visible on the Attachments tab too — consent
                  covers the whole submission, files included, not just the form fields. */}
              {consent.enabled ? (
                <FormConsentGate
                  text={consent.text}
                  agreed={consentAgreed}
                  onChange={(v) => { setConsentAgreed(v); if (v) setConsentError(false); }}
                  error={consentError}
                  disabled={submitting}
                  inputRef={consentRef}
                />
              ) : null}

              {/* Attachments live in their own TAB (opt-in per form), not as an inline form field. Both
                  panels stay MOUNTED (toggled with `hidden`) so typed form data and any in-progress upload
                  survive a tab switch. With attachments off, the form renders on its own — no tabs. */}
              {showAttachments ? (
                <div role="tablist" aria-label="Form sections" className="mb-5 flex gap-1 border-b border-gray-200 dark:border-gray-800">
                  <TabButton id="form" active={tab === "form"} onClick={() => setTab("form")}>
                    Form
                  </TabButton>
                  <TabButton id="files" active={tab === "files"} onClick={() => setTab("files")} badge={attachmentCount}>
                    Attachments
                  </TabButton>
                </div>
              ) : null}

              <div role="tabpanel" hidden={showAttachments && tab !== "form"}>
                {/* A bad schema must not blank the host's iframe — degrade to a message. */}
                <ErrorBoundary
                  label="form-embed-renderer"
                  fallback={(e) => (
                    <p className="py-8 text-center text-sm text-error-500">
                      This form couldn't be displayed. {e.message}
                    </p>
                  )}
                >
                  {minionClient ? (
                    <MinionProvider client={minionClient}>
                      <FormRenderer schema={form.schema} onSubmit={handleSubmit} submitting={submitting} allowJs={false} beforeSubmit={captchaGate} />
                    </MinionProvider>
                  ) : (
                    <FormRenderer schema={form.schema} onSubmit={handleSubmit} submitting={submitting} allowJs={false} beforeSubmit={captchaGate} />
                  )}
                </ErrorBoundary>
              </div>

              {/* Token-scoped attachments (uploaded before submit, linked to the instance after). */}
              {showAttachments && token ? (
                <div role="tabpanel" hidden={tab !== "files"}>
                  <EmbedAttachments token={token} processRef={attachmentRef} onCountChange={setAttachmentCount} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        {/* Attribution. The server has already applied the tenant's plan, so this flag is the effective
            answer — free tenants can't switch it off, paying tenants can (Form settings → "Show
            'Developed at Lukeflow'"). Shown on every state of the page (including the thank-you), but
            never before the form has loaded — an error/loading shell shouldn't advertise. */}
        {form?.showBranding ? <LukeflowBadge surface="embed" /> : null}
      </div>
    </div>
  );
}

// A lightweight tab trigger (no router/UI-lib dep — the embed bundle stays small). The badge shows the
// current attachment count so a filler sees their files without leaving the Form tab.
function TabButton({
  id,
  active,
  onClick,
  badge,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`embed-tab-${id}`}
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-brand-500 text-brand-600 dark:text-brand-400"
          : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      }`}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
          {badge}
        </span>
      )}
    </button>
  );
}
