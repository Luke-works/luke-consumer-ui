import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { PhoneOutgoing, PhoneIncoming, Plus, Settings as SettingsIcon } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { useDialog } from "../../hooks/useDialog";
import { PHONE, canWrite } from "../../lib/capabilities";
import {
  isCallActive,
  listCalls,
  startOutboundCall,
  type CallStatus,
  type PhoneCall,
} from "../../lib/phoneApi";
import PhoneSettingsDrawer from "../../components/phone/PhoneSettingsDrawer";

const STATUS_BADGE: Record<CallStatus, string> = {
  QUEUED: "bg-gray-100 text-gray-600 dark:bg-white/10",
  RINGING: "bg-brand-50 text-brand-600 dark:bg-brand-500/15",
  IN_PROGRESS: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  ENDED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  FAILED: "bg-error-50 text-error-600 dark:bg-error-500/15",
};
const STATUS_LABEL: Record<CallStatus, string> = {
  QUEUED: "Queued",
  RINGING: "Ringing",
  IN_PROGRESS: "In progress",
  ENDED: "Ended",
  FAILED: "Failed",
};
const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");
const fmtCost = (c?: number | null) => (c == null ? "—" : `$${c.toFixed(3)}`);

export default function Phone() {
  const navigate = useNavigate();
  const { session, isLoaded } = useAuth();
  const tenant = session?.tenant ?? null;
  const canEdit = canWrite(session, PHONE);

  const [rows, setRows] = useState<PhoneCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCall, setShowCall] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setError(null);
    try {
      const page = await listCalls(tenant, { maxResults: 100 });
      setRows(page.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load calls");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (isLoaded && tenant) void refresh();
  }, [isLoaded, tenant, refresh]);

  // Live polling: while any call is active (queued/ringing/in-progress), re-fetch
  // every few seconds so statuses, transcripts and costs update without a reload.
  const hasActive = rows.some((c) => isCallActive(c.status));
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!hasActive || !tenant) return;
    const t = window.setInterval(() => void refreshRef.current(), 4000);
    return () => window.clearInterval(t);
  }, [hasActive, tenant]);

  return (
    <>
      <PageMeta title="Phone | Lukeflow" description="Inbound & outbound voice calls via Vapi." />
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Phone &amp; voice</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Place and receive AI voice calls through Vapi. Inbound calls and call outcomes appear here live.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
            >
              <SettingsIcon className="size-4" /> Settings
            </button>
            {canEdit && (
              <button
                onClick={() => setShowCall(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                <Plus className="size-4" /> Place call
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {loading && rows.length === 0 ? (
            <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
              <p>No calls yet.</p>
              {canEdit && <p>Click “Place call” to start an outbound call, or point a Vapi number at this workspace for inbound.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[820px] w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase text-gray-400 dark:border-gray-800">
                  <tr>
                    <th className="px-5 py-3 font-medium">Call</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Started</th>
                    <th className="px-5 py-3 font-medium">Cost</th>
                    <th className="px-5 py-3 font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                      onClick={() => navigate(`/phone/${c.id}`)}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {c.direction === "OUTBOUND" ? (
                            <PhoneOutgoing className="size-4 text-brand-500" />
                          ) : (
                            <PhoneIncoming className="size-4 text-success-500" />
                          )}
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">{c.customerNumber || "—"}</div>
                            <div className="text-xs text-gray-400">{c.direction === "OUTBOUND" ? "Outbound" : "Inbound"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_BADGE[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{fmtDateTime(c.startedAt ?? c.createdAt)}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtCost(c.cost)}</td>
                      <td className="px-5 py-3 max-w-[260px] truncate text-gray-500">{c.summary || (c.errorMessage ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCall && tenant && (
        <PlaceCallModal
          tenant={tenant}
          onClose={() => setShowCall(false)}
          onPlaced={() => {
            setShowCall(false);
            void refresh();
          }}
        />
      )}
      {showSettings && tenant && (
        <PhoneSettingsDrawer tenant={tenant} canEdit={canEdit} onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}

// ── Place outbound call ──────────────────────────────────────────────────────
function PlaceCallModal({ tenant, onClose, onPlaced }: { tenant: string; onClose: () => void; onPlaced: () => void }) {
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = /^\+[1-9]\d{6,15}$/.test(number.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await startOutboundCall(tenant, { customerNumber: number.trim() });
      onPlaced();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not place the call");
    } finally {
      setBusy(false);
    }
  };

  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Place a call" tabIndex={-1} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl outline-none dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Place a call</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          The call is placed from your default number with your default assistant (set these in Settings).
        </p>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Phone number (E.164)</label>
        <input
          autoFocus
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="+14155551234"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
        />
        {!valid && number.length > 0 && <p className="mt-1 text-xs text-amber-600">Use international format, e.g. +14155551234</p>}
        {err && <p className="mt-3 text-sm text-error-500">{err}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">Cancel</button>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            <PhoneOutgoing className="size-4" /> {busy ? "Calling…" : "Call"}
          </button>
        </div>
      </div>
    </div>
  );
}
