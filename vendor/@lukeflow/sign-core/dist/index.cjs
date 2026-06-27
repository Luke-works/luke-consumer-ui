'use strict';

// src/errors.ts
var ApiError = class extends Error {
  constructor(status, message, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
};

// src/geometry.ts
var DEFAULT_FIELD_SIZE = { w: 160, h: 50 };
var clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
var isRotated = (g) => g.rotate % 360 !== 0;
function cssToPdf(g, cssX, cssY) {
  return { x: cssX * g.pdfW / g.cssW, y: cssY * g.pdfH / g.cssH };
}
function fieldToCssRect(g, field) {
  const sx = g.cssW / g.pdfW;
  const sy = g.cssH / g.pdfH;
  return { left: field.x * sx, top: field.y * sy, width: field.w * sx, height: field.h * sy };
}
function placeField(g, cssX, cssY, size = DEFAULT_FIELD_SIZE, page = 0) {
  const { x: pdfX, y: pdfY } = cssToPdf(g, cssX, cssY);
  const w = Math.min(size.w, g.pdfW);
  const h = Math.min(size.h, g.pdfH);
  return {
    page,
    x: clamp(pdfX - w / 2, 0, Math.max(0, g.pdfW - w)),
    y: clamp(pdfY - h / 2, 0, Math.max(0, g.pdfH - h)),
    w,
    h
  };
}

// src/adapters.ts
var ms = (v) => {
  if (v == null) return void 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? void 0 : t;
  }
  if (Array.isArray(v) && v.length >= 3) {
    const [Y, Mo, D, h = 0, mi = 0, s = 0] = v;
    return new Date(Y, Mo - 1, D, h, mi, s).getTime();
  }
  return void 0;
};
function asArray(v) {
  return Array.isArray(v) ? v : [];
}
var toSignature = (a) => ({
  id: a.id,
  code: a.code,
  name: a.name,
  status: a.status,
  signerEmail: a.signerEmail,
  signerName: a.signerName,
  verificationMethod: a.verificationMethod ?? "NONE",
  field: a.field,
  createdBy: a.createdBy,
  createdByName: a.createdByName,
  retainUntil: ms(a.retainUntil),
  createdAt: ms(a.createdAt),
  sentAt: ms(a.sentAt),
  signedAt: ms(a.signedAt)
});
var toAudit = (a) => ({
  action: a.action,
  actor: a.actor,
  ipAddress: a.ipAddress,
  userAgent: a.userAgent,
  geoCountry: a.geoCountry,
  geoCity: a.geoCity,
  ipRisk: a.ipRisk,
  at: ms(a.at)
});

// src/client.ts
var seg = (s) => encodeURIComponent(s);
function createSignaturesClient(opts) {
  const base = (opts.baseUrl || "").replace(/\/$/, "");
  async function parse(res) {
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = data && (data.message || data.error) || `Request failed (${res.status})`;
      throw new ApiError(res.status, msg, data);
    }
    return data;
  }
  async function authedFetch(tenant, path, init = {}, retry = true) {
    const headers = new Headers(init.headers);
    headers.set("X-Tenant-Id", tenant);
    const token = opts.getToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${base}${path}`, { ...init, headers, credentials: "include" });
    if (res.status === 401 && retry && opts.refresh) {
      const r = await opts.refresh();
      if (r) return authedFetch(tenant, path, init, false);
    }
    return res;
  }
  const reqJson = (tenant, path, init = {}) => authedFetch(tenant, path, init).then(parse);
  return {
    /** Create a DRAFT from a PDF + metadata (multipart). */
    async createSignature(tenant, file, meta) {
      const form = new FormData();
      form.append("file", file);
      form.append("json", JSON.stringify(meta));
      return toSignature(await reqJson(tenant, "/api/signatures", { method: "POST", body: form }));
    },
    /** The tenant's requests, newest first. */
    async listSignatures(tenant) {
      return asArray(await reqJson(tenant, "/api/signatures")).map(toSignature);
    },
    /** A single request + its IP-stamped audit trail. */
    async getSignature(tenant, id) {
      const d = await reqJson(tenant, `/api/signatures/${seg(id)}`);
      return { request: toSignature(d.request), audit: asArray(d.audit).map(toAudit) };
    },
    /** Mint + return the public signing link (idempotent). */
    async sendSignature(tenant, id) {
      const r = await reqJson(tenant, `/api/signatures/${seg(id)}/send`, { method: "POST" });
      return r.signUrl;
    },
    /** Cancel a request. */
    async voidSignature(tenant, id) {
      return toSignature(await reqJson(tenant, `/api/signatures/${seg(id)}/void`, { method: "POST" }));
    },
    /** Download the sealed PDF (COMPLETED only) as a Blob. */
    async downloadSigned(tenant, id) {
      const res = await authedFetch(tenant, `/api/signatures/${seg(id)}/signed.pdf`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ApiError(res.status, text || `Download failed (${res.status})`, text);
      }
      return res.blob();
    },
    // ── Public signing surface (token-authenticated; NO auth/tenant headers) ──────────
    /** Load a signing session by token (marks VIEWED). Throws ApiError(404|410) for bad links. */
    async getSigningSession(token, signal) {
      return parse(await fetch(`${base}/api/public/sign/${seg(token)}`, { signal }));
    },
    /** Submit the drawn signature. Throws ApiError on 400/403/404/410. */
    async submitSignature(token, input, signal) {
      return parse(
        await fetch(`${base}/api/public/sign/${seg(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal
        })
      );
    }
  };
}

