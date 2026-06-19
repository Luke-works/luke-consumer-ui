import { useEffect, useMemo, useState } from "react";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { ChevronLeft, LayoutList, Columns2, FolderTree } from "lucide-react";
import DataTable, { type ManualTable } from "../../components/tables/DataTable";
import InstanceDetail, { STATE_BADGE } from "./InstanceDetail";
import { pidOf } from "./TracePanel";
import { listForms } from "../../lib/formsApi";
import { getInstanceSummary, listInstances, STATE_LABEL, type DefinitionSummary, type FormInstance } from "../../lib/formInstancesApi";
import { isAbortError } from "../../lib/abort";

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleString() : "—");

// One server page at a time (#26). Pagination/sort/search are all server-driven.
const PAGE_SIZE = 25;

// Maps a sortable column id to the server sort field (see FormInstanceSpecs).
const SORT_FIELD: Record<string, string> = {
  form: "definitionCode",
  status: "state",
  submitted: "submittedAt",
};

function processBadge(i: FormInstance) {
  if (pidOf(i)) return <span className="inline-flex items-center gap-1 text-xs text-success-600"><span className="size-1.5 rounded-full bg-success-500" />started</span>;
  if (i.context?.processStartStatus === "FAILED") return <span className="inline-flex items-center gap-1 text-xs text-error-500"><span className="size-1.5 rounded-full bg-error-500" />failed</span>;
  return <span className="text-xs text-gray-400">—</span>;
}

type ViewMode = "list" | "split" | "definition";
type FormRow = { id: string; code: string; name: string };

const inst = createColumnHelper<FormInstance>();
const def = createColumnHelper<FormRow & { total: number; subs: number; last: number }>();

