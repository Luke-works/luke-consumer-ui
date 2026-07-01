// WORKFLOW capability API — talks to luke-core-engine through the auth gateway
// (/api/workflow/** → core-engine). Mirrors phoneApi/formsApi: the shared `authed`
// + `tenantInit` wrapper attaches the access token and X-Tenant-Id.
// Backend: com.luke.engine.workflow (+ .integrations).
import type { StepTypeDescriptor, WorkflowDoc } from "@lukeflow/workflow-core";
import { asArray, authed, tenantInit } from "./authApi";

const seg = (s: string) => encodeURIComponent(s);

/** JSON request with the tenant header + Content-Type-when-body, returning parsed T. */
function req<T>(tenant: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  return authed<T>(path, tenantInit(tenant, { ...init, headers }));
}

// ── Types (match the backend records) ────────────────────────────────────────

export type WorkflowDefinition = {
  id: string;
  name: string;
  description?: string | null;
  status: string; // DRAFT | PUBLISHED
  latestVersion: number;
  publishedVersion?: number | null;
  draftJson?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type WorkflowVersion = {
  id: string;
  definitionId: string;
  version: number;
  jsonSource: string;
  bpmnXml?: string | null;
  processId?: string | null;
  compileOk: boolean;
  compileError?: string | null;
  signedOffAt?: string | null;
  signedOffBy?: string | null;
  checkedInAt?: string | null;
};

export type IntegrationConnectionStatus = "PENDING" | "ACTIVE" | "NEEDS_RECONNECT" | "REVOKED";

export type IntegrationConnection = {
  id: string;
  providerKey: string;
  status: IntegrationConnectionStatus;
  externalAccount?: string | null;
  nangoConnectionId?: string | null;
  errorState?: string | null;
  createdAt?: string | null;
  lastUsedAt?: string | null;
};

export type ConnectResult = { connectionId: string; sessionToken: string; expiresAt?: string | null };

// ── Catalog ───────────────────────────────────────────────────────────────────

export async function getCatalog(tenant: string): Promise<StepTypeDescriptor[]> {
  const res = await req<{ steps: StepTypeDescriptor[] }>(tenant, "/api/workflow/catalog");
  return asArray<StepTypeDescriptor>(res?.steps);
}

// ── Definitions + lifecycle ─────────────────────────────────────────────────────

const BASE = "/api/workflow/definitions";

export async function listDefinitions(tenant: string): Promise<WorkflowDefinition[]> {
  return asArray<WorkflowDefinition>(await req<WorkflowDefinition[]>(tenant, BASE));
}

export function getDefinition(tenant: string, id: string): Promise<WorkflowDefinition> {
  return req<WorkflowDefinition>(tenant, `${BASE}/${seg(id)}`);
}

export function createDefinition(
  tenant: string,
  input: { name: string; description?: string; json: string },
): Promise<WorkflowDefinition> {
  return req<WorkflowDefinition>(tenant, BASE, { method: "POST", body: JSON.stringify(input) });
}

export function updateDraft(
  tenant: string,
  id: string,
  input: { name?: string; description?: string; json?: string },
): Promise<WorkflowDefinition> {
  return req<WorkflowDefinition>(tenant, `${BASE}/${seg(id)}`, { method: "PUT", body: JSON.stringify(input) });
}

export function checkIn(tenant: string, id: string): Promise<WorkflowVersion> {
  return req<WorkflowVersion>(tenant, `${BASE}/${seg(id)}/check-in`, { method: "POST" });
}

export function signOff(tenant: string, id: string, version: number): Promise<WorkflowVersion> {
  return req<WorkflowVersion>(tenant, `${BASE}/${seg(id)}/versions/${version}/sign-off`, { method: "POST" });
}

export function publish(tenant: string, id: string, version: number): Promise<WorkflowDefinition> {
  return req<WorkflowDefinition>(tenant, `${BASE}/${seg(id)}/publish`, {
    method: "POST",
    body: JSON.stringify({ version }),
  });
}

export async function listVersions(tenant: string, id: string): Promise<WorkflowVersion[]> {
  return asArray<WorkflowVersion>(await req<WorkflowVersion[]>(tenant, `${BASE}/${seg(id)}/versions`));
}

// ── Integrations (connections) ──────────────────────────────────────────────────

const INT = "/api/workflow/integrations";

export async function listConnections(tenant: string): Promise<IntegrationConnection[]> {
  return asArray<IntegrationConnection>(await req<IntegrationConnection[]>(tenant, `${INT}/connections`));
}

export function startConnect(tenant: string, provider: string, userEmail?: string): Promise<ConnectResult> {
  return req<ConnectResult>(tenant, `${INT}/${seg(provider)}/connect`, {
    method: "POST",
    body: JSON.stringify({ userEmail }),
  });
}

export function disconnect(tenant: string, id: string): Promise<void> {
  return req<void>(tenant, `${INT}/connections/${seg(id)}`, { method: "DELETE" });
}

// ── Runs (Pillar 4: runtime) ───────────────────────────────────────────────────

export type WorkflowRunSummary = {
  id: string;
  businessKey?: string | null;
  /** ACTIVE | COMPLETED | EXTERNALLY_TERMINATED | INTERNALLY_TERMINATED | SUSPENDED */
  state: string;
  ended: boolean;
  startTime?: number | null;
  endTime?: number | null;
};

export type WorkflowRunTask = {
  id: string;
  name?: string | null;
  activityId?: string | null;
  assignee?: string | null;
  created?: number | null;
  candidateGroups?: string[];
};

export type WorkflowRunIncident = {
  id: string;
  type: string;
  message?: string | null;
  activityId?: string | null;
  timestamp?: number | null;
};

export type WorkflowRunDetail = {
  found: boolean;
  instanceId: string;
  processDefinitionKey?: string | null;
  state?: string | null;
  ended: boolean;
  startTime?: number | null;
  endTime?: number | null;
  currentActivityIds: string[];
  activeTasks: WorkflowRunTask[];
  incidents: WorkflowRunIncident[];
};

/** Start a test instance of the definition's published version. */
export function startRun(
  tenant: string,
  id: string,
  variables?: Record<string, unknown>,
): Promise<{ instanceId: string }> {
  return req<{ instanceId: string }>(tenant, `${BASE}/${seg(id)}/runs`, {
    method: "POST",
    body: JSON.stringify({ variables: variables ?? {} }),
  });
}

/** Recent runs (running + finished) for the definition. */
export async function listRuns(tenant: string, id: string): Promise<WorkflowRunSummary[]> {
  return asArray<WorkflowRunSummary>(await req<WorkflowRunSummary[]>(tenant, `${BASE}/${seg(id)}/runs`));
}

/** Full status of one run — state, current activities, active tasks, incidents. */
export function getRun(tenant: string, instanceId: string): Promise<WorkflowRunDetail> {
  return req<WorkflowRunDetail>(tenant, `/api/workflow/runs/${seg(instanceId)}`);
}

/** A blank starter document for a new workflow (a trigger + nothing else). */
export function blankWorkflow(name: string): WorkflowDoc {
  return {
    id: `wf_${Date.now().toString(36)}`,
    version: 1,
    name,
    trigger: { capability: "forms", type: "form.submitted" },
    nodes: [],
  };
}
