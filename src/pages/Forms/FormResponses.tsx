import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import { useAuth } from "../../context/AuthContext";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import {
  getInstance,
  INSTANCE_PAGE_MAX,
  listInstances,
  STATE_LABEL,
  type FormInstance,
  type InstanceState,
  type InstanceView,
} from "../../lib/formInstancesApi";
import { ChevronLeftIcon } from "../../icons";

const PAGE_SIZE = 25;

const STATE_BADGE: Record<InstanceState, string> = {
  CREATED: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  SENT: "bg-blue-50 text-blue-600 dark:bg-blue-500/15",
  OPENED: "bg-blue-50 text-blue-600 dark:bg-blue-500/15",
  IN_PROGRESS: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  SUBMITTED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  PROCESSED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  EXPIRED: "bg-gray-100 text-gray-400 dark:bg-white/10",
  CANCELLED: "bg-error-50 text-error-500 dark:bg-error-500/15",
};

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleString() : "—");

export default function FormResponses() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;

  const [rows, setRows] = useState<FormInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InstanceView | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    if (!tenant || !code) return;
    let active = true;
    setLoading(true);
    listInstances(tenant, { definitionCode: code, firstResult: pageIndex * PAGE_SIZE, maxResults: PAGE_SIZE })
      .then((page) => { if (active) { setRows(page.items); setTotal(page.total); setLoading(false); } })
      .catch((e: unknown) => { if (active) { setError((e as { message?: string })?.message ?? "Couldn’t load responses."); setLoading(false); } });
    return () => { active = false; };
  }, [tenant, code, pageIndex]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const to = Math.min((pageIndex + 1) * PAGE_SIZE, total);

  const openView = async (id: string) => {
    if (!tenant) return;
    setViewLoading(true);
    try {
      setSelected(await getInstance(tenant, id));
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn’t load the response.");
    } finally {
      setViewLoading(false);
    }
  };

  const [exporting, setExporting] = useState(false);

  // Export every response, not just the current page — page through the server in
  // max-size chunks (the list is now paginated, #26).
  const exportCsv = async () => {
    if (!tenant || !code) return;
    setExporting(true);
    try {
      const all: FormInstance[] = [];
      for (let first = 0; ; first += INSTANCE_PAGE_MAX) {
        const page = await listInstances(tenant, { definitionCode: code, firstResult: first, maxResults: INSTANCE_PAGE_MAX });
        all.push(...page.items);
        if (all.length >= page.total || page.items.length === 0) break;
      }
      const blob = new Blob([toCsv(all)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${code}-responses.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn’t export responses.");
    } finally {
      setExporting(false);
    }
  };

  if (!tenant || !code) return null;

  const initialValues = selected ? { ...(selected.instance.prefill ?? {}), ...(selected.instance.data ?? {}) } : {};

  return (
    <>
      <PageMeta title="Responses | Lukeflow" description="Form responses." />
      <div className="mx-auto max-w-[920px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate("/forms")}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <ChevronLeftIcon className="size-5" />Forms
          </button>
          {total > 0 && (
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4">
            <h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">Responses</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-mono">{code}</span> · {total} total
            </p>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Loading responses…</p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-error-500">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No responses yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Submitted</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 pr-4 font-medium">By</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                      <td className="py-2.5 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_BADGE[r.state]}`}>{STATE_LABEL[r.state]}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300">{fmt(r.submittedAt)}</td>
                      <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400">{fmt(r.createdAt)}</td>
                      <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400">{r.createdBy ? r.createdBy.replace(/^workos:/, "") : "—"}</td>
                      <td className="py-2.5 text-right">
                        <button type="button" onClick={() => openView(r.id)} className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pageCount > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
                  <span>Showing {from}–{to} of {total}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                      disabled={pageIndex === 0}
                      aria-label="Previous page"
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <span className="px-2">Page {pageIndex + 1} of {pageCount}</span>
                    <button
                      type="button"
                      onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={pageIndex + 1 >= pageCount}
                      aria-label="Next page"
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={!!selected || viewLoading} onClose={() => setSelected(null)} className="mx-4 max-h-[90vh] w-full max-w-[680px] overflow-y-auto">
        <div className="p-6 sm:p-8">
          {viewLoading && !selected ? (
            <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
          ) : selected ? (
            <>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Response</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_BADGE[selected.instance.state]}`}>{STATE_LABEL[selected.instance.state]}</span>
              </div>
              <FormRenderer schema={selected.schema} initialValues={initialValues} readOnly />
            </>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

// Flatten responses to CSV: a column per field key seen across rows.
function toCsv(rows: FormInstance[]): string {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.data ?? {}))));
  const esc = (v: unknown) => {
    const s = v != null && typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["id", "status", "submittedAt", ...keys];
  const lines = [header.map(esc).join(",")];
  for (const r of rows) {
    const data = r.data ?? {};
    const cells = [
      r.id,
      r.state,
      r.submittedAt ? new Date(r.submittedAt).toISOString() : "",
      ...keys.map((k) => data[k]),
    ];
    lines.push(cells.map(esc).join(","));
  }
  return lines.join("\n");
}
