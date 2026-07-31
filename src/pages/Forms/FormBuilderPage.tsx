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
import BuilderMobileNotice from "../../components/common/BuilderMobileNotice";
import "@lukeflow/form-react/styles.css";
import "@lukeflow/form-builder/styles.css";
import "../../styles/lukeforms-theme.css"; // token bridge — MUST load after the package CSS
import { readSubmitMessage, validateSchema, type FormSchema } from "@lukeflow/form-core";
import {
  CONSENT_DEFAULT_TEXT,
  readAttachmentsEnabled,
  readFont,
  readSaveSubmissionAsPdf,
  readSettings,
} from "../../lib/formSchema";
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
import { FlaskConical, CodeXml, ArrowUp, Eye, ArrowLeft, ExternalLink, Send, Users, Settings } from "lucide-react";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import SubmissionSuccess from "../../components/formBuilder/SubmissionSuccess";
import FormTestPanel from "./FormTestPanel";
import FormEmbedPanel from "./FormEmbedPanel";
import FormSendPanel from "./FormSendPanel";
import FormRolesPanel from "./FormRolesPanel";
import FormSettingsModal from "./FormSettingsModal";
import { guardedLeave } from "../../lib/leaveGuard";
import { useMutationLock } from "../../hooks/useMutationLock";
import Button from "../../components/ui/button/Button";
import Tooltip from "../../components/ui/tooltip/Tooltip";
import FormStatusPopover from "./FormStatusPopover";
import LifecycleActions from "./LifecycleActions";
import { lifecycleGate, TOOLBAR_BTN_ICON, TOOLBAR_BTN_NEUTRAL, type LifecycleState } from "./lifecycle";
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
  // Preview (read-only fill) — available even in view-only; opens from the top bar.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSchema, setPreviewSchema] = useState("");
  // Whether the preview form has been submitted — drives the success screen so the configured
  // submission message is verifiable in the designer (the bare renderer doesn't show it).
  const [previewDone, setPreviewDone] = useState(false);
  // Preview modal: render the live Form, or its raw schema JSON (the builder package's own preview
  // had this view + an "Open in new tab"; we restore both here since we run our own Preview modal).
  const [previewView, setPreviewView] = useState<"form" | "json">("form");
  const [jsonCopied, setJsonCopied] = useState(false);
  // "Test the form" (positive/negative validation runs + sign-off).
  const [testOpen, setTestOpen] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<number | null>(null);
  // Whether the LATEST checked-in version is signed off ⟺ Publish is allowed. A plain check-in
  // creates an unsigned version (clears this); "Check in & sign off" sets it.
  const [latestSignedOff, setLatestSignedOff] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const isOutbound = form?.kind === "OUTBOUND";
  // Advisory edit-lock: who (other than me) currently holds it, for the "being edited" banner.
  const [lockedByOther, setLockedByOther] = useState<string | null>(null);
  // Form settings modal (name / description / submission message + activity feed).
  const [formSettingsOpen, setFormSettingsOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  // Opt-in file attachments: when on, the embedded form offers an Attachments tab to the filler.
  // Stored in the schema settings (versioned), so the published embed knows whether to show it.
  const [allowAttachments, setAllowAttachments] = useState(false);
  // Opt-in: render each completed submission to a PDF and attach it to the process instance
  // (visible in the Form Inbox + Core UI Tasklist). Versioned in the schema settings.
  const [saveSubmissionPdf, setSaveSubmissionPdf] = useState(false);
  // The form's typeface. Lives in the VERSIONED schema settings (like attachments), so the published
  // form carries the font its author approved and a change re-gates sign-off/publish.
  const [font, setFont] = useState<string>("");
  // The agreement a filler must accept before their submission counts. Versioned schema settings, like
  // the font — so the wording is pinned to the version someone was shown, which is exactly what makes it
  // usable as evidence. core-engine reads the SAME setting off the served version and refuses a
  // submission that arrives without agreement, so this is a contract and not a UI preference.
  const [consentEnabled, setConsentEnabled] = useState(false);
  const [consentText, setConsentText] = useState("");
  // "Developed at Lukeflow" attribution on the public embed / respond surfaces. Form METADATA (not
  // versioned schema), so it saves with name/description and takes effect on the live form with no
  // re-publish. Free plans can't turn it off — the server enforces that too.
  const [showBranding, setShowBranding] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  // Latest schema reported by the (uncontrolled) builder; the lifecycle reads it.
  const latestRef = useRef<FormSchema | null>(null);
  const submitMsgRef = useRef("");
  const allowAttachmentsRef = useRef(false);
  const saveSubmissionPdfRef = useRef(false);
  const fontRef = useRef("");
  const consentEnabledRef = useRef(false);
  const consentTextRef = useRef("");
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
        const att = readAttachmentsEnabled(f.schema);
        setAllowAttachments(att);
        allowAttachmentsRef.current = att;
        const sap = readSaveSubmissionAsPdf(f.schema);
        setSaveSubmissionPdf(sap);
        saveSubmissionPdfRef.current = sap;
        const fnt = readFont(f.schema);
        setFont(fnt);
        fontRef.current = fnt;
        // Read the RAW stored statement, not readConsent's blank→default substitution: the builder must
        // show what is actually saved, or an author would see wording they never wrote and assume it is.
        const stored = readSettings(f.schema).consent;
        const cOn = stored?.enabled === true;
        const cText = typeof stored?.text === "string" ? stored.text : "";
        setConsentEnabled(cOn);
        consentEnabledRef.current = cOn;
        setConsentText(cText);
        consentTextRef.current = cText;
        setShowBranding(f.showBranding);
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
      JSON.stringify({
        ...schema,
        settings: {
          ...(schema.settings ?? {}),
          submitMessage: submitMsgRef.current,
          attachments: allowAttachmentsRef.current,
          saveSubmissionAsPdf: saveSubmissionPdfRef.current,
          font: fontRef.current,
          // Written UNCONDITIONALLY. Omitting it when consent is off would let the spread above carry a
          // previously-saved `consent` forward, so switching the requirement off would appear to work in
          // the builder while the published form kept demanding agreement.
          consent: { enabled: consentEnabledRef.current, text: consentTextRef.current },
        },
      }),
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

  // Preview snapshots the current schema into a read-only renderer (works in view-only too).
  const openPreview = () => {
    setPreviewSchema(currentJson());
    setPreviewDone(false);
    setPreviewView("form");
    setJsonCopied(false);
    setPreviewOpen(true);
  };

  // Pretty-printed schema for the JSON view (falls back to the raw string if it won't parse).
  const prettyPreviewJson = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(previewSchema), null, 2);
    } catch {
      return previewSchema;
    }
  }, [previewSchema]);

  const copyPreviewJson = async () => {
    try {
      await navigator.clipboard.writeText(prettyPreviewJson);
      setJsonCopied(true);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  // Open the current working schema full-page in a new tab. We hand it off via localStorage (too big
  // for a URL) and the standalone /forms/:id/preview route renders it — faithful to the unsaved draft,
  // no publish required.
  const openPreviewInNewTab = () => {
    if (!id) return;
    try {
      localStorage.setItem(`lukeform:preview:${id}`, JSON.stringify({ schema: previewSchema, title: form?.name ?? "Form" }));
    } catch {
      /* storage blocked — the new tab will show the "expired" notice */
    }
    window.open(`/forms/${id}/preview`, "_blank", "noopener,noreferrer");
  };

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
      // Publishing finalizes the version — leave the editing session so the builder + Form settings
      // drop to view-only, exactly as a page refresh would show (an existing/published form opens
      // view-only). Without this the post-publish state stayed editable until a reload, which looked
      // inconsistent. Check out again to start the next version.
      setCheckedOut(false);
      setDirtySinceCheckIn(false);
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

  // Toggle opt-in attachments. Lives in the schema settings (versioned), so flipping it dirties the
  // draft and re-gates sign-off/publish exactly like a field or submit-message edit.
  const onToggleAttachments = (on: boolean) => {
    setAllowAttachments(on);
    allowAttachmentsRef.current = on;
    if (!canEdit) return;
    setDirtySinceCheckIn(true);
    setLatestSignedOff(false);
    scheduleSave(latestRef.current ?? initialSchema);
  };

  // Toggle "save submission as PDF". Like attachments, it lives in the versioned schema settings, so
  // flipping it dirties the draft and re-gates sign-off/publish.
  const onToggleSaveSubmissionPdf = (on: boolean) => {
    setSaveSubmissionPdf(on);
    saveSubmissionPdfRef.current = on;
    if (!canEdit) return;
    setDirtySinceCheckIn(true);
    setLatestSignedOff(false);
    scheduleSave(latestRef.current ?? initialSchema);
  };

  // Pick the form's typeface. Schema-settings like attachments: flipping it dirties the draft and
  // re-gates sign-off/publish, and autosaves immediately so the builder preview re-renders in the font.
  const onFontChange = (id: string) => {
    setFont(id);
    fontRef.current = id;
    if (!canEdit) return;
    setDirtySinceCheckIn(true);
    setLatestSignedOff(false);
    scheduleSave(latestRef.current ?? initialSchema);
  };

  // Require (or stop requiring) an agreement. Versioned schema settings: dirties the draft and re-gates
  // sign-off/publish, so a change to what people are asked to accept cannot reach a live form without
  // going back through sign-off — which is the point.
  const onToggleConsent = (on: boolean) => {
    setConsentEnabled(on);
    consentEnabledRef.current = on;
    // Seed the statement so "on" can never mean "on, with nothing to agree to". The server substitutes
    // the same default, but an author should see the words, not discover them later on a live form.
    if (on && !consentTextRef.current.trim()) {
      setConsentText(CONSENT_DEFAULT_TEXT);
      consentTextRef.current = CONSENT_DEFAULT_TEXT;
    }
    if (!canEdit) return;
    setDirtySinceCheckIn(true);
    setLatestSignedOff(false);
    scheduleSave(latestRef.current ?? initialSchema);
  };

  const onConsentText = (v: string) => {
    setConsentText(v);
    consentTextRef.current = v;
    if (!canEdit) return;
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

  // Open the settings dialog, seeding the metadata inputs HERE (not in an effect) so a re-render
  // mid-edit can't clobber what's being typed.
  const openSettings = () => {
    if (!form) return;
    setFormName(form.name);
    setFormDesc(form.description ?? "");
    setShowBranding(form.showBranding);
    setSettingsError(null);
    setFormSettingsOpen(true);
  };

  // Persist name + description (form metadata, not schema). The submission message lives in the
  // schema and autosaves separately via onSubmitMessage; updateMeta only touches name/description.
  const saveFormSettings = async () => {
    if (!tenant || !id) return;
    const name = formName.trim() || form?.name || "";
    const changed = name !== form?.name || (formDesc || "") !== (form?.description || "");
    setFormName(name);
    setSettingsError(null);
    // The badge is metadata like name/description, so it rides the same PATCH. Only send it when it
    // actually changed: an unchanged value from a locked (free-plan) form must not trip the paid gate.
    const brandingChanged = showBranding !== form?.showBranding;
    try {
      await updateMeta(tenant, id, {
        name,
        description: formDesc,
        ...(brandingChanged ? { showBranding } : {}),
      });
    } catch (e) {
      // Most likely the plan no longer allows hiding the badge (402) — keep the modal open, tell them
      // why, and snap the checkbox back to what the server still has.
      setSettingsError((e as Error).message || "Couldn't save these settings.");
      setShowBranding(form?.showBranding ?? true);
      return;
    }
    setForm((f) => (f ? { ...f, name, description: formDesc, showBranding } : f));
    // Form metadata is part of the form's published identity, so a name/description change must go
    // through the lifecycle like any edit: it dirties the draft (Check-in lights up) and invalidates
    // the signed-off version, so Publish re-gates until the new state is signed off and published.
    if (changed && canEdit && checkedOut) {
      setDirtySinceCheckIn(true);
      setLatestSignedOff(false);
    }
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

  // Shared by the top-bar buttons and the LukeBuilds chat so both gate identically.
  const editable = canEdit && checkedOut;
  const lifecycleState: LifecycleState = {
    busy, mutating, checkedOut, dirty: dirtySinceCheckIn, version, signedOff: latestSignedOff, publishedVersion,
  };

  // Run a lifecycle action the user asked for conversationally in LukeBuilds. Gated by the SAME
  // rules as the buttons; returns a message to show in chat when it isn't currently allowed.
  const runLifecycle = (action: "checkin" | "publish" | "undo_checkout"): { ok: boolean; message: string } => {
    const gate = lifecycleGate(lifecycleState);
    const g = action === "checkin" ? gate.checkin : action === "publish" ? gate.publish : gate.undo;
    if (!g.ok) return { ok: false, message: g.reason };
    if (action === "checkin") onCheckIn();
    else if (action === "publish") onPublish();
    else onUndoCheckout();
    return { ok: true, message: "" };
  };

  return (
    // overflow-x-clip: the top-bar button tooltips (TailAdmin: position:absolute, left-1/2,
    // always in the DOM) stick ~50px past the viewport on the right-edge buttons, which made the
    // whole PAGE horizontally scrollable. On macOS that overflow is invisible at rest (overlay
    // scrollbars) but native drag-and-drop edge auto-scroll latched onto it and slid the page
    // sideways mid-drag, clipping the palette. `clip` (not `hidden`) contains that overflow
    // without becoming a scroll container, so the page can't scroll/auto-scroll — and the sticky
    // palette/AI-panel still pin to the viewport (verified). Vertical flow is unaffected.
    <div className="space-y-4 overflow-x-clip">
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
          className={TOOLBAR_BTN_NEUTRAL}
        >
          <ArrowLeft className="size-4" />Forms
        </button>
        {/* The name is a heading, not a control. It used to be a button with a pencil, which read as
            "rename" while actually opening every setting the form has — the gear says that plainly. */}
        <h1 className="min-w-0 truncate text-lg font-semibold text-gray-800 dark:text-white/90">{form.name}</h1>
        <Tooltip content="Form settings — name, submission, legal, appearance and activity.">
          <button
            type="button"
            onClick={openSettings}
            aria-label="Form settings"
            className={`${TOOLBAR_BTN_ICON} shrink-0`}
          >
            <Settings className="size-4" />
          </button>
        </Tooltip>
        {/* Everything about the form's STATE lives behind this one icon, beside the gear: published
            or not, which version, sign-off, save state, and the view-only message with its way out.
            The glyph and colour still say which of those three states you're in without a click. */}
        <FormStatusPopover
          info={{
            status,
            version,
            publishedVersion,
            signedOff: latestSignedOff,
            lastTestedAt,
            canEdit,
            checkedOut,
            saveLabel,
            saveError: !!saveError,
          }}
          onCheckout={onCheckout}
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Preview + Test are available to view-only users too (read access can validate). */}
          <Tooltip content="Preview the form — fill it to test conditions, calculations and validation.">
            <button type="button" onClick={openPreview} className={TOOLBAR_BTN_NEUTRAL}>
              <Eye className="size-4" />Preview
            </button>
          </Tooltip>
          <Tooltip content="Auto-fill the form with sample data, validate it, and sign off.">
            <button type="button" onClick={() => setTestOpen(true)} className={TOOLBAR_BTN_NEUTRAL}>
              <FlaskConical className="size-4" />Test
            </button>
          </Tooltip>
          {canEdit && (
            <>
              {blocking.length > 0 && (
                <Tooltip content="A form with errors can't be signed off or published. Fix these — see the Problems list in the builder below. (You can still check it in as a work-in-progress snapshot.)">
                  <span className="inline-flex h-9 items-center gap-1 rounded-lg bg-error-50 px-2.5 text-xs font-medium text-error-600 dark:bg-error-500/10 dark:text-error-400">
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
              {isOutbound ? (
                <>
                  {/* Roles are a design-time decision about the form, so this sits with the other
                      authoring actions — and unlike Send it needs no published version, since you
                      decide who fills what while you're still building. */}
                  <Tooltip content="Choose which fields you fill before sending, and which the recipient fills.">
                    <button type="button" onClick={() => setRolesOpen(true)} className={TOOLBAR_BTN_NEUTRAL}>
                      <Users className="size-4" />Who fills
                    </button>
                  </Tooltip>
                  <Tooltip content={publishedVersion != null
                    ? "Send a prefilled copy to a recipient by email."
                    : "Publish a version first — you send the published version."}>
                    <button type="button" onClick={() => setSendOpen(true)} disabled={publishedVersion == null} className={TOOLBAR_BTN_NEUTRAL}>
                      <Send className="size-4" />Send
                    </button>
                  </Tooltip>
                </>
              ) : (
                <Tooltip content={publishedVersion != null
                  ? `Embed the published version (v${publishedVersion}) — get an iframe snippet for any website.`
                  : "Publish a version first — the embed always serves the published version."}>
                  <button type="button" onClick={() => setEmbedOpen(true)} disabled={publishedVersion == null} className={TOOLBAR_BTN_NEUTRAL}>
                    <CodeXml className="size-4" />Embed
                  </button>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      <BuilderMobileNotice label="form builder" />
      {/* The builder is non-interactive (inert) until checked out — true view-only, not just visual. */}
      <div
        inert={!editable || undefined}
        className={editable ? "hidden sm:block" : "hidden opacity-75 transition-opacity sm:block"}
      >
        <FormBuilder
          key={`${form.id}-${reloadKey}`}
          ref={builderRef}
          initialSchema={initialSchema}
          onChange={handleChange}
          attributeEditors={editors}
          settings="modal"
          hidePreview /* Preview lives in the top bar (works in view-only too) */
          formName={form.name} /* file stem for the Data view's "Generate template" download */
          aside={
            canEdit ? (
              <AiAssistPanel
                tenant={tenant}
                formId={id}
                formName={form.name}
                kind={form.kind}
                schema={liveSchema}
                onApplied={applyAiSchema}
                onRunLifecycle={runLifecycle}
              />
            ) : undefined
          }
        />
      </div>

      {/* Read-only live preview of the current form (top-bar Preview). Submitting shows the configured
          submission message, exactly as a real filler would see it after submit. */}
      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} className="mx-4 max-h-[90vh] w-full max-w-[640px] overflow-y-auto">
        <div className="p-6 sm:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 pr-8">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Preview — {form.name}</h2>
            <div className="flex items-center gap-2">
              {/* Form ⇄ JSON view toggle. */}
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
                {(["form", "json"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPreviewView(v)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                      previewView === v
                        ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <Tooltip content="Open this preview full-page in a new browser tab.">
                <button type="button" onClick={openPreviewInNewTab} className={TOOLBAR_BTN_NEUTRAL}>
                  <ExternalLink className="size-4" />New tab
                </button>
              </Tooltip>
            </div>
          </div>

          {previewView === "json" ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">The form's raw schema JSON.</p>
                <Button size="sm" variant="outline" onClick={copyPreviewJson}>{jsonCopied ? "Copied ✓" : "Copy JSON"}</Button>
              </div>
              <pre className="max-h-[64vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
                {prettyPreviewJson}
              </pre>
            </div>
          ) : previewDone ? (
            <>
              <SubmissionSuccess message={readSubmitMessage(previewSchema)} />
              <div className="text-center">
                <Button size="sm" variant="outline" onClick={() => setPreviewDone(false)}>Fill again</Button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Fill it out to test conditions, calculated values and validation.</p>
              <FormRenderer schema={previewSchema} onSubmit={() => setPreviewDone(true)} />
            </>
          )}
        </div>
      </Modal>

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
      <FormEmbedPanel
        key={id}
        open={embedOpen}
        onClose={() => setEmbedOpen(false)}
        tenant={tenant}
        formId={id}
        publishedVersion={publishedVersion}
        submissionHandling={form?.submissionHandling}
        onSubmissionHandled={() => setForm((prev) => (prev ? { ...prev, submissionHandling: "COLLECT" } : prev))}
      />
      {form ? (
        <>
          <FormSendPanel
            open={sendOpen}
            onClose={() => setSendOpen(false)}
            tenant={tenant}
            formId={id}
            code={form.code}
            outboundRoles={form.outboundRoles}
          />
          <FormRolesPanel
            open={rolesOpen}
            onClose={() => setRolesOpen(false)}
            tenant={tenant}
            form={form}
            schema={JSON.stringify(latestRef.current ?? initialSchema)}
            onSaved={(roles) => setForm((prev) => (prev ? { ...prev, outboundRoles: roles } : prev))}
          />
        </>
      ) : null}

      <FormSettingsModal
        open={formSettingsOpen}
        onClose={() => setFormSettingsOpen(false)}
        form={form}
        canEdit={canEdit}
        checkedOut={checkedOut}
        editable={editable}
        formName={formName}
        onFormName={setFormName}
        formDesc={formDesc}
        onFormDesc={setFormDesc}
        submitMessage={submitMessage}
        onSubmitMessage={onSubmitMessage}
        allowAttachments={allowAttachments}
        onToggleAttachments={onToggleAttachments}
        saveSubmissionPdf={saveSubmissionPdf}
        onToggleSaveSubmissionPdf={onToggleSaveSubmissionPdf}
        consentEnabled={consentEnabled}
        onToggleConsent={onToggleConsent}
        consentText={consentText}
        onConsentText={onConsentText}
        font={font}
        onFontChange={onFontChange}
        showBranding={showBranding}
        onShowBranding={setShowBranding}
        auditEvents={auditEvents}
        settingsError={settingsError}
        onSave={() => void saveFormSettings()}
      />

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
