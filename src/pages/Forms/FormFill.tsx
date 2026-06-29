import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import SubmissionSuccess from "../../components/formBuilder/SubmissionSuccess";
import AttachmentsButton from "../../components/documents/AttachmentsButton";
import { readSubmitMessage } from "../../lib/formSchema";
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

  const [view, setView] = useState<InstanceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState(false);

  const created = useRef(false);
  const saveTimer = useRef<number | null>(null);
  // Track the latest edit + a pending flag so an in-debounce edit can be flushed
  // on exit instead of dropped, plus the save context for the unmount flush.
  const latestDataRef = useRef<Record<string, unknown> | null>(null);
  const pendingRef = useRef(false);
  const ctxRef = useRef<{ tenant: string | null; instanceId: string | null }>({ tenant: null, instanceId: null });

  // Create the instance once on entry.
  useEffect(() => {
    if (!tenant || !code || created.current) return;
    created.current = true;
    let active = true;
    createInstance(tenant, { definitionCode: code })
      .then((v) => { if (active) { setView(v); setLoading(false); } })
      .catch((e: unknown) => {
        if (active) { setError(messageFor(e)); setLoading(false); }
      });
    return () => { active = false; };
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
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSubmitting(true);
    try {
      await submitInstance(tenant, instance.id, data);
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
              <FormRenderer
                schema={view!.schema}
                initialValues={initialValues}
                onChange={handleChange}
                onSubmit={handleSubmit}
                submitting={submitting}
              />
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
