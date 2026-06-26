/**
 * LukeBuilderPage — the STAGED form designer powered by @lukeflow/form-builder
 * (the headless monorepo builder), as the next step of the consumer-ui cutover.
 *
 * It is a thin shell: the package's <FormBuilder> provides the full editing surface
 * (searchable palette, drag-and-drop canvas, tabbed attribute settings incl. Minion
 * data sources + JS logic), and this page owns the app lifecycle — load, debounced
 * autosave, check-in, publish, discard — plus consumer-ui's domain-specific attribute
 * editors injected via the `attributeEditors` plugin (see {@link lukeAttributeEditors}).
 *
 * Scope (v1): a runnable, verifiable cutover that leaves the existing coltorapps
 * FormBuilderPage untouched. The AI panel (LukeBuilds), "Test the form" (LukeTests) +
 * sign-off, edit-lock and embed are NOT yet ported here — they remain on the legacy
 * page until this is QA'd, then they get layered on and the legacy page + coltorapps
 * are removed. Reachable at `/forms/:id/build-v2`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FormBuilder, type FormBuilderHandle } from "@lukeflow/form-builder";
import "@lukeflow/form-react/styles.css";
import "@lukeflow/form-builder/styles.css";
import "../../styles/lukeforms-theme.css"; // token bridge — MUST load after the package CSS
import { camelCaseKeys, readSubmitMessage, validateSchema, type FormSchema } from "@lukeflow/form-core";
import { useAuth } from "../../context/AuthContext";
import { canWrite, FORMS } from "../../lib/capabilities";
import AiAssistPanel from "./AiAssistPanel";
import type { BuilderSchemaLike } from "../../lib/formAgentApi";
import {
  checkIn,
  checkout,
  discardDraft,
  getForm,
  latestVersion,
  publishVersion,
  release,
  saveDraft,
  type FormStatus,
  type StoredForm,
} from "../../lib/formsApi";
import { lukeAttributeEditors } from "./lukeAttributeEditors";
import { Modal } from "../../components/ui/modal";
import { MonitorPlay, FlaskConical, BadgeCheck, CodeXml } from "lucide-react";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import FormTestPanel from "./FormTestPanel";
import FormEmbedPanel from "./FormEmbedPanel";

const EMPTY: FormSchema = { root: [], entities: {} };

function parseSchema(raw: string): FormSchema {
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && p.entities && Array.isArray(p.root)) return p as FormSchema;
  } catch {
    /* fall through */
  }
  return EMPTY;
}

const STATUS_BADGE: Record<FormStatus, string> = {
  draft: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  published: "bg-success-50 text-success-600 dark:bg-success-500/15",
  archived: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
};

