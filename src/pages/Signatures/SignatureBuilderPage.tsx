import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Pencil, Rocket, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { SignatureBuilder, type SignatureBuilderHandle } from "@lukeflow/sign-react";
import BuilderMobileNotice from "../../components/common/BuilderMobileNotice";
import { useAuth } from "../../context/AuthContext";
import { canWrite, SIGNATURES } from "../../lib/capabilities";
import {
  isSchemaSignable,
  lifecycleGate,
  parseSignatureSchema,
  signatureDefinitions,
  type LifecycleState,
  type SignatureSchema,
  type StoredSignatureDefinition,
} from "../../lib/signaturesApi";

const BTN = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
const NEUTRAL = `${BTN} border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5`;
const PRIMARY = `${BTN} bg-brand-500 text-white hover:bg-brand-600`;

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  published: "bg-success-50 text-success-600 dark:bg-success-500/15",
  archived: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
};

export default function SignatureBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;
  const me = session?.userId ?? null;
  const canEdit = canWrite(session, SIGNATURES);

  const builderRef = useRef<SignatureBuilderHandle>(null);
  const [def, setDef] = useState<StoredSignatureDefinition | null>(null);
  const [initialSchema, setInitialSchema] = useState<SignatureSchema | null>(null);
  const [liveSchema, setLiveSchema] = useState<SignatureSchema | null>(null);
  const [docSource, setDocSource] = useState<string | null>(null);
  const [checkedOut, setCheckedOut] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const saveTimer = useRef<number | null>(null);
  const objectUrl = useRef<string | null>(null);

  const refreshDef = useCallback(async () => {
    if (!tenant || !id) return null;
    const d = await signatureDefinitions.get(tenant, id);
    setDef(d);
    setCheckedOut(!!d.lockedBy && d.lockedBy === me);
    return d;
  }, [tenant, id, me]);

  // Load the definition + its document.
  useEffect(() => {
    if (!tenant || !id) return;
    let active = true;
    setLoading(true);
    signatureDefinitions
      .get(tenant, id)
      .then(async (d) => {
        if (!active) return;
        setDef(d);
        setCheckedOut(!!d.lockedBy && d.lockedBy === me);
        const schema = parseSignatureSchema(d.schema);
        setInitialSchema(schema);
        setLiveSchema(schema);
        if (schema.document.key) {
          try {
            const blob = await signatureDefinitions.fetchDocument(tenant, id, schema.document.key);
            if (!active) return;
            const url = URL.createObjectURL(blob);
            objectUrl.current = url;
            setDocSource(url);
          } catch {
            /* document missing — builder shows the dropzone */
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          navigate("/signatures", { replace: true });
        }
      });
    return () => {
      active = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [tenant, id, me, navigate]);

  const persist = useCallback(
    async (schema: SignatureSchema) => {
      if (!tenant || !id) return;
      try {
        await signatureDefinitions.saveDraft(tenant, id, JSON.stringify(schema));
        setSaved(true);
      } catch {
        setSaved(false);
      }
    },
    [tenant, id],
  );

  const onChange = useCallback(
    (schema: SignatureSchema) => {
      setLiveSchema(schema);
      setDirty(true);
      if (!canEdit || !checkedOut) return;
      setSaved(false);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void persist(schema), 600);
    },
    [canEdit, checkedOut, persist],
  );

  const onUploadDocument = useCallback(
    async (file: File) => {
      if (!tenant || !id) throw new Error("not ready");
      return signatureDefinitions.uploadDocument(tenant, id, file);
    },
    [tenant, id],
  );

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setError(null);
      setBusy(label);
      try {
        await fn();
        await refreshDef();
      } catch (e) {
        setError(e instanceof Error ? e.message : `${label} failed`);
      } finally {
        setBusy(null);
      }
    },
    [refreshDef],
  );

  const gate = useMemo<ReturnType<typeof lifecycleGate> | null>(() => {
    if (!def) return null;
    const state: LifecycleState = {
      status: def.status,
      checkedOut,
      lockedBy: def.lockedBy,
      userId: me,
      dirty,
      latestVersion: def.latestVersion,
      latestVersionSignedOff: def.latestVersionSignedOff,
      publishedVersion: def.publishedVersion,
      schemaValid: liveSchema ? isSchemaSignable(liveSchema) : false,
    };
    return lifecycleGate(state);
  }, [def, checkedOut, dirty, me, liveSchema]);

  const currentSchema = () => builderRef.current?.getSchema() ?? liveSchema;

  if (loading || !def || !initialSchema) {
    return <div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading designer…</div>;
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/signatures")} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
              {def.name}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_BADGE[def.status]}`}>{def.status}</span>
              {def.latestVersion > 0 && <span className="text-xs font-normal text-gray-400">v{def.latestVersion}</span>}
            </h1>
            <p className="font-mono text-xs text-gray-400">{def.code}</p>
          </div>
        </div>

        {canEdit && gate && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-gray-400">{saved ? "Saved" : "Saving…"}</span>
            {!checkedOut ? (
              <button className={PRIMARY} disabled={!gate.canCheckout || !!busy} onClick={() => run("checkout", () => signatureDefinitions.checkout(tenant!, id!))}>
                <Pencil className="size-4" /> Checkout
              </button>
            ) : (
              <button className={NEUTRAL} disabled={!!busy} onClick={() => run("discard", () => signatureDefinitions.discard(tenant!, id!))}>
                <RotateCcw className="size-4" /> {busy === "discard" ? "Reverting…" : "Undo checkout"}
              </button>
            )}
            <button
              className={NEUTRAL}
              disabled={!gate.canCheckIn || !!busy}
              title={gate.reason}
              onClick={() => run("checkin", async () => {
                const s = currentSchema();
                if (s) await signatureDefinitions.checkIn(tenant!, id!, JSON.stringify(s));
                setDirty(false);
              })}
            >
              <Save className="size-4" /> {busy === "checkin" ? "Checking in…" : "Check in"}
            </button>
            <button className={NEUTRAL} disabled={!gate.canSignOff || !!busy} title={gate.reason} onClick={() => run("signoff", () => signatureDefinitions.signOff(tenant!, id!))}>
              <ShieldCheck className="size-4" /> {busy === "signoff" ? "Signing off…" : "Legal sign-off"}
            </button>
            <button className={checkedOut ? NEUTRAL : PRIMARY} disabled={!gate.canPublish || !!busy} title={gate.reason} onClick={() => run("publish", () => signatureDefinitions.publish(tenant!, id!, def.latestVersion))}>
              <Rocket className="size-4" /> {busy === "publish" ? "Publishing…" : def.publishedVersion === def.latestVersion && def.latestVersion > 0 ? "Published" : "Publish"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">{error}</div>
      )}
      {!checkedOut && canEdit && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">
          View-only — <strong>Checkout</strong> to edit this definition.
        </div>
      )}

      <BuilderMobileNotice label="signature designer" />
      <div className="hidden sm:block">
      <SignatureBuilder
        ref={builderRef}
        initialSchema={initialSchema}
        documentSource={docSource}
        readOnly={!canEdit || !checkedOut}
        onChange={onChange}
        onUploadDocument={onUploadDocument}
      />
      </div>
    </div>
  );
}
