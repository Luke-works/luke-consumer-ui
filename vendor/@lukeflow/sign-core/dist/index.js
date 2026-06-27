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

export { ApiError, DEFAULT_FIELD_SIZE, asArray, createSignaturesClient, cssToPdf, fieldToCssRect, isRotated, ms, placeField, toAudit, toSignature };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map