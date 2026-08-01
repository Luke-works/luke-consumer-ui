import { useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { Columns2, FileText, Inbox as InboxIcon, LayoutList, Mail } from "lucide-react";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import DataTable, { type ManualTable } from "../../components/tables/DataTable";
import { Modal } from "../../components/ui/modal";
import { useAuth } from "../../context/AuthContext";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import TaskAttachments from "../../components/documents/TaskAttachments";
import {
  completeTask, getInbox, INBOX_PAGE_MAX, taskKind, type InboxTask, type InboxTaskKind,
} from "../../lib/formInboxApi";
import { getInboundEmail, type InboundEmail } from "../../lib/emailIntakeApi";
import EmailMessageView from "../../components/email/EmailMessageView";
import { getInstance, type InstanceView } from "../../lib/formInstancesApi";
import { listForms } from "../../lib/formsApi";
import { isAbortError } from "../../lib/abort";

/**
 * One source in the split view's master list, with its open tasks.
 *
 * A source is a form definition OR an inbound email box — the inbox is the tenant's whole work
 * queue, not only its submissions. Forms are listed even with zero tasks (this page is where an
 * author looks for them); email boxes are derived from the tasks themselves, because a box with
 * nothing waiting is inbox noise and is managed on the Email page instead.
 */
type InboxGroup = { key: string; kind: InboxTaskKind; code: string; name: string; tasks: InboxTask[] };

/** The source group a task belongs to. Kept beside the group builder so the two can't drift. */
function groupKeyOf(t: InboxTask): string {
  return taskKind(t) === "email" ? `email:${t.emailBox ?? ""}` : `form:${t.definitionCode ?? ""}`;
}

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

  // Split view groups by form definition: code→name for ALL the tenant's forms, so forms
  // with no open tasks still appear in the list.
  const [formNames, setFormNames] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || "table",
  );
  const [selected, setSelected] = useState<InboxTask | null>(null);
  const [view, setView] = useState<InstanceView | null>(null);
  /** The received email behind an EMAIL task. Mutually exclusive with `view`. */
  const [emailView, setEmailView] = useState<InboundEmail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Task ids we've completed but the server list may still return for a beat
  // (completion can lag). We suppress these from refetches until the server drops them.
  const completedRef = useRef<Set<string>>(new Set());

  const sortCol = sorting[0];
  const sortField = sortCol ? SORT_FIELD[sortCol.id] : undefined;
  const sortOrder = sortCol && sortField ? (sortCol.desc ? "desc" : "asc") : undefined;

  // One place to drop the selection AND both content panes. Split across call sites, it is
  // exactly the kind of thing that leaves a stale email body under a newly-selected form task.
  const clearSelection = () => {
    setSelected(null);
    setView(null);
    setEmailView(null);
  };

  const setViewMode = (m: ViewMode) => {
    setMode(m);
    localStorage.setItem(VIEW_KEY, m);
    // Leaving table mode closes the modal; entering it closes the split preview.
    clearSelection();
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

  // All the tenant's forms (code → name), so the split view can list every form definition
  // — including ones with no open tasks. Loaded once per tenant; falls back to the raw code.
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

  // Load whatever the task is ABOUT. Branching on kind is the fix for the original defect:
  // every task used to be fetched as a form submission, so an email task asked the form API for
  // "email-inbox-<id>", got nothing back, and opened blank.
  const openTask = async (task: InboxTask) => {
    setSelected(task);
    setView(null);
    setEmailView(null);
    if (!tenant) return;

    const kind = taskKind(task);
    const id = kind === "email" ? task.emailMessageId : task.instanceId;
    if (!id) return;

    setViewLoading(true);
    try {
      if (kind === "email") setEmailView(await getInboundEmail(tenant, id));
      else setView(await getInstance(tenant, id));
    } catch {
      /* show the task without its content rather than failing the whole pane */
    } finally {
      setViewLoading(false);
    }
  };

  // Outlook behaviour: keep a task open in split view. Opens the first visible task on
  // entry, and re-selects when the current one drops out of view (e.g. the form filter
  // changed or its task was completed); clears when nothing is visible.
  useEffect(() => {
    if (mode !== "split") return;
    if (selected && tasks.some((t) => t.taskId === selected.taskId)) return;
    if (tasks.length > 0) void openTask(tasks[0]!); // length > 0 checked
    else clearSelection();
    // openTask is stable enough here; selecting sets `selected` so this won't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tasks, selected]);

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
      if (mode === "split" && remaining.length > 0) {
        // Advance to the next task (Outlook-style) rather than clearing the pane.
        const pos = Math.max(0, tasks.findIndex((t) => t.taskId === completedId));
        void openTask(remaining[Math.min(pos, remaining.length - 1)]!); // remaining.length > 0, index clamped in-bounds
      } else {
        clearSelection();
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
      <PageMeta title="Inbox | Lukeflow" description="Work waiting on you." />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Inbox</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Everything waiting on you — form submissions to review and email to triage.</p>
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
          tasks={tasks}
          formNames={formNames}
          total={total}
          search={search}
          onSearchChange={(q) => { setSearch(q); setPageIndex(0); }}
          selected={selected}
          onSelect={(t) => void openTask(t)}
          view={view}
          emailView={emailView}
          viewLoading={viewLoading}
          completing={completing}
          onComplete={complete}
        />
      )}

      {/* Table mode opens each task in a modal. */}
      <Modal
        isOpen={mode === "table" && !!selected}
        onClose={() => clearSelection()}
        className="mx-4 flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 overflow-y-auto"
      >
        {selected ? (
          <div className="p-6 sm:p-8">
            <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">{selected.name ?? "Task"}</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Review it, then complete the task.</p>
            <ReviewBody view={view} emailView={emailView} viewLoading={viewLoading} tenant={tenant} task={selected} />
            <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <Button size="sm" onClick={complete} disabled={completing}>{completing ? "Completing…" : "Complete task"}</Button>
              <Button size="sm" variant="outline" onClick={() => clearSelection()}>Cancel</Button>
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

// ── Master/detail: form definitions (with nested tasks) │ submission ────────
function SplitInbox({
  tenant, tasks, formNames, total, search, onSearchChange,
  selected, onSelect, view, emailView, viewLoading, completing, onComplete,
}: {
  tenant: string | null;
  tasks: InboxTask[];
  formNames: Record<string, string>;
  total: number;
  search: string;
  onSearchChange: (search: string) => void;
  selected: InboxTask | null;
  onSelect: (t: InboxTask) => void;
  view: InstanceView | null;
  emailView: InboundEmail | null;
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

  // Move focus to the reading pane when a task is selected (incl. the auto-select on entry)
  // so keyboard/AT users land on the content (#34).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selected) headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.taskId]);

  // Every form the tenant has (from formNames) PLUS any form a task references, each with its
  // open tasks — so forms with zero tasks still appear. Tasks with no form → "Ungrouped".
  const groups = useMemo<InboxGroup[]>(() => {
    const formTasks = new Map<string, InboxTask[]>();
    const emailTasks = new Map<string, InboxTask[]>();
    const push = (m: Map<string, InboxTask[]>, k: string, t: InboxTask) => {
      const arr = m.get(k);
      if (arr) arr.push(t); else m.set(k, [t]);
    };
    for (const t of tasks) {
      if (taskKind(t) === "email") push(emailTasks, t.emailBox ?? "", t);
      else push(formTasks, t.definitionCode ?? "", t);
    }

    const codes = new Set<string>([...Object.keys(formNames), ...formTasks.keys()].filter((c) => c !== ""));
    const forms: InboxGroup[] = [...codes]
      .map((code) => ({
        key: `form:${code}`, kind: "form" as const, code,
        name: formNames[code] || code, tasks: formTasks.get(code) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const emails: InboxGroup[] = [...emailTasks.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((box) => ({
        key: `email:${box}`, kind: "email" as const, code: box,
        name: box || "Inbound email", tasks: emailTasks.get(box)!,
      }));

    // Email first. It is the time-sensitive queue, and putting it after an alphabetical list of
    // every form is how a "unified" inbox quietly stays a forms inbox.
    const list: InboxGroup[] = [...emails, ...forms];
    if (formTasks.has("")) {
      list.push({ key: "form:", kind: "form", code: "", name: "Ungrouped", tasks: formTasks.get("")! });
    }
    return list;
  }, [tasks, formNames]);

  // The form whose tasks fill the lower section: the user's pick, else the selected task's
  // form, else the first form that has any tasks.
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const firstWithTasks = groups.find((g) => g.tasks.length > 0);
  const activeKey = activeSource ?? (selected ? groupKeyOf(selected) : null)
    ?? firstWithTasks?.key ?? groups[0]?.key ?? null;
  const activeGroup = groups.find((g) => g.key === activeKey) ?? null;
  const activeTasks = activeGroup?.tasks ?? [];

  const truncated = total > tasks.length; // more open tasks than we loaded for grouping

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(420px,520px)_1fr]">
      {/* Left pane — two side-by-side sections: forms (left) + the picked form's tasks (right). */}
      <div className="flex max-h-[72vh] min-h-[60vh] overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {/* Section 1 — form definitions (name + id). Click one to load its tasks on the right. */}
        <div className="flex w-[150px] shrink-0 flex-col border-r border-gray-200 dark:border-gray-800">
          <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-800">Sources</div>
          <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
            {groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Nothing yet.</p>
            ) : (
              groups.map((g) => {
                const on = g.key === activeKey;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setActiveSource(g.key)}
                    aria-pressed={on}
                    title={g.name}
                    className={`flex w-full items-center gap-1.5 px-2.5 py-2 text-left transition ${
                      on ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    {/* An icon, not a text label: at 150px the two source kinds must be
                        distinguishable without spending horizontal space the name needs. */}
                    {g.kind === "email" ? (
                      <Mail className="size-3.5 shrink-0 text-gray-400" aria-hidden />
                    ) : (
                      <FileText className="size-3.5 shrink-0 text-gray-400" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-medium ${on ? "text-brand-700 dark:text-brand-300" : "text-gray-800 dark:text-gray-200"}`}>{g.name}</span>
                      <span className="block truncate font-mono text-[11px] text-gray-400">
                        {g.kind === "email" ? "Inbound email" : g.code || "—"}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs ${
                      g.tasks.length ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" : "bg-gray-100 text-gray-400 dark:bg-white/10"
                    }`}>{g.tasks.length}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Section 2 — tasks for the picked form. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tasks</span>
            {activeGroup && <span className="min-w-0 flex-1 truncate text-xs text-gray-400">· {activeGroup.name}</span>}
          </div>
          <div className="border-b border-gray-100 p-2.5 dark:border-gray-800">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search tasks…"
              className="h-9 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
            />
          </div>
          <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
            {activeTasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">{search ? "No matches." : "No open tasks here."}</p>
            ) : (
              activeTasks.map((t) => {
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
                    <span className="text-xs text-gray-400">{fmt(t.created)} · {who(t.assignee) ?? "Unassigned"}</span>
                  </button>
                );
              })
            )}
          </div>
          {truncated && (
            <div className="border-t border-gray-100 px-3 py-2 text-center text-xs text-gray-400 dark:border-gray-800">
              Showing the first {tasks.length} of {total} open tasks.
            </div>
          )}
        </div>
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
              <ReviewBody view={view} emailView={emailView} viewLoading={viewLoading} tenant={tenant} task={selected} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/10">
              <InboxIcon className="size-6" />
            </span>
            <p className="mt-3 text-sm text-gray-400">Select a task to review it.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Shared submission view used by both the modal and the reading pane. Renders the read-only submission
// plus its classified Attachments section (Task vs Process) for the selected task.
function ReviewBody({
  view, emailView, viewLoading, tenant, task,
}: {
  view: InstanceView | null;
  emailView: InboundEmail | null;
  viewLoading: boolean;
  tenant: string | null;
  task: InboxTask | null;
}) {
  const kind = task ? taskKind(task) : "form";

  if (kind === "email") {
    if (viewLoading) return <p className="py-8 text-center text-sm text-gray-400">Loading message…</p>;
    if (emailView) return <EmailMessageView email={emailView} from={task?.emailFrom} />;
    // Reached when intake stored the envelope but not the body — i.e. mail received before this
    // feature shipped. Say so, rather than showing an empty pane that reads like a bug.
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        This message was received before its content was stored, so there is nothing to show.
      </p>
    );
  }

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
