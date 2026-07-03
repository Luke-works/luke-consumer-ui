// Client for the Form Inbox (core-engine /api/form-inbox) — the open user tasks
// for the tenant (e.g. "Review Submission"), each linked to its submission.
import { authed, tenantInit } from "./authApi";

const seg = (s: string) => encodeURIComponent(s);

export type InboxTask = {
  taskId: string;
  name?: string;
  created?: number;
  assignee?: string | null;
  processInstanceId?: string;
  processDefinitionKey?: string;
  /** The FormInstance id this task is about (the process business key). */
  instanceId?: string | null;
  /** The form definition (code) this task's submission belongs to — for grouping the
   *  inbox by form. Absent on older engines (falls back to "ungrouped" in the UI). */
  definitionCode?: string | null;
};

/** A page of inbox tasks plus the full server-side total (#26). */
export type InboxPage = { items: InboxTask[]; total: number; firstResult: number; maxResults: number };

/** Hard server page cap (FormInboxController.MAX_PAGE). */
export const INBOX_PAGE_MAX = 200;

/** A page of open user tasks for the tenant, paged + sorted + searchable server-side
 *  (#26). `search` matches task name or assignee; `sort` is created|name|assignee.
 *
 *  Tolerant of both response shapes so a deploy window (new UI / old engine, or vice
 *  versa) can't crash the inbox: a bare array (pre-#26 backend) is wrapped into a page. */
export async function getInbox(
  tenant: string,
  opts: { firstResult?: number; maxResults?: number; search?: string; sort?: string; order?: "asc" | "desc" } = {},
  signal?: AbortSignal,
): Promise<InboxPage> {
  const qs = new URLSearchParams();
  if (opts.search) qs.set("search", opts.search);
  if (opts.sort) qs.set("sort", opts.sort);
  if (opts.order) qs.set("order", opts.order);
  if (opts.firstResult != null) qs.set("firstResult", String(opts.firstResult));
  qs.set("maxResults", String(opts.maxResults ?? INBOX_PAGE_MAX));
  const body = await authed<InboxPage | InboxTask[]>(`/api/form-inbox?${qs.toString()}`, tenantInit(tenant, { signal }));
  if (Array.isArray(body)) {
    return { items: body, total: body.length, firstResult: 0, maxResults: body.length };
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === "number" ? body.total : items.length,
    firstResult: body?.firstResult ?? 0,
    maxResults: body?.maxResults ?? items.length,
  };
}

export function completeTask(tenant: string, taskId: string): Promise<{ ok: boolean; taskId: string }> {
  return authed(`/api/form-inbox/${seg(taskId)}/complete`, tenantInit(tenant, { method: "POST" }));
}
