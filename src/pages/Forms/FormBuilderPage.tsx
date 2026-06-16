import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { type Schema } from "@coltorapps/builder";
import {
  BuilderEntities,
  BuilderEntityAttributes,
  useBuilderStore,
  useBuilderStoreData,
} from "@coltorapps/builder-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { canWrite, FORMS } from "../../lib/capabilities";
import Tooltip from "../../components/ui/tooltip/Tooltip";
import { Modal } from "../../components/ui/modal";
import { GripVertical, ArrowUp, MonitorPlay, FlaskConical, BadgeCheck } from "lucide-react";
import { ChevronLeftIcon, CheckLineIcon, PaperPlaneIcon, TrashBinIcon, AngleUpIcon, AngleDownIcon, PencilIcon } from "../../icons";
import {
  checkIn,
  checkout,
  discardDraft,
  getAudit,
  getEmbedToken,
  getForm,
  latestVersion,
  publishVersion,
  release,
  saveDraft,
  signOffTest,
  updateMeta,
  type AuditEvent,
  type FormStatus,
  type StoredForm,
} from "../../lib/formsApi";
import { autofillSchema, negativeFillSchema, type NegativeExpectation } from "../../lib/autofill";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { formBuilder, PALETTE_GROUPS, CONTAINER_TYPES, type PaletteItem } from "../../components/formBuilder/formBuilder";
import { attributesComponents, entityComponents, BuilderEntitiesContext } from "../../components/formBuilder/components";
import FormRenderer from "../../components/formBuilder/FormRenderer";
import AiAssistPanel from "./AiAssistPanel";
import CapabilityBuildingAnimation from "./CapabilityBuildingAnimation";
import { generateSchema, generateTestData, type BuilderSchemaLike } from "../../lib/formAgentApi";
import LukeTestsMark from "../../components/branding/LukeTestsMark";
import { z } from "zod";
import {
  camelCaseKeys,
  collectKeys,
  duplicateKeyIds,
  isAutoKey,
  isKeyed,
  isValidKey,
  keyOf,
  orderedIds,
  readSettings,
  repairSchema,
  sanitizeKey,
  uniqueKey,
  validateSchema,
  type FormSchema,
} from "../../lib/formSchema";
import { analyzeExpression } from "../../lib/expression";

type BuilderSchema = Schema<typeof formBuilder>;

// Free-text expression attributes the renderer evaluates — validated for syntax
// and unknown field references at authoring time.
const EXPR_ATTRS = ["calculateValue", "customConditional", "customValidation", "customDefaultValue"] as const;

// Build a real ZodError carrying `message` — the attribute editors only render
// errors that are ZodError instances (see components.tsx `errorText`).
const makeFieldError = (message: string): z.ZodError =>
  (z.string().refine(() => false, message).safeParse("") as { error: z.ZodError }).error;

// Minimal structural view of the builder store, for the derived-error pass.
type DerivedErrorStore = {
  getSchema(): unknown;
  setEntityAttribute(entityId: string, name: string, value: unknown): void;
  setEntityAttributeError(entityId: string, name: string, error?: unknown): void;
  resetEntityAttributeError(entityId: string, name: string): void;
};

// Re-derive a field's key (camelCase of its label, made unique) when the label
// changes — but only while the key is still auto (hasn't been manually edited
// away from the label). `prevLabel` tracks the label at the last sync so we can
// tell an auto key from a manual one across keystrokes.
function syncKeyToLabel(store: DerivedErrorStore, id: string, prevLabel: Map<string, string>): void {
  const s = store.getSchema() as FormSchema;
  const e = s.entities[id];
  if (!e || !isKeyed(e)) return;
  const newLabel = typeof e.attributes.label === "string" ? e.attributes.label : "";
  const oldLabel = prevLabel.get(id) ?? newLabel;
  const currentKey = typeof e.attributes.key === "string" ? e.attributes.key : "";
  prevLabel.set(id, newLabel);
  if (!isAutoKey(currentKey, oldLabel)) return; // manual override — leave it alone
  const taken = new Set<string>();
  for (const [oid, oe] of Object.entries(s.entities)) {
    if (oid === id || !isKeyed(oe)) continue;
    const k = oe.attributes.key;
    if (typeof k === "string" && k) taken.add(k);
  }
  const newKey = uniqueKey(sanitizeKey(newLabel), taken);
  if (newKey !== currentKey) store.setEntityAttribute(id, "key", newKey);
}

// The set of identifiers an expression may legally reference: every field key
// plus the implicit `value` (the field's own value, used in custom validation).
function knownKeySet(s: FormSchema): Set<string> {
  const known = new Set<string>(["value"]);
  for (const { key } of collectKeys(s)) known.add(key);
  return known;
}

// Syntax / unknown-reference problems across all expression attributes.
function expressionProblems(s: FormSchema): Array<{ entityId: string; attr: string; message: string }> {
  const known = knownKeySet(s);
  const out: Array<{ entityId: string; attr: string; message: string }> = [];
  for (const id of orderedIds(s)) {
    const e = s.entities[id];
    if (!e) continue;
    for (const attr of EXPR_ATTRS) {
      const v = e.attributes[attr];
      const err = typeof v === "string" ? analyzeExpression(v, known) : null;
      if (err) out.push({ entityId: id, attr, message: err });
    }
  }
  return out;
}

// Recompute every field's derived errors (key format/uniqueness + expression
// syntax/references) from the live schema and push them into the builder, so
// problems surface in-place in the field editors.
function applyDerivedErrors(store: DerivedErrorStore): void {
  const s = store.getSchema() as FormSchema;
  const dupes = duplicateKeyIds(s);
  const exprErrs = new Map<string, string>();
  for (const p of expressionProblems(s)) exprErrs.set(`${p.entityId}|${p.attr}`, p.message);

  for (const id of orderedIds(s)) {
    const e = s.entities[id];
    if (!e) continue;
    if (isKeyed(e)) {
      const k = e.attributes.key;
      let msg: string | null = null;
      if (typeof k === "string" && k !== "" && !isValidKey(k)) {
        msg = "Use letters, numbers and underscores only (must start with a letter).";
      } else if (dupes.has(id)) {
        msg = `Duplicate key "${keyOf(id, e)}" — already used by another field.`;
      }
      if (msg) store.setEntityAttributeError(id, "key", makeFieldError(msg));
      else store.resetEntityAttributeError(id, "key");
    }
    for (const attr of EXPR_ATTRS) {
      if (!(attr in e.attributes)) continue;
      const m = exprErrs.get(`${id}|${attr}`);
      if (m) store.setEntityAttributeError(id, attr, makeFieldError(m));
      else store.resetEntityAttributeError(id, attr);
    }
  }
}