// src/http.ts
function createTransport(opts) {
  const base = (opts.baseUrl || "").replace(/\/$/, "");
  async function parse(res) {
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = data && (data.message || data.error) || `Request failed (${res.status})`;
      throw new ApiError(res.status, msg, data);
    }
    return data;
  }
  async function authedFetch(tenant, path, init = {}, retry = true) {
    const headers = new Headers(init.headers);
    headers.set("X-Tenant-Id", tenant);
    const token = opts.getToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${base}${path}`, { ...init, headers, credentials: "include" });
    if (res.status === 401 && retry && opts.refresh) {
      const r = await opts.refresh();
      if (r) return authedFetch(tenant, path, init, false);
    }
    return res;
  }
  const reqJson = (tenant, path, init = {}) => authedFetch(tenant, path, init).then(parse);
  return { base, parse, authedFetch, reqJson };
}
var seg2 = (s) => encodeURIComponent(s);

// src/schema.ts
var FIELD_TYPES = ["SIGNATURE", "INITIALS", "DATE", "NAME", "TEXT"];
var FIELD_TYPE_LABEL = {
  SIGNATURE: "Signature",
  INITIALS: "Initials",
  DATE: "Date signed",
  NAME: "Full name",
  TEXT: "Text"
};
var SIGNER_COLORS = ["#465fff", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2"];
function defaultSignatureSchema(documentName = "Untitled document") {
  return {
    document: { name: documentName },
    signers: [{ id: "signer-1", label: "Signer 1", order: 1, verify: "NONE", color: SIGNER_COLORS[0] }],
    fields: [],
    variables: [],
    routing: "sequential"
  };
}
function nextId(prefix, existing) {
  let n = existing.length + 1;
  const ids = new Set(existing.map((e) => e.id));
  while (ids.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function validateSignatureSchema(schema) {
  const problems = [];
  if (!schema.document?.name?.trim()) problems.push({ level: "error", message: "The document needs a name." });
  if (!schema.document?.key) problems.push({ level: "error", message: "Upload the document to sign." });
  if (!schema.signers.length) problems.push({ level: "error", message: "Add at least one signer." });
  if (!schema.fields.length) problems.push({ level: "error", message: "Place at least one field on the document." });
  const signerIds = new Set(schema.signers.map((s) => s.id));
  for (const f of schema.fields) {
    if (!signerIds.has(f.signerId)) {
      problems.push({ level: "error", message: `A ${FIELD_TYPE_LABEL[f.type] ?? "field"} is not assigned to a signer.`, fieldId: f.id });
    }
    if (schema.document.pageCount != null && (f.page < 0 || f.page >= schema.document.pageCount)) {
      problems.push({ level: "error", message: "A field is placed on a page that doesn't exist.", fieldId: f.id });
    }
  }
  for (const s of schema.signers) {
    if (!schema.fields.some((f) => f.signerId === s.id)) {
      problems.push({ level: "warning", message: `${s.label} has no fields to fill.`, signerId: s.id });
    }
  }
  const labels = schema.signers.map((s) => s.label.trim().toLowerCase());
  if (new Set(labels).size !== labels.length) {
    problems.push({ level: "warning", message: "Two signers share the same name." });
  }
  const seen = /* @__PURE__ */ new Set();
  for (const v of schema.variables ?? []) {
    if (!v.key?.trim()) problems.push({ level: "error", message: "A data attribute is missing its key." });
    else if (seen.has(v.key)) problems.push({ level: "error", message: `Duplicate data attribute "${v.key}".` });
    else seen.add(v.key);
  }
  return problems;
}
function isSchemaSignable(schema) {
  return !validateSignatureSchema(schema).some((p) => p.level === "error");
}
function repairSignatureSchema(input) {
  const base = defaultSignatureSchema();
  if (!input || typeof input !== "object") return base;
  const raw = input;
  const document = {
    name: typeof raw.document?.name === "string" && raw.document.name.trim() ? raw.document.name : base.document.name,
    key: typeof raw.document?.key === "string" ? raw.document.key : void 0,
    pageCount: typeof raw.document?.pageCount === "number" ? raw.document.pageCount : void 0
  };
  const signers = Array.isArray(raw.signers) ? raw.signers.filter((s) => !!s && typeof s.id === "string" && typeof s.label === "string").map((s, i) => ({
    id: s.id,
    label: s.label || `Signer ${i + 1}`,
    order: typeof s.order === "number" && s.order > 0 ? s.order : i + 1,
    verify: s.verify ?? "NONE",
    color: s.color ?? SIGNER_COLORS[i % SIGNER_COLORS.length]
  })) : base.signers;
  const safeSigners = signers.length ? signers : base.signers;
  const signerIds = new Set(safeSigners.map((s) => s.id));
  const fields = Array.isArray(raw.fields) ? raw.fields.filter(
    (f) => !!f && typeof f.id === "string" && typeof f.signerId === "string" && signerIds.has(f.signerId) && FIELD_TYPES.includes(f.type) && [f.page, f.x, f.y, f.w, f.h].every((n) => typeof n === "number")
  ).map((f) => ({
    id: f.id,
    signerId: f.signerId,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    required: f.required ?? true,
    label: typeof f.label === "string" ? f.label : void 0
  })) : [];
  const variables = Array.isArray(raw.variables) ? raw.variables.filter((v) => !!v && typeof v.key === "string" && v.key.trim().length > 0).map((v) => ({
    key: v.key,
    label: typeof v.label === "string" && v.label.trim() ? v.label : v.key,
    required: v.required ?? false,
    description: typeof v.description === "string" ? v.description : void 0
  })) : [];
  const routing = raw.routing === "parallel" ? "parallel" : "sequential";
  return { document, signers: safeSigners, fields, variables, routing, settings: raw.settings ?? void 0 };
}
function parseSignatureSchema(json) {
  if (!json) return defaultSignatureSchema();
  try {
    return repairSignatureSchema(JSON.parse(json));
  } catch {
    return defaultSignatureSchema();
  }
}

// src/lifecycle.ts
function lifecycleGate(s) {
  const lockedByOther = !!s.lockedBy && !!s.userId && s.lockedBy !== s.userId;
  const canCheckout = !s.checkedOut && !lockedByOther && s.status !== "archived";
  const canUndoCheckout = s.checkedOut;
  const canCheckIn = s.checkedOut && s.dirty;
  const canSignOff = s.latestVersion > 0 && !s.latestVersionSignedOff && s.schemaValid && !s.dirty;
  const canPublish = s.latestVersionSignedOff && s.publishedVersion !== s.latestVersion;
  const canInstantiate = (s.publishedVersion ?? 0) > 0;
  let reason;
  if (lockedByOther) reason = "Checked out by another user.";
  else if (!s.checkedOut) reason = "Check out to edit.";
  else if (s.dirty && !s.schemaValid) reason = "Fix the problems, then check in.";
  else if (s.latestVersion === 0) reason = "Check in a version first.";
  else if (!s.latestVersionSignedOff) reason = "Needs legal sign-off before publishing.";
  return { lockedByOther, canCheckout, canUndoCheckout, canCheckIn, canSignOff, canPublish, canInstantiate, reason };
}

// src/definitions.ts
var toDef = (a) => ({
  ...a,
  status: a.status,
  latestVersion: a.latestVersion ?? 0,
  latestVersionSignedOff: !!a.latestVersionSignedOff,
  createdAt: ms(a.createdAt) ?? 0,
  updatedAt: ms(a.updatedAt) ?? 0,
  deletedAt: ms(a.deletedAt) ?? null,
  lastReviewedAt: ms(a.lastReviewedAt) ?? null
});
var toArtifact = (a) => ({
  version: a.version,
  schema: a.schema,
  by: a.by,
  signedOffBy: a.signedOffBy,
  checkedInAt: ms(a.checkedInAt) ?? 0,
  signedOffAt: ms(a.signedOffAt) ?? null
});
var toAudit2 = (a) => ({
  action: a.action,
  detail: a.detail,
  actor: a.actor,
  actorName: a.actorName,
  at: ms(a.at) ?? 0
});
var asArr = (v) => Array.isArray(v) ? v : [];
function createSignatureDefinitionsClient(opts) {
  const { reqJson, authedFetch, base } = createTransport(opts);
  const ROOT = "/api/signature-definitions";
  return {
    /** List definitions (optionally including soft-deleted). */
    async list(tenant, opts2) {
      const q = opts2?.deleted ? "?deleted=true" : "";
      return asArr(await reqJson(tenant, `${ROOT}${q}`)).map(toDef);
    },
    async get(tenant, id) {
      return toDef(await reqJson(tenant, `${ROOT}/${seg2(id)}`));
    },
    async create(tenant, body) {
      return toDef(await reqJson(tenant, ROOT, { method: "POST", body: JSON.stringify(body) }));
    },
    async patchMeta(tenant, id, body) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    // ── draft + versions ──────────────────────────────────────────────────────────
    /** Save the working draft (the SignatureSchema JSON). Debounce in the host. */
    async saveDraft(tenant, id, schema) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/draft`, { method: "PUT", body: JSON.stringify({ schema }) });
    },
    /** Snapshot the draft as a new immutable version (allowed even with problems). */
    async checkIn(tenant, id, schema) {
      return toArtifact(
        await reqJson(tenant, `${ROOT}/${seg2(id)}/versions`, { method: "POST", body: JSON.stringify({ schema }) })
      );
    },
    async getVersions(tenant, id) {
      return asArr(await reqJson(tenant, `${ROOT}/${seg2(id)}/versions`)).map(toArtifact);
    },
    async getVersion(tenant, id, version) {
      return toArtifact(await reqJson(tenant, `${ROOT}/${seg2(id)}/versions/${version}`));
    },
    async restoreVersion(tenant, id, version) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/versions/${version}/restore`, { method: "POST" });
    },
    // ── legal review + publish ──────────────────────────────────────────────────────
    /** Record legal sign-off on the latest version (the review gate; enables publish). */
    async signOff(tenant, id) {
      return toDef(await reqJson(tenant, `${ROOT}/${seg2(id)}/sign-off`, { method: "POST" }));
    },
    /** Publish a signed-off version live. */
    async publish(tenant, id, version) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/versions/${version}/publish`, { method: "POST" });
    },
    // ── advisory edit lock ──────────────────────────────────────────────────────────
    async checkout(tenant, id, force = false) {
      return toDef(await reqJson(tenant, `${ROOT}/${seg2(id)}/checkout?force=${force}`, { method: "POST" }));
    },
    async release(tenant, id, force = false) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/release?force=${force}`, { method: "POST" });
    },
    /** Discard the working draft, reverting to the published/latest version. */
    async discard(tenant, id) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/discard`, { method: "POST" });
    },
    // ── archive + delete ────────────────────────────────────────────────────────────
    async retire(tenant, id) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/retire`, { method: "POST" });
    },
    async unretire(tenant, id) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/unretire`, { method: "POST" });
    },
    async softDelete(tenant, id) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}`, { method: "DELETE" });
    },
    async restore(tenant, id) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/restore`, { method: "POST" });
    },
    async purge(tenant, id) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/purge`, { method: "DELETE" });
    },
    async audit(tenant, id) {
      return asArr(await reqJson(tenant, `${ROOT}/${seg2(id)}/audit`)).map(toAudit2);
    },
    // ── source document (DocumentStore) ─────────────────────────────────────────────
    /** Upload the PDF to sign; returns the opaque key to store in schema.document.key. */
    async uploadDocument(tenant, id, file) {
      const form = new FormData();
      form.append("file", file);
      return reqJson(tenant, `${ROOT}/${seg2(id)}/document`, { method: "POST", body: form });
    },
    /** Fetch a stored document by key (for rendering in the builder/preview). */
    async fetchDocument(tenant, id, key) {
      const res = await authedFetch(tenant, `${ROOT}/${seg2(id)}/document/${seg2(key)}`);
      if (!res.ok) throw new Error(`document fetch failed (${res.status})`);
      return res.blob();
    },
    /** Absolute URL of a stored document (when the host renders via a tokenized <embed>/viewer). */
    documentUrl(id, key) {
      return `${base}${ROOT}/${seg2(id)}/document/${seg2(key)}`;
    }
  };
}

// src/instance.ts
var SIGNATURE_INSTANCE_STATES = [
  "CREATED",
  "SENT",
  "OPENED",
  "IN_PROGRESS",
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED"
];
var TERMINAL = /* @__PURE__ */ new Set(["COMPLETED", "DECLINED", "EXPIRED", "CANCELLED"]);
var isTerminalInstanceState = (s) => TERMINAL.has(s);
var toInstance = (a) => ({
  ...a,
  values: a.values ?? {},
  createdAt: ms(a.createdAt),
  completedAt: ms(a.completedAt),
  expiresAt: ms(a.expiresAt)
});
var toRecipient = (r) => ({ ...r, signedAt: ms(r.signedAt) });
var toDetail = (d) => ({
  instance: toInstance(d.instance),
  recipients: Array.isArray(d.recipients) ? d.recipients.map(toRecipient) : []
});
var asArr2 = (v) => Array.isArray(v) ? v : [];
function createSignatureInstancesClient(opts) {
  const { base, reqJson, parse, authedFetch } = createTransport(opts);
  const ROOT = "/api/signature-instances";
  return {
    /** Start a campaign → one instance + its recipients (with signing tokens). */
    async startCampaign(tenant, input) {
      return toDetail(await reqJson(tenant, ROOT, { method: "POST", body: JSON.stringify(input) }));
    },
    async listInstances(tenant, opts2) {
      const q = opts2?.definitionCode ? `?definitionCode=${seg2(opts2.definitionCode)}` : "";
      return asArr2(await reqJson(tenant, `${ROOT}${q}`)).map(toInstance);
    },
    async getInstance(tenant, id) {
      return toDetail(await reqJson(tenant, `${ROOT}/${seg2(id)}`));
    },
    async cancelInstance(tenant, id) {
      return toInstance(await reqJson(tenant, `${ROOT}/${seg2(id)}/cancel`, { method: "POST" }));
    },
    async remindRecipient(tenant, id, signerId) {
      await reqJson(tenant, `${ROOT}/${seg2(id)}/recipients/${seg2(signerId)}/remind`, { method: "POST" });
    },
    /** Retry sealing a completed instance whose closure seal failed. */
    async reseal(tenant, id) {
      return toInstance(await reqJson(tenant, `${ROOT}/${seg2(id)}/seal`, { method: "POST" }));
    },
    /** Download the final sealed PDF (COMPLETED + SEALED only). */
    async downloadSigned(tenant, id) {
      const res = await authedFetch(tenant, `${ROOT}/${seg2(id)}/signed.pdf`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ApiError(res.status, text || `Download failed (${res.status})`, text);
      }
      return res.blob();
    },
    // ── public per-recipient signing (token = sole auth; NO tenant header) ─────────────
    async getRecipientSession(token, signal) {
      return parse(await fetch(`${base}/api/public/sign-instance/${seg2(token)}`, { signal }));
    },
    async signAsRecipient(token, input, signal) {
      return parse(
        await fetch(`${base}/api/public/sign-instance/${seg2(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal
        })
      );
    }
  };
}

