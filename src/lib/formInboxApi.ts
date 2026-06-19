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
};

/** A page of inbox tasks plus the full server-side total (#26). */
export type InboxPage = { items: InboxTask[]; total: number; firstResult: number; maxResults: number };

/** Hard server page cap (FormInboxController.MAX_PAGE). */
export const INBOX_PAGE_MAX = 200;

/** A page of open user tasks for the tenant, paged + sorted + searchable server-side
 *  (#26). `search` matches task name or assignee; `sort` is created|name|assignee. */
export function getInbox(
  tenant: string,
  opts: { firstResult?: number; maxResults?: number; search?: string; sort?: string; order?: "asc" | "desc" } = {},
): Promise<InboxPage> {
  const qs = new URLSearchParams();
  if (opts.search) qs.set("search", opts.search);
  if (opts.sort) qs.set("sort", opts.sort);
  if (opts.order) qs.set("order", opts.order);
  if (opts.firstResult != null) qs.set("firstResult", String(opts.firstResult));
  qs.set("maxResults", String(opts.maxResults ?? INBOX_PAGE_MAX));
  return authed(`/api/form-inbox?${qs.toString()}`, tenantInit(tenant));
}

export function completeTask(tenant: string, taskId: string): Promise<{ ok: boolean; taskId: string }> {
  return authed(`/api/form-inbox/${seg(taskId)}/complete`, tenantInit(tenant, { method: "POST" }));
}
