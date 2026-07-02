// Client for the capability-engine form lifecycle, routed through the gateway
// (/api/form-definitions/** → core-engine proxy → capability-engine). Every call
// is tenant-scoped (X-Tenant-Id) and gated by the FORMS capability server-side
// (GET = read, mutations = read-write). This replaces the old browser-local store.
import { authed, tenantInit, asArray } from "./authApi";

const BASE = "/api/form-definitions";
const seg = (s: string) => encodeURIComponent(s);

// ── View models (what the UI works with) ────────────────────────────────────
export type FormStatus = "draft" | "published" | "archived";

/** Authoring intent, chosen at creation. INBOUND = embedded (public submissions);
 *  OUTBOUND = prefilled by a preparer and sent to a named recipient (never embeddable). */
export type FormKind = "INBOUND" | "OUTBOUND";

/** Who fills an outbound field. */
export type FieldRole = "PREPARER" | "RECIPIENT" | "EITHER";

export type StoredForm = {
  id: string;
  code: string;
  name: string;
  description?: string;
  /** Editable working draft (coltorapps schema JSON, "" when empty). */
  schema: string;
  /** Inbound vs outbound (defaults to INBOUND for legacy forms). */
  kind: FormKind;
  /** Inbound only: chosen submission handling (e.g. "COLLECT"); null = undecided → embed stays gated. */
  submissionHandling?: string | null;
  /** Outbound only: fieldKey → role map. */
  outboundRoles?: Record<string, FieldRole>;
  status: FormStatus;
  publishedVersion?: number;
  /** Highest checked-in version (0 when none). Populated on single-form loads. */
  latestVersion: number;
  /** Whether that latest version is signed off (⟺ publishable). Single-form loads. */
  latestVersionSignedOff: boolean;
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
export type FormArtifact = { version: number; schema: string; checkedInAt: number; by?: string; signedOffAt?: number | null };

/** One entry in a form's activity feed. */
export type AuditEvent = { action: string; detail?: string; actor?: string; actorName?: string; at: number };

// ── Backend DTOs ────────────────────────────────────────────────────────────
type ApiForm = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string; // DRAFT | PUBLISHED | RETIRED
  kind?: string | null; // INBOUND | OUTBOUND
  submissionHandling?: string | null;
  outboundRolesJson?: string | null;
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
type ApiVersion = { version: number; schema: string; checkedInBy?: string | null; checkedInAt: string; signedOffAt?: string | null; signedOffBy?: string | null };
type ApiAudit = { action: string; detail?: string | null; actor?: string | null; actorName?: string | null; at: string };

// ── Adapters (backend ⇄ view model) ─────────────────────────────────────────
const STATUS_IN: Record<string, FormStatus> = { DRAFT: "draft", PUBLISHED: "published", RETIRED: "archived" };
const ms = (iso?: string | null): number => (iso ? Date.parse(iso) : 0);

function toForm(f: ApiForm, latestVersion = 0, latestVersionSignedOff = false): StoredForm {
  return {
    id: f.id,
    code: f.code,
    name: f.name,
    description: f.description ?? undefined,
    schema: f.draftSchema ?? "",
    kind: f.kind === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
    submissionHandling: f.submissionHandling ?? null,
    outboundRoles: parseRoles(f.outboundRolesJson),
    status: STATUS_IN[f.status] ?? "draft",
    publishedVersion: f.publishedVersion ?? undefined,
    latestVersion,
    latestVersionSignedOff,
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
  signedOffAt: v.signedOffAt ? ms(v.signedOffAt) : null,
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
  const max = maxVersion(versions);
  const latestSignedOff = !!versions.find((v) => v.version === max)?.signedOffAt;
  return toForm(form, max, latestSignedOff);
}

function parseRoles(json?: string | null): Record<string, FieldRole> | undefined {
  if (!json) return undefined;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, FieldRole>) : undefined;
  } catch {
    return undefined;
  }
}

export async function createForm(
  tenant: string,
  name: string,
  description?: string,
  kind: FormKind = "INBOUND",
): Promise<StoredForm> {
  const f = await req<ApiForm>(tenant, BASE, { method: "POST", body: JSON.stringify({ name, description, kind }) });
  return toForm(f);
}

/** Inbound only: choose what happens to submissions (defaults to "COLLECT"). Unlocks embedding. */
export async function setSubmissionHandling(tenant: string, id: string, mode = "COLLECT"): Promise<StoredForm> {
  const f = await req<ApiForm>(tenant, `${BASE}/${seg(id)}/submission-handling`, {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
  return toForm(f);
}

/** Outbound only: store the per-field fill-role map (fieldKey → PREPARER | RECIPIENT | EITHER). */
export async function setOutboundConfig(
  tenant: string,
  id: string,
  roles: Record<string, FieldRole>,
): Promise<StoredForm> {
  const f = await req<ApiForm>(tenant, `${BASE}/${seg(id)}/outbound-config`, {
    method: "PUT",
    body: JSON.stringify({ roles }),
  });
  return toForm(f);
}

/** Outbound send: create a prefilled instance for a recipient and email them the /respond link. */
export type OutboundSendResult = { instanceId: string; token: string; link: string; emailStatus: string };
export function sendOutbound(
  tenant: string,
  id: string,
  recipient: { firstName?: string; lastName?: string; email: string },
  prefill?: Record<string, unknown>,
  expiresAt?: number,
): Promise<OutboundSendResult> {
  return req(tenant, `${BASE}/${seg(id)}/send`, {
    method: "POST",
    body: JSON.stringify({ recipient, prefill, expiresAt }),
  });
}

/** The field→variable contract for a form's resolved schema (pin: published | latest | draft | v{n}). */
export type FieldContract = { key: string; type: string; required: boolean; conditional: boolean; disabled?: boolean; label?: string };
export async function getFields(tenant: string, code: string, pin = "latest"): Promise<FieldContract[]> {
  const r = await req<{ fields: FieldContract[] }>(tenant, `${BASE}/by-code/${seg(code)}/fields?pin=${pin}`);
  return asArray<FieldContract>(r.fields);
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

/** Check in (snapshot) the draft as a new immutable version. Never publishes — that's a
 *  separate, sign-off-gated step ({@link publishVersion}). Errors / WIP are allowed. */
export async function checkIn(tenant: string, id: string, schema: string): Promise<FormArtifact> {
  const v = await req<ApiVersion>(tenant, `${BASE}/${seg(id)}/versions`, {
    method: "POST",
    body: JSON.stringify({ schema }),
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

/** Revoke all existing embed tokens for this form (bumps the embed-key version) and return a fresh
 *  one. The previously-pasted snippet stops working everywhere (Route B M4). */
export async function rotateEmbedToken(
  tenant: string,
  id: string,
): Promise<{ token: string; code: string; allowedEmbedOrigins?: string | null }> {
  return req(tenant, `${BASE}/${seg(id)}/embed-token/rotate`, { method: "POST" });
}

/** Record that the form passed its self-test ("Test the form" sign-off). */
export async function signOffTest(tenant: string, id: string): Promise<StoredForm> {
  const f = await req<ApiForm>(tenant, `${BASE}/${seg(id)}/sign-off`, { method: "POST" });
  return toForm(f);
}

/** Highest checked-in version for a loaded form (0 when never checked in). */
export const latestVersion = (form: StoredForm): number => form.latestVersion;
