import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Copy, Download, Plus, Search, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { DocumentViewer } from "@lukeflow/sign-react";
import { useAuth } from "../../context/AuthContext";
import { SIGNATURES, canWrite } from "../../lib/capabilities";
import {
  ApiError,
  DEFAULT_FIELD_SIZE,
  fieldToCssRect,
  isRotated,
  placeField,
  signaturesClient,
  type PdfGeometry,
  type SignatureAuditEvent,
  type SignatureField,
  type SignatureRequest,
  type SignatureStatus,
  type VerificationMethod,
} from "../../lib/signaturesApi";

const STATUS_BADGE: Record<SignatureStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  SENT: "bg-brand-50 text-brand-600 dark:bg-brand-500/15",
  VIEWED: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  SIGNED: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  COMPLETED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  VOIDED: "bg-error-50 text-error-600 dark:bg-error-500/15",
};

type StatusFilter = "ALL" | SignatureStatus;
const FILTERS: StatusFilter[] = ["ALL", "DRAFT", "SENT", "VIEWED", "COMPLETED", "VOIDED"];

const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");

export default function SignaturesList() {
  const { session, isLoaded } = useAuth();
  const tenant = session?.tenant ?? null;
  const canEdit = canWrite(session, SIGNATURES);

  const [rows, setRows] = useState<SignatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<SignatureRequest | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setError(null);
    try {
      setRows(await signaturesClient.listSignatures(tenant));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load signature requests");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (isLoaded && tenant) void refresh();
  }, [isLoaded, tenant, refresh]);

  const stats = useMemo(() => {
    const awaiting = (s: SignatureStatus) => s === "SENT" || s === "VIEWED" || s === "SIGNED";
    return {
      total: rows.length,
      awaiting: rows.filter((r) => awaiting(r.status)).length,
      completed: rows.filter((r) => r.status === "COMPLETED").length,
      drafts: rows.filter((r) => r.status === "DRAFT").length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "ALL" && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.signerName.toLowerCase().includes(q) ||
        r.signerEmail.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  const copyLink = useCallback(
    async (row: SignatureRequest) => {
      if (!tenant) return;
      try {
        const url = await signaturesClient.sendSignature(tenant, row.id); // idempotent
        await navigator.clipboard.writeText(url);
        setCopiedId(row.id);
        setTimeout(() => setCopiedId(null), 1500);
        void refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to copy link");
      }
    },
    [tenant, refresh],
  );

  const download = useCallback(
    async (row: SignatureRequest) => {
      if (!tenant) return;
      try {
        const blob = await signaturesClient.downloadSigned(tenant, row.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${row.code || "signed"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Download failed");
      }
    },
    [tenant],
  );

  const doVoid = useCallback(
    async (row: SignatureRequest) => {
      if (!tenant) return;
      if (!window.confirm(`Void "${row.name}"? The signing link will stop working.`)) return;
      try {
        await signaturesClient.voidSignature(tenant, row.id);
        void refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Void failed");
      }
    },
    [tenant, refresh],
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Signatures</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Send a PDF for signature and track every request end to end.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            <Plus className="size-4" /> New request
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Awaiting signature" value={stats.awaiting} tone="amber" />
        <StatCard label="Completed" value={stats.completed} tone="success" />
        <StatCard label="Drafts" value={stats.drafts} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">
          {error}
        </div>
      )}

      {/* Toolbar: filter pills + search */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                filter === f
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20"
              }`}
            >
              {f === "ALL" ? "All" : f.toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, signer, or code"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-white/5 sm:w-72"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading && rows.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-400">
            Loading signatures…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
            {rows.length === 0 ? (
              <>
                <p>No signature requests yet.</p>
                {canEdit && <p>Click “New request” to send your first document.</p>}
              </>
            ) : (
              <p>No requests match the current filter.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-400 dark:border-gray-800">
                <tr>
                  <th className="px-5 py-3 font-medium">Request</th>
                  <th className="px-5 py-3 font-medium">Signer</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3 font-medium">Retain until</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {visible.map((row) => (
                  <tr key={row.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{row.name}</div>
                      <div className="font-mono text-xs text-gray-400">{row.code}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-gray-700 dark:text-gray-200">{row.signerName}</div>
                      <div className="text-xs text-gray-400">{row.signerEmail}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_BADGE[row.status]}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {fmtDate(row.signedAt ?? row.sentAt ?? row.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{fmtDate(row.retainUntil)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100">
                        {canEdit && row.status !== "VOIDED" && row.status !== "COMPLETED" && (
                          <IconBtn
                            title={copiedId === row.id ? "Copied!" : "Copy signing link"}
                            onClick={() => copyLink(row)}
                          >
                            <Copy className="size-4" />
                          </IconBtn>
                        )}
                        {row.status === "COMPLETED" && (
                          <IconBtn title="Download signed PDF" onClick={() => download(row)}>
                            <Download className="size-4" />
                          </IconBtn>
                        )}
                        <IconBtn title="View history" onClick={() => setHistoryFor(row)}>
                          <Clock className="size-4" />
                        </IconBtn>
                        {canEdit && row.status !== "COMPLETED" && row.status !== "VOIDED" && (
                          <IconBtn title="Void" danger onClick={() => doVoid(row)}>
                            <Trash2 className="size-4" />
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && tenant && (
        <NewRequestModal
          tenant={tenant}
          onClose={() => setModalOpen(false)}
          onCreated={() => void refresh()}
        />
      )}
      {historyFor && tenant && (
        <HistoryDrawer tenant={tenant} request={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "amber" | "success" }) {
  const valueColor =
    tone === "amber" ? "text-amber-600 dark:text-amber-400" : tone === "success" ? "text-success-600 dark:text-success-500" : "text-gray-900 dark:text-white";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className={`text-2xl font-semibold ${valueColor}`}>{value}</div>
      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 ${
        danger ? "hover:text-error-500" : "hover:text-brand-500"
      }`}
    >
      {children}
    </button>
  );
}

// ── New request modal: details → upload PDF → click any page to place the field → send ──

const VERIFY_OPTIONS: { value: VerificationMethod; label: string; enabled: boolean }[] = [
  { value: "NONE", label: "No verification", enabled: true },
  { value: "EMAIL_OTP", label: "Email code (coming soon)", enabled: false },
  { value: "SMS_OTP", label: "SMS code (coming soon)", enabled: false },
];

function NewRequestModal({
  tenant,
  onClose,
  onCreated,
}: {
  tenant: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [verification, setVerification] = useState<VerificationMethod>("NONE");
  const [file, setFile] = useState<File | null>(null);
  const [field, setField] = useState<SignatureField | null>(null);
  const [rotatedErr, setRotatedErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onPlace = ({
    page,
    cssX,
    cssY,
    geometry,
  }: {
    page: number;
    cssX: number;
    cssY: number;
    geometry: PdfGeometry;
  }) => {
    if (isRotated(geometry)) {
      setRotatedErr(true);
      return;
    }
    setRotatedErr(false);
    setField(placeField(geometry, cssX, cssY, DEFAULT_FIELD_SIZE, page));
  };

  const renderOverlay = ({ page, geometry }: { page: number; geometry: PdfGeometry }) => {
    if (!field || field.page !== page) return null;
    const r = fieldToCssRect(geometry, field);
    return (
      <div
        className="pointer-events-none absolute flex items-center justify-center rounded border-2 border-brand-500 bg-brand-500/15 text-[10px] font-semibold uppercase text-brand-600"
        style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
      >
        Sign here
      </div>
    );
  };

  const canSubmit =
    !!name.trim() && !!signerName.trim() && !!signerEmail.trim() && !!file && !!field && !rotatedErr && !busy;

  const submit = async () => {
    if (!canSubmit || !file || !field) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await signaturesClient.createSignature(tenant, file, {
        name: name.trim(),
        signerEmail: signerEmail.trim(),
        signerName: signerName.trim(),
        field,
        verificationMethod: verification,
      });
      const url = await signaturesClient.sendSignature(tenant, created.id);
      setSignUrl(url);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={signUrl ? "Signing link ready" : "New signature request"} wide={!signUrl && !!file}>
      {signUrl ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Share this link with the signer. It opens the guided signing ceremony.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={signUrl}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-white/5"
            />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(signUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex justify-end">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Request name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mutual NDA"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signer name">
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
              />
            </Field>
            <Field label="Signer email">
              <input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
              />
            </Field>
          </div>
          <Field label="Identity verification">
            <div className="relative">
              <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <select
                value={verification}
                onChange={(e) => setVerification(e.target.value as VerificationMethod)}
                className="w-full appearance-none rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-white/5"
              >
                {VERIFY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} disabled={!o.enabled}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Document (PDF)">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setField(null);
                setRotatedErr(false);
              }}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-600 dark:text-gray-300"
            />
          </Field>

          {file && (
            <div>
              {rotatedErr ? (
                <p className="mb-2 text-xs text-error-500">
                  That page is rotated, which isn’t supported yet. Use a page with normal orientation.
                </p>
              ) : (
                <p className="mb-2 text-xs text-gray-500">
                  {field
                    ? "Field placed. Click anywhere to move it, or change pages to place on another page."
                    : "Click on the page where the signer should sign. Use the toolbar to change pages or zoom."}
                </p>
              )}
              <DocumentViewer source={file} onClick={onPlace} renderOverlay={renderOverlay} baseWidth={520} />
            </div>
          )}

          {err && <p className="text-sm text-error-500">{err}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="size-4" /> {busy ? "Sending…" : "Create & send"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── History drawer (IP-stamped audit trail) ─────────────────────────────────────────

function HistoryDrawer({
  tenant,
  request,
  onClose,
}: {
  tenant: string;
  request: SignatureRequest;
  onClose: () => void;
}) {
  const [audit, setAudit] = useState<SignatureAuditEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    signaturesClient
      .getSignature(tenant, request.id)
      .then((d) => active && setAudit(d.audit))
      .catch((e: unknown) => active && setErr(e instanceof ApiError ? e.message : "Failed to load history"));
    return () => {
      active = false;
    };
  }, [tenant, request.id]);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{request.name}</h2>
            <p className="font-mono text-xs text-gray-400">{request.code}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>

        {err && <p className="text-sm text-error-500">{err}</p>}
        {!audit && !err && <p className="text-sm text-gray-400">Loading history…</p>}
        {audit && audit.length === 0 && <p className="text-sm text-gray-400">No events yet.</p>}

        <ol className="space-y-3">
          {audit?.map((e, i) => (
            <li key={i} className="rounded-lg border border-gray-100 p-3 text-sm dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-white">{e.action}</span>
                <span className="text-xs text-gray-400">{e.at ? new Date(e.at).toLocaleString() : ""}</span>
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                {e.actor && <div>by {e.actor}</div>}
                {e.ipAddress && (
                  <div>
                    IP {e.ipAddress}
                    {e.ipRisk && e.ipRisk !== "CLEAN" ? ` · ${e.ipRisk}` : ""}
                    {e.geoCity || e.geoCountry ? ` · ${[e.geoCity, e.geoCountry].filter(Boolean).join(", ")}` : ""}
                  </div>
                )}
                {e.userAgent && <div className="truncate">{e.userAgent}</div>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── small shared atoms ──────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}
