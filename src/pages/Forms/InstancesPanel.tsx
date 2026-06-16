import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ChevronLeft, LayoutList, Columns2, FolderTree } from "lucide-react";
import DataTable from "../../components/tables/DataTable";
import InstanceDetail, { STATE_BADGE } from "./InstanceDetail";
import { pidOf } from "./TracePanel";
import { listForms } from "../../lib/formsApi";
import { listInstances, STATE_LABEL, type FormInstance, type InstanceState } from "../../lib/formInstancesApi";

// A "submission" = the recipient actually submitted. CREATED/SENT/OPENED are
// pre-submission and hidden by default.
const SUBMISSION_STATES = new Set<InstanceState>(["SUBMITTED", "PROCESSED"]);
const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleString() : "—");
const isSub = (i: FormInstance) => SUBMISSION_STATES.has(i.state);

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
  const [forms, setForms] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [view, setView] = useState<ViewMode>("list");
  const [selectedDef, setSelectedDef] = useState<string | null>(definitionCode ?? null);
  const [detail, setDetail] = useState<FormInstance | null>(null);

  const names = useMemo(() => Object.fromEntries(forms.map((f) => [f.code, f.name])), [forms]);
  const idByCode = useMemo(() => Object.fromEntries(forms.map((f) => [f.code, f.id])), [forms]);

  useEffect(() => {
    if (!tenant) return;
    let active = true;
    setLoading(true);
    Promise.all([listInstances(tenant), listForms(tenant)])
      .then(([insts, fs]) => {
        if (!active) return;
        setRows(insts);
        setForms(fs.map((f) => ({ id: f.id, code: f.code, name: f.name })));
        setLoading(false);
      })
      .catch((e: unknown) => { if (active) { setError((e as { message?: string })?.message ?? "Couldn’t load instances."); setLoading(false); } });
    return () => { active = false; };
  }, [tenant]);

  // When embedded for one definition, behave like the cockpit for that form.
  const scopedToCode = definitionCode ?? (view === "definition" ? selectedDef : null);
  const baseRows = useMemo(
    () => (scopedToCode ? rows.filter((r) => r.definitionCode === scopedToCode) : rows),
    [rows, scopedToCode],
  );
  const visible = useMemo(() => (showAll ? baseRows : baseRows.filter(isSub)), [baseRows, showAll]);
  const hiddenCount = baseRows.length - visible.length;

  const definitions = useMemo(
    () =>
      forms.map((f) => {
        const mine = rows.filter((r) => r.definitionCode === f.code);
        return {
          ...f,
          total: mine.length,
          subs: mine.filter(isSub).length,
          last: mine.reduce((m, r) => Math.max(m, r.submittedAt ?? r.createdAt), 0),
        };
      }),
    [forms, rows],
  );

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
      id: "id", header: "ID",
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
      id: "process", header: "Process",
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
      <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-3.5 rounded text-brand-500" />
      Show all states{!showAll && hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
    </label>
  );

  if (loading) return <p className="py-10 text-center text-sm text-gray-400">Loading instances…</p>;
  if (error) return <p className="py-10 text-center text-sm text-error-500">{error}</p>;

  const switchView = (v: ViewMode) => { setView(v); setDetail(null); if (!definitionCode) setSelectedDef(null); };

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
            data={visible}
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
            data={visible}
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
          onRowClick={(d) => setSelectedDef(d.code)}
          searchPlaceholder="Search forms…"
          minWidth="min-w-[560px]"
          emptyMessage="No forms yet."
        />
      ) : detail ? (
        detailFor(detail, () => setDetail(null))
      ) : (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <button type="button" onClick={() => setSelectedDef(null)} className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-gray-800 dark:hover:text-gray-200">
              <ChevronLeft className="size-4" /> Forms
            </button>
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{names[selectedDef] ?? selectedDef}</h2>
              <p className="font-mono text-xs text-gray-400">{selectedDef}</p>
            </div>
          </div>
          <DataTable
            columns={instanceColumns(false)}
            data={visible}
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