function parseSchema(raw: string): BuilderSchema | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.entities || !Array.isArray(parsed.root)) {
      return undefined;
    }
    // Hand the builder a structurally-sound schema — dangling refs or a cycle
    // in a stored draft would otherwise crash useBuilderStore on init.
    return repairSchema(parsed as FormSchema).schema as unknown as BuilderSchema;
  } catch {
    return undefined;
  }
}

const GripIcon = GripVertical;

function PaletteButton({ item }: { item: PaletteItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${item.type}`,
    data: { kind: "palette", item },
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      className={`flex cursor-grab items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 active:cursor-grabbing dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5 ${isDragging ? "opacity-40" : ""}`}
    >
      <GripIcon className="size-4 text-gray-300" />
      {item.label}
    </button>
  );
}

// Key generation (camelCase from label, made unique) is shared with the schema
// integrity layer via `sanitizeKey`/`uniqueKey` in lib/formSchema, so add-time
// keys, manual edits, and AI-applied schemas all agree on what a valid key is.
// Only these entity types actually define a `key` attribute — injecting `key`
// into any other type makes coltorapps throw "Unknown entity attribute".
const TYPES_WITH_KEY = new Set<string>(
  formBuilder.entities.filter((e) => e.attributes.some((a) => a.name === "key")).map((e) => e.name)
);

function SortableField({ id, isActive, onSelect, onUp, onDown, onDelete, children }: {
  id: string; isActive: boolean; onSelect: () => void; onUp: () => void; onDown: () => void; onDelete: () => void; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className={`group relative cursor-pointer rounded-xl border p-4 pl-9 transition ${
        isOver
          ? "border-brand-400 ring-2 ring-brand-300"
          : isActive
            ? "border-brand-400 ring-1 ring-brand-400"
            : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab rounded p-1 text-gray-300 hover:text-gray-500 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripIcon />
      </button>
      {children}
      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button type="button" onClick={(e) => { e.stopPropagation(); onUp(); }} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10" aria-label="Move up"><AngleUpIcon className="size-4" /></button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDown(); }} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10" aria-label="Move down"><AngleDownIcon className="size-4" /></button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-error-500 dark:hover:bg-white/10" aria-label="Delete field"><TrashBinIcon className="size-4" /></button>
      </div>
    </div>
  );
}

function Canvas({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "root" });
  return (
    <div ref={setNodeRef} className={`min-h-full space-y-3 rounded-xl transition ${isOver ? "ring-2 ring-brand-300 ring-inset" : ""}`}>
      {children}
    </div>
  );
}

// Step copy for the working overlay, per agent + task.
const BUILD_STEPS = [
  "Understanding your request…",
  "Converting it to a technical capability…",
  "Designing the fields…",
  "Tightening the bolts…",
];
const TEST_GEN_STEPS = [
  "Reading the form…",
  "Inventing realistic answers…",
  "Filling the fields…",
];
const TEST_FIX_STEPS = [
  "Reviewing the failures…",
  "Pinpointing the validation gaps…",
  "Repairing the form…",
];

