// Client for the capability-engine form lifecycle, routed through the gateway
// (/api/form-definitions/** → core-engine proxy → capability-engine). Every call
// is tenant-scoped (X-Tenant-Id) and gated by the FORMS capability server-side
// (GET = read, mutations = read-write). This replaces the old browser-local store.
import { authed, tenantInit, asArray } from "./authApi";

const BASE = "/api/form-definitions";
const seg = (s: string) => encodeURIComponent(s);

// ── View models (what the UI works with) ────────────────────────────────────
export type FormStatus = "draft" | "published" | "archived";

export type StoredForm = {
  id: string;
  code: string;
  name: string;
  description?: string;
  /** Editable working draft (coltorapps schema JSON, "" when empty). */
  schema: string;
  status: FormStatus;
  publishedVersion?: number;
  /** Highest checked-in version (0 when none). Populated on single-form loads. */
  latestVersion: number;
  lockedBy?: string | null;
  deletedAt?: number | null;
  createdBy?: string;
  updatedBy?: string;
  /** Resolved display names for createdBy/updatedBy (server falls back to the id). */
  createdByName?: string;
  updatedByName?: string;
  createdAt: number;
  updatedAt: number;
  /** When the form last passed its self-test ("Test the form"), 0/undefined if never. */
  lastTestedAt?: number | null;
  lastTestedBy?: string | null;
};

/** A checked-in, immutable version (the artifact workflows resolve). */
export type FormArtifact = { version: number; schema: string; checkedInAt: number; by?: string };

/** One entry in a form's activity feed. */
export type AuditEvent = { action: string; detail?: string; actor?: string; actorName?: string; at: number };

// ── Backend DTOs ────────────────────────────────────────────────────────────
type ApiForm = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string; // DRAFT | PUBLISHED | RETIRED
  publishedVersion?: number | null;
  draftSchema?: string | null;
  deletedAt?: string | null;
  lockedBy?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  lastTestedAt?: string | null;
  lastTestedBy?: string | null;
};
type ApiVersion = { version: number; schema: string; checkedInBy?: string | null; checkedInAt: string };
type ApiAudit = { action: string; detail?: string | null; actor?: string | null; actorName?: string | null; at: string };

// ── Adapters (backend ⇄ view model) ─────────────────────────────────────────
const STATUS_IN: Record<string, FormStatus> = { DRAFT: "draft", PUBLISHED: "published", RETIRED: "archived" };
const ms = (iso?: string | null): number => (iso ? Date.parse(iso) : 0);

function toForm(f: ApiForm, latestVersion = 0): StoredForm {
  return {
    id: f.id,
    code: f.code,
    name: f.name,
    description: f.description ?? undefined,
    schema: f.draftSchema ?? "",
    status: STATUS_IN[f.status] ?? "draft",
    publishedVersion: f.publishedVersion ?? undefined,
    latestVersion,
    lockedBy: f.lockedBy ?? null,
    deletedAt: f.deletedAt ? ms(f.deletedAt) : null,
    createdBy: f.createdBy ?? undefined,
    updatedBy: f.updatedBy ?? undefined,
    createdByName: f.createdByName ?? undefined,
    updatedByName: f.updatedByName ?? undefined,
    createdAt: ms(f.createdAt),
    updatedAt: ms(f.updatedAt) || ms(f.createdAt),
    lastTestedAt: f.lastTestedAt ? ms(f.lastTestedAt) : null,
    lastTestedBy: f.lastTestedBy ?? null,
  };
}

const toArtifact = (v: ApiVersion): FormArtifact => ({
  version: v.version,
  schema: v.schema,
  checkedInAt: ms(v.checkedInAt),
  by: v.checkedInBy ?? undefined,
});

const toAudit = (a: ApiAudit): AuditEvent => ({
  action: a.action,
  detail: a.detail ?? undefined,
  actor: a.actor ?? undefined,
  actorName: a.actorName ?? undefined,
  at: ms(a.at),
});

const maxVersion = (vs: ApiVersion[]): number => vs.reduce((m, v) => Math.max(m, v.version), 0);

// ── Requests ─────────────────────────────────────────────────────────────────
function req<T>(tenant: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  return authed<T>(path, tenantInit(tenant, { ...init, headers }));
}

