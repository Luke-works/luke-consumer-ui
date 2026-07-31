// Client for EMAIL INTAKE — the received content of an inbound message, and the routing rules
// that decide what an arriving message becomes. Routed through the gateway to core-engine,
// tenant-scoped (X-Tenant-Id) and EMAIL-capability-gated server-side.
//
// Routing rules live under /api/email-boxes/routing-rules rather than a path of their own: the
// engine registers its capability gate and auth filter on the /api/email-boxes prefix, so the
// nested path inherits both and cannot be shipped ungated.
import { ApiError, authed, tenantInit } from "./authApi";

const RULES_BASE = "/api/email-boxes/routing-rules";
const seg = (s: string) => encodeURIComponent(s);

/** One attachment that arrived — metadata only. The bytes are not stored (see InboundEmail). */
export type InboundAttachment = { name: string | null; contentType: string | null; contentLength: number };

/** One raw header as the mailer sent it. */
export type InboundHeader = { Name?: string; Value?: string; name?: string; value?: string };

/** The received content of an inbound message (core-engine `InboundEmail`). */
export type InboundEmail = {
  id: string;
  tenantId: string;
  boxId: string | null;
  boxAddress: string | null;
  mailboxHash: string | null;
  fromName: string | null;
  toFull: string | null;
  ccAddresses: string | null;
  replyTo: string | null;
  textBody: string | null;
  htmlBody: string | null;
  strippedTextReply: string | null;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  /** JSON strings on the wire — parse with `parseAttachments` / `parseHeaders`. */
  attachments: string | null;
  headers: string | null;
  attachmentCount: number;
  receivedAt?: string | number;
};

/** The received content for a message, or null when there is none (an outbound row, or a
 *  message stored before intake kept bodies). Callers render an empty state rather than an error. */
export async function getInboundEmail(
  tenant: string,
  messageId: string,
  signal?: AbortSignal,
): Promise<InboundEmail | null> {
  try {
    return await authed<InboundEmail>(`/api/emails/${seg(messageId)}/inbound`, tenantInit(tenant, { signal }));
  } catch (e) {
    // Only a genuine 404 means "no content"; anything else (including an abort, which has no
    // status) must surface so the caller doesn't render an empty inbox as if it were empty.
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Attachment metadata, tolerating a null/!JSON column rather than throwing into a render. */
export function parseAttachments(raw: string | null | undefined): InboundAttachment[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as InboundAttachment[]) : [];
  } catch {
    return [];
  }
}

/** Raw headers, normalised to lowercase keys (the engine stores Postmark's `Name`/`Value`). */
export function parseHeaders(raw: string | null | undefined): Array<{ name: string; value: string }> {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return (v as InboundHeader[])
      .map((h) => ({ name: String(h.Name ?? h.name ?? ""), value: String(h.Value ?? h.value ?? "") }))
      .filter((h) => h.name);
  } catch {
    return [];
  }
}

// ── routing rules ──────────────────────────────────────────────────────────

export type RuleField = "FROM" | "SUBJECT" | "TO" | "BODY" | "ANY";
export type RuleOperator = "CONTAINS" | "EQUALS" | "STARTS_WITH" | "ENDS_WITH" | "REGEX";

export type EmailRoutingRule = {
  id: string;
  tenantId: string;
  /** null = applies to every inbound box. */
  boxId: string | null;
  name: string;
  enabled: boolean;
  sortOrder: number;
  matchField: RuleField;
  matchOperator: RuleOperator;
  matchValue: string;
  caseSensitive: boolean;
  actionAssignee: string | null;
  actionCandidateGroup: string | null;
  actionPriority: number | null;
  actionProcessKey: string | null;
  actionTaskName: string | null;
  actionSuppressTask: boolean;
  createdAt?: string | number;
};

export type RuleRequest = {
  boxId?: string | null;
  name: string;
  enabled?: boolean;
  sortOrder?: number;
  matchField: RuleField;
  matchOperator: RuleOperator;
  matchValue: string;
  caseSensitive?: boolean;
  actionAssignee?: string | null;
  actionCandidateGroup?: string | null;
  actionPriority?: number | null;
  actionProcessKey?: string | null;
  actionTaskName?: string | null;
  actionSuppressTask?: boolean;
};

function req<T>(tenant: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  return authed<T>(path, tenantInit(tenant, { ...init, headers }));
}

/** All rules for the tenant, already in evaluation order (first match wins). */
export function listRules(tenant: string, signal?: AbortSignal): Promise<EmailRoutingRule[]> {
  return authed<EmailRoutingRule[]>(RULES_BASE, tenantInit(tenant, { signal })).then((r) =>
    Array.isArray(r) ? r : [],
  );
}

export function createRule(tenant: string, body: RuleRequest): Promise<EmailRoutingRule> {
  return req<EmailRoutingRule>(tenant, RULES_BASE, { method: "POST", body: JSON.stringify(body) });
}

export function updateRule(tenant: string, id: string, body: RuleRequest): Promise<EmailRoutingRule> {
  return req<EmailRoutingRule>(tenant, `${RULES_BASE}/${seg(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteRule(tenant: string, id: string): Promise<void> {
  return req<void>(tenant, `${RULES_BASE}/${seg(id)}`, { method: "DELETE" });
}

/** Reorder: send the full ordered list of ids. Order IS the semantics — first match wins. */
export function reorderRules(tenant: string, orderedIds: string[]): Promise<EmailRoutingRule[]> {
  return req<EmailRoutingRule[]>(tenant, `${RULES_BASE}/reorder`, {
    method: "POST",
    body: JSON.stringify(orderedIds),
  });
}

/** Human-readable summary of a rule's test — used in the list and in tests. */
export function describeMatch(rule: Pick<EmailRoutingRule, "matchField" | "matchOperator" | "matchValue">): string {
  const field = { FROM: "From", SUBJECT: "Subject", TO: "To", BODY: "Body", ANY: "Anything" }[rule.matchField];
  const op = {
    CONTAINS: "contains",
    EQUALS: "is",
    STARTS_WITH: "starts with",
    ENDS_WITH: "ends with",
    REGEX: "matches",
  }[rule.matchOperator];
  return `${field} ${op} “${rule.matchValue}”`;
}
