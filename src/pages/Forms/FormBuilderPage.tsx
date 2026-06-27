/**
 * FormBuilderPage — the form designer, powered by @lukeflow/form-builder (the headless
 * monorepo builder). This is THE builder at `/forms/:id`; it replaced the legacy
 * coltorapps FormBuilderPage (deleted in the cutover).
 *
 * It is a thin shell: the package's <FormBuilder> provides the full editing surface
 * (searchable palette, drag-and-drop canvas, tabbed attribute settings incl. Minion data
 * sources + JS logic, Problems panel, live preview), and this page owns the app lifecycle —
 * load, debounced autosave, edit-lock + take-over, leave-guard, check-in/publish/discard
 * (gated on blocking problems) — plus the AI panel (LukeBuilds), "Test the form" + sign-off
 * (LukeTests), Embed, and the settings modal. Live preview is the builder package's own
 * toolbar button (one Preview, not two). Domain-specific attribute editors
 * inject via the `attributeEditors` plugin (see {@link lukeAttributeEditors}).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FormBuilder, type FormBuilderHandle } from "@lukeflow/form-builder";
import "@lukeflow/form-react/styles.css";
import "@lukeflow/form-builder/styles.css";
import "../../styles/lukeforms-theme.css"; // token bridge — MUST load after the package CSS
import { readSubmitMessage, validateSchema, type FormSchema } from "@lukeflow/form-core";
import { useAuth } from "../../context/AuthContext";
import { canWrite, FORMS } from "../../lib/capabilities";
import AiAssistPanel from "./AiAssistPanel";
import { normalizeAgentSchema, type BuilderSchemaLike } from "../../lib/formAgentApi";
import {
  checkIn,
  checkout,
  getAudit,
  getForm,
  latestVersion,
  publishVersion,
  release,
  restoreVersion,
  saveDraft,
  signOffTest,
  updateMeta,
  type AuditEvent,
  type FormStatus,
  type StoredForm,
} from "../../lib/formsApi";
import { lukeAttributeEditors } from "./lukeAttributeEditors";
import { Modal } from "../../components/ui/modal";
import { FlaskConical, BadgeCheck, CodeXml, ArrowUp } from "lucide-react";
import FormTestPanel from "./FormTestPanel";
import FormEmbedPanel from "./FormEmbedPanel";
import { guardedLeave } from "../../lib/leaveGuard";
import { useMutationLock } from "../../hooks/useMutationLock";
import { PencilIcon } from "../../icons";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import Tooltip from "../../components/ui/tooltip/Tooltip";
import LifecycleActions, { type LifecycleState } from "./LifecycleActions";
import PageMeta from "../../components/common/PageMeta";

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

export default function FormBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;
  const canEdit = canWrite(session, FORMS);
  const me = session?.userId ?? null;

  const [form, setForm] = useState<StoredForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState<null | "checkin" | "publish" | "undo">(null);
  const [status, setStatus] = useState<FormStatus>("draft");
  const [version, setVersion] = useState(0);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  // Has the draft changed since checkout / the last check-in? Drives Check-in + Undo-checkout.
  const [dirtySinceCheckIn, setDirtySinceCheckIn] = useState(false);
  // Editing session: the builder is VIEW-ONLY until you check out. New forms (no version yet)
  // open straight into edit mode (there's nothing to view); existing ones open view-only.
  const [checkedOut, setCheckedOut] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  // Live schema mirrored to the AI panel (which reads it to build/modify the form).
  const [liveSchema, setLiveSchema] = useState<BuilderSchemaLike | null>(null);
  // "Test the form" (positive/negative validation runs + sign-off).
  const [testOpen, setTestOpen] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<number | null>(null);
  // Whether the LATEST checked-in version is signed off ⟺ Publish is allowed. A plain check-in
  // creates an unsigned version (clears this); "Check in & sign off" sets it.
  const [latestSignedOff, setLatestSignedOff] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  // Advisory edit-lock: who (other than me) currently holds it, for the "being edited" banner.
  const [lockedByOther, setLockedByOther] = useState<string | null>(null);
  // Form settings modal (name / description / submission message + activity feed).
  const [formSettingsOpen, setFormSettingsOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  // Latest schema reported by the (uncontrolled) builder; the lifecycle reads it.
  const latestRef = useRef<FormSchema | null>(null);
  const submitMsgRef = useRef("");
  const saveTimer = useRef<number | null>(null);
  const unsaved = useRef(false);
  // Imperative handle: lets the AI apply a new schema WITHOUT remounting the builder,
  // so the AI panel + its chat history (the `aside`) stay mounted across applies.
  const builderRef = useRef<FormBuilderHandle>(null);
  const heldLock = useRef(false); // true once our checkout succeeds — guards a late load from re-showing the banner

  // Mutual exclusion for lifecycle actions (check-in / publish / discard) so rapid clicks
  // or check-in→publish can't interleave on stale version state.
  const { locked: mutating, runExclusive } = useMutationLock();

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
        setPublishedVersion(f.publishedVersion ?? null);
        setLastTestedAt(f.lastTestedAt ?? null);
        setLatestSignedOff(f.latestVersionSignedOff);
        // Checkout baseline: opening the form is not itself a change. Check-in / Undo-checkout
        // light up only once the user actually edits (onChange), and reset on check-in / reload.
        setDirtySinceCheckIn(false);
        // A brand-new form (no versions) has nothing to view → open editable; otherwise view-only.
        setCheckedOut(canEdit && latestVersion(f) < 1);
        const sm = readSubmitMessage(f.schema);
        setSubmitMessage(sm);
        submitMsgRef.current = sm;
        latestRef.current = null;
        setLiveSchema(parseSchema(f.schema) as unknown as BuilderSchemaLike);
        // Show the "being edited" banner only if someone else holds the lock AND we haven't taken it.
        if (!heldLock.current) setLockedByOther(f.lockedBy && f.lockedBy !== me ? f.lockedBy : null);
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
  }, [tenant, id, reloadKey, navigate, me, canEdit]);

  // Acquire the advisory edit lock on open and release it on leave — the backend
  // gates draft saves on the lock, so without this every autosave returns "Save failed".
  // A 409 (someone else holds it) is tolerated: editing still works, the save may fail
  // until taken over, matching the classic designer's behavior.
  useEffect(() => {
    if (!tenant || !id || !canEdit) return;
    let active = true;
    checkout(tenant, id)
      .then(() => { if (active) { heldLock.current = true; setLockedByOther(null); } }) // we hold it now
      .catch(() => {}); // 409 → another holder; the banner (set from the loaded form) stays
    return () => {
      active = false;
      heldLock.current = false;
      void release(tenant, id);
    };
  }, [tenant, id, canEdit]);

  // Force-acquire the lock from the current holder, clearing the banner.
  const takeOver = async () => {
    if (!tenant || !id) return;
    await checkout(tenant, id, true);
    heldLock.current = true;
    setLockedByOther(null);
  };

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
    async (schema: FormSchema): Promise<boolean> => {
      if (!tenant || !id) return false;
      try {
        await saveDraft(tenant, id, toJson(schema));
        unsaved.current = false;
        setSaved(true);
        setSaveError(false);
        return true;
      } catch {
        setSaved(false);
        setSaveError(true);
        return false;
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
      // The working draft now differs from the latest checked-in version, so Check-in has
      // something to do again, and the signed-off version no longer matches the draft — Publish
      // must re-gate (sign off the CURRENT work before it can go live).
      setDirtySinceCheckIn(true);
      setLatestSignedOff(false);
      if (!canEdit) return; // view-only: never persist edits.
      scheduleSave(schema);
    },
    [canEdit, scheduleSave],
  );

  // Apply an AI-generated schema: normalize keys to camelCase (the agent emits snake_case
  // without our uniqueness guards), push it into the builder via the imperative handle
  // (no remount → the AI chat survives), and let onChange persist it.
  const applyAiSchema = useCallback((schema: BuilderSchemaLike) => {
    // Bridge the agent's coltorapps schema → form-core (stamp entity ids, camelCase keys) so the
    // builder actually renders it. setSchema fires onChange → mirrors liveSchema + autosaves.
    builderRef.current?.setSchema(normalizeAgentSchema(schema) as unknown as FormSchema);
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

  // Flush a pending autosave on demand, surfacing failures (returns success).
  const flushSave = (): Promise<boolean> => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    return persist(latestRef.current ?? initialSchema);
  };

  // Leaving in-app during the autosave debounce must not drop edits: flush first and
  // only navigate if the save succeeds; on failure stay put (the indicator shows the error).
  const leaveDesigner = async (to: string) => {
    const safe = await guardedLeave(canEdit && unsaved.current, flushSave);
    if (safe) navigate(to);
  };

  // Check-in is a SNAPSHOT — allowed even with validation errors / work-in-progress. It never
  // publishes (publish is a separate, sign-off-gated step) and the new version starts unsigned.
  const onCheckIn = () => runExclusive(async () => {
    if (!tenant || !id || !dirtySinceCheckIn) return; // nothing to check in if the draft is unchanged
    setBusy("checkin");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    try {
      const art = await checkIn(tenant, id, currentJson());
      setVersion(art.version);
      setDirtySinceCheckIn(false); // draft now equals the new version
      setLatestSignedOff(false); // a plain check-in is unsigned until it's tested + signed off
      setSaved(true);
      setSaveError(false);
    } catch (e) {
      console.error("Check-in failed", e);
      setSaveError(true);
    } finally {
      setBusy(null);
    }
  });

  // Publish promotes the latest version live — gated on it being signed off (the server enforces
  // this too). The mutex guarantees a check-in (which sets `version`) resolves first.
  const onPublish = () => runExclusive(async () => {
    if (!tenant || !id || version < 1 || !latestSignedOff || publishedVersion === version) return; // signed-off + not already live
    setBusy("publish");
    try {
      await publishVersion(tenant, id, version);
      setStatus("published");
      setPublishedVersion(version);
      setSaveError(false);
    } catch (e) {
      console.error("Publish failed", e);
      setSaveError(true);
    } finally {
      setBusy(null);
    }
  });

  // "Check in & sign off" from the Test panel: snapshot the current draft as the latest version,
  // then sign THAT version off — so what was tested is exactly what becomes publishable. Throws on
  // failure so the panel surfaces it.
  const checkInAndSignOff = async (): Promise<void> => {
    if (!tenant || !id) throw new Error("Form not loaded");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const art = await checkIn(tenant, id, currentJson());
    setVersion(art.version);
    setDirtySinceCheckIn(false); // draft now equals the just-signed-off version
    const updated = await signOffTest(tenant, id);
    setLatestSignedOff(true);
    setLastTestedAt(updated.lastTestedAt ?? Date.now());
    setSaved(true);
  };

  // Checkout: enter an editing session. The builder becomes editable and the current latest
  // version is the point Undo-checkout rolls back to.
  const onCheckout = () => setCheckedOut(true);

  // Undo checkout: leave the editing session. With unsaved edits, revert the draft to the last
  // checked-in version (the reload re-syncs version/sign-off + drops back to view-only); with no
  // edits, just exit to view-only.
  const onUndoCheckout = () => {
    if (!checkedOut) return;
    if (!dirtySinceCheckIn || version < 1) {
      // No changes to revert — just leave edit mode. Reload to remount the builder (clearing its
      // undo history so a stray ⌘Z can't mutate a view-only form) and drop back to view-only.
      setCheckedOut(false);
      setReloadKey((k) => k + 1);
      return;
    }
    void runExclusive(async () => {
      if (!tenant || !id) return;
      if (!window.confirm(`Undo your changes and revert to the last checked-in version (v${version})?`)) return;
      setBusy("undo");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      try {
        await restoreVersion(tenant, id, version);
        unsaved.current = false;
        setCheckedOut(false);
        setReloadKey((k) => k + 1);
      } catch (e) {
        console.error("Undo checkout failed", e);
        setSaveError(true);
      } finally {
        setBusy(null);
      }
    });
  };

  const onSubmitMessage = (v: string) => {
    setSubmitMessage(v);
    submitMsgRef.current = v;
    if (!canEdit) return;
    // The submit message is part of the persisted schema, so changing it dirties the draft
    // (re-enables Check-in) and re-gates sign-off, same as any field edit.
    setDirtySinceCheckIn(true);
    setLatestSignedOff(false);
    scheduleSave(latestRef.current ?? initialSchema);
  };

  // Load the activity feed when the settings modal opens. The inputs are seeded by the
  // name button's onClick (NOT here) so a re-render mid-edit can't clobber what's typed.
  useEffect(() => {
    if (!formSettingsOpen || !tenant || !id) return;
    let active = true;
    getAudit(tenant, id)
      .then((a) => active && setAuditEvents(a))
      .catch(() => active && setAuditEvents([]));
    return () => { active = false; };
  }, [formSettingsOpen, tenant, id]);

  // Persist name + description (form metadata, not schema). The submission message lives in the
  // schema and autosaves separately via onSubmitMessage; updateMeta only touches name/description.
  const saveFormSettings = async () => {
    if (!tenant || !id) return;
    const name = formName.trim() || form?.name || "";
    setFormName(name);
    await updateMeta(tenant, id, { name, description: formDesc });
    setForm((f) => (f ? { ...f, name, description: formDesc } : f));
    setFormSettingsOpen(false);
  };

  // Floating "scroll to top" for the whole-page-scroll layout — shows past a threshold.
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const editors = useMemo(() => lukeAttributeEditors, []);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading form…</div>;
  }
  if (!tenant || !id || !form) return null;

  const saveLabel = saveError ? "Save failed" : saved ? "Saved" : "Saving…";

  // Shared by the top bar and the LukeBuilds panel so both render the same gated trio.
  const editable = canEdit && checkedOut;
  const lifecycleState: LifecycleState = {
    busy, mutating, checkedOut, dirty: dirtySinceCheckIn, version, signedOff: latestSignedOff, publishedVersion,
  };

  return (
    <div className="space-y-4">
      <PageMeta title={`${form.name} | Lukeflow`} description="Design your form in Lukeflow." />
      {canEdit && lockedByOther && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400">
          <span>
            This form is being edited by <span className="font-medium">{lockedByOther.replace(/^workos:/, "")}</span>. Your changes may overwrite theirs.
          </span>
          <button
            type="button"
            onClick={() => void takeOver()}
            className="shrink-0 rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            Take over
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void leaveDesigner("/forms")}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          ← Forms
        </button>
        <button
          type="button"
          onClick={() => { setFormName(form.name); setFormDesc(form.description ?? ""); setFormSettingsOpen(true); }}
          title="Form settings"
          className="group flex min-w-0 items-center gap-1.5 text-lg font-semibold text-gray-800 dark:text-white/90"
        >
          <span className="truncate">{form.name}</span>
          <PencilIcon className="size-3.5 shrink-0 text-gray-300 transition group-hover:text-gray-500" />
        </button>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>{status}</span>
        <span className="text-xs text-gray-400">v{version}</span>
        {latestSignedOff && (
          <span
            title={lastTestedAt ? `Signed off ${new Date(lastTestedAt).toLocaleString()}` : "Latest version is signed off"}
            className="inline-flex items-center gap-1 text-xs text-success-600 dark:text-success-400"
          >
            <BadgeCheck className="size-3.5" />Signed off
          </span>
        )}
        <span className={`text-xs ${saveError ? "text-error-500" : "text-gray-400"}`}>{canEdit ? saveLabel : "View only"}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Test is available to view-only users too (read access can validate). */}
          <Tooltip content="Auto-fill the form with sample data, validate it, and sign off.">
            <button
              type="button"
              onClick={() => setTestOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <FlaskConical className="size-4" />Test
            </button>
          </Tooltip>
          {canEdit && (
            <>
              {blocking.length > 0 && (
                <Tooltip content="A form with errors can't be signed off or published. Fix these — see the Problems list in the builder below. (You can still check it in as a work-in-progress snapshot.)">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-error-50 px-2.5 py-1.5 text-xs font-medium text-error-600 dark:bg-error-500/10 dark:text-error-400">
                    <span aria-hidden>⊘</span>{blocking.length} error{blocking.length > 1 ? "s" : ""}
                  </span>
                </Tooltip>
              )}
              <LifecycleActions
                state={lifecycleState}
                onCheckout={onCheckout}
                onUndoCheckout={onUndoCheckout}
                onCheckIn={onCheckIn}
                onPublish={onPublish}
              />
              <Tooltip content={publishedVersion != null
                ? `Embed the published version (v${publishedVersion}) — get an iframe snippet for any website.`
                : "Publish a version first — the embed always serves the published version."}>
                <button
                  type="button"
                  onClick={() => setEmbedOpen(true)}
                  disabled={publishedVersion == null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  <CodeXml className="size-4" />Embed
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* View-only notice: an editor hasn't checked the form out yet (the Checkout button is above). */}
      {canEdit && !checkedOut && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
          🔒 View-only — you're looking at v{version}. Use <span className="font-medium">Checkout</span> above to edit it.
        </div>
      )}

      {/* The builder is non-interactive (inert) until checked out — true view-only, not just visual. */}
      <div inert={!editable || undefined} className={editable ? "" : "opacity-75 transition-opacity"}>
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
                lifecycleActions={
                  <LifecycleActions
                    state={lifecycleState}
                    onCheckout={onCheckout}
                    onUndoCheckout={onUndoCheckout}
                    onCheckIn={onCheckIn}
                    onPublish={onPublish}
                  />
                }
              />
            ) : undefined
          }
        />
      </div>

      <FormTestPanel
        open={testOpen}
        onClose={() => setTestOpen(false)}
        tenant={tenant}
        formName={form.name}
        canEdit={canEdit}
        getJson={currentJson}
        onApplyAiSchema={applyAiSchema}
        onSignOff={checkInAndSignOff}
      />

      {/* Keyed by formId so navigating to another form's builder mints a fresh token. */}
      <FormEmbedPanel key={id} open={embedOpen} onClose={() => setEmbedOpen(false)} tenant={tenant} formId={id} publishedVersion={publishedVersion} />

      <Modal isOpen={formSettingsOpen} onClose={() => setFormSettingsOpen(false)} className="mx-4 w-full max-w-[480px]">
        <div className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Form settings</h2>
          <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5">
            <span className="text-xs text-gray-400">Form ID</span>
            <p className="font-mono text-sm font-medium text-gray-700 dark:text-gray-200">{form.code}</p>
          </div>
          {(form.createdByName || form.updatedByName) && (
            <p className="mb-4 text-xs text-gray-400">
              {form.createdByName && <>Created by <span className="text-gray-600 dark:text-gray-300">{form.createdByName}</span></>}
              {form.updatedByName && <>{form.createdByName ? " · " : ""}last edited by <span className="text-gray-600 dark:text-gray-300">{form.updatedByName}</span></>}
            </p>
          )}
          <div className="mb-4">
            <Label>Form name</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="mb-4">
            <Label>Description</Label>
            <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Optional" disabled={!canEdit} />
          </div>
          <div className="mb-6">
            <Label>Submission message</Label>
            <textarea
              value={submitMessage}
              onChange={(e) => onSubmitMessage(e.target.value)}
              disabled={!canEdit}
              rows={3}
              placeholder="Thank you! Your response has been recorded."
              className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:opacity-60 dark:border-gray-700 dark:text-white/90"
            />
            <p className="mt-1 text-xs text-gray-400">Shown with a success animation after the form is submitted. Leave blank for the default.</p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setFormSettingsOpen(false)}>{canEdit ? "Cancel" : "Close"}</Button>
            {canEdit && <Button onClick={saveFormSettings} disabled={!formName.trim()}>Save</Button>}
          </div>

          {auditEvents.length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Activity</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {auditEvents.map((ev, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span><span className="font-medium text-gray-700 dark:text-gray-300">{ev.action.replace(/_/g, " ")}</span>{ev.detail ? ` ${ev.detail}` : ""}{ev.actorName ? ` · ${ev.actorName}` : ""}</span>
                    <span className="text-gray-400">{new Date(ev.at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
          className="fixed bottom-6 right-6 z-40 flex size-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-theme-lg transition hover:-translate-y-0.5 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          <ArrowUp className="size-5" />
        </button>
      )}
    </div>
  );
}
