// Client for the shared DOCUMENTS layer (DOC-11), routed through the auth gateway
// (/api/documents/** → file-proxy → core-engine). The browser sends bytes to OUR API,
// NEVER to S3: no presigned URL, no bucket/region/key, no client-side checksum (core
// computes the SHA-256 authoritatively as the bytes stream through). Tenant-scoped via
// X-Tenant-Id; the gateway asserts the user (injects X-User-Id) — the browser NEVER
// sends X-User-Id. Mirrors emailApi/signaturesApi conventions (UPPERCASE statuses,
// timestamps in ms).
import { ApiError, authed, getAccessToken, refresh, tenantInit } from "./authApi";

const BASE_PATH = "/api/documents";

/** Where authed calls go: the auth gateway base URL other API calls in this app use. */
const GATEWAY_BASE = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");

export type DocumentKind = "FORM_ATTACHMENT" | "SIGNATURE_ATTACHMENT" | "GENERIC";
export type DocumentStatus = "PENDING" | "READY" | "QUARANTINED" | "DELETED";

/** The Document metadata record (DOC-3 contract). NEVER carries raw bytes or the
 *  server-only storageKey, and never crosses tenants. */
export type Document = {
  docId: string;
  processRef: string;
  processInstanceId?: string | null;
  taskId?: string | null;
  kind: DocumentKind;
  capability: string;
  ownerEntityId?: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  status: DocumentStatus;
  /** ms epoch; the object is retained (un-deletable) until this instant. */
  retainUntil?: number | null;
  createdBy: string;
  createdByName?: string | null;
  /** ms epoch. */
  createdAt: number;
};

/** Fields that accompany the file part in a POST /api/documents multipart request. */
export type UploadMeta = {
  /** The process business key = the S3 folder + case-file grouping (Flow A: minted up
   *  front; Flow B: a running businessKey). Required. */
  processRef: string;
  kind: DocumentKind;
  capability: string;
  taskId?: string;
  ownerEntityId?: string;
};

// LocalDateTime / Instant may arrive as ISO string, [Y,M,D,h,m,s] array (Jackson), or
// epoch millis — be tolerant (mirrors emailApi/formInstancesApi adapters).
const ms = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  if (Array.isArray(v) && v.length >= 3) {
    const [Y, Mo, D, h = 0, mi = 0, s = 0] = v as number[];
    return new Date(Y, Mo - 1, D, h, mi, s).getTime();
  }
  return undefined;
};

type ApiDocument = Omit<Document, "retainUntil" | "createdAt"> & {
  retainUntil?: unknown;
  createdAt?: unknown;
};

const toDocument = (d: ApiDocument): Document => ({
  docId: d.docId,
  processRef: d.processRef,
  processInstanceId: d.processInstanceId ?? null,
  taskId: d.taskId ?? null,
  kind: d.kind,
  capability: d.capability,
  ownerEntityId: d.ownerEntityId ?? null,
  filename: d.filename,
  contentType: d.contentType,
  sizeBytes: d.sizeBytes,
  sha256: d.sha256,
  status: d.status,
  retainUntil: ms(d.retainUntil) ?? null,
  createdBy: d.createdBy,
  createdByName: d.createdByName ?? null,
  createdAt: ms(d.createdAt) ?? 0,
});

/** Build the authed proxy content URL for a document (the bytes stream from S3 through
 *  core; supports HTTP Range). It carries no S3 marker. NOTE: this URL needs the
 *  Authorization/X-Tenant-Id headers, so it can't be dropped straight into <img src> /
 *  react-pdf file= — use {@link fetchContent} to get a blob URL instead (see DocumentView). */
export const contentUrl = (docId: string): string =>
  `${GATEWAY_BASE}${BASE_PATH}/${encodeURIComponent(docId)}/content`;

/** GET the document metadata (no bytes). */
export async function getDocument(
  tenant: string,
  docId: string,
  signal?: AbortSignal,
): Promise<Document> {
  const d = await authed<ApiDocument>(
    `${BASE_PATH}/${encodeURIComponent(docId)}`,
    tenantInit(tenant, { signal }),
  );
  return toDocument(d);
}

/** List documents for a process case file / task / kind / capability (no bytes). */
export async function listDocuments(
  tenant: string,
  query: { processRef?: string; taskId?: string; kind?: DocumentKind; capability?: string },
  signal?: AbortSignal,
): Promise<Document[]> {
  const qs = new URLSearchParams();
  if (query.processRef) qs.set("processRef", query.processRef);
  if (query.taskId) qs.set("taskId", query.taskId);
  if (query.kind) qs.set("kind", query.kind);
  if (query.capability) qs.set("capability", query.capability);
  const suffix = qs.toString() ? `?${qs}` : "";
  const list = await authed<unknown>(`${BASE_PATH}${suffix}`, tenantInit(tenant, { signal }));
  return Array.isArray(list) ? (list as ApiDocument[]).map(toDocument) : [];
}

