// Client for the capability-engine form-instance lifecycle, routed through the
// gateway (/api/form-instances/** → core-engine proxy → capability-engine). A
// form instance is a concrete runtime occurrence of a published definition
// version: a fill session that autosaves and submits. Tenant-scoped (X-Tenant-Id)
// and capability-gated server-side, same as form-definitions.
import { authed, tenantInit } from "./authApi";

const BASE = "/api/form-instances";
const seg = (s: string) => encodeURIComponent(s);

// ── Lifecycle states (mirror FormInstanceStates on the backend) ──────────────
export type InstanceState =
  | "CREATED" | "SENT" | "OPENED" | "IN_PROGRESS"
  | "SUBMITTED" | "PROCESSED" | "EXPIRED" | "CANCELLED";

/** States in which the instance can still be opened/edited/submitted. */
export const OPEN_STATES: ReadonlySet<InstanceState> = new Set([
  "CREATED", "SENT", "OPENED", "IN_PROGRESS",
]);
export const isOpen = (s: InstanceState): boolean => OPEN_STATES.has(s);

// ── View model ───────────────────────────────────────────────────────────────
export type FormInstance = {
  id: string;
  token: string;
  definitionCode: string;
  version: number;
  state: InstanceState;
  /** Read-only seed values (key → value), shown but typically not submitted. */
  prefill?: Record<string, unknown>;
  /** The working/submitted answers (key → value). */
  data?: Record<string, unknown>;
  recipient?: Record<string, unknown>;
  context?: Record<string, unknown>;
  createdBy?: string;
  createdAt: number;
  expiresAt?: number;
  submittedAt?: number;
  updatedAt?: number;
};

/** A loaded instance plus the pinned schema string to render it with. */
export type InstanceView = { instance: FormInstance; schema: string };

// ── Backend DTOs ─────────────────────────────────────────────────────────────
type ApiInstance = {
  id: string;
  token: string;
  definitionCode: string;
  version: number;
  state: string;
  prefill?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  recipient?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  createdBy?: string | null;
  createdAt?: unknown;
  expiresAt?: unknown;
  submittedAt?: unknown;
  updatedAt?: unknown;
};
type ApiView = { instance: ApiInstance; schema?: string | null };

// LocalDateTime may arrive as an ISO string or a [Y,M,D,h,m,s] array (Jackson),
// or epoch millis — be tolerant.
const ms = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? undefined : t; }
  if (Array.isArray(v) && v.length >= 3) {
    const [Y, Mo, D, h = 0, mi = 0, s = 0] = v as number[];
    return new Date(Y, Mo - 1, D, h, mi, s).getTime();
  }
  return undefined;
};

function toInstance(i: ApiInstance): FormInstance {
  return {
    id: i.id,
    token: i.token,
    definitionCode: i.definitionCode,
    version: i.version,
    state: (i.state as InstanceState) ?? "CREATED",
    prefill: i.prefill ?? undefined,
    data: i.data ?? undefined,
    recipient: i.recipient ?? undefined,
    context: i.context ?? undefined,
    createdBy: i.createdBy ?? undefined,
    createdAt: ms(i.createdAt) ?? 0,
    expiresAt: ms(i.expiresAt),
    submittedAt: ms(i.submittedAt),
    updatedAt: ms(i.updatedAt),
  };
}

const toView = (v: ApiView): InstanceView => ({ instance: toInstance(v.instance), schema: v.schema ?? "" });

// ── Requests ─────────────────────────────────────────────────────────────────
function req<T>(tenant: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  // Never send X-User-Id from the browser — the auth gateway rejects it in CORS and
  // strips it (anti-spoof), asserting the user from the session. Matches formsApi.
  return authed<T>(path, tenantInit(tenant, { ...init, headers }));
}

export type CreateInstanceInput = {
  definitionCode: string;
  version?: number;
  prefill?: Record<string, unknown>;
  recipient?: Record<string, unknown>;
  context?: Record<string, unknown>;
  expiresAt?: number;
};

/** Start a fill session for a form's published version (or a specific version). */
export async function createInstance(tenant: string, input: CreateInstanceInput): Promise<InstanceView> {
  const v = await req<ApiView>(tenant, BASE, { method: "POST", body: JSON.stringify(input) });
  return toView(v);
}

/** Full instance + schema, for rendering / viewing a response. */
export async function getInstance(tenant: string, id: string): Promise<InstanceView> {
  return toView(await req<ApiView>(tenant, `${BASE}/${seg(id)}`));
}

export async function getInstanceByToken(tenant: string, token: string): Promise<InstanceView> {
  return toView(await req<ApiView>(tenant, `${BASE}/by-token/${seg(token)}`));
}

/** A page of instances. `total` is the full server-side count; `items` is the
 *  bounded page actually returned (see {@link INSTANCE_PAGE_MAX}). */
export type InstancePage = {
  items: FormInstance[];
  total: number;
  firstResult: number;
  maxResults: number;
};

/** Hard page cap enforced by the backend (FormInstanceController.MAX_PAGE, #52).
 *  Requesting more is silently clamped to this, so callers should treat a result
 *  of this size as "possibly truncated" and surface it (compare items vs total). */
export const INSTANCE_PAGE_MAX = 200;

/** A page of instances for the tenant, optionally filtered by form code or state.
 *  The endpoint is paged + size-capped server-side (#52) rather than returning the
 *  whole (monotonically growing) tenant history — read `total` to detect when more
 *  rows exist than were returned. */
export async function listInstances(
  tenant: string,
  filter: {
    definitionCode?: string;
    state?: InstanceState;
    firstResult?: number;
    maxResults?: number;
  } = {},
): Promise<InstancePage> {
  const qs = new URLSearchParams();
  if (filter.definitionCode) qs.set("definitionCode", filter.definitionCode);
  if (filter.state) qs.set("state", filter.state);
  if (filter.firstResult != null) qs.set("firstResult", String(filter.firstResult));
  qs.set("maxResults", String(filter.maxResults ?? INSTANCE_PAGE_MAX));
  const body = await req<{
    items: ApiInstance[];
    total: number;
    firstResult: number;
    maxResults: number;
  }>(tenant, `${BASE}?${qs.toString()}`);
  return {
    items: body.items.map(toInstance),
    total: body.total,
    firstResult: body.firstResult,
    maxResults: body.maxResults,
  };
}

/** Per-definition rollup for the cockpit, keyed by definitionCode (#26). Computed
 *  server-side over the whole tenant set, so the counts are correct even though the
 *  instance list itself is capped. Definitions with no instances are absent. */
export type DefinitionSummary = { total: number; subs: number; last: number | null };

export async function getInstanceSummary(tenant: string): Promise<Record<string, DefinitionSummary>> {
  return req<Record<string, DefinitionSummary>>(tenant, `${BASE}/summary`);
}

/** Partial autosave (merges into the instance's data; moves it to IN_PROGRESS). */
export async function saveInstanceData(
  tenant: string,
  id: string,
  data: Record<string, unknown>,
): Promise<InstanceView> {
  return toView(await req<ApiView>(tenant, `${BASE}/${seg(id)}`, { method: "PATCH", body: JSON.stringify({ data }) }));
}

/** Submit the instance (optionally with a final data merge). */
export async function submitInstance(
  tenant: string,
  id: string,
  data?: Record<string, unknown>,
): Promise<InstanceView> {
  return toView(
    await req<ApiView>(tenant, `${BASE}/${seg(id)}/submit`, {
      method: "POST",
      body: JSON.stringify(data ? { data } : {}),
    }),
  );
}

export async function sendInstance(tenant: string, id: string): Promise<FormInstance> {
  return toInstance(await req<ApiInstance>(tenant, `${BASE}/${seg(id)}/send`, { method: "POST" }));
}
export async function cancelInstance(tenant: string, id: string): Promise<FormInstance> {
  return toInstance(await req<ApiInstance>(tenant, `${BASE}/${seg(id)}/cancel`, { method: "POST" }));
}
export async function markProcessed(tenant: string, id: string): Promise<FormInstance> {
  return toInstance(await req<ApiInstance>(tenant, `${BASE}/${seg(id)}/processed`, { method: "POST" }));
}

// ── End-to-end process trace (core-engine /api/process-trace) ────────────────
export type ProcessTaskInfo = {
  id: string;
  name?: string;
  assignee?: string | null;
  created?: number;
  candidateGroups: string[];
};
export type ProcessIncident = { type?: string; message?: string; activityId?: string; timestamp?: number };
export type ProcessTrace = {
  found: boolean;
  processInstanceId?: string;
  processDefinitionKey?: string;
  state?: string; // ACTIVE | COMPLETED | …
  ended?: boolean;
  startTime?: number;
  endTime?: number;
  activeTasks?: ProcessTaskInfo[];
  landedInUserTask?: boolean;
  incidents?: ProcessIncident[];
  hasIncident?: boolean;
};

/** Trace a submission's process: started? running/done? sitting in a user task? */
export function getProcessTrace(tenant: string, processInstanceId: string): Promise<ProcessTrace> {
  return authed(`/api/process-trace/${seg(processInstanceId)}`, tenantInit(tenant));
}

/** Re-attempt the process start for a submitted instance whose process never
 *  started. Returns the fresh outcome (status + processInstanceId or error). */
export function retryProcess(
  tenant: string,
  id: string,
): Promise<{ status: string; processInstanceId: string; error: string }> {
  return req(tenant, `${BASE}/${seg(id)}/retry-process`, { method: "POST" });
}

/** Human label for a lifecycle state. */
export const STATE_LABEL: Record<InstanceState, string> = {
  CREATED: "Created",
  SENT: "Sent",
  OPENED: "Opened",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  PROCESSED: "Processed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};