/** Live forms (or trash when deleted=true). latestVersion is not resolved here. */
export async function listForms(tenant: string, deleted = false, signal?: AbortSignal): Promise<StoredForm[]> {
  const list = await req<ApiForm[]>(tenant, `${BASE}?deleted=${deleted}`, { signal });
  return asArray<ApiForm>(list).map((f) => toForm(f));
}

/** A single form with its latest version number resolved (for the builder). */
export async function getForm(tenant: string, id: string): Promise<StoredForm> {
  const [form, versions] = await Promise.all([
    req<ApiForm>(tenant, `${BASE}/${seg(id)}`),
    req<ApiVersion[]>(tenant, `${BASE}/${seg(id)}/versions`),
  ]);
  return toForm(form, maxVersion(versions));
}

export async function createForm(tenant: string, name: string, description?: string): Promise<StoredForm> {
  const f = await req<ApiForm>(tenant, BASE, { method: "POST", body: JSON.stringify({ name, description }) });
  return toForm(f);
}

export function saveDraft(tenant: string, id: string, schema: string): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/draft`, { method: "PUT", body: JSON.stringify({ schema }) });
}

export function updateMeta(
  tenant: string,
  id: string,
  patch: { name?: string; description?: string; allowedEmbedOrigins?: string },
): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function checkIn(tenant: string, id: string, schema: string, publish?: boolean): Promise<FormArtifact> {
  const v = await req<ApiVersion>(tenant, `${BASE}/${seg(id)}/versions`, {
    method: "POST",
    body: JSON.stringify({ schema, publish: publish ?? false }),
  });
  return toArtifact(v);
}

export async function listVersions(tenant: string, id: string): Promise<FormArtifact[]> {
  const vs = await req<ApiVersion[]>(tenant, `${BASE}/${seg(id)}/versions`);
  return asArray<ApiVersion>(vs).map(toArtifact);
}

export function publishVersion(tenant: string, id: string, version: number): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/versions/${version}/publish`, { method: "POST" });
}

export function restoreVersion(tenant: string, id: string, version: number): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/versions/${version}/restore`, { method: "POST" });
}

export function discardDraft(tenant: string, id: string): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/discard`, { method: "POST" });
}

/** Acquire the edit lock. Rejects (409) if held by someone else unless force=true. */
export async function checkout(tenant: string, id: string, force = false): Promise<StoredForm> {
  const f = await req<ApiForm>(tenant, `${BASE}/${seg(id)}/checkout?force=${force}`, { method: "POST" });
  return toForm(f);
}

export function release(tenant: string, id: string, force = false): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/release?force=${force}`, { method: "POST" });
}

export function archiveForm(tenant: string, id: string, archived: boolean): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/${archived ? "retire" : "unretire"}`, { method: "POST" });
}

export function softDelete(tenant: string, id: string): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}`, { method: "DELETE" });
}

export function restoreForm(tenant: string, id: string): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/restore`, { method: "POST" });
}

export function purgeForm(tenant: string, id: string): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/purge`, { method: "DELETE" });
}

export async function cloneForm(tenant: string, id: string): Promise<StoredForm> {
  const f = await req<ApiForm>(tenant, `${BASE}/${seg(id)}/clone`, { method: "POST" });
  return toForm(f);
}

export async function getAudit(tenant: string, id: string): Promise<AuditEvent[]> {
  const list = await req<ApiAudit[]>(tenant, `${BASE}/${seg(id)}/audit`);
  return asArray<ApiAudit>(list).map(toAudit);
}

/** Mint an opaque, signed embed token for a published form (for the iframe). */
export async function getEmbedToken(
  tenant: string,
  id: string,
): Promise<{ token: string; code: string; allowedEmbedOrigins?: string | null }> {
  return req(tenant, `${BASE}/${seg(id)}/embed-token`);
}

/** Record that the form passed its self-test ("Test the form" sign-off). */
export async function signOffTest(tenant: string, id: string): Promise<StoredForm> {
  const f = await req<ApiForm>(tenant, `${BASE}/${seg(id)}/sign-off`, { method: "POST" });
  return toForm(f);
}

/** Highest checked-in version for a loaded form (0 when never checked in). */
export const latestVersion = (form: StoredForm): number => form.latestVersion;