/** Soft-delete a document (423 Locked if retention-locked). */
export function deleteDocument(tenant: string, docId: string): Promise<void> {
  return authed(`${BASE_PATH}/${encodeURIComponent(docId)}`, tenantInit(tenant, { method: "DELETE" }));
}

/**
 * Fetch the document bytes through the authed proxy as a Blob. <img> and react-pdf can't
 * attach our Authorization/X-Tenant-Id headers to a bare URL, so we fetch here (with the
 * gateway's one refresh-on-401 retry) and the caller wraps it in URL.createObjectURL —
 * mirroring how the signatures builder loads its source PDF. The byte stream still goes
 * only to OUR /api/documents/{id}/content, never to S3.
 *
 * NOTE: blob-fetching loads the whole object (no progressive Range streaming on the
 * client). The /content endpoint DOES support Range server-side; a future enhancement
 * could stream via a Range-aware loader, but that needs an auth scheme react-pdf can use
 * on a bare URL (e.g. a short-lived signed-cookie path — see DOC-12).
 */
export async function fetchContent(
  tenant: string,
  docId: string,
  retry = true,
): Promise<Blob> {
  const token = getAccessToken();
  const headers = new Headers();
  headers.set("X-Tenant-Id", tenant);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // NB: never set X-User-Id — the gateway asserts identity from the session.
  const res = await fetch(contentUrl(docId), { headers, credentials: "include" });
  if (res.status === 401 && retry) {
    const r = await refresh();
    if (r) return fetchContent(tenant, docId, false);
  }
  if (!res.ok) {
    throw new ApiError(res.status, `Could not load document content (${res.status})`);
  }
  return res.blob();
}

export type UploadHandle = {
  /** Resolves with the persisted Document (status READY) on success. */
  done: Promise<Document>;
  /** Abort the in-flight upload. */
  abort: () => void;
};

/**
 * POST a file as multipart/form-data to /api/documents via the auth gateway, reporting
 * upload progress and retrying ONCE on a network-level failure (not on HTTP errors —
 * a 413/403 is deterministic). Uses XMLHttpRequest because fetch has no upload-progress
 * events. The browser sends bytes to OUR API only; core computes the checksum.
 *
 * @param onProgress called with an integer percent 0..100 (only while total is known).
 */
export function uploadDocument(
  tenant: string,
  file: File,
  meta: UploadMeta,
  onProgress?: (percent: number) => void,
): UploadHandle {
  let xhr: XMLHttpRequest | null = null;
  let aborted = false;

  const attempt = (canRetry: boolean): Promise<Document> =>
    new Promise<Document>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file, file.name);
      // The broker (DOC-3) binds these as flat multipart form fields (@RequestParam), NOT a JSON part.
      form.append("processRef", meta.processRef);
      form.append("kind", meta.kind);
      form.append("capability", meta.capability);
      if (meta.taskId) form.append("taskId", meta.taskId);
      if (meta.ownerEntityId) form.append("ownerEntityId", meta.ownerEntityId);

      const req = new XMLHttpRequest();
      xhr = req;
      req.open("POST", uploadUrl(), true);
      req.withCredentials = true; // include the refresh cookie like fetch credentials:"include"
      const token = getAccessToken();
      if (token) req.setRequestHeader("Authorization", `Bearer ${token}`);
      req.setRequestHeader("X-Tenant-Id", tenant);
      // Do NOT set Content-Type — the browser sets the multipart boundary itself.
      // NEVER set X-User-Id — the gateway asserts the user from the session.

      req.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
        }
      };

      req.onload = () => {
        if (req.status >= 200 && req.status < 300) {
          try {
            const data = req.responseText ? JSON.parse(req.responseText) : {};
            onProgress?.(100);
            resolve(toDocument(data as ApiDocument));
          } catch {
            reject(new ApiError(req.status, "Malformed upload response"));
          }
        } else {
          // Deterministic HTTP error (413 over cap, 403 no access, …) — don't retry.
          let msg = `Upload failed (${req.status})`;
          try {
            const d = JSON.parse(req.responseText);
            msg = d?.message || d?.error || msg;
          } catch {
            /* keep default */
          }
          reject(new ApiError(req.status, msg));
        }
      };

      // Network-level failure (no HTTP status) — retry once.
      req.onerror = () => {
        if (canRetry && !aborted) {
          attempt(false).then(resolve, reject);
        } else {
          reject(new ApiError(0, "Network error during upload"));
        }
      };
      req.ontimeout = () => reject(new ApiError(0, "Upload timed out"));
      req.onabort = () => reject(new ApiError(0, "Upload cancelled"));

      req.send(form);
    });

  return {
    done: attempt(true),
    abort: () => {
      aborted = true;
      xhr?.abort();
    },
  };
}

const uploadUrl = (): string => `${GATEWAY_BASE}${BASE_PATH}`;

export { ApiError };
