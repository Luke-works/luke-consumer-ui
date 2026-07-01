import type { WorkflowDoc } from "@lukeflow/workflow-core";
import { AlertTriangle, Play, RefreshCw, RotateCcw, Radio, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import {
  cancelRun,
  getRun,
  listRuns,
  retryRun,
  startRun,
  type WorkflowRunDetail,
  type WorkflowRunSummary,
} from "../../lib/workflowApi";

const STATE_BADGE: Record<string, string> = {
  ACTIVE: "bg-brand-50 text-brand-600 dark:bg-brand-500/15",
  COMPLETED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  SUSPENDED: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  EXTERNALLY_TERMINATED: "bg-gray-100 text-gray-500 dark:bg-white/10",
  INTERNALLY_TERMINATED: "bg-gray-100 text-gray-500 dark:bg-white/10",
};
const fmt = (t?: number | null) => (t ? new Date(t).toLocaleString() : "—");

/** Inspect (and start) test runs of a published workflow — Pillar 4a. */
export default function WorkflowRunsModal({
  tenant,
  definitionId,
  doc,
  canRun,
  isOpen,
  onClose,
  onWatch,
}: {
  tenant: string;
  definitionId: string;
  doc: WorkflowDoc | null;
  canRun: boolean;
  isOpen: boolean;
  onClose: () => void;
  /** Watch this run live on the canvas (Pillar 4c). */
  onWatch?: (instanceId: string) => void;
}) {
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<WorkflowRunDetail | null>(null);
  const [acting, setActing] = useState(false);
  const [varsText, setVarsText] = useState("");
  const [showVars, setShowVars] = useState(false);

  // Map a BPMN activity id back to its authoring node label (ids are equal by construction).
  const label = useCallback(
    (activityId?: string | null) => {
      if (!activityId) return "—";
      if (activityId === "start" || activityId === "__start") return "Trigger";
      if (activityId === "end") return "End";
      const n = doc?.nodes?.find((x) => x.id === activityId);
      return n?.name || activityId;
    },
    [doc],
  );

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    try {
      setRuns(await listRuns(tenant, definitionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [tenant, definitionId]);

  useEffect(() => {
    if (isOpen) {
      setSelected(null);
      void refresh();
    }
  }, [isOpen, refresh]);

  const onStart = async () => {
    if (!tenant || starting) return;
    setStarting(true);
    setError(null);
    try {
      await startRun(tenant, definitionId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start run");
    } finally {
      setStarting(false);
    }
  };

  const openDetail = async (id: string) => {
    setSelected(null);
    setVarsText("");
    setShowVars(false);
    try {
      setSelected(await getRun(tenant, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run");
    }
  };

  const parseVars = (): Record<string, unknown> | undefined => {
    const t = varsText.trim();
    if (!t) return undefined;
    try {
      const v = JSON.parse(t);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
    } catch {
      throw new Error("Variables must be valid JSON, e.g. { \"amount\": 5 }");
    }
  };

  const onRetry = async () => {
    if (!selected || acting) return;
    setActing(true);
    setError(null);
    try {
      const next = await retryRun(tenant, selected.instanceId, parseVars());
      setSelected(next);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setActing(false);
    }
  };

  const onCancel = async () => {
    if (!selected || acting) return;
    setActing(true);
    setError(null);
    try {
      const next = await cancelRun(tenant, selected.instanceId);
      setSelected(next);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setActing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-4 max-h-[90vh] w-full max-w-[720px] overflow-y-auto">
      <div className="p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Runs</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Start a test run and inspect its status.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" startIcon={<RefreshCw className="size-4" />} onClick={() => void refresh()}>
              Refresh
            </Button>
            {canRun ? (
              <Button size="sm" startIcon={<Play className="size-4" />} onClick={onStart} disabled={starting}>
                {starting ? "Starting…" : "Test run"}
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/15">{error}</div>
        ) : null}

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            No runs yet. {canRun ? "Start a test run above." : "Publish the workflow to run it."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Run</th>
                  <th className="px-4 py-2.5 font-medium">State</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => void openDetail(r.id)}
                    className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 ${selected?.instanceId === r.id ? "bg-brand-50/50 dark:bg-brand-500/10" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-300">{r.businessKey || r.id.slice(0, 12)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE[r.state] ?? STATE_BADGE.EXTERNALLY_TERMINATED}`}>
                        {r.state}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{fmt(r.startTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected?.found ? (
          <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">
              Run detail <span className="font-mono text-xs font-normal text-gray-400">{selected.instanceId.slice(0, 12)}</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selected.state} · started {fmt(selected.startTime)}
              {selected.ended ? ` · ended ${fmt(selected.endTime)}` : ""}
            </p>

            {!selected.ended ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" startIcon={<RotateCcw className="size-3.5" />} onClick={onRetry} disabled={acting}>
                  Retry
                </Button>
                <button
                  type="button"
                  onClick={() => setShowVars((v) => !v)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  {showVars ? "Hide variables" : "Retry with variables…"}
                </button>
                {onWatch ? (
                  <Button size="sm" variant="outline" startIcon={<Radio className="size-3.5" />} onClick={() => { onWatch(selected.instanceId); onClose(); }}>
                    Watch on canvas
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" startIcon={<XCircle className="size-3.5" />} onClick={onCancel} disabled={acting}>
                  Cancel run
                </Button>
              </div>
            ) : null}
            {showVars && !selected.ended ? (
              <textarea
                value={varsText}
                onChange={(e) => setVarsText(e.target.value)}
                rows={2}
                placeholder='{ "amount": 5 }'
                className="mt-2 w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 font-mono text-xs text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90"
              />
            ) : null}

            {selected.currentActivityIds.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase text-gray-400">Currently at</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selected.currentActivityIds.map((a) => (
                    <span key={a} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                      {label(a)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {selected.activeTasks.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase text-gray-400">Waiting on tasks</p>
                <ul className="mt-1 space-y-1">
                  {selected.activeTasks.map((t) => (
                    <li key={t.id} className="text-sm text-gray-700 dark:text-gray-200">
                      {t.name || label(t.activityId)}
                      {t.assignee ? <span className="text-gray-400"> · {t.assignee}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.incidents.length > 0 ? (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase text-error-500">
                  <AlertTriangle className="size-3.5" /> Incidents
                </p>
                <ul className="mt-1 space-y-1.5">
                  {selected.incidents.map((i) => (
                    <li key={i.id} className="rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-500/10 dark:text-error-300">
                      <span className="font-medium">{label(i.activityId)}</span>: {i.message || i.type}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-400">No incidents.</p>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
