import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Copy, Download, Plus, Send, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { SIGNATURES, canWrite } from "../../lib/capabilities";
import { ApiError } from "../../lib/authApi";
import PdfView, { type PdfGeometry } from "../../components/signatures/PdfView";
import {
  createSignature,
  downloadSigned,
  getSignature,
  listSignatures,
  sendSignature,
  voidSignature,
  type SignatureAuditEvent,
  type SignatureField,
  type SignatureRequest,
  type SignatureStatus,
} from "../../lib/signaturesApi";

// Fixed signature field size in PDF points (matches the engine defaults).
const FIELD_W = 160;
const FIELD_H = 50;
const PICKER_WIDTH = 460;

const STATUS_BADGE: Record<SignatureStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  SENT: "bg-brand-50 text-brand-600 dark:bg-brand-500/15",
  VIEWED: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  SIGNED: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  COMPLETED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  VOIDED: "bg-error-50 text-error-600 dark:bg-error-500/15",
};

const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setError(null);
    try {
      setRows(await listSignatures(tenant));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load signature requests");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (isLoaded && tenant) void refresh();
  }, [isLoaded, tenant, refresh]);

  const copyLink = useCallback(
    async (row: SignatureRequest) => {
      if (!tenant) return;
      try {
        const url = await sendSignature(tenant, row.id); // idempotent: returns the existing link
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
        const blob = await downloadSigned(tenant, row.id);
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
        await voidSignature(tenant, row.id);
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
            Send a PDF for signature and track it end to end.
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

      {error && (
        <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading && rows.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-400">
            Loading signatures…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
            <p>No signature requests yet.</p>
            {canEdit && <p>Click “New request” to send your first document.</p>}
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
                {rows.map((row) => (
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

// ── New request modal: upload PDF → click to place ONE field → Create & Send ─────────

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
  const [file, setFile] = useState<File | null>(null);
  const [geom, setGeom] = useState<PdfGeometry | null>(null);
  const [field, setField] = useState<SignatureField | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const overlay = useMemo(() => {
    if (!field || !geom) return null;
    const sx = geom.cssW / geom.pdfW;
    const sy = geom.cssH / geom.pdfH;
    return (
      <div
        className="pointer-events-none absolute rounded border-2 border-brand-500 bg-brand-500/15"
        style={{ left: field.x * sx, top: field.y * sy, width: field.w * sx, height: field.h * sy }}
      />
    );
  }, [field, geom]);

  // A rotated page would misplace the stamp (the engine uses the un-rotated mediabox), so V1
  // refuses to place/sign on /Rotate ≠ 0 pages.
  const rotated = !!geom && geom.rotate % 360 !== 0;

  const placeField = (p: { cssX: number; cssY: number }) => {
    if (!geom || rotated) return;
    const pdfX = (p.cssX * geom.pdfW) / geom.cssW;
    const pdfY = (p.cssY * geom.pdfH) / geom.cssH;
    // Clamp the field SIZE to the page first, then the origin — never overflow a small page.
    const w = Math.min(FIELD_W, geom.pdfW);
    const h = Math.min(FIELD_H, geom.pdfH);
    setField({
      page: 0,
      x: clamp(pdfX - w / 2, 0, Math.max(0, geom.pdfW - w)),
      y: clamp(pdfY - h / 2, 0, Math.max(0, geom.pdfH - h)),
      w,
      h,
    });
  };

  const canSubmit =
    !!name.trim() && !!signerName.trim() && !!signerEmail.trim() && !!file && !!field && !rotated && !busy;

  const submit = async () => {
    if (!canSubmit || !file || !field) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await createSignature(tenant, file, {
        name: name.trim(),
        signerEmail: signerEmail.trim(),
        signerName: signerName.trim(),
        field,
      });
      const url = await sendSignature(tenant, created.id);
      setSignUrl(url);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={signUrl ? "Signing link ready" : "New signature request"}>
      {signUrl ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Share this link with the signer. It opens the document for signing.
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
          <Field label="Document (PDF)">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setField(null);
                setGeom(null);
              }}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-600 dark:text-gray-300"
            />
          </Field>

          {file && (
            <div>
              {rotated ? (
                <p className="mb-2 text-xs text-error-500">
                  This PDF has rotated pages, which aren’t supported yet. Please upload an unrotated document.
                </p>
              ) : (
                <p className="mb-2 text-xs text-gray-500">
                  {field ? "Field placed. Click again to move it." : "Click on the page to place the signature field."}
                </p>
              )}
              <div className="max-h-[40vh] overflow-auto rounded-lg border border-gray-200 p-2 dark:border-gray-800">
                <PdfView
                  source={file}
                  width={PICKER_WIDTH}
                  onGeometry={setGeom}
                  onClick={placeField}
                  overlay={overlay}
                />
              </div>
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
    getSignature(tenant, request.id)
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
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900"
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