export default function LukeBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;
  const canEdit = canWrite(session, FORMS);

  const [form, setForm] = useState<StoredForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState<null | "checkin" | "publish" | "discard">(null);
  const [status, setStatus] = useState<FormStatus>("draft");
  const [version, setVersion] = useState(0);
  const [submitMessage, setSubmitMessage] = useState("");
  // Live schema mirrored to the AI panel (which reads it to build/modify the form).
  const [liveSchema, setLiveSchema] = useState<BuilderSchemaLike | null>(null);
  // Preview + "Test the form" (positive/negative validation runs + sign-off).
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSchema, setPreviewSchema] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<number | null>(null);
  const [embedOpen, setEmbedOpen] = useState(false);

  // Latest schema reported by the (uncontrolled) builder; the lifecycle reads it.
  const latestRef = useRef<FormSchema | null>(null);
  const submitMsgRef = useRef("");
  const saveTimer = useRef<number | null>(null);
  const unsaved = useRef(false);
  // Imperative handle: lets the AI apply a new schema WITHOUT remounting the builder,
  // so the AI panel + its chat history (the `aside`) stay mounted across applies.
  const builderRef = useRef<FormBuilderHandle>(null);

  useEffect(() => {
    if (!tenant || !id) return;
    let active = true;
    setLoading(true);
    getForm(tenant, id)
      .then((f) => {
        if (!active) return;
        setForm(f);
        setStatus(f.status);
        setVersion(latestVersion(f));
        setLastTestedAt(f.lastTestedAt ?? null);
        const sm = readSubmitMessage(f.schema);
        setSubmitMessage(sm);
        submitMsgRef.current = sm;
        latestRef.current = null;
        setLiveSchema(parseSchema(f.schema) as unknown as BuilderSchemaLike);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          navigate("/forms", { replace: true });
        }
      });
    return () => {
      active = false;
    };
  }, [tenant, id, reloadKey, navigate]);

  // Acquire the advisory edit lock on open and release it on leave — the backend
  // gates draft saves on the lock, so without this every autosave returns "Save failed".
  // A 409 (someone else holds it) is tolerated: editing still works, the save may fail
  // until taken over, matching the classic designer's behavior.
  useEffect(() => {
    if (!tenant || !id || !canEdit) return;
    checkout(tenant, id).catch(() => {}); // 409 → another holder; non-fatal
    return () => {
      void release(tenant, id);
    };
  }, [tenant, id, canEdit]);

  const initialSchema = useMemo(() => (form ? parseSchema(form.schema) : EMPTY), [form]);

  // Blocking (error-severity) schema problems, from the SAME form-core validator the
  // builder's Problems badge/panel use — so a red "N problems" badge ⟺ Check-in/Publish
  // disabled here. liveSchema mirrors the builder's working schema (set on load + onChange).
  const blocking = useMemo(
    () => validateSchema((liveSchema as unknown as FormSchema | null) ?? initialSchema).filter((d) => d.severity === "error"),
    [liveSchema, initialSchema],
  );

  // Merge the form-level submit message into a schema before persisting (preserving
  // any other settings), matching the legacy page's `withSettings`.
  const toJson = useCallback(
    (schema: FormSchema) =>
      JSON.stringify({ ...schema, settings: { ...(schema.settings ?? {}), submitMessage: submitMsgRef.current } }),
    [],
  );

  const persist = useCallback(
    async (schema: FormSchema) => {
      if (!tenant || !id) return;
      try {
        await saveDraft(tenant, id, toJson(schema));
        unsaved.current = false;
        setSaved(true);
        setSaveError(false);
      } catch {
        setSaved(false);
        setSaveError(true);
      }
    },
    [tenant, id, toJson],
  );

  const scheduleSave = useCallback(
    (schema: FormSchema) => {
      setSaved(false);
      setSaveError(false);
      unsaved.current = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void persist(schema), 600);
    },
    [persist],
  );

  const handleChange = useCallback(
    (schema: FormSchema) => {
      latestRef.current = schema;
      setLiveSchema(schema as unknown as BuilderSchemaLike); // keep the AI panel's view current
      if (!canEdit) return; // view-only: never persist edits.
      scheduleSave(schema);
    },
    [canEdit, scheduleSave],
  );

  // Apply an AI-generated schema: normalize keys to camelCase (the agent emits snake_case
  // without our uniqueness guards), push it into the builder via the imperative handle
  // (no remount → the AI chat survives), and let onChange persist it.
  const applyAiSchema = useCallback((schema: BuilderSchemaLike) => {
    const normalized = camelCaseKeys(schema as unknown as FormSchema);
    builderRef.current?.setSchema(normalized); // fires onChange → mirrors liveSchema + autosaves
  }, []);

  // Flush a pending edit on unmount (best-effort — can't surface UI once gone).
  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (canEdit && unsaved.current && latestRef.current && tenant && id) {
        saveDraft(tenant, id, toJson(latestRef.current)).catch((e) =>
          console.error("Autosave on unmount failed; unsaved edits may be lost", e),
        );
      }
    },
    [canEdit, tenant, id, toJson],
  );

  // Warn before a hard unload (tab close / refresh) with unsaved edits.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (unsaved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const currentJson = () => toJson(latestRef.current ?? initialSchema);

  const onCheckIn = async () => {
    if (!tenant || !id || blocking.length) return; // never check in a schema with blocking problems
    setBusy("checkin");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    try {
      const art = await checkIn(tenant, id, currentJson());
      setVersion(art.version);
      setStatus("published");
      setSaved(true);
      setSaveError(false);
    } catch (e) {
      console.error("Check-in failed", e);
      setSaveError(true);
    } finally {
      setBusy(null);
    }
  };

  const onPublish = async () => {
    if (!tenant || !id || blocking.length) return; // never publish a schema with blocking problems
    setBusy("publish");
    try {
      await publishVersion(tenant, id, version);
      setStatus("published");
      setSaveError(false);
    } catch (e) {
      console.error("Publish failed", e);
      setSaveError(true);
    } finally {
      setBusy(null);
    }
  };

  const onDiscard = async () => {
    if (!tenant || !id) return;
    if (!window.confirm("Discard draft changes and revert to the published version?")) return;
    setBusy("discard");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    try {
      await discardDraft(tenant, id);
      unsaved.current = false;
      setReloadKey((k) => k + 1);
    } catch (e) {
      console.error("Discard failed", e);
      setSaveError(true);
    } finally {
      setBusy(null);
    }
  };

  const onSubmitMessage = (v: string) => {
    setSubmitMessage(v);
    submitMsgRef.current = v;
    if (!canEdit) return;
    scheduleSave(latestRef.current ?? initialSchema);
  };

  // Preview snapshots the live schema into a read-only renderer; Test opens the
  // self-contained panel, which snapshots + auto-fills on open.
  const openPreview = () => {
    setPreviewSchema(currentJson());
    setPreviewOpen(true);
  };

  const editors = useMemo(() => lukeAttributeEditors, []);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading form…</div>;
  }
  if (!tenant || !id || !form) return null;

  const saveLabel = saveError ? "Save failed" : saved ? "Saved" : "Saving…";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        New builder (preview) — powered by <code>@lukeflow/form-builder</code>. “Test the form” and sign-off are
        not wired here yet; use the classic designer for those.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/forms")}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          ← Forms
        </button>
        <h1 className="min-w-0 truncate text-lg font-semibold text-gray-800 dark:text-white/90">{form.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>{status}</span>
        <span className="text-xs text-gray-400">v{version}</span>
        {lastTestedAt && (
          <span className="inline-flex items-center gap-1 text-xs text-success-600 dark:text-success-400">
            <BadgeCheck className="size-3.5" />Tested
          </span>
        )}
        <span className={`text-xs ${saveError ? "text-error-500" : "text-gray-400"}`}>{canEdit ? saveLabel : "View only"}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Preview + Test are available to view-only users too (read access can validate). */}
          <button
            type="button"
            onClick={openPreview}
            title="Preview & test the form — conditions, calculations and validation run live."
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <MonitorPlay className="size-4" />Preview
          </button>
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            title="Auto-fill the form with valid sample data, validate it, and sign off."
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <FlaskConical className="size-4" />Test
          </button>
          {canEdit && (
            <>
              {blocking.length > 0 && (
                <span
                  title="Fix these before checking in or publishing — see the Problems list in the builder below."
                  className="inline-flex items-center gap-1 rounded-lg bg-error-50 px-2.5 py-1.5 text-xs font-medium text-error-600 dark:bg-error-500/10 dark:text-error-400"
                >
                  <span aria-hidden>⊘</span>{blocking.length} error{blocking.length > 1 ? "s" : ""}
                </span>
              )}
              <button
                type="button"
                onClick={onDiscard}
                disabled={busy !== null}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Discard draft
              </button>
              <button
                type="button"
                onClick={onCheckIn}
                disabled={busy !== null || blocking.length > 0}
                title={blocking.length ? "Fix the blocking problems before checking in." : undefined}
                className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50 dark:border-brand-500/30 dark:bg-brand-500/10"
              >
                {busy === "checkin" ? "Checking in…" : "Check in"}
              </button>
              <button
                type="button"
                onClick={onPublish}
                disabled={busy !== null || blocking.length > 0}
                title={blocking.length ? "Fix the blocking problems before publishing." : undefined}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {busy === "publish" ? "Publishing…" : "Publish"}
              </button>
              {status === "published" && (
                <button
                  type="button"
                  onClick={() => setEmbedOpen(true)}
                  title="Get an iframe snippet to embed this form on any website."
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  <CodeXml className="size-4" />Embed
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {canEdit && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-300">Submission “thank you” message</span>
          <input
            value={submitMessage}
            onChange={(e) => onSubmitMessage(e.target.value)}
            placeholder="Thanks — we’ve received your submission."
            className="h-9 w-full max-w-xl rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90"
          />
        </label>
      )}

      <FormBuilder
        key={`${form.id}-${reloadKey}`}
        ref={builderRef}
        initialSchema={initialSchema}
        onChange={handleChange}
        attributeEditors={editors}
        settings="modal"
        aside={
          canEdit ? (
            <AiAssistPanel
              tenant={tenant}
              formId={id}
              formName={form.name}
              schema={liveSchema}
              onApplied={applyAiSchema}
            />
          ) : undefined
        }
      />

      {/* Read-only live preview of the current draft. */}
      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} className="mx-4 max-h-[90vh] w-full max-w-[640px] overflow-y-auto">
        <div className="p-6 sm:p-8">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Preview — {form.name}</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Fill it out to test conditions, calculated values and validation.</p>
          <FormRenderer schema={previewSchema} />
        </div>
      </Modal>

      <FormTestPanel
        open={testOpen}
        onClose={() => setTestOpen(false)}
        tenant={tenant}
        formId={id}
        formName={form.name}
        canEdit={canEdit}
        getJson={currentJson}
        onApplyAiSchema={applyAiSchema}
        onSignedOff={setLastTestedAt}
      />

      {/* Keyed by formId so navigating to another form's builder mints a fresh token. */}
      <FormEmbedPanel key={id} open={embedOpen} onClose={() => setEmbedOpen(false)} tenant={tenant} formId={id} />
    </div>
  );
}