// Working overlay — shown over the canvas while LukeBuilds builds, or over the
// Test modal while LukeTests generates data / fixes failures. A seamless status
// with a little worker tightening bolts, stepping through what's happening.
function AiProcessingOverlay({
  title = "Generating capability…",
  wordmark = "LukeBuilds",
  steps = BUILD_STEPS,
}: {
  title?: string;
  wordmark?: string;
  steps?: string[];
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % steps.length), 1600);
    return () => window.clearInterval(t);
  }, [steps.length]);
  return (
    <div className="absolute inset-0 z-10 rounded-2xl bg-white/80 backdrop-blur-[2px] dark:bg-gray-900/80">
      <div className="sticky top-[35vh] mx-auto flex w-fit flex-col items-center gap-2 text-center">
        <CapabilityBuildingAnimation />
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-400">{steps[i]}</p>
        <p className="mt-1 bg-gradient-to-r from-brand-500 to-purple-500 bg-clip-text text-[11px] font-bold uppercase tracking-wider text-transparent">
          {wordmark}
        </p>
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<FormStatus, string> = {
  draft: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  published: "bg-success-50 text-success-600 dark:bg-success-500/15",
  archived: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
};

function Designer({ tenant, formId, form, reload, onSchema, building, suppressFlushRef }: {
  tenant: string; formId: string; form: StoredForm; reload: () => void;
  onSchema?: (s: BuilderSchemaLike) => void; building?: boolean;
  // When set, the next unmount skips its autosave flush — the parent (AI apply)
  // has already persisted a newer schema and is remounting the builder.
  suppressFlushRef?: React.RefObject<boolean>;
}) {
  const navigate = useNavigate();
  const { session } = useAuth();
  // read → view-only: the canvas is browsable but nothing is persisted and the
  // write actions are hidden. read-write → full editing.
  const canEdit = canWrite(session, FORMS);
  const me = session?.userId ?? null;
  // Advisory edit-lock: who (if anyone other than me) currently holds it.
  const [lockedByOther, setLockedByOther] = useState<string | null>(
    form.lockedBy && form.lockedBy !== me ? form.lockedBy : null,
  );
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(() => latestVersion(form));
  const [publishedVersion, setPublishedVersion] = useState(form.publishedVersion);
  const [status, setStatus] = useState<FormStatus>(form.status);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSchema, setPreviewSchema] = useState("");
  // "Test the form": positive (valid → must pass) + negative (invalid → must reject).
  const [testOpen, setTestOpen] = useState(false);
  const [testSchema, setTestSchema] = useState("");
  const [posInitial, setPosInitial] = useState<Record<string, unknown>>({});
  const [negInitial, setNegInitial] = useState<Record<string, unknown>>({});
  const [negExpected, setNegExpected] = useState<NegativeExpectation[]>([]);
  const [posResult, setPosResult] = useState<{ ok: boolean; errorCount: number; errorKeys: string[] } | null>(null);
  const [negResult, setNegResult] = useState<{ ok: boolean; errorCount: number; errorKeys: string[] } | null>(null);
  const [posPlay, setPosPlay] = useState(0); // bump → (re)play the positive typing animation
  const [negPlay, setNegPlay] = useState(0); // bump → (re)play the negative typing animation
  const [testNonce, setTestNonce] = useState(0); // remounts the renderers per test session
  const [testTab, setTestTab] = useState<"positive" | "negative">("positive");
  const [signing, setSigning] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<number | null>(form.lastTestedAt ?? null);
  // LukeTests collaboration on the Test panel: generate sample data + fix failures.
  const [aiFilling, setAiFilling] = useState(false);
  const [aiFixing, setAiFixing] = useState(false);
  const [aiTestError, setAiTestError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [formSettingsOpen, setFormSettingsOpen] = useState(false);
  const [formName, setFormName] = useState(form.name);
  const [formDesc, setFormDesc] = useState(form.description ?? "");
  // Form-level "thank you" message, stored in the schema's settings. A ref keeps
  // the autosave/checkin closures reading the latest value.
  const [submitMessage, setSubmitMessage] = useState(() => readSettings(form.schema).submitMessage ?? "");
  const submitMessageRef = useRef(submitMessage);
  useEffect(() => { submitMessageRef.current = submitMessage; }, [submitMessage]);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedToken, setEmbedToken] = useState<string | null>(null);
  const [embedErr, setEmbedErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<number | null>(null);
  // True while there are edits not yet persisted to the backend (the 600ms
  // autosave debounce window). Drives the leave-guard and the unmount flush.
  const unsavedRef = useRef(false);
  // entityId → label at the last key sync, so a label edit can tell whether the
  // key is still auto-derived (resync) or was manually overridden (leave it).
  const prevLabelRef = useRef<Map<string, string>>(new Map());

  // Load the activity feed when the form-settings modal opens.
  useEffect(() => {
    if (!formSettingsOpen) return;
    let active = true;
    getAudit(tenant, formId)
      .then((a) => active && setAuditEvents(a))
      .catch(() => active && setAuditEvents([]));
    return () => { active = false; };
  }, [formSettingsOpen, tenant, formId]);

  const initialSchema = useMemo(() => parseSchema(form.schema), [form.schema]);

  const builderStore = useBuilderStore(formBuilder, {
    initialData: initialSchema ? { schema: initialSchema } : undefined,
    events: {
      onEntityAttributeUpdated(payload) {
        const name = payload.attributeName;
        if (name === "label") {
          // Re-derive the key from the label (Form.io-style) while it's auto.
          syncKeyToLabel(builderStore as unknown as DerivedErrorStore, payload.entity.id, prevLabelRef.current);
          void builderStore.validateEntityAttribute(payload.entity.id, "label");
          applyDerivedErrors(builderStore as unknown as DerivedErrorStore);
        } else if (name === "key" || (EXPR_ATTRS as readonly string[]).includes(name)) {
          // Keys and expressions need a form-wide pass, not just per-value checks.
          applyDerivedErrors(builderStore as unknown as DerivedErrorStore);
        } else {
          void builderStore.validateEntityAttribute(payload.entity.id, name);
        }
      },
      onEntityDeleted(payload) {
        if (payload.entity.id === activeEntityId) setActiveEntityId(null);
        // A delete can resolve a duplicate/reference elsewhere — re-evaluate.
        applyDerivedErrors(builderStore as unknown as DerivedErrorStore);
      },
    },
  });

  // Surface any pre-existing problems (legacy or AI-applied schemas) as soon as
  // the builder mounts, and seed the label→key baseline so the first label edit
  // can tell an auto key from a manual one.
  useEffect(() => {
    const s = builderStore.getSchema() as unknown as FormSchema;
    for (const [eid, ent] of Object.entries(s.entities)) {
      if (isKeyed(ent)) prevLabelRef.current.set(eid, typeof ent.attributes.label === "string" ? ent.attributes.label : "");
    }
    applyDerivedErrors(builderStore as unknown as DerivedErrorStore);
  }, [builderStore]);

  const { schema } = useBuilderStoreData(builderStore);
  const order = schema.root;

  // Live problem report. `blocking` (structural + key errors) gates check-in /
  // publish; expression warnings are advisory and surfaced for visibility.
  const problems = useMemo(() => validateSchema(schema as unknown as FormSchema), [schema]);
  const exprWarnings = useMemo(() => expressionProblems(schema as unknown as FormSchema), [schema]);
  const blocking = useMemo(() => problems.filter((p) => p.severity === "error"), [problems]);
  const problemList = useMemo(() => {
    const s = schema as unknown as FormSchema;
    const labelOf = (id?: string) => {
      if (!id) return "Form";
      const e = s.entities[id];
      const lbl = e && typeof e.attributes.label === "string" && e.attributes.label ? e.attributes.label : e?.type;
      return lbl || id;
    };
    const items = problems.map((p) => ({ severity: p.severity, entityId: p.entityId, message: p.message, label: labelOf(p.entityId) }));
    for (const w of exprWarnings) {
      items.push({ severity: "warning" as const, entityId: w.entityId, message: `${w.attr}: ${w.message}`, label: labelOf(w.entityId) });
    }
    return items;
  }, [schema, problems, exprWarnings]);
  const warnCount = problemList.length - blocking.length;

  const focusProblem = (entityId?: string) => {
    if (!entityId) return;
    setActiveEntityId(entityId);
    setSettingsOpen(true);
    setProblemsOpen(false);
  };

  // Report the live schema up to the parent so the AI panel (which lives above
  // this remounting component) can read the current form and re-apply changes.
  useEffect(() => {
    onSchema?.(schema as unknown as BuilderSchemaLike);
  }, [schema, onSchema]);

  // Acquire the advisory edit lock on open; release it when leaving. A 409 means
  // someone else holds it — we surface a banner but still allow editing.
  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    checkout(tenant, formId)
      .then(() => active && setLockedByOther(null))
      .catch(() => {}); // 409 → banner already reflects form.lockedBy
    return () => {
      active = false;
      void release(tenant, formId);
    };
  }, [tenant, formId, canEdit]);

  const takeOver = async () => {
    await checkout(tenant, formId, true);
    setLockedByOther(null);
  };

  // Merge the form-level settings (submit message) into a schema before saving,
  // so the renderer can read it after submit. Reads the latest message via ref.
  const withSettings = (schemaObj: unknown) =>
    JSON.stringify({ ...(schemaObj as object), settings: { submitMessage: submitMessageRef.current } });
  const currentSchemaJson = () => withSettings(builderStore.getSchema());

  useEffect(() => {
    if (!canEdit) return; // view-only: never persist edits.
    return builderStore.subscribe((data) => {
      setSaved(false);
      setDirty(true);
      unsavedRef.current = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void saveDraft(tenant, formId, withSettings(data.schema)).then(() => {
          unsavedRef.current = false;
          setSaved(true);
        });
      }, 600);
    });
  }, [builderStore, tenant, formId, canEdit]);

  // Flush any edit still in the debounce window when the designer unmounts
  // (route change / remount), so the last keystrokes aren't lost.
  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    // Skip the flush when the parent is remounting us after persisting a newer
    // schema (AI apply) — flushing the stale local schema would clobber it.
    if (suppressFlushRef?.current) {
      suppressFlushRef.current = false;
      return;
    }
    if (canEdit && unsavedRef.current) {
      unsavedRef.current = false;
      void saveDraft(tenant, formId, currentSchemaJson());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderStore, tenant, formId, canEdit, suppressFlushRef]);

  // Warn before a full page unload (tab close / refresh) with unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (unsavedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const flushSave = async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    await saveDraft(tenant, formId, currentSchemaJson());
    unsavedRef.current = false;
    setSaved(true);
  };

  // Edit the form-level submission message (persisted in the schema, debounced).
  const onSubmitMessageChange = (v: string) => {
    setSubmitMessage(v);
    submitMessageRef.current = v;
    setSaved(false); setDirty(true); unsavedRef.current = true;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveDraft(tenant, formId, currentSchemaJson()).then(() => { unsavedRef.current = false; setSaved(true); });
    }, 600);
  };

  const handleCheckIn = async () => {
    if (blocking.length) { setProblemsOpen(true); return; } // never check in a broken schema
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const artifact = await checkIn(tenant, formId, currentSchemaJson());
    if (artifact) {
      setVersion(artifact.version);
      if (publishedVersion === undefined) setPublishedVersion(artifact.version);
      setStatus("published");
      setSaved(true);
      setDirty(false);
    }
  };

  const handlePublish = async () => {
    if (blocking.length) { setProblemsOpen(true); return; } // never publish a broken schema
    await publishVersion(tenant, formId, version);
    setPublishedVersion(version);
    setStatus("published");
  };

  const openEmbed = async () => {
    setEmbedOpen(true);
    setEmbedErr(null);
    setCopied(false);
    if (embedToken) return;
    try {
      const { token } = await getEmbedToken(tenant, formId);
      setEmbedToken(token);
    } catch (e) {
      setEmbedErr((e as { message?: string })?.message ?? "Couldn’t generate the embed code.");
    }
  };

  const embedUrl = embedToken ? `${window.location.origin}/embed/${embedToken}` : "";
  const embedSnippet = embedToken
    ? `<iframe src="${embedUrl}" width="100%" height="640" style="border:0;max-width:720px" title="${form.name}"></iframe>`
    : "";
  const copyEmbed = async () => {
    try { await navigator.clipboard.writeText(embedSnippet); setCopied(true); } catch { /* ignore */ }
  };

  const handleDiscard = async () => {
    if (!window.confirm("Discard draft changes and revert to the published version?")) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    await discardDraft(tenant, formId);
    reload();
  };

  // Loose view of the schema entities for parent/child resolution.
  const ents = schema.entities as Record<string, { type: string; parentId?: string; children?: string[]; attributes: Record<string, unknown> }>;
  const childrenOf = (id?: string) => (id ? ents[id]?.children ?? [] : order);
  const subtree = (id: string, acc = new Set<string>()): Set<string> => {
    acc.add(id);
    (ents[id]?.children ?? []).forEach((c) => subtree(c, acc));
    return acc;
  };

  const addField = (type: string, defaults: Record<string, unknown>, index?: number, parentId?: string) => {
    const attributes: Record<string, unknown> = { ...defaults };
    if (TYPES_WITH_KEY.has(type)) {
      const existing = new Set<string>();
      for (const eid in ents) {
        const k = ents[eid].attributes.key;
        if (typeof k === "string" && k) existing.add(k);
      }
      attributes.key = uniqueKey(sanitizeKey(String(defaults.label ?? type)), existing);
    }
    const entity = builderStore.addEntity({
      type,
      attributes,
      ...(parentId ? { parentId } : {}),
      ...(index !== undefined ? { index } : {}),
    } as Parameters<typeof builderStore.addEntity>[0]);
    // Seed the label→key baseline so renaming this new field resyncs its key.
    if (TYPES_WITH_KEY.has(type)) prevLabelRef.current.set(entity.id, String(defaults.label ?? type));
    // Tabs need at least a couple of tabs to be usable.
    if (type === "tabs") {
      builderStore.addEntity({ type: "tab", attributes: { label: "Tab 1" }, parentId: entity.id } as Parameters<typeof builderStore.addEntity>[0]);
      builderStore.addEntity({ type: "tab", attributes: { label: "Tab 2" }, parentId: entity.id } as Parameters<typeof builderStore.addEntity>[0]);
    }
    // Tables seed cells (numColumns × 2 rows).
    if (type === "table") {
      const cols = typeof defaults.numColumns === "number" ? defaults.numColumns : 2;
      for (let i = 0; i < cols * 2; i++) builderStore.addEntity({ type: "cell", attributes: {}, parentId: entity.id } as Parameters<typeof builderStore.addEntity>[0]);
    }
    setActiveEntityId(entity.id);
  };

  const addTab = (tabsId: string) => {
    const count = ents[tabsId]?.children?.length ?? 0;
    builderStore.addEntity({ type: "tab", attributes: { label: `Tab ${count + 1}` }, parentId: tabsId } as Parameters<typeof builderStore.addEntity>[0]);
  };

  const addTableRow = (tableId: string) => {
    const cols = typeof ents[tableId]?.attributes.numColumns === "number" ? (ents[tableId].attributes.numColumns as number) : 2;
    for (let i = 0; i < cols; i++) builderStore.addEntity({ type: "cell", attributes: {}, parentId: tableId } as Parameters<typeof builderStore.addEntity>[0]);
  };

  const move = (id: string, delta: number) => {
    const siblings = childrenOf(ents[id]?.parentId);
    const idx = siblings.indexOf(id);
    const next = idx + delta;
    if (next < 0 || next >= siblings.length) return;
    builderStore.setEntityIndex(id, next);
  };

  // Resolve where a drop lands: which parent container and at what index.
  const resolveTarget = (overId: string, activeType?: string): { parentId?: string; index: number } => {
    if (overId === "root") return { parentId: undefined, index: order.length };
    const e = ents[overId];
    if (e && CONTAINER_TYPES.has(e.type)) {
      // A field dropped on a Tabs container goes into its first tab, not the tabs shell.
      if (e.type === "tabs" && activeType !== "tab") {
        const firstTab = e.children?.[0];
        if (firstTab) return { parentId: firstTab, index: ents[firstTab]?.children?.length ?? 0 };
      }
      // A field dropped on a Table goes into its first empty cell (or first cell).
      if (e.type === "table" && activeType !== "cell") {
        const cells = e.children ?? [];
        const target = cells.find((c) => (ents[c]?.children?.length ?? 0) === 0) ?? cells[0];
        if (target) return { parentId: target, index: ents[target]?.children?.length ?? 0 };
      }
      return { parentId: overId, index: e.children?.length ?? 0 };
    }
    const parentId = e?.parentId;
    return { parentId, index: Math.max(0, childrenOf(parentId).indexOf(overId)) };
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.kind === "palette") {
      setDragLabel((data.item as PaletteItem).label);
    } else {
      const e = ents[String(event.active.id)];
      const label = e && typeof e.attributes.label === "string" && e.attributes.label ? e.attributes.label : e?.type;
      setDragLabel(label ?? "Field");
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragLabel(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const data = active.data.current;
    const activeType = data?.kind === "palette" ? (data.item as PaletteItem).type : ents[String(active.id)]?.type;
    const target = resolveTarget(overId, activeType);

    if (data?.kind === "palette") {
      const item = data.item as PaletteItem;
      addField(item.type, item.defaults, target.index, target.parentId);
      return;
    }

    const activeId = String(active.id);
    if (activeId === overId) return;
    // Don't drop a container into its own subtree.
    if (target.parentId && subtree(activeId).has(target.parentId)) return;

    const currentParent = ents[activeId]?.parentId;
    if ((target.parentId ?? undefined) === (currentParent ?? undefined)) {
      builderStore.setEntityIndex(activeId, target.index);
    } else if (target.parentId === undefined) {
      builderStore.unsetEntityParent(activeId, { index: target.index });
    } else {
      builderStore.setEntityParent(activeId, target.parentId, { index: target.index });
    }
  };

  const openPreview = () => {
    setPreviewSchema(currentSchemaJson());
    setPreviewOpen(true);
  };

  // Test the form: snapshot the schema, auto-fill valid sample data, open the
  // modal, then trigger validation once it has mounted (and calc values settle).
  const openTest = () => {
    const json = currentSchemaJson();
    const neg = negativeFillSchema(json);
    setTestSchema(json);
    setPosInitial(autofillSchema(json));
    setNegInitial(neg.values);
    setNegExpected(neg.expected);
    setPosResult(null);
    setNegResult(null);
    setTestTab("positive");
    setNegPlay(0);
    setPosPlay((p) => p + 1); // play positive on open (renderer plays on mount)
    setTestNonce((n) => n + 1);
    setTestOpen(true);
  };

  const signOff = async () => {
    setSigning(true);
    try {
      const updated = await signOffTest(tenant, formId);
      setLastTestedAt(updated.lastTestedAt ?? Date.now());
      setTestOpen(false);
    } finally {
      setSigning(false);
    }
  };

  // Verdicts. Negative passes when every intentionally-invalid field was rejected
  // (or there were no rules to test). Sign-off needs a clean positive AND negative.
  const negCaught = negResult ? negExpected.filter((e) => negResult.errorKeys.includes(e.key)) : [];
  const negNA = negExpected.length === 0;
  const negOk = !!negResult && negExpected.every((e) => negResult.errorKeys.includes(e.key));
  const posOk = !!posResult?.ok;
  const canSignOff = posOk && (negNA || negOk);
  // Playback steps (form order) for the typing animation.
  const posSteps = Object.entries(posInitial).map(([key, value]) => ({ key, value }));
  const negSteps = Object.entries(negInitial).map(([key, value]) => ({ key, value }));

  // ── LukeTests ↔ Test collaboration ───────────────────────────────────────
  // Is there a failure on the active tab that LukeTests could fix?
  const hasFixableFailure =
    (testTab === "positive" && !!posResult && !posOk) ||
    (testTab === "negative" && !!negResult && !negNA && !negOk);

  // key -> label, from the schema under test (for readable fix prompts).
  const fieldLabels = (): Record<string, string> => {
    try {
      const s = JSON.parse(testSchema) as BuilderSchemaLike;
      const out: Record<string, string> = {};
      for (const [id, e] of Object.entries(s.entities ?? {})) {
        const a = (e as { attributes?: { key?: string; label?: string } }).attributes ?? {};
        out[a.key ?? id] = a.label ?? a.key ?? id;
      }
      return out;
    } catch {
      return {};
    }
  };

  // Generate realistic VALID sample data for the positive run with LukeTests
  // (richer than the heuristic auto-fill). Negative stays rule-aware (its
  // expected-violation tracking needs the deterministic filler).
  const fillPositiveWithAi = async () => {
    setAiFilling(true);
    setAiTestError(null);
    try {
      const schema = JSON.parse(currentSchemaJson()) as BuilderSchemaLike;
      const td = await generateTestData(schema, "valid", form.name, me ?? undefined);
      setPosInitial(td.values);
      setTestTab("positive");
      setPosResult(null);
      setPosPlay((p) => p + 1); // replay with the new values, then re-validate
    } catch (e) {
      setAiTestError((e as Error).message);
    } finally {
      setAiFilling(false);
    }
  };

  // Hand the active-tab failures to LukeTests and apply its fix (saveDraft +
  // remount the builder, same path AiAssistPanel uses).
  const askAiToFix = async () => {
    setAiFixing(true);
    setAiTestError(null);
    try {
      const labels = fieldLabels();
      let message: string;
      if (testTab === "positive" && posResult) {
        const fields = posResult.errorKeys.map((k) => labels[k] ?? k).join(", ") || "some fields";
        message = `In a Test run I filled this form with VALID data, but these fields still fail validation: ${fields}. The validation is too strict or misconfigured — adjust the form so correct input passes.`;
      } else {
        const missed = negExpected.filter((e) => !negResult?.errorKeys.includes(e.key));
        const fields = missed.map((e) => `${e.label} (${e.reason})`).join(", ") || "some fields";
        message = `In a Test run these fields should REJECT invalid input but don't: ${fields}. Add or repair their validation so invalid values are rejected.`;
      }
      const result = await generateSchema(
        message,
        JSON.parse(currentSchemaJson()) as BuilderSchemaLike,
        form.name,
        me ?? undefined,
      );
      await saveDraft(tenant, formId, JSON.stringify(result.schema));
      setTestOpen(false);
      // The outgoing builder must not re-save its stale local schema over our fix
      // (same guard the AiAssistPanel apply path uses).
      if (suppressFlushRef) suppressFlushRef.current = true;
      reload(); // remount the builder with the fixed schema
    } catch (e) {
      setAiTestError((e as Error).message);
    } finally {
      setAiFixing(false);
    }
  };

  const saveFormSettings = async () => {
    const name = formName.trim() || form.name;
    setFormName(name);
    await updateMeta(tenant, formId, { name, description: formDesc });
    setFormSettingsOpen(false);
  };

  // Floating "scroll to top" for the whole-page-scroll layout — shows once the
  // page is scrolled past a threshold.
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <PageMeta title={`${form.name} | Lukeflow`} description="Design your form in Lukeflow." />

      {canEdit && lockedByOther && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400">
          <span>
            This form is being edited by <span className="font-medium">{lockedByOther.replace(/^workos:/, "")}</span>. Your changes may overwrite theirs.
          </span>
          <Button size="sm" variant="outline" onClick={takeOver}>Take over</Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tooltip content="Back to form list">
          <button type="button" onClick={() => navigate("/forms")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5">
            <ChevronLeftIcon className="size-5" />Forms
          </button>
        </Tooltip>
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="min-w-0">
          <button type="button" onClick={() => setFormSettingsOpen(true)} className="group flex max-w-full items-center gap-1.5 text-base font-semibold text-gray-800 dark:text-white/90">
            <span className="truncate">{formName}</span>
            <PencilIcon className="size-3.5 shrink-0 text-gray-300 transition group-hover:text-gray-500" />
          </button>
          <p className="flex items-center gap-1.5 text-[11px] leading-tight text-gray-400">
            <span className="font-mono">{form.code}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase ${STATUS_BADGE[status]}`}>{status}</span>
            <span>{publishedVersion ? `v${publishedVersion} live` : version ? `v${version} checked in` : "never checked in"}</span>
            {lastTestedAt && (<><span className="size-1 rounded-full bg-success-400" /><span className="inline-flex items-center gap-1 text-success-600 dark:text-success-400"><BadgeCheck className="size-3.5" />Tested</span></>)}
            {dirty && (<><span className="size-1 rounded-full bg-amber-400" /><span className="text-amber-500">unchecked-in changes</span></>)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!canEdit ? (
            <>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/10 dark:text-gray-400">
                View only
              </span>
              <Tooltip content="Preview & test the form — conditions, calculations and validation run live."><Button size="sm" variant="outline" onClick={openPreview} startIcon={<MonitorPlay className="size-4" />}>Preview</Button></Tooltip>
              <Tooltip content="Auto-fill the form with valid sample data and validate it."><Button size="sm" variant="outline" onClick={openTest} startIcon={<FlaskConical className="size-4" />}>Test</Button></Tooltip>
            </>
          ) : (
            <>
              <span className="mr-1 hidden text-xs text-gray-400 sm:inline">{saved ? "Draft saved" : "Saving…"}</span>
              {problemList.length > 0 && (
                <Tooltip content={blocking.length ? `${blocking.length} problem(s) block check-in & publish` : `${warnCount} warning(s)`}>
                  <button
                    type="button"
                    onClick={() => setProblemsOpen(true)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      blocking.length
                        ? "bg-error-50 text-error-600 hover:bg-error-100 dark:bg-error-500/10 dark:text-error-400"
                        : "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400"
                    }`}
                  >
                    <span aria-hidden>{blocking.length ? "⊘" : "⚠"}</span>
                    {blocking.length ? `${blocking.length} error${blocking.length > 1 ? "s" : ""}` : `${warnCount} warning${warnCount > 1 ? "s" : ""}`}
                  </button>
                </Tooltip>
              )}
              {dirty && version > 0 && (
                <Tooltip content="Discard draft edits and revert to the live version."><Button size="sm" variant="outline" onClick={handleDiscard}>Discard</Button></Tooltip>
              )}
              <Tooltip content="Preview & test the form — conditions, calculations and validation run live."><Button size="sm" variant="outline" onClick={openPreview} startIcon={<MonitorPlay className="size-4" />}>Preview</Button></Tooltip>
              <Tooltip content="Auto-fill the form with valid sample data, validate it, and sign off."><Button size="sm" variant="outline" onClick={openTest} startIcon={<FlaskConical className="size-4" />}>Test</Button></Tooltip>
              <Tooltip content="Save your progress as a draft. Drafts keep your edits so you can continue working, but can't be used in workflows yet."><Button size="sm" variant="outline" onClick={flushSave} startIcon={<CheckLineIcon className="size-4" />}>Save</Button></Tooltip>
              <Tooltip content={blocking.length ? "Fix the blocking problems before checking in." : "Check in a version as an artifact that workflows can use. Your draft stays editable for further changes."}><Button size="sm" variant="outline" onClick={handleCheckIn} disabled={blocking.length > 0} startIcon={<PaperPlaneIcon className="size-4" />}>Check in</Button></Tooltip>
              {version > 0 && (
                <Tooltip content={blocking.length ? "Fix the blocking problems before publishing." : "Make the latest checked-in version the live one that workflows use."}><Button size="sm" onClick={handlePublish} disabled={publishedVersion === version || blocking.length > 0}>{publishedVersion === version ? "Published" : `Publish v${version}`}</Button></Tooltip>
              )}
              {publishedVersion && (
                <Tooltip content="Get an iframe snippet to embed this form on any website."><Button size="sm" variant="outline" onClick={openEmbed}>Embed</Button></Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragLabel(null)}>
        <div className={`grid min-h-[520px] grid-cols-1 items-start gap-4 ${canEdit ? "lg:grid-cols-[220px_1fr]" : ""}`}>
          {/* Palette — only when the user can edit. */}
          {canEdit && (
          <div className="sticky top-24 max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <input
              type="search"
              value={paletteQuery}
              onChange={(e) => setPaletteQuery(e.target.value)}
              placeholder="Search fields…"
              className="mb-3 h-9 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90"
            />
            {(() => {
              const q = paletteQuery.trim().toLowerCase();
              const groups = q
                ? PALETTE_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q) || i.type.toLowerCase().includes(q)) })).filter((g) => g.items.length)
                : PALETTE_GROUPS;
              if (groups.length === 0) return <p className="px-1 py-4 text-center text-xs text-gray-400">No fields match “{paletteQuery}”.</p>;
              return groups.map((group) => (
                <div key={group.group} className="mb-4 last:mb-0">
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{group.group}</p>
                  <div className="flex flex-col gap-1.5">
                    {group.items.map((item) => (
                      <PaletteButton key={item.type} item={item} />
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
          )}

          {/* Canvas — non-interactive when the user only has read access. */}
          <div className="relative">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className={canEdit ? "" : "pointer-events-none select-none"}>
            <Canvas>
              {order.length === 0 ? (
                <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-center dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No fields yet</p>
                  <p className="mt-1 text-sm text-gray-400">{canEdit ? "Drag a field from the left to start building." : "This form has no fields."}</p>
                </div>
              ) : (
                <SortableContext items={Object.keys(schema.entities)} strategy={verticalListSortingStrategy}>
                  <BuilderEntitiesContext.Provider value={ents}>
                    <BuilderEntities builderStore={builderStore} components={entityComponents}>
                      {(props) => (
                        <SortableField
                          id={props.entity.id}
                          isActive={props.entity.id === activeEntityId}
                          onSelect={() => { setActiveEntityId(props.entity.id); setSettingsOpen(true); }}
                          onUp={() => move(props.entity.id, -1)}
                          onDown={() => move(props.entity.id, 1)}
                          onDelete={() => builderStore.deleteEntity(props.entity.id)}
                        >
                          {props.children}
                        </SortableField>
                      )}
                    </BuilderEntities>
                  </BuilderEntitiesContext.Provider>
                </SortableContext>
              )}
            </Canvas>
            </div>
            </div>
            {building && <AiProcessingOverlay />}
            {/* Floating scroll-to-top, anchored to the bottom of the canvas. */}
            {showScrollTop && (
              <div className="pointer-events-none sticky bottom-6 z-20 flex justify-end pr-1">
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  aria-label="Scroll to top"
                  className="pointer-events-auto flex size-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-theme-lg transition hover:-translate-y-0.5 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  <ArrowUp className="size-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragLabel ? (
            <div className="flex cursor-grabbing items-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-medium text-brand-600 shadow-theme-lg dark:bg-gray-900">
              <GripIcon className="size-4 text-brand-300" />
              {dragLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Modal isOpen={embedOpen} onClose={() => setEmbedOpen(false)} className="mx-4 w-full max-w-[560px]">
        <div className="p-6">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Embed this form</h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Paste this snippet into any web page. Submissions create a response and start a process.
          </p>
          {embedErr ? (
            <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-500 dark:bg-error-500/10">{embedErr}</p>
          ) : !embedToken ? (
            <p className="py-6 text-center text-sm text-gray-400">Generating…</p>
          ) : (
            <>
              <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">{embedSnippet}</pre>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={copyEmbed}>{copied ? "Copied ✓" : "Copy snippet"}</Button>
                <Button size="sm" variant="outline" startIcon={<MonitorPlay className="size-4" />} onClick={() => window.open(embedUrl, "_blank", "noopener,noreferrer")}>Open preview</Button>
              </div>
              <p className="mt-3 text-xs text-gray-400">The link is opaque and signed — it carries only this form, scoped to your organization.</p>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={problemsOpen} onClose={() => setProblemsOpen(false)} className="mx-4 max-h-[80vh] w-full max-w-[520px] overflow-y-auto">
        <div className="p-6">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Problems</h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {blocking.length
              ? `${blocking.length} blocking issue${blocking.length > 1 ? "s" : ""} must be fixed before you can check in or publish.`
              : "No blocking issues. The items below are advisory."}
          </p>
          {problemList.length === 0 ? (
            <p className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/10">Everything looks good — no problems found.</p>
          ) : (
            <ul className="space-y-2">
              {problemList.map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => focusProblem(p.entityId)}
                    disabled={!p.entityId}
                    className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      p.entityId ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5" : "cursor-default"
                    } ${
                      p.severity === "error"
                        ? "border-error-200 dark:border-error-500/30"
                        : "border-amber-200 dark:border-amber-500/30"
                    }`}
                  >
                    <span aria-hidden className={p.severity === "error" ? "text-error-500" : "text-amber-500"}>
                      {p.severity === "error" ? "⊘" : "⚠"}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{p.label}</span>
                      <span className="block text-gray-500 dark:text-gray-400">{p.message}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal isOpen={formSettingsOpen} onClose={() => setFormSettingsOpen(false)} className="mx-4 w-full max-w-[480px]">
        <div className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Form settings</h2>
          <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5">
            <span className="text-xs text-gray-400">Form ID</span>
            <p className="font-mono text-sm font-medium text-gray-700 dark:text-gray-200">{form.code}</p>
          </div>
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
              onChange={(e) => onSubmitMessageChange(e.target.value)}
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
                    <span><span className="font-medium text-gray-700 dark:text-gray-300">{ev.action.replace(/_/g, " ")}</span>{ev.detail ? ` ${ev.detail}` : ""}</span>
                    <span className="text-gray-400">{new Date(ev.at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={settingsOpen && !!activeEntityId} onClose={() => setSettingsOpen(false)} className="mx-4 max-h-[85vh] w-full max-w-[520px] overflow-y-auto">
        <div className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Field settings</h2>
          {activeEntityId ? (
            <BuilderEntityAttributes builderStore={builderStore} components={attributesComponents} entityId={activeEntityId} />
          ) : null}
          {activeEntityId && ents[activeEntityId]?.type === "tabs" ? (
            <button
              type="button"
              onClick={() => addTab(activeEntityId)}
              className="mt-2 rounded-lg border border-brand-300 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-white/5"
            >
              + Add tab
            </button>
          ) : null}
          {activeEntityId && ents[activeEntityId]?.type === "table" ? (
            <button
              type="button"
              onClick={() => addTableRow(activeEntityId)}
              className="mt-2 rounded-lg border border-brand-300 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-white/5"
            >
              + Add row
            </button>
          ) : null}
        </div>
      </Modal>

      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} className="mx-4 max-h-[90vh] w-full max-w-[640px] overflow-y-auto">
        <div className="p-6 sm:p-8">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Preview — {form.name}</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Fill it out to test conditions, calculated values and validation.</p>
          <FormRenderer schema={previewSchema} />
        </div>
      </Modal>

      {/* Test the form — positive (valid → must pass) + negative (invalid → must reject). */}
      <Modal isOpen={testOpen} onClose={() => setTestOpen(false)} className="mx-4 max-h-[90vh] w-full max-w-[640px] overflow-y-auto">
        <div className="relative p-6 sm:p-8">
          {/* LukeTests working overlay — the user sees it building/fixing in the background. */}
          {(aiFilling || aiFixing) && (
            <AiProcessingOverlay
              wordmark="LukeTests"
              title={aiFixing ? "LukeTests is fixing the form…" : "LukeTests is generating test data…"}
              steps={aiFixing ? TEST_FIX_STEPS : TEST_GEN_STEPS}
            />
          )}
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Test — {form.name}</h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            <strong>Positive</strong> fills valid data (must pass). <strong>Negative</strong> fills invalid data (validation must reject it). Regex / custom-rule fields may need a manual value.
          </p>

          {/* Overall summary */}
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-medium ${posResult ? (posOk ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400" : "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400") : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"}`}>
              Positive: {posResult ? (posOk ? "✓ valid" : `✗ ${posResult.errorCount} error${posResult.errorCount === 1 ? "" : "s"}`) : "running…"}
            </span>
            <span className={`rounded-full px-2.5 py-1 font-medium ${negResult ? (negNA || negOk ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400" : "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400") : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"}`}>
              Negative: {negResult ? (negNA ? "n/a (no rules)" : `${negOk ? "✓" : "✗"} ${negCaught.length}/${negExpected.length} rejected`) : "running…"}
            </span>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
            {(["positive", "negative"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTestTab(t); if (t === "negative" && negPlay === 0) setNegPlay((s) => s + 1); }}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition ${testTab === t ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Negative per-field breakdown */}
          {testTab === "negative" && negResult && !negNA && (
            <ul className="mb-4 space-y-1 rounded-lg bg-gray-50 p-3 text-xs dark:bg-white/5">
              {negExpected.map((e) => {
                const caught = negResult.errorKeys.includes(e.key);
                return (
                  <li key={e.key} className="flex items-center gap-2">
                    <span aria-hidden className={caught ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}>{caught ? "✓" : "✗"}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{e.label}</span>
                    <span className="text-gray-400">— {e.reason} {caught ? "rejected" : "NOT rejected (validation gap)"}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Renderers play the typing animation then validate. Inactive tab is hidden but mounted. */}
          <div className={testTab === "positive" ? "" : "hidden"}>
            <FormRenderer key={`pos-${testNonce}`} schema={testSchema} playback={{ steps: posSteps, signal: posPlay }} onResult={setPosResult} />
          </div>
          <div className={testTab === "negative" ? "" : "hidden"}>
            <FormRenderer key={`neg-${testNonce}`} schema={testSchema} playback={{ steps: negSteps, signal: negPlay }} onResult={setNegResult} />
          </div>

          {aiTestError && (
            <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-600 dark:bg-error-500/10">{aiTestError}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => (testTab === "positive" ? setPosPlay((s) => s + 1) : setNegPlay((s) => s + 1))}>Re-run</Button>
              {canEdit && testTab === "positive" && (
                <Tooltip content="Let LukeTests fill the positive run with realistic valid data.">
                  <Button size="sm" variant="outline" onClick={fillPositiveWithAi} disabled={aiFilling} startIcon={<LukeTestsMark className="size-4" />}>
                    {aiFilling ? "Generating…" : "Generate data"}
                  </Button>
                </Tooltip>
              )}
              {canEdit && hasFixableFailure && (
                <Tooltip content="Hand the failing fields to LukeTests and apply its fix.">
                  <Button size="sm" variant="outline" onClick={askAiToFix} disabled={aiFixing} startIcon={<LukeTestsMark className="size-4" />}>
                    {aiFixing ? "Fixing…" : "Ask LukeTests to fix"}
                  </Button>
                </Tooltip>
              )}
            </div>
            {canEdit ? (
              <Tooltip content={canSignOff ? "Record that this form passed its self-test." : "Sign-off needs a clean positive run and all negative rules rejected."}>
                <span>
                  <Button size="sm" onClick={signOff} disabled={!canSignOff || signing} startIcon={<BadgeCheck className="size-4" />}>
                    {signing ? "Signing off…" : "Sign off"}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <span className="text-xs text-gray-400">Sign-off needs edit access.</span>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

export default function FormBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, refreshSession } = useAuth();
  const tenant = session?.tenant ?? null;
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<StoredForm | null>(null);
  const [loading, setLoading] = useState(true);
  // AI panel state lives here (above the keyed Designer) so chat history and the
  // panel survive the builder remount that applying a change triggers.
  // `aiBuilding` drives the canvas "building" animation — it's true ONLY while an
  // actual form change is being applied, so it never shows for off-topic chat.
  const [aiBuilding, setAiBuilding] = useState(false);
  const [liveSchema, setLiveSchema] = useState<BuilderSchemaLike | null>(null);
  // Bumped to remount ONLY the builder (load a new schema into it) without the
  // full-page reload — keeps the docked chat panel and its history mounted.
  const [designerNonce, setDesignerNonce] = useState(0);
  // Tells the outgoing Designer to skip its unmount autosave flush (the AI apply
  // already persisted a newer schema; flushing stale local state would clobber it).
  const suppressFlushRef = useRef(false);

  // Apply an AI-produced schema locally: the agent already saved the draft, so
  // just swap it into the form and remount the builder. No refetch, no loading.
  // Only called when the form actually changed (the panel skips no-op turns), so
  // this is exactly where the build animation belongs — a brief reveal flourish.
  const applyAiSchema = (schema: BuilderSchemaLike) => {
    // The agent emits snake_case keys without our uniqueness/identifier guards,
    // so force keys to camelCase (rewriting any references) before trusting the
    // schema — then persist the cleaned draft so the backend matches the builder.
    const normalized = camelCaseKeys(schema as unknown as FormSchema) as unknown as BuilderSchemaLike;
    // Preserve the form-level settings (submit message) — the agent only returns
    // entities/root, so re-merge what's already on the form.
    const json = JSON.stringify({ ...normalized, settings: readSettings(form?.schema) });
    suppressFlushRef.current = true; // the outgoing builder must not re-save stale state
    setAiBuilding(true);
    setForm((f) => (f ? { ...f, schema: json } : f));
    setLiveSchema(normalized);
    setDesignerNonce((n) => n + 1);
    if (tenant && id) void saveDraft(tenant, id, json);
    window.setTimeout(() => setAiBuilding(false), 1300);
  };

  // Re-read the session on entry so the editor reflects the caller's *current*
  // FORMS access (a role change made elsewhere won't be in the bootstrap session).
  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!tenant || !id) return;
    let active = true;
    setLoading(true);
    getForm(tenant, id)
      .then((f) => { if (active) { setForm(f); setLoading(false); } })
      .catch(() => { if (active) { setLoading(false); navigate("/forms", { replace: true }); } });
    return () => { active = false; };
  }, [tenant, id, reloadKey, navigate]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading form…</div>;
  }
  if (!tenant || !id || !form) return null;

  const canEdit = canWrite(session, FORMS);

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <Designer
          key={`${form.id}-${reloadKey}-${designerNonce}`}
          tenant={tenant}
          formId={id}
          form={form}
          reload={() => setReloadKey((k) => k + 1)}
          onSchema={setLiveSchema}
          building={aiBuilding}
          suppressFlushRef={suppressFlushRef}
        />
      </div>
      {/* Permanent LukeBuilds rail — sticky and viewport-tall so it stays fully
          visible (composer included) and pins as you scroll a long form. */}
      {canEdit && (
        <aside className="sticky top-24 hidden h-[calc(100vh-9rem)] w-[360px] shrink-0 lg:block">
          <AiAssistPanel
            tenant={tenant}
            formId={id}
            formName={form.name}
            schema={liveSchema}
            onApplied={applyAiSchema}
          />
        </aside>
      )}
    </div>
  );
}
