import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { MinionProvider } from "@lukeflow/form-react";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import SubmissionSuccess from "../../components/formBuilder/SubmissionSuccess";
import { createAuthedMinionClient } from "../../lib/minionsApi";
import AttachmentsButton from "../../components/documents/AttachmentsButton";
import FormConsentGate from "../../components/formBuilder/FormConsentGate";
import { readConsent, readSubmitMessage } from "../../lib/formSchema";
import {
  createInstance,
  isOpen,
  saveInstanceData,
  STATE_LABEL,
  submitInstance,
  type InstanceView,
} from "../../lib/formInstancesApi";
import { ChevronLeftIcon } from "../../icons";

// Fill a form: creates a runtime instance for the published version, autosaves
// edits, and submits. Reachable from the Forms list ("Fill") at /forms/:code/fill.
export default function FormFill() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;
  // Secure minion client (authed, tenant-scoped) — powers server-side field features like address
  // autocomplete without exposing any provider key to the browser.
  const minionClient = useMemo(() => (tenant ? createAuthedMinionClient(tenant) : null), [tenant]);

  const [view, setView] = useState<InstanceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState(false);
  // Consent (opt-in per form). The in-app door is gated too: whoever ticks the box is the person the
  // record will name, so exempting staff would make the evidence inconsistent across doors.
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);

  const created = useRef(false);
  const saveTimer = useRef<number | null>(null);
  // Track the latest edit + a pending flag so an in-debounce edit can be flushed
  // on exit instead of dropped, plus the save context for the unmount flush.
  const latestDataRef = useRef<Record<string, unknown> | null>(null);
  const pendingRef = useRef(false);
  const ctxRef = useRef<{ tenant: string | null; instanceId: string | null }>({ tenant: null, instanceId: null });

  // Create the instance once on entry.
  //
  // Deliberately NO "ignore stale result" cleanup flag here. The obvious pattern —
  // `let active = true; … return () => { active = false; }` — deadlocks against the
  // `created.current` guard under StrictMode's mount→cleanup→remount: the first pass
  // starts the request and the cleanup disowns its result, then the second pass sees
  // the guard already set and never re-issues it. The response arrives with nothing
  // left to receive it and the page hangs on "Preparing the form…" forever.
  //
  // The guard alone is the correct invariant: exactly one instance is created per
  // mount (creating two would leave an orphan runtime instance behind), and a real
  // unmount gets a fresh ref on remount, so navigating away and back re-fetches.
  // Setting state after unmount is a no-op in React 18+, so nothing needs disowning.
  useEffect(() => {
    if (!tenant || !code || created.current) return;
    created.current = true;
    createInstance(tenant, { definitionCode: code })
      .then((v) => { setView(v); setLoading(false); })
      .catch((e: unknown) => { setError(messageFor(e)); setLoading(false); });
  }, [tenant, code]);

  // On unmount, flush any in-debounce edit so the last keystrokes aren't dropped
  // when the user navigates away within the autosave window.
  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const { tenant: t, instanceId } = ctxRef.current;
    if (pendingRef.current && t && instanceId && latestDataRef.current) {
      pendingRef.current = false;
      saveInstanceData(t, instanceId, latestDataRef.current).catch((e) => {
        console.error("Autosave on exit failed; recent edits may be lost", e);
      });
    }
  }, []);

  const instance = view?.instance ?? null;
  const open = instance ? isOpen(instance.state) : false;
  const initialValues = useMemo(
    () => ({ ...(instance?.prefill ?? {}), ...(instance?.data ?? {}) }),
    [instance],
  );
  // The agreement this instance's PINNED version published — the same setting the server enforces.
  const consent = useMemo(() => readConsent(view?.schema), [view?.schema]);

  const handleChange = (data: Record<string, unknown>) => {
    if (!tenant || !instance || !open) return;
    latestDataRef.current = data;
    pendingRef.current = true;
    ctxRef.current = { tenant, instanceId: instance.id };
    setSaveError(false);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveInstanceData(tenant, instance.id, data)
        .then(() => { pendingRef.current = false; setSavedAt(Date.now()); setSaveError(false); })
        .catch(() => setSaveError(true)); // surface the failure instead of swallowing it
    }, 800);
  };

  const handleSubmit = async (data: Record<string, unknown>) => {
    if (!tenant || !instance) return;
    // Enforced server-side; this only spares a round-trip and a generic error.
    if (consent.enabled && !consentAgreed) {
      setConsentError(true);
      consentRef.current?.focus();
      consentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSubmitting(true);
    try {
      await submitInstance(tenant, instance.id, data, consentAgreed);
      setDone(true);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!tenant || !code) return null;

  return (
    <>
      <PageMeta title="Fill form | Lukeflow" description="Fill out a form." />
      <div className="mx-auto max-w-[720px]">
        <button
          type="button"
          onClick={() => navigate("/forms")}
          className="mb-4 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
        >
          <ChevronLeftIcon className="size-5" />Forms
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.03]">
          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Preparing the form…</p>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-error-500">{error}</p>
              <Button size="sm" variant="outline" onClick={() => navigate("/forms")} className="mt-4">Back to forms</Button>
            </div>
          ) : done ? (
            <div>
              <SubmissionSuccess message={view ? readSubmitMessage(view.schema) : undefined} />
              <div className="text-center">
                <Button size="sm" variant="outline" onClick={() => navigate("/forms")}>Back to forms</Button>
              </div>
            </div>
          ) : !open ? (
            <p className="py-10 text-center text-sm text-gray-400">
              This form can’t be filled right now (status: {instance ? STATE_LABEL[instance.state] : "unknown"}).
            </p>
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">{instance?.definitionCode} · v{instance?.version}</p>
                <div className="flex items-center gap-3">
                  {saveError ? <span className="text-xs text-error-500">Couldn’t save — check your connection</span> : savedAt ? <span className="text-xs text-gray-400">Saved</span> : null}
                  {instance && (
                    <AttachmentsButton
                      processRef={instance.id}
                      ownerEntityId={instance.id}
                      kind="FORM_ATTACHMENT"
                      capability="FORMS"
                    />
                  )}
                </div>
              </div>
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
              {minionClient ? (
                <MinionProvider client={minionClient}>
                  <FormRenderer
                    schema={view!.schema}
                    initialValues={initialValues}
                    onChange={handleChange}
                    onSubmit={handleSubmit}
                    submitting={submitting}
                  />
                </MinionProvider>
              ) : (
                <FormRenderer
                  schema={view!.schema}
                  initialValues={initialValues}
                  onChange={handleChange}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function messageFor(e: unknown): string {
  const m = (e as { message?: string })?.message;
  if (typeof m === "string" && m) {
    if (/no published version/i.test(m)) return "This form has no published version yet — publish it before filling.";
    return m;
  }
  return "Couldn’t open this form.";
}
