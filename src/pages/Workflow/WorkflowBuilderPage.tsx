import "@xyflow/react/dist/style.css";
import { validateWorkflow, type WorkflowDoc } from "@lukeflow/workflow-core";
import { WorkflowBuilder } from "@lukeflow/workflow-builder";
import BuilderMobileNotice from "../../components/common/BuilderMobileNotice";
import { ArrowLeft, CheckCircle2, PlayCircle, Rocket, Save, Stamp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import WorkflowAiAssistPanel from "./WorkflowAiAssistPanel";
import WorkflowRunsModal from "./WorkflowRunsModal";
import { listForms } from "../../lib/formsApi";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { WORKFLOW, canWrite } from "../../lib/capabilities";
import {
  blankWorkflow,
  checkIn as apiCheckIn,
  getCatalog,
  getDefinition,
  getRun,
  listConnections,
  publish as apiPublish,
  signOff as apiSignOff,
  updateDraft,
  type IntegrationConnection,
  type WorkflowDefinition,
  type WorkflowRunDetail,
} from "../../lib/workflowApi";
import type { StepTypeDescriptor } from "@lukeflow/workflow-core";

function parseDoc(def: WorkflowDefinition | null): WorkflowDoc {
  if (def?.draftJson) {
    try {
      return JSON.parse(def.draftJson) as WorkflowDoc;
    } catch {
      /* fall through to blank */
    }
  }
  return blankWorkflow(def?.name ?? "Workflow");
}

export default function WorkflowBuilderPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { theme } = useTheme();
  const tenant = session?.tenant ?? null;
  const canEdit = canWrite(session, WORKFLOW);

  const [def, setDef] = useState<WorkflowDefinition | null>(null);
  const [doc, setDoc] = useState<WorkflowDoc | null>(null);
  const [stepTypes, setStepTypes] = useState<StepTypeDescriptor[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [forms, setForms] = useState<{ code: string; name: string }[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runsOpen, setRunsOpen] = useState(false);
  const [watchRunId, setWatchRunId] = useState<string | null>(null);
  const [watchDetail, setWatchDetail] = useState<WorkflowRunDetail | null>(null);

  useEffect(() => {
    if (!tenant || !id) return;
    let alive = true;
    (async () => {
      try {
        const [d, cat] = await Promise.all([getDefinition(tenant, id), getCatalog(tenant)]);
        if (!alive) return;
        setDef(d);
        setDoc(parseDoc(d));
        setStepTypes(cat);
        setVersion(d.publishedVersion ?? (d.latestVersion > 0 ? d.latestVersion : null));
        // Connections power the integration-action picker; best-effort (never blocks the builder).
        listConnections(tenant)
          .then((c) => alive && setConnections(c))
          .catch(() => alive && setConnections([]));
        // Published forms power the forms-trigger "Which form?" picker; best-effort.
        listForms(tenant)
          .then((fs) =>
            alive &&
            setForms(
              fs
                .filter((f) => f.publishedVersion != null || f.status === "published")
                .map((f) => ({ code: f.code, name: f.name })),
            ),
          )
          .catch(() => alive && setForms([]));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load workflow");
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenant, id]);

  const diagnostics = useMemo(() => (doc ? validateWorkflow(doc) : []), [doc]);
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;

  // Live run watching (Pillar 4c): poll the watched run and highlight its nodes on the canvas.
  useEffect(() => {
    if (!tenant || !watchRunId) {
      setWatchDetail(null);
      return;
    }
    let alive = true;
    const poll = async () => {
      try {
        const d = await getRun(tenant, watchRunId);
        if (alive) setWatchDetail(d);
      } catch {
        /* transient — keep the last snapshot */
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [tenant, watchRunId]);

  const highlight = useMemo(
    () =>
      watchDetail && watchDetail.found
        ? {
            active: watchDetail.currentActivityIds,
            incident: watchDetail.incidents.map((i) => i.activityId).filter((a): a is string => !!a),
          }
        : undefined,
    [watchDetail],
  );

  const run = useCallback(
    async (label: string, fn: () => Promise<string | void>) => {
      if (!tenant) return;
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const note = await fn();
        setMessage(note ?? `${label} ✓`);
      } catch (e) {
        setError(e instanceof Error ? e.message : `${label} failed`);
      } finally {
        setBusy(false);
      }
    },
    [tenant],
  );

  const save = () =>
    run("Saved", async () => {
      if (!doc || !tenant) return;
      await updateDraft(tenant, id, { name: doc.name, json: JSON.stringify(doc) });
    });

  const checkIn = () =>
    run("Checked in", async () => {
      if (!doc || !tenant) return;
      await updateDraft(tenant, id, { name: doc.name, json: JSON.stringify(doc) });
      const v = await apiCheckIn(tenant, id);
      setVersion(v.version);
      return v.compileOk ? `Checked in v${v.version} — compiles ✓` : `Checked in v${v.version} — compile error: ${v.compileError ?? "unknown"}`;
    });

  const signOff = () =>
    run("Signed off", async () => {
      if (!tenant || version == null) return "Check in a version first";
      await apiSignOff(tenant, id, version);
      return `Signed off v${version} ✓`;
    });

  const publish = () =>
    run("Published", async () => {
      if (!tenant || version == null) return "Check in + sign off a version first";
      const d = await apiPublish(tenant, id, version);
      setDef(d);
      return `Published v${version} — live ✓`;
    });

  if (!doc) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">
        {error ?? "Loading builder…"}
      </div>
    );
  }

  return (
    <>
      <PageMeta title={`${doc.name ?? "Workflow"} · Builder`} description="Design a workflow" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate("/workflow")} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">{doc.name}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {def?.status ?? "DRAFT"}
              {def?.publishedVersion != null ? ` · live v${def.publishedVersion}` : ""}
              {errorCount > 0 ? ` · ${errorCount} problem${errorCount === 1 ? "" : "s"}` : " · valid"}
            </p>
          </div>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-white/5">
              <Save className="size-4" /> Save
            </button>
            <button type="button" onClick={checkIn} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-white/5">
              <CheckCircle2 className="size-4" /> Check in
            </button>
            <button type="button" onClick={signOff} disabled={busy || version == null} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-white/5">
              <Stamp className="size-4" /> Sign off
            </button>
            <button type="button" onClick={publish} disabled={busy || version == null} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              <Rocket className="size-4" /> Publish
            </button>
            <button type="button" onClick={() => setRunsOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5">
              <PlayCircle className="size-4" /> Runs
            </button>
          </div>
        ) : null}
      </div>

      {message ? (
        <div className="mb-3 rounded-lg bg-success-50 px-4 py-2 text-sm text-success-700 dark:bg-success-500/15">{message}</div>
      ) : null}
      {error ? (
        <div className="mb-3 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/15">{error}</div>
      ) : null}
      {watchRunId ? (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          <span className="flex items-center gap-2">
            <span className="inline-block size-2 animate-pulse rounded-full bg-brand-500" />
            Watching run <span className="font-mono text-xs">{watchRunId.slice(0, 12)}</span>
            {watchDetail?.state ? <span className="opacity-70">· {watchDetail.state}</span> : null}
          </span>
          <button type="button" onClick={() => setWatchRunId(null)} className="font-medium hover:underline">
            Stop
          </button>
        </div>
      ) : null}

      <BuilderMobileNotice label="workflow builder" />
      <div className="hidden h-[72vh] flex-col gap-4 sm:flex lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <WorkflowBuilder value={doc} stepTypes={stepTypes} connections={connections} forms={forms} theme={theme} highlight={highlight} onChange={canEdit ? setDoc : undefined} />
        </div>
        {canEdit && tenant ? (
          <div className="h-full w-full shrink-0 lg:w-[340px]">
            <WorkflowAiAssistPanel
              tenant={tenant}
              workflowId={id}
              workflowName={doc.name ?? "Workflow"}
              doc={doc}
              catalog={stepTypes}
              onApplied={(next) => {
                setDoc(next);
                setMessage("LukeBuilds updated your workflow ✓");
                setError(null);
              }}
            />
          </div>
        ) : null}
      </div>

      {tenant ? (
        <WorkflowRunsModal
          tenant={tenant}
          definitionId={id}
          doc={doc}
          canRun={def?.publishedVersion != null}
          isOpen={runsOpen}
          onClose={() => setRunsOpen(false)}
          onWatch={(instanceId) => setWatchRunId(instanceId)}
        />
      ) : null}
    </>
  );
}
