// Client for the core-engine email-template lifecycle, routed through the gateway
// (/api/email-templates/** → core-engine). Every call is tenant-scoped
// (X-Tenant-Id) and gated by the EMAIL capability server-side (GET = read,
// mutations = read-write). We store only the lightweight EmailDoc JSON + the
// Postmark template alias — Postmark owns the rendered HTML.
import { authed, tenantInit } from "./authApi";

const BASE = "/api/email-templates";
const seg = (s: string) => encodeURIComponent(s);

// ── View models (what the UI works with) ────────────────────────────────────
export type TemplateStatus = "draft" | "published" | "retired";

export type StoredTemplate = {
  id: string;
  code: string;
  name: string;
  description?: string;
  subject: string;
  /** Editable working draft (EmailDoc JSON, "" when empty). */
  doc: string;
  status: TemplateStatus;
  publishedVersion?: number;
  /** Highest checked-in version (0 when none). Populated on single loads. */
  latestVersion: number;
  /** Stable Postmark template alias once published, else undefined. */
  postmarkAlias?: string | null;
  deletedAt?: number | null;
  createdBy?: string;
  updatedBy?: string;
  /** Resolved display names for createdBy/updatedBy (server falls back to the id). */
  createdByName?: string;
  updatedByName?: string;
  createdAt: number;
  updatedAt: number;
};

/** A checked-in, immutable version (the source EmailDoc, not html). */
export type TemplateVersion = {
  version: number;
  doc: string;
  subject: string;
  postmarkAlias?: string | null;
  postmarkTemplateId?: number | null;
  checkedInAt: number;
  by?: string;
};

/** One entry in a template's activity feed. */
export type AuditEvent = { action: string; detail?: string; actor?: string; actorName?: string; at: number };

// ── Backend DTOs ────────────────────────────────────────────────────────────
type ApiTemplate = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  subject?: string | null;
  status: string; // DRAFT | PUBLISHED | RETIRED
  publishedVersion?: number | null;
  draftDoc?: string | null;
  postmarkAlias?: string | null;
  deletedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};
type ApiVersion = {
  version: number;
  doc: string;
  subject?: string | null;
  postmarkAlias?: string | null;
  postmarkTemplateId?: number | null;
  checkedInBy?: string | null;
  checkedInAt: string;
};
type ApiAudit = { action: string; detail?: string | null; actor?: string | null; actorName?: string | null; at: string };

// ── Adapters (backend ⇄ view model) ─────────────────────────────────────────
const STATUS_IN: Record<string, TemplateStatus> = { DRAFT: "draft", PUBLISHED: "published", RETIRED: "retired" };
const ms = (iso?: string | null): number => (iso ? Date.parse(iso) : 0);

function toTemplate(t: ApiTemplate, latestVersion = 0): StoredTemplate {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description ?? undefined,
    subject: t.subject ?? "",
    doc: t.draftDoc ?? "",
    status: STATUS_IN[t.status] ?? "draft",
    publishedVersion: t.publishedVersion ?? undefined,
    latestVersion,
    postmarkAlias: t.postmarkAlias ?? null,
    deletedAt: t.deletedAt ? ms(t.deletedAt) : null,
    createdBy: t.createdBy ?? undefined,
    updatedBy: t.updatedBy ?? undefined,
    createdByName: t.createdByName ?? undefined,
    updatedByName: t.updatedByName ?? undefined,
    createdAt: ms(t.createdAt),
    updatedAt: ms(t.updatedAt) || ms(t.createdAt),
  };
}

const toVersion = (v: ApiVersion): TemplateVersion => ({
  version: v.version,
  doc: v.doc,
  subject: v.subject ?? "",
  postmarkAlias: v.postmarkAlias ?? null,
  postmarkTemplateId: v.postmarkTemplateId ?? null,
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

/** Live templates (or trash when deleted=true). latestVersion is not resolved here. */
export async function listTemplates(tenant: string, deleted = false): Promise<StoredTemplate[]> {
  const list = await req<ApiTemplate[]>(tenant, `${BASE}?deleted=${deleted}`);
  return list.map((t) => toTemplate(t));
}

/** A single template with its latest version number resolved (for the builder). */
export async function getTemplate(tenant: string, id: string): Promise<StoredTemplate> {
  const [tpl, versions] = await Promise.all([
    req<ApiTemplate>(tenant, `${BASE}/${seg(id)}`),
    req<ApiVersion[]>(tenant, `${BASE}/${seg(id)}/versions`),
  ]);
  return toTemplate(tpl, maxVersion(versions));
}

export async function createTemplate(tenant: string, name: string, description?: string): Promise<StoredTemplate> {
  const t = await req<ApiTemplate>(tenant, BASE, { method: "POST", body: JSON.stringify({ name, description }) });
  return toTemplate(t);
}

/** Autosave target: persist the working EmailDoc JSON + its subject. */
export function saveDraft(tenant: string, id: string, doc: string, subject: string): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/draft`, { method: "PUT", body: JSON.stringify({ doc, subject }) });
}

export function updateMeta(
  tenant: string,
  id: string,
  patch: { name?: string; description?: string },
): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/**
 * Check-in: store the version (doc + subject) and publish to Postmark with the
 * browser-compiled html/text. The first check-in auto-publishes. The backend
 * forwards html/text to Postmark and never stores them.
 */
export async function checkIn(
  tenant: string,
  id: string,
  body: { doc: string; subject: string; html: string; text: string; publish?: boolean },
): Promise<TemplateVersion> {
  const v = await req<ApiVersion>(tenant, `${BASE}/${seg(id)}/versions`, {
    method: "POST",
    body: JSON.stringify({ ...body, publish: body.publish ?? false }),
  });
  return toVersion(v);
}

export async function listVersions(tenant: string, id: string): Promise<TemplateVersion[]> {
  const vs = await req<ApiVersion[]>(tenant, `${BASE}/${seg(id)}/versions`);
  return vs.map(toVersion);
}

/** Re-push a checked-in version's doc to Postmark. */
export function publishVersion(tenant: string, id: string, version: number): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/versions/${version}/publish`, { method: "POST" });
}

export function retireTemplate(tenant: string, id: string, retired: boolean): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/${retired ? "retire" : "unretire"}`, { method: "POST" });
}

export function softDelete(tenant: string, id: string): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}`, { method: "DELETE" });
}

export function restoreTemplate(tenant: string, id: string): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/restore`, { method: "POST" });
}

export function purgeTemplate(tenant: string, id: string): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/purge`, { method: "DELETE" });
}

export async function cloneTemplate(tenant: string, id: string): Promise<StoredTemplate> {
  const t = await req<ApiTemplate>(tenant, `${BASE}/${seg(id)}/clone`, { method: "POST" });
  return toTemplate(t);
}

export async function getAudit(tenant: string, id: string): Promise<AuditEvent[]> {
  const list = await req<ApiAudit[]>(tenant, `${BASE}/${seg(id)}/audit`);
  return list.map(toAudit);
}

/** Send a test email through the published Postmark template (reuses the send path). */
export function sendTest(
  tenant: string,
  id: string,
  body: { to: string; model?: Record<string, unknown> },
): Promise<unknown> {
  return req(tenant, `${BASE}/${seg(id)}/send-test`, { method: "POST", body: JSON.stringify(body) });
}

/** Highest checked-in version for a loaded template (0 when never checked in). */
export const latestVersion = (template: StoredTemplate): number => template.latestVersion;
