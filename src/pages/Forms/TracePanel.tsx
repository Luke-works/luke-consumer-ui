import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/button/Button";
import {
  getProcessTrace,
  retryProcess,
  STATE_LABEL,
  type FormInstance,
  type ProcessTrace,
} from "../../lib/formInstancesApi";

const ctxStr = (i: FormInstance, k: string): string | null => {
  const v = i.context?.[k];
  return typeof v === "string" && v ? v : null;
};
export const pidOf = (i: FormInstance) => ctxStr(i, "processInstanceId");

// The end-to-end story for one submission: submitted → process start → live trace.
export default function TracePanel({ tenant, instance, formName }: { tenant: string; instance: FormInstance; formName?: string }) {
  const [inst, setInst] = useState<FormInstance>(instance);
  const pid = pidOf(inst);
  const [trace, setTrace] = useState<ProcessTrace | null>(null);
  const [loading, setLoading] = useState(!!pid);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryErr, setRetryErr] = useState<string | null>(null);

  useEffect(() => {
    if (!pid) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    getProcessTrace(tenant, pid)
      .then((t) => { if (active) { setTrace(t); setLoading(false); } })
      .catch((e: unknown) => { if (active) { setError((e as { message?: string })?.message ?? "Couldn’t load the trace."); setLoading(false); } });
    return () => { active = false; };
  }, [tenant, pid]);

  const submitted = inst.state === "SUBMITTED" || inst.state === "PROCESSED";
  const canRetry = !pid && submitted;

  const onRetry = async () => {
    setRetrying(true);
    setRetryErr(null);
    try {
      const r = await retryProcess(tenant, inst.id);
      const ctx: Record<string, unknown> = { ...(inst.context ?? {}) };
      ctx.processStartStatus = r.status;
      if (r.processInstanceId) ctx.processInstanceId = r.processInstanceId;
      if (r.error) ctx.processStartError = r.error; else delete ctx.processStartError;
      setTrace(null);
      setError(null);
      setInst({ ...inst, context: ctx });
    } catch (e) {
      setRetryErr((e as { message?: string })?.message ?? "Retry failed.");
    } finally {
      setRetrying(false);
    }
  };

  const steps = useMemo(() => buildSteps(inst, pid, trace, loading, error), [inst, pid, trace, loading, error]);

  return (
    <div className="p-6 sm:p-8">
      <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Submission trace</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        {formName ?? inst.definitionCode} · <span className="font-mono text-xs">{inst.id}</span>
      </p>
      <ol className="relative space-y-5 border-l border-gray-200 pl-6 dark:border-gray-700">
        {steps.map((s, i) => (
          <li key={i} className="relative">
            <span className={`absolute -left-[27px] flex size-4 items-center justify-center rounded-full ring-4 ring-white dark:ring-gray-900 ${s.dot}`} />
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.title}</p>
            {s.detail ? <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{s.detail}</p> : null}
          </li>
        ))}
      </ol>
      {canRetry ? (
        <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <Button size="sm" onClick={onRetry} disabled={retrying}>{retrying ? "Retrying…" : "Retry process start"}</Button>
          <span className="text-xs text-gray-400">Re-fires the process and shows the exact result (or error).</span>
          {retryErr ? <span className="text-sm text-error-500">{retryErr}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

type Step = { title: string; detail?: string; dot: string };
const DOT_DONE = "bg-success-500";
const DOT_ACTIVE = "bg-brand-500";
const DOT_IDLE = "bg-gray-300 dark:bg-gray-600";
const DOT_WARN = "bg-amber-400";
const DOT_ERROR = "bg-error-500";

function buildSteps(instance: FormInstance, pid: string | null, trace: ProcessTrace | null, loading: boolean, error: string | null): Step[] {
  const steps: Step[] = [];
  const submitted = instance.state === "SUBMITTED" || instance.state === "PROCESSED";

  steps.push({
    title: submitted ? "Submitted" : `Status: ${STATE_LABEL[instance.state]}`,
    detail: submitted ? new Date(instance.submittedAt ?? instance.createdAt).toLocaleString() : "Not submitted yet — no process is started until submission.",
    dot: submitted ? DOT_DONE : DOT_IDLE,
  });

  const startStatus = ctxStr(instance, "processStartStatus");
  const startError = ctxStr(instance, "processStartError");

  if (pid) {
    steps.push({ title: "Process started", detail: `Instance ${pid}`, dot: DOT_DONE });
  } else if (startStatus === "FAILED") {
    steps.push({ title: "Process start failed", detail: startError ?? "The start call to the engine failed.", dot: DOT_ERROR });
    return steps;
  } else {
    steps.push({
      title: "No process started",
      detail: submitted
        ? "Best-effort — the start may have been skipped (engine not configured for process start). Retryable."
        : "A process starts only once the form is submitted.",
      dot: submitted ? DOT_WARN : DOT_IDLE,
    });
    return steps;
  }

  if (loading) { steps.push({ title: "Checking the process…", dot: DOT_ACTIVE }); return steps; }
  if (error) { steps.push({ title: "Couldn’t read the process", detail: error, dot: DOT_WARN }); return steps; }
  if (!trace || !trace.found) { steps.push({ title: "Process not found", detail: "It may have completed and been cleaned up.", dot: DOT_IDLE }); return steps; }

  if (trace.hasIncident && trace.incidents?.length) {
    for (const inc of trace.incidents) {
      steps.push({ title: `Incident: ${inc.type ?? "error"}`, detail: inc.message ?? undefined, dot: DOT_ERROR });
    }
  }

  if (trace.landedInUserTask && trace.activeTasks?.length) {
    for (const t of trace.activeTasks) {
      const who = t.assignee
        ? `assigned to ${t.assignee.replace(/^workos:/, "")}`
        : t.candidateGroups.length
          ? `candidate group: ${t.candidateGroups.join(", ")}`
          : "unassigned — anyone with access can pick it up";
      steps.push({ title: `Waiting in user task: ${t.name ?? "task"}`, detail: who, dot: DOT_ACTIVE });
    }
    return steps;
  }

  if (trace.ended || trace.state === "COMPLETED") {
    steps.push({ title: "Process completed", detail: trace.endTime ? new Date(trace.endTime).toLocaleString() : undefined, dot: DOT_DONE });
  } else {
    steps.push({ title: "Process running", detail: "No open user task right now.", dot: DOT_ACTIVE });
  }
  return steps;
}