export default function InstancesPanel({ tenant, definitionCode }: { tenant: string; definitionCode?: string }) {
  const [rows, setRows] = useState<FormInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Record<string, DefinitionSummary>>({});
  const [forms, setForms] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Server-driven table controls.
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: "submitted", desc: true }]);
  const [search, setSearch] = useState("");

  const [view, setView] = useState<ViewMode>("list");
  const [selectedDef, setSelectedDef] = useState<string | null>(definitionCode ?? null);
  const [detail, setDetail] = useState<FormInstance | null>(null);

  const names = useMemo(() => Object.fromEntries(forms.map((f) => [f.code, f.name])), [forms]);
  const idByCode = useMemo(() => Object.fromEntries(forms.map((f) => [f.code, f.id])), [forms]);

  // When embedded for one definition, behave like the cockpit for that form.
  const scopedToCode = definitionCode ?? (view === "definition" ? selectedDef : null);

  const sortCol = sorting[0];
  const sortField = sortCol ? SORT_FIELD[sortCol.id] : undefined;
  const sortOrder = sortCol && sortField ? (sortCol.desc ? "desc" : "asc") : undefined;

  // Forms + per-form summary load once per tenant (independent of the page).
  useEffect(() => {
    if (!tenant) return;
    const ctl = new AbortController();
    setLoading(true);
    Promise.all([listForms(tenant, false, ctl.signal), getInstanceSummary(tenant, ctl.signal)])
      .then(([fs, sum]) => {
        setForms(fs.map((f) => ({ id: f.id, code: f.code, name: f.name })));
        setSummary(sum);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (isAbortError(e)) return; // superseded/unmounted — not a real error
        setError((e as { message?: string })?.message ?? "Couldn’t load forms.");
        setLoading(false);
      });
    return () => ctl.abort();
  }, [tenant]);

  // The instance page itself — refetched whenever a filter/sort/page changes; the
  // prior (now superseded) request is aborted so it can't render stale data (#27).
  useEffect(() => {
    if (!tenant) return;
    const ctl = new AbortController();
    listInstances(tenant, {
      definitionCode: scopedToCode ?? undefined,
      submittedOnly: !showAll,
      search: search || undefined,
      sort: sortField,
      order: sortOrder,
      firstResult: pageIndex * PAGE_SIZE,
      maxResults: PAGE_SIZE,
    }, ctl.signal)
      .then((page) => { setRows(page.items); setTotal(page.total); })
      .catch((e: unknown) => {
        if (isAbortError(e)) return;
        setError((e as { message?: string })?.message ?? "Couldn’t load instances.");
      });
    return () => ctl.abort();
  }, [tenant, scopedToCode, showAll, search, sortField, sortOrder, pageIndex]);

  // Counts come from the server rollup (#26), not by reducing the capped instance
  // page — so the cockpit totals stay correct for large tenants.
  const definitions = useMemo(
    () =>
      forms.map((f) => {
        const s = summary[f.code];
        return { ...f, total: s?.total ?? 0, subs: s?.subs ?? 0, last: s?.last ?? 0 };
      }),
    [forms, summary],
  );

  // Shared server-driven table config for the instance tables. Changing sort/search
  // resets to the first page so the user doesn't land on an out-of-range page.
  const manual: ManualTable = {
    pageIndex,
    pageSize: PAGE_SIZE,
    rowCount: total,
    onPageChange: setPageIndex,
    sorting,
    onSortingChange: (s) => { setSorting(s); setPageIndex(0); },
    search,
    onSearchChange: (q) => { setSearch(q); setPageIndex(0); },
  };

  const detailFor = (i: FormInstance, onBack?: () => void) => (
    <InstanceDetail tenant={tenant} instance={i} formName={names[i.definitionCode]} formId={idByCode[i.definitionCode]} onBack={onBack} />
  );

  const instanceColumns = (showForm: boolean) => [
    ...(showForm
      ? [inst.accessor((r) => names[r.definitionCode] ?? r.definitionCode, {
          id: "form", header: "Form",
          cell: (c) => (
            <span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{c.getValue()}</span>
              <span className="ml-2 font-mono text-xs text-gray-400">{c.row.original.definitionCode}·v{c.row.original.version}</span>
            </span>
          ),
        })]
      : []),
    inst.accessor((r) => r.id, {
      id: "id", header: "ID", enableSorting: false,
      cell: (c) => <span className="font-mono text-xs text-gray-500" title={c.getValue()}>{c.getValue().slice(0, 8)}…</span>,
    }),
    inst.accessor((r) => STATE_LABEL[r.state], {
      id: "status", header: "Status",
      cell: (c) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_BADGE[c.row.original.state]}`}>{c.getValue()}</span>,
    }),
    inst.accessor((r) => r.submittedAt ?? r.createdAt, {
      id: "submitted", header: "Submitted",
      cell: (c) => <span className="text-gray-600 dark:text-gray-300">{fmt(c.getValue())}</span>,
    }),
    inst.accessor((r) => (pidOf(r) ? "started" : r.context?.processStartStatus === "FAILED" ? "failed" : ""), {
      id: "process", header: "Process", enableSorting: false,
      cell: (c) => processBadge(c.row.original),
    }),
  ];

  const definitionColumns = [
    def.accessor((r) => r.name, {
      id: "name", header: "Form",
      cell: (c) => (
        <span>
          <span className="font-medium text-gray-800 dark:text-gray-200">{c.getValue()}</span>
          <span className="ml-2 font-mono text-xs text-gray-400">{c.row.original.code}</span>
        </span>
      ),
    }),
    def.accessor((r) => r.subs, { id: "subs", header: "Submissions", meta: { align: "right" }, cell: (c) => <span className="font-medium text-gray-700 dark:text-gray-300">{c.getValue()}</span> }),
    def.accessor((r) => r.total, { id: "total", header: "All", meta: { align: "right" }, cell: (c) => <span className="text-gray-500">{c.getValue()}</span> }),
    def.accessor((r) => r.last, { id: "last", header: "Last activity", cell: (c) => <span className="text-gray-600 dark:text-gray-300">{fmt(c.getValue() || undefined)}</span> }),
  ];

  const showAllToggle = (
    <label className="flex shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <input
        type="checkbox"
        checked={showAll}
        onChange={(e) => { setShowAll(e.target.checked); setPageIndex(0); }}
        className="size-3.5 rounded text-brand-500"
      />
      Show all states
    </label>
  );

  if (loading) return <p className="py-10 text-center text-sm text-gray-400">Loading instances…</p>;
  if (error) return <p className="py-10 text-center text-sm text-error-500">{error}</p>;

  const switchView = (v: ViewMode) => { setView(v); setDetail(null); setPageIndex(0); if (!definitionCode) setSelectedDef(null); };
  const openDef = (code: string) => { setSelectedDef(code); setPageIndex(0); };

  const VIEWS: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "list", label: "List", icon: <LayoutList className="size-4" /> },
    { key: "split", label: "Split", icon: <Columns2 className="size-4" /> },
    { key: "definition", label: "Definition", icon: <FolderTree className="size-4" /> },
  ];

  // The view switcher — hidden when embedded for a single definition.
  const switcher = definitionCode ? null : (
    <div className="mb-4 inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => switchView(v.key)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${view === v.key ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15" : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"}`}
        >
          {v.icon}{v.label}
        </button>
      ))}
    </div>
  );

  // ── LIST ───────────────────────────────────────────────────────────────────
  if (view === "list" || definitionCode) {
    return (
      <>
        {switcher}
        {detail ? (
          detailFor(detail, () => setDetail(null))
        ) : (
          <DataTable
            columns={instanceColumns(!definitionCode)}
            data={rows}
            manual={manual}
            onRowClick={setDetail}
            searchPlaceholder="Search submissions…"
            minWidth={definitionCode ? "min-w-[560px]" : "min-w-[760px]"}
            toolbar={showAllToggle}
            emptyMessage={showAll ? "No instances yet." : "No submissions yet."}
          />
        )}
      </>
    );
  }

  // ── SPLIT ──────────────────────────────────────────────────────────────────
  if (view === "split") {
    return (
      <>
        {switcher}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)]">
          <DataTable
            columns={instanceColumns(true)}
            data={rows}
            manual={manual}
            onRowClick={setDetail}
            rowClassName={(r) => (detail?.id === r.id ? "bg-brand-50/60 dark:bg-brand-500/10" : "")}
            searchPlaceholder="Search submissions…"
            minWidth="min-w-[520px]"
            toolbar={showAllToggle}
            emptyMessage={showAll ? "No instances yet." : "No submissions yet."}
          />
          <div className="lg:sticky lg:top-24">
            {detail ? detailFor(detail) : (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 text-sm text-gray-400 dark:border-gray-700">
                Select a submission to see its detail.
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── DEFINITION (Cockpit) ─────────────────────────────────────────────────────
  return (
    <>
      {switcher}
      {!selectedDef ? (
        <DataTable
          columns={definitionColumns}
          data={definitions}
          onRowClick={(d) => openDef(d.code)}
          searchPlaceholder="Search forms…"
          minWidth="min-w-[560px]"
          emptyMessage="No forms yet."
        />
      ) : detail ? (
        detailFor(detail, () => setDetail(null))
      ) : (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <button type="button" onClick={() => { setSelectedDef(null); setPageIndex(0); }} className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-gray-800 dark:hover:text-gray-200">
              <ChevronLeft className="size-4" /> Forms
            </button>
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{names[selectedDef] ?? selectedDef}</h2>
              <p className="font-mono text-xs text-gray-400">{selectedDef}</p>
            </div>
          </div>
          <DataTable
            columns={instanceColumns(false)}
            data={rows}
            manual={manual}
            onRowClick={setDetail}
            searchPlaceholder="Search submissions…"
            minWidth="min-w-[560px]"
            toolbar={showAllToggle}
            emptyMessage={showAll ? "No instances for this form yet." : "No submissions for this form yet."}
          />
        </div>
      )}
    </>
  );
}
