import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Copy, Download, Plus, Send, Trash2, Users, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { SIGNATURES, canWrite } from "../../lib/capabilities";
import {
  ApiError,
  parseSignatureSchema,
  recipientSignUrl,
  signatureDefinitions,
  signatureInstances,
  type InstanceRecipient,
  type SignatureInstance,
  type StoredSignatureDefinition,
} from "../../lib/signaturesApi";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  published: "bg-success-50 text-success-600 dark:bg-success-500/15",
  archived: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
};
const INSTANCE_BADGE: Record<string, string> = {
  CREATED: "bg-gray-100 text-gray-600 dark:bg-white/10",
  SENT: "bg-brand-50 text-brand-600 dark:bg-brand-500/15",
  OPENED: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  IN_PROGRESS: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  COMPLETED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  CANCELLED: "bg-error-50 text-error-600 dark:bg-error-500/15",
  EXPIRED: "bg-error-50 text-error-600 dark:bg-error-500/15",
  DECLINED: "bg-error-50 text-error-600 dark:bg-error-500/15",
};
const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");

export default function SignaturesList() {
  const navigate = useNavigate();
  const { session, isLoaded } = useAuth();
  const tenant = session?.tenant ?? null;
  const canEdit = canWrite(session, SIGNATURES);

  const [rows, setRows] = useState<StoredSignatureDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [campaignFor, setCampaignFor] = useState<StoredSignatureDefinition | null>(null);
  const [instancesFor, setInstancesFor] = useState<StoredSignatureDefinition | null>(null);

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setError(null);
    try {
      setRows(await signatureDefinitions.list(tenant));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load definitions");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (isLoaded && tenant) void refresh();
  }, [isLoaded, tenant, refresh]);

  const create = async () => {
    if (!tenant || !newName.trim() || creating) return;
    setCreating(true);
    try {
      const d = await signatureDefinitions.create(tenant, { name: newName.trim() });
      setShowCreate(false);
      setNewName("");
      navigate(`/signatures/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (d: StoredSignatureDefinition) => {
    if (!tenant) return;
    if (!window.confirm(`Delete "${d.name}"?`)) return;
    try {
      await signatureDefinitions.softDelete(tenant, d.id);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Signatures</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Design a signature document, get legal sign-off, then send it for signature.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            <Plus className="size-4" /> New definition
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading && rows.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
            <p>No signature definitions yet.</p>
            {canEdit && <p>Click “New definition” to design your first document.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-400 dark:border-gray-800">
                <tr>
                  <th className="px-5 py-3 font-medium">Definition</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Version</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((d) => (
                  <tr key={d.id} className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]" onClick={() => navigate(`/signatures/${d.id}`)}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{d.name}</div>
                      <div className="font-mono text-xs text-gray-400">{d.code}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_BADGE[d.status]}`}>{d.status}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {d.publishedVersion ? `v${d.publishedVersion} live` : d.latestVersion ? `v${d.latestVersion} draft` : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{fmtDate(d.updatedAt)}</td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        <IconBtn title="Campaigns" onClick={() => setInstancesFor(d)}>
                          <Users className="size-4" />
                        </IconBtn>
                        {canEdit && d.status === "published" && (
                          <IconBtn title="Send for signature" onClick={() => setCampaignFor(d)}>
                            <Send className="size-4" />
                          </IconBtn>
                        )}
                        {canEdit && (
                          <IconBtn title="Delete" danger onClick={() => remove(d)}>
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

      {showCreate && (
        <Modal title="Name your definition" onClose={() => setShowCreate(false)}>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Definition name</label>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Mutual NDA"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
          />
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">Cancel</button>
            <button onClick={create} disabled={!newName.trim() || creating} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
              {creating ? "Creating…" : "Create & design"}
            </button>
          </div>
        </Modal>
      )}

      {campaignFor && tenant && (
        <CampaignModal tenant={tenant} def={campaignFor} onClose={() => setCampaignFor(null)} />
      )}
      {instancesFor && tenant && (
        <InstancesDrawer tenant={tenant} def={instancesFor} onClose={() => setInstancesFor(null)} />
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} className={`rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 ${danger ? "hover:text-error-500" : "hover:text-brand-500"}`}>
      {children}
    </button>
  );
}

// ── Campaign (start instance) ─────────────────────────────────────────────────────────
function CampaignModal({ tenant, def, onClose }: { tenant: string; def: StoredSignatureDefinition; onClose: () => void }) {
  const schema = useMemo(() => parseSignatureSchema(def.schema), [def.schema]);
  const [recipients, setRecipients] = useState<Record<string, { name: string; email: string }>>(
    () => Object.fromEntries(schema.signers.map((s) => [s.id, { name: "", email: "" }])),
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<InstanceRecipient[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const ready =
    schema.signers.every((s) => recipients[s.id]?.name.trim() && recipients[s.id]?.email.trim()) &&
    schema.variables.filter((v) => v.required).every((v) => values[v.key]?.trim());

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const detail = await signatureInstances.startCampaign(tenant, {
        definitionCode: def.code,
        recipients: schema.signers.map((s) => ({ signerId: s.id, name: recipients[s.id]!.name.trim(), email: recipients[s.id]!.email.trim() })),
        values,
      });
      setDone(detail.recipients);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={done ? "Signing links ready" : `Send “${def.name}”`} onClose={onClose} wide>
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Share each recipient's link. Sequential signers are notified in order.</p>
          {done.map((r) => {
            const url = recipientSignUrl(r.signToken);
            return (
              <div key={r.signerId} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                <div className="mb-1 text-sm font-medium text-gray-800 dark:text-gray-100">{r.name} <span className="text-xs text-gray-400">({r.email})</span></div>
                <div className="flex items-center gap-2">
                  <input readOnly value={url} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-2 py-1.5 font-mono text-xs dark:border-gray-700 dark:bg-white/5" />
                  <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(r.signerId); setTimeout(() => setCopied(null), 1500); }} className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">
                    {copied === r.signerId ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex justify-end"><button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">Done</button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recipients</h3>
            <div className="space-y-3">
              {schema.signers.map((s) => (
                <div key={s.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">{s.label} <span className="text-xs text-gray-400">· order {s.order}</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Full name" value={recipients[s.id]?.name ?? ""} onChange={(e) => setRecipients((r) => ({ ...r, [s.id]: { ...r[s.id]!, name: e.target.value } }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5" />
                    <input type="email" placeholder="email@example.com" value={recipients[s.id]?.email ?? ""} onChange={(e) => setRecipients((r) => ({ ...r, [s.id]: { ...r[s.id]!, email: e.target.value } }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {schema.variables.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Data attributes</h3>
              <div className="grid grid-cols-2 gap-2">
                {schema.variables.map((v) => (
                  <label key={v.key} className="block">
                    <span className="mb-1 block text-xs text-gray-500">{v.label}{v.required && <span className="text-error-500"> *</span>}</span>
                    <input value={values[v.key] ?? ""} onChange={(e) => setValues((s) => ({ ...s, [v.key]: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5" />
                  </label>
                ))}
              </div>
            </div>
          )}

          {err && <p className="text-sm text-error-500">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">Cancel</button>
            <button onClick={submit} disabled={!ready || busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
              <Send className="size-4" /> {busy ? "Sending…" : "Start campaign"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Instances (campaign tracking) ──────────────────────────────────────────────────────
function InstancesDrawer({ tenant, def, onClose }: { tenant: string; def: StoredSignatureDefinition; onClose: () => void }) {
  const [rows, setRows] = useState<SignatureInstance[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Record<string, InstanceRecipient[]>>({});

  useEffect(() => {
    let active = true;
    signatureInstances
      .listInstances(tenant, { definitionCode: def.code })
      .then((r) => active && setRows(r))
      .catch((e: unknown) => active && setErr(e instanceof ApiError ? e.message : "Failed to load campaigns"));
    return () => { active = false; };
  }, [tenant, def.code]);

  const toggle = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!recipients[id]) {
      try {
        const d = await signatureInstances.getInstance(tenant, id);
        setRecipients((m) => ({ ...m, [id]: d.recipients }));
      } catch { /* ignore */ }
    }
  };

  const download = async (inst: SignatureInstance) => {
    try {
      const blob = await signatureInstances.downloadSigned(tenant, inst.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inst.name || "signed"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Campaigns</h2>
            <p className="text-xs text-gray-400">{def.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><X className="size-5" /></button>
        </div>
        {err && <p className="text-sm text-error-500">{err}</p>}
        {!rows && !err && <p className="text-sm text-gray-400">Loading…</p>}
        {rows && rows.length === 0 && <p className="text-sm text-gray-400">No campaigns started yet.</p>}
        <div className="space-y-2">
          {rows?.map((inst) => (
            <div key={inst.id} className="rounded-lg border border-gray-200 dark:border-gray-800">
              <button onClick={() => toggle(inst.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{inst.name}</div>
                  <div className="text-xs text-gray-400">{fmtDate(inst.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {inst.state === "COMPLETED" && inst.sealStatus === "SEALED" && (
                    <span onClick={(e) => { e.stopPropagation(); void download(inst); }} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-white/10" title="Download signed PDF">
                      <Download className="size-4" />
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${INSTANCE_BADGE[inst.state] ?? ""}`}>{inst.state}</span>
                </div>
              </button>
              {openId === inst.id && (
                <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-800">
                  {(recipients[inst.id] ?? []).map((r) => (
                    <div key={r.signerId} className="flex items-center justify-between gap-2 py-1 text-xs">
                      <span className="text-gray-600 dark:text-gray-300">{r.name} <span className="text-gray-400">({r.state})</span></span>
                      <button onClick={() => navigator.clipboard.writeText(recipientSignUrl(r.signToken))} className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-600">
                        <Copy className="size-3" /> link
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── shared modal ───────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 ${wide ? "max-w-2xl" : "max-w-md"}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
