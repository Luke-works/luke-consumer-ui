import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { getCall, isCallActive, type CallStatus, type PhoneCall } from "../../lib/phoneApi";

const STATUS_BADGE: Record<CallStatus, string> = {
  QUEUED: "bg-gray-100 text-gray-600 dark:bg-white/10",
  RINGING: "bg-brand-50 text-brand-600 dark:bg-brand-500/15",
  IN_PROGRESS: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  ENDED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  FAILED: "bg-error-50 text-error-600 dark:bg-error-500/15",
};
const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");
const fmtCost = (c?: number | null) => (c == null ? "—" : `$${c.toFixed(3)}`);

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, isLoaded } = useAuth();
  const tenant = session?.tenant ?? null;

  const [call, setCall] = useState<PhoneCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tenant || !id) return;
    try {
      setCall(await getCall(tenant, id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load call");
    } finally {
      setLoading(false);
    }
  }, [tenant, id]);

  useEffect(() => {
    if (isLoaded && tenant) void refresh();
  }, [isLoaded, tenant, refresh]);

  // Poll while the call is still live so the transcript/recording/summary fill in.
  const active = call ? isCallActive(call.status) : false;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!active || !tenant) return;
    const t = window.setInterval(() => void refreshRef.current(), 4000);
    return () => window.clearInterval(t);
  }, [active, tenant]);

  return (
    <>
      <PageMeta title="Call | Lukeflow" description="Call detail" />
      <div className="mx-auto max-w-3xl">
        <button onClick={() => navigate("/phone")} className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white">
          <ArrowLeft className="size-4" /> Back to calls
        </button>

        {error && (
          <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">{error}</div>
        )}
        {loading && !call ? (
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : call ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {call.direction === "OUTBOUND" ? (
                    <PhoneOutgoing className="size-5 text-brand-500" />
                  ) : (
                    <PhoneIncoming className="size-5 text-success-500" />
                  )}
                  <div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">{call.customerNumber || "—"}</div>
                    <div className="text-xs text-gray-400">{call.direction === "OUTBOUND" ? "Outbound" : "Inbound"} call</div>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase ${STATUS_BADGE[call.status]}`}>{call.status}</span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <Field label="Started" value={fmtDateTime(call.startedAt ?? call.createdAt)} />
                <Field label="Ended" value={fmtDateTime(call.endedAt)} />
                <Field label="Cost" value={fmtCost(call.cost)} />
                <Field label="Ended reason" value={call.endedReason ?? "—"} />
                <Field label="Assistant" value={call.assistantId ?? "—"} mono />
                <Field label="Vapi call id" value={call.vapiCallId ?? "—"} mono />
              </dl>
              {call.errorMessage && <p className="mt-3 text-sm text-error-500">{call.errorMessage}</p>}
            </div>

            {call.recordingUrl && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recording</h3>
                <audio controls src={call.recordingUrl} className="w-full" />
              </div>
            )}

            {call.summary && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Summary</h3>
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{call.summary}</p>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Transcript</h3>
              {call.transcript ? (
                <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm text-gray-700 dark:text-gray-200">{call.transcript}</pre>
              ) : (
                <p className="text-sm text-gray-400">{active ? "Transcript will appear once the call ends." : "No transcript available."}</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className={`mt-0.5 text-gray-800 dark:text-gray-100 ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
    </div>
  );
}