exports.ApiError = ApiError;
exports.DEFAULT_FIELD_SIZE = DEFAULT_FIELD_SIZE;
exports.FIELD_TYPES = FIELD_TYPES;
exports.FIELD_TYPE_LABEL = FIELD_TYPE_LABEL;
exports.SIGNATURE_INSTANCE_STATES = SIGNATURE_INSTANCE_STATES;
exports.SIGNER_COLORS = SIGNER_COLORS;
exports.asArray = asArray;
exports.createSignatureDefinitionsClient = createSignatureDefinitionsClient;
exports.createSignatureInstancesClient = createSignatureInstancesClient;
exports.createSignaturesClient = createSignaturesClient;
exports.createTransport = createTransport;
exports.cssToPdf = cssToPdf;
exports.defaultSignatureSchema = defaultSignatureSchema;
exports.fieldToCssRect = fieldToCssRect;
exports.isRotated = isRotated;
exports.isSchemaSignable = isSchemaSignable;
exports.isTerminalInstanceState = isTerminalInstanceState;
exports.lifecycleGate = lifecycleGate;
exports.ms = ms;
exports.nextId = nextId;
exports.parseSignatureSchema = parseSignatureSchema;
exports.placeField = placeField;
exports.repairSignatureSchema = repairSignatureSchema;
exports.seg = seg2;
exports.toAudit = toAudit;
exports.toSignature = toSignature;
exports.validateSignatureSchema = validateSignatureSchema;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map