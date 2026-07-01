// Phone / Voice capability API — talks to luke-core-engine through the auth
// gateway (/api/phone-* → core-engine proxy). Mirrors formInstancesApi/emailApi:
// the shared `authed` + `tenantInit` fetch wrapper attaches the access token and
// X-Tenant-Id. Backend: com.luke.engine.capability.phone.
import { authed, tenantInit, asArray } from "./authApi";

const seg = (s: string) => encodeURIComponent(s);

// ── Calls ──────────────────────────────────────────────────────────────────

export type CallStatus = "QUEUED" | "RINGING" | "IN_PROGRESS" | "ENDED" | "FAILED";
export type CallDirection = "INBOUND" | "OUTBOUND";

/** Statuses past which a call no longer changes — used to stop live polling. */
export const TERMINAL_CALL_STATES: ReadonlySet<CallStatus> = new Set(["ENDED", "FAILED"]);
export const isCallActive = (s: CallStatus): boolean => !TERMINAL_CALL_STATES.has(s);

export type PhoneCall = {
  id: string;
  tenantId: string;
  direction: CallDirection;
  status: CallStatus;
  vapiCallId?: string | null;
  phoneNumberId?: string | null;
  assistantId?: string | null;
  customerNumber?: string | null;
  endedReason?: string | null;
  transcript?: string | null;
  recordingUrl?: string | null;
  summary?: string | null;
  cost?: number | null;
  analysis?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
  processInstanceId?: string | null;
  processStatus?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type PagedCalls = { items: PhoneCall[]; total: number; firstResult: number; maxResults: number };

export const CALLS_PAGE_MAX = 200;

export type OutboundCallInput = {
  customerNumber: string;
  phoneNumberId?: string;
  assistantId?: string;
  variableValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export async function listCalls(
  tenant: string,
  opts: { status?: CallStatus; direction?: CallDirection; firstResult?: number; maxResults?: number } = {},
): Promise<PagedCalls> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.direction) q.set("direction", opts.direction);
  q.set("firstResult", String(opts.firstResult ?? 0));
  q.set("maxResults", String(Math.min(opts.maxResults ?? 50, CALLS_PAGE_MAX)));
  const res = await authed<PagedCalls>(`/api/phone-calls?${q.toString()}`, tenantInit(tenant));
  return { items: asArray<PhoneCall>(res?.items), total: res?.total ?? 0, firstResult: res?.firstResult ?? 0, maxResults: res?.maxResults ?? 50 };
}

export function getCall(tenant: string, id: string): Promise<PhoneCall> {
  return authed<PhoneCall>(`/api/phone-calls/${seg(id)}`, tenantInit(tenant));
}

export function startOutboundCall(tenant: string, input: OutboundCallInput): Promise<PhoneCall> {
  return authed<PhoneCall>(`/api/phone-calls`, tenantInit(tenant, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

// ── Numbers ────────────────────────────────────────────────────────────────

export type PhoneNumber = {
  id: string;
  tenantId: string;
  vapiNumberId: string;
  number: string;
  provider: string;
  name?: string | null;
  assistantId?: string | null;
  createdAt?: string | null;
};

export type ProvisionNumberInput = {
  provider?: "vapi" | "twilio" | "telnyx" | "vonage";
  areaCode?: string;
  number?: string;
  credentialId?: string;
  name?: string;
  assistantId?: string;
};

export async function listNumbers(tenant: string): Promise<PhoneNumber[]> {
  return asArray<PhoneNumber>(await authed(`/api/phone-numbers`, tenantInit(tenant)));
}

/** SaaS 1:1 — a workspace owns at most one number. Returns it, or null if not provisioned yet. */
export async function getMyNumber(tenant: string): Promise<PhoneNumber | null> {
  const list = await listNumbers(tenant);
  return list[0] ?? null;
}

export function provisionNumber(tenant: string, input: ProvisionNumberInput): Promise<PhoneNumber> {
  return authed<PhoneNumber>(`/api/phone-numbers`, tenantInit(tenant, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

// ── Settings ───────────────────────────────────────────────────────────────

export type PhoneSettings = {
  id: string;
  hasApiKey: boolean;
  defaultAssistantId?: string | null;
};

export function getSettings(tenant: string): Promise<PhoneSettings> {
  return authed<PhoneSettings>(`/api/phone-settings`, tenantInit(tenant));
}

export function updateDefaults(
  tenant: string,
  input: { defaultAssistantId?: string | null },
): Promise<PhoneSettings> {
  return authed<PhoneSettings>(`/api/phone-settings`, tenantInit(tenant, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export function connectApiKey(tenant: string, apiKey: string): Promise<PhoneSettings> {
  return authed<PhoneSettings>(`/api/phone-settings/api-key`, tenantInit(tenant, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  }));
}

export function disconnectApiKey(tenant: string): Promise<PhoneSettings> {
  return authed<PhoneSettings>(`/api/phone-settings/api-key`, tenantInit(tenant, { method: "DELETE" }));
}
