import { useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { Columns2, FileText, Inbox as InboxIcon, LayoutList } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import DataTable, { type ManualTable } from "../../components/tables/DataTable";
import { Modal } from "../../components/ui/modal";
import { useAuth } from "../../context/AuthContext";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import TaskAttachments from "../../components/documents/TaskAttachments";
import { completeTask, getInbox, INBOX_PAGE_MAX, type InboxTask } from "../../lib/formInboxApi";
import { getInstance, type InstanceView } from "../../lib/formInstancesApi";
import { listForms } from "../../lib/formsApi";
import { isAbortError } from "../../lib/abort";

/** A form definition that has open tasks, with how many (for the inbox's Forms column). */
type FormGroup = { code: string; name: string; count: number };

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleString() : "—");
const who = (a?: string | null) => (a ? a.replace(/^workos:/, "") : null);

const PAGE_SIZE = 25;
// Sortable column id → server sort field (see FormInboxController.applyOrder).
const SORT_FIELD: Record<string, string> = { task: "name", created: "created", assignee: "assignee" };

type ViewMode = "table" | "split";
const VIEW_KEY = "lk.inbox.view";
const col = createColumnHelper<InboxTask>();

// The reviewer's inbox: open user tasks (e.g. "Review Submission") for the
// tenant. View as a sortable table (open each in a modal) or as an Outlook-style
// split — a task list on the left, the submission preview on the right.
export default function FormInbox() {
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;

  const [tasks, setTasks] = useState<InboxTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server-driven table controls (shared by both views).
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created", desc: true }]);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Split view "by Form Definition": the selected form filter (null = all forms) and a
  // code→name map so the Forms column shows friendly names instead of raw codes.
  const [formFilter, setFormFilter] = useState<string | null>(null);
  const [formNames, setFormNames] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || "table",
  );
  const [selected, setSelected] = useState<InboxTask | null>(null);
  const [view, setView] = useState<InstanceView | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Task ids we've completed but the server list may still return for a beat
  // (completion can lag). We suppress these from refetches until the server drops them.
  const completedRef = useRef<Set<string>>(new Set());

  const sortCol = sorting[0];
  const sortField = sortCol ? SORT_FIELD[sortCol.id] : undefined;
  const sortOrder = sortCol && sortField ? (sortCol.desc ? "desc" : "asc") : undefined;

  const setViewMode = (m: ViewMode) => {
    setMode(m);
    localStorage.setItem(VIEW_KEY, m);
    // Leaving table mode closes the modal; entering it closes the split preview.
    setSelected(null);
    setView(null);
  };

  useEffect(() => {
    if (!tenant) return;
    const ctl = new AbortController();
    setLoading(true);
    // Split view groups by form, so it loads all open tasks (up to the cap) at once and
    // filters/paginates client-side; table view stays server-paged.
    const splitting = mode === "split";
    getInbox(tenant, {
      firstResult: splitting ? 0 : pageIndex * PAGE_SIZE,
      maxResults: splitting ? INBOX_PAGE_MAX : PAGE_SIZE,
      search: search || undefined,
      sort: sortField,
      order: sortOrder,
    }, ctl.signal)
      .then((p) => {
        // Drop just-completed tasks the server hasn't dropped yet; prune ids it
        // already has (so the suppression set self-heals and can't grow stale).
        const done = completedRef.current;
        done.forEach((id) => { if (!p.items.some((t) => t.taskId === id)) done.delete(id); });
        const items = p.items.filter((t) => !done.has(t.taskId));
        setTasks(items);
        setTotal(Math.max(0, p.total - (p.items.length - items.length)));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (isAbortError(e)) return; // superseded poll/filter — not a real error
        setError((e as { message?: string })?.message ?? "Couldn’t load the inbox.");
        setLoading(false);
      });
    return () => ctl.abort();
  }, [tenant, mode, pageIndex, sortField, sortOrder, search, reloadKey]);

  // Form code → name (for the Forms column labels). Loaded once per tenant; the inbox
  // still works if this fails (labels fall back to the raw code).
  useEffect(() => {
    if (!tenant) return;
    let active = true;
    listForms(tenant)
      .then((fs) => {
        if (!active) return;
        const m: Record<string, string> = {};
        for (const f of fs) m[f.code] = f.name;
        setFormNames(m);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [tenant]);

  // Forms that have open tasks (+counts), derived from the loaded tasks, and the tasks
  // visible under the current form filter. Both drive the split view's three panes.
  const formGroups = useMemo<FormGroup[]>(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      const code = t.definitionCode ?? "";
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count, name: formNames[code] || code || "Ungrouped" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, formNames]);

  const visibleTasks = useMemo(
    () => (formFilter == null ? tasks : tasks.filter((t) => (t.definitionCode ?? "") === formFilter)),
    [tasks, formFilter],
  );

  const openTask = async (task: InboxTask) => {
    setSelected(task);
    setView(null);
    if (!tenant || !task.instanceId) return;
    setViewLoading(true);
    try {
      setView(await getInstance(tenant, task.instanceId));
    } catch {
      /* show task without the submission */
    } finally {
      setViewLoading(false);
    }
  };

  // Outlook behaviour: keep a task open in split view. Opens the first visible task on
  // entry, and re-selects when the current one drops out of view (e.g. the form filter
  // changed or its task was completed); clears when nothing is visible.
  useEffect(() => {
    if (mode !== "split") return;
    if (selected && visibleTasks.some((t) => t.taskId === selected.taskId)) return;
    if (visibleTasks.length > 0) void openTask(visibleTasks[0]);
    else { setSelected(null); setView(null); }
    // openTask is stable enough here; selecting sets `selected` so this won't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, visibleTasks, selected]);

  const complete = async () => {
    if (!tenant || !selected) return;
    const completedId = selected.taskId;
    setCompleting(true);
    try {
      await completeTask(tenant, completedId);
      // Optimistically remove the completed task so it leaves the list AND the
      // reading pane at once — don't wait on (and don't get re-added by) the
      // server list, which can still return it for a beat.
      completedRef.current.add(completedId);
      const remaining = tasks.filter((t) => t.taskId !== completedId);
      setTasks(remaining);
      setTotal((n) => Math.max(0, n - 1));
      if (mode === "split") {
        // Advance to the next task in the SAME form filter (Outlook-style).
        const remainingVisible = visibleTasks.filter((t) => t.taskId !== completedId);
        if (remainingVisible.length > 0) {
          const pos = Math.max(0, visibleTasks.findIndex((t) => t.taskId === completedId));
          void openTask(remainingVisible[Math.min(pos, remainingVisible.length - 1)]);
        } else {
          setSelected(null);
          setView(null);
        }
      } else {
        setSelected(null);
        setView(null);
      }
      setReloadKey((k) => k + 1); // reconcile with the server
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn’t complete the task.");
    } finally {
      setCompleting(false);
    }
  };

  // Server-driven config for the table view; split view drives the same state.
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

  const columns = [
    col.accessor((t) => t.name ?? "Task", {
      id: "task",
      header: "Task",
      cell: (c) => <span className="font-medium text-gray-800 dark:text-gray-200">{c.getValue()}</span>,
    }),
    col.accessor((t) => t.created ?? 0, {
      id: "created",
      header: "Created",
      cell: (c) => <span className="text-gray-500 dark:text-gray-400">{fmt(c.getValue())}</span>,
    }),
    col.accessor((t) => who(t.assignee) ?? "Unassigned", {
      id: "assignee",
      header: "Assignee",
      cell: (c) => (
        <span className={c.getValue() === "Unassigned" ? "text-gray-400" : "text-gray-500 dark:text-gray-400"}>{c.getValue()}</span>
      ),
    }),
    col.display({
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { align: "right" },
      cell: (c) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); void openTask(c.row.original); }} className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">Review</button>
      ),
    }),
  ];

  if (!tenant) return null;

  return (
    <>
      <PageMeta title="Form Inbox | Lukeflow" description="Tasks waiting on you." />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Form Inbox</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Tasks from form submissions that are waiting to be reviewed.</p>
        </div>
        <ViewToggle mode={mode} onChange={setViewMode} />
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">Loading inbox…</p>
      ) : error ? (
        <p className="py-10 text-center text-sm text-error-500">{error}</p>
      ) : mode === "table" ? (
        <DataTable
          columns={columns}
          data={tasks}
          manual={manual}
          onRowClick={(t) => void openTask(t)}
          searchPlaceholder="Search tasks…"
          minWidth="min-w-[560px]"
          emptyMessage="Your inbox is empty — no tasks waiting."
        />
      ) : (
        <SplitInbox
          tenant={tenant}
          tasks={visibleTasks}
          groups={formGroups}
          formFilter={formFilter}
          onFormFilter={setFormFilter}
          total={total}
          search={search}
          onSearchChange={(q) => { setSearch(q); setPageIndex(0); }}
          selected={selected}
          onSelect={(t) => void openTask(t)}
          view={view}
          viewLoading={viewLoading}
          completing={completing}
          onComplete={complete}
        />
      )}

      {/* Table mode opens each task in a modal. */}
      <Modal
        isOpen={mode === "table" && !!selected}
        onClose={() => { setSelected(null); setView(null); }}
        className="mx-4 max-h-[90vh] w-full max-w-[680px] overflow-y-auto"
      >
        {selected ? (
          <div className="p-6 sm:p-8">
            <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">{selected.name ?? "Task"}</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Review the submission, then complete the task.</p>
            <ReviewBody view={view} viewLoading={viewLoading} tenant={tenant} task={selected} />
            <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <Button size="sm" onClick={complete} disabled={completing}>{completing ? "Completing…" : "Complete task"}</Button>
              <Button size="sm" variant="outline" onClick={() => { setSelected(null); setView(null); }}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

// ── Segmented List / Split toggle ──────────────────────────────────────────
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const btn = (m: ViewMode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onChange(m)}
      aria-pressed={mode === m}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
        mode === m
          ? "bg-white text-brand-600 shadow-theme-xs dark:bg-white/10 dark:text-brand-400"
          : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-800 dark:bg-white/[0.03]">
      {btn("table", "List", <LayoutList className="size-4" />)}
      {btn("split", "Split", <Columns2 className="size-4" />)}
    </div>
  );
}

// A row in the Forms column: form name + open-task count, highlighted when selected.
function FormRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
        active
          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
          : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
      }`}
    >
      <FileText className={`size-4 shrink-0 ${active ? "text-brand-500" : "text-gray-400"}`} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs ${
        active ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200" : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
      }`}>{count}</span>
    </button>
  );
}

// ── Outlook-style three-pane: Forms │ Tasks │ Submission ────────────────────
function SplitInbox({
  tenant, tasks, groups, formFilter, onFormFilter, total, search, onSearchChange,
  selected, onSelect, view, viewLoading, completing, onComplete,
}: {
  tenant: string | null;
  tasks: InboxTask[];
  groups: FormGroup[];
  formFilter: string | null;
  onFormFilter: (code: string | null) => void;
  total: number;
  search: string;
  onSearchChange: (search: string) => void;
  selected: InboxTask | null;
  onSelect: (t: InboxTask) => void;
  view: InstanceView | null;
  viewLoading: boolean;
  completing: boolean;
  onComplete: () => void;
}) {
  // Local input value, debounced into the server search so each keystroke doesn't refetch.
  const [input, setInput] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => { if (input !== search) onSearchChange(input); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // Move focus to the reading pane when a task is selected — incl. the auto-select of
  // the first task on entering split view — so keyboard/AT users land on the content (#34).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selected) headingRef.current?.focus();
    // Key on the task id only — re-focus on a *different* task, not every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.taskId]);

  const allCount = groups.reduce((n, g) => n + g.count, 0);
  const truncated = total > allCount; // more open tasks than we loaded for grouping

  return (
    <div className="grid gap-4 lg:grid-cols-[210px_300px_1fr]">
      {/* Forms pane — pick a form definition to scope the task list. Vertical rail on large
          screens; on small screens it collapses to the dropdown inside the task pane. */}
      <div className="hidden max-h-[72vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] lg:flex">
        <div className="border-b border-gray-100 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-800">Forms</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          <FormRow label="All forms" count={allCount} active={formFilter == null} onClick={() => onFormFilter(null)} />
          {groups.map((g) => (
            <FormRow key={g.code || "ungrouped"} label={g.name} count={g.count} active={formFilter === g.code} onClick={() => onFormFilter(g.code)} />
          ))}
        </div>
      </div>

      {/* Task pane */}
      <div className="flex max-h-[72vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {/* Form filter dropdown — only on small screens (the Forms rail is hidden there). */}
        <div className="border-b border-gray-100 p-3 lg:hidden dark:border-gray-800">
          <select
            value={formFilter ?? "__all__"}
            onChange={(e) => onFormFilter(e.target.value === "__all__" ? null : e.target.value)}
            aria-label="Filter by form"
            className="h-9 w-full rounded-lg border border-gray-200 bg-transparent px-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-800 dark:text-white/90"
          >
            <option value="__all__">All forms ({allCount})</option>
            {groups.map((g) => (
              <option key={g.code || "ungrouped"} value={g.code}>{g.name} ({g.count})</option>
            ))}
          </select>
        </div>
        <div className="border-b border-gray-100 p-3 dark:border-gray-800">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search tasks…"
            className="h-9 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
          />
        </div>
        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
          {tasks.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{search ? "No matches." : "No tasks here."}</p>
          ) : (
            tasks.map((t) => {
              const active = selected?.taskId === t.taskId;
              return (
                <button
                  key={t.taskId}
                  type="button"
                  onClick={() => onSelect(t)}
                  className={`flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition ${
                    active ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <span className={`text-sm font-medium ${active ? "text-brand-700 dark:text-brand-300" : "text-gray-800 dark:text-gray-200"}`}>{t.name ?? "Task"}</span>
                  <span className="text-xs text-gray-400">{fmt(t.created)}</span>
                  <span className="text-xs text-gray-400">{who(t.assignee) ?? "Unassigned"}</span>
                </button>
              );
            })
          )}
        </div>
        {truncated && (
          <div className="border-t border-gray-100 px-3 py-2 text-center text-xs text-gray-400 dark:border-gray-800">
            Showing the first {allCount} of {total} open tasks.
          </div>
        )}
      </div>

      {/* Reading pane — bounded to the same height as the list so its (potentially tall)
          submission scrolls WITHIN this pane instead of growing the page and dragging the
          list along with it. Header stays fixed; only the body below scrolls. */}
      <div className="flex max-h-[72vh] min-h-[60vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <div className="min-w-0">
                <h2 ref={headingRef} tabIndex={-1} className="truncate text-base font-semibold text-gray-800 outline-none dark:text-white/90">{selected.name ?? "Task"}</h2>
                <p className="text-xs text-gray-400">Created {fmt(selected.created)} · {who(selected.assignee) ?? "Unassigned"}</p>
              </div>
              <Button size="sm" onClick={onComplete} disabled={completing}>{completing ? "Completing…" : "Complete task"}</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <ReviewBody view={view} viewLoading={viewLoading} tenant={tenant} task={selected} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/10">
              <InboxIcon className="size-6" />
            </span>
            <p className="mt-3 text-sm text-gray-400">Select a task to review its submission.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Shared submission view used by both the modal and the reading pane. Renders the read-only submission
// plus its classified Attachments section (Task vs Process) for the selected task.
function ReviewBody({
  view, viewLoading, tenant, task,
}: {
  view: InstanceView | null;
  viewLoading: boolean;
  tenant: string | null;
  task: InboxTask | null;
}) {
  // The form instance id — from the loaded submission if present, else the inbox task. Attachments
  // render off this independently of whether the submission view itself loaded.
  const ownerEntityId = view?.instance.id ?? task?.instanceId ?? null;
  const initialValues = view ? { ...(view.instance.prefill ?? {}), ...(view.instance.data ?? {}) } : {};
  return (
    <>
      {viewLoading ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading submission…</p>
      ) : view ? (
        <FormRenderer schema={view.schema} initialValues={initialValues} readOnly />
      ) : (
        <p className="py-6 text-center text-sm text-gray-400">No linked submission to display.</p>
      )}
      {tenant && ownerEntityId ? (
        <TaskAttachments tenant={tenant} ownerEntityId={ownerEntityId} taskId={task?.taskId} />
      ) : null}
    </>
  );
}
