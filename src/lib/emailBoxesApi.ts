// Client for the EMAIL capability's email BOXES — registered send-from (OUTBOUND) and
// receive-at (INBOUND) addresses on the tenant's verified sender domain. Routed through
// the gateway (/api/email-boxes/** → core-engine). Tenant-scoped + EMAIL-gated server-side.
import { authed, tenantInit } from "./authApi";

export type EmailBoxDirection = "INBOUND" | "OUTBOUND";

export type EmailBox = {
  id: string;
  tenantId: string;
  direction: EmailBoxDirection;
  address: string;
  localPart: string | null;
  displayName: string | null;
  status: string;
  /** OUTBOUND: the dedicated Postmark message-stream id. */
  postmarkStreamId: string | null;
  /** INBOUND: MailboxHash for +hash@inbound.postmarkapp.com routing. */
  routingKey: string | null;
  /** INBOUND: fire an email.inbound workflow on receipt. */
  workflowTrigger: boolean;
  createdAt?: string | number;
};

export type RegisterBoxRequest = {
  direction: EmailBoxDirection;
  localPart: string;
  displayName?: string;
  /** OUTBOUND only: "Transactional" (default) or "Broadcasts". */
  streamType?: string;
  /** INBOUND only: whether receipt fires a workflow (default true). */
  workflowTrigger?: boolean;
};

export type RegisterBoxResult = {
  box: EmailBox;
  /** INBOUND: the webhook URL Postmark was pointed at (or would be). */
  inboundWebhookUrl: string | null;
  /** INBOUND: Postmark's inbound address (<hash>@inbound.postmarkapp.com). */
  postmarkInboundAddress: string | null;
  /** A non-fatal note (e.g. inbound hook not yet wired). */
  warning: string | null;
};

function req<T>(tenant: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  return authed<T>(path, tenantInit(tenant, { ...init, headers }));
}

/** All boxes for the tenant (inbound + outbound). */
export function listBoxes(tenant: string): Promise<EmailBox[]> {
  return req<EmailBox[]>(tenant, "/api/email-boxes").then((r) => (Array.isArray(r) ? r : []));
}

/** Register a new inbound or outbound box. */
export function registerBox(tenant: string, body: RegisterBoxRequest): Promise<RegisterBoxResult> {
  return req<RegisterBoxResult>(tenant, "/api/email-boxes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Remove a box (drops our row; Postmark stream/history is kept). */
export function deleteBox(tenant: string, id: string): Promise<void> {
  return req<void>(tenant, `/api/email-boxes/${encodeURIComponent(id)}`, { method: "DELETE" });
}
