// Client for the work Inbox (core-engine /api/form-inbox) — every open user task for the
// tenant, whatever created it: form submissions to review AND inbound email to triage.
// The path is historical (it is registered by name in the engine's ApiAuthFilter); the
// endpoint has always returned all tasks, which is precisely why `kind` exists.
import { authed, tenantInit } from "./authApi";

const seg = (s: string) => encodeURIComponent(s);

/** What a task is about. Drives which preview the inbox renders. */
export type InboxTaskKind = "form" | "email";

export type InboxTask = {
  taskId: string;
  name?: string;
  created?: number;
  assignee?: string | null;
  processInstanceId?: string;
  processDefinitionKey?: string;
  /** Camunda task priority — set by an email routing rule, otherwise the engine default. */
  priority?: number | null;
  /**
   * What this task is about. Absent on an older engine, where every task was assumed to be a
   * form — `taskKind()` below applies that fallback in one place rather than at each use.
   */
  kind?: InboxTaskKind;
  /** FORM only: the FormInstance id this task is about. Null for email tasks — an email has
   *  no submission behind it, and treating the business key as one is what broke those rows. */
  instanceId?: string | null;
  /** FORM only: the form definition (code) this task's submission belongs to — for grouping the
   *  inbox by form. Absent on older engines (falls back to "ungrouped" in the UI). */
  definitionCode?: string | null;
  /** EMAIL only: the stored message id; fetch its body with `getInboundEmail`. */
  emailMessageId?: string | null;
  /** EMAIL only: who sent it. */
  emailFrom?: string | null;
  /** EMAIL only: the inbound box it arrived at — the grouping key for email tasks. */
  emailBox?: string | null;
};

/**
 * The task's kind, tolerating an engine that predates the field.
 *
 * The fallback is deliberately `emailMessageId`-first rather than a blanket "form": during a
 * deploy window a new UI can meet an old engine, and mislabelling an email task as a form is
 * exactly the bug this field was added to fix.
 */
export function taskKind(t: InboxTask): InboxTaskKind {
  if (t.kind) return t.kind;
  return t.emailMessageId ? "email" : "form";
}

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
