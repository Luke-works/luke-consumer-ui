// Client for PUBLIC (embed) document uploads — attachments on an unauthenticated embedded form.
// Like publicEmbedApi, there is NO bearer token and NO tenant header: the opaque embed token is the
// auth (the gateway forwards /api/public/** without auth; core verifies the token → unforgeable tenant).
// The browser uploads to a high-entropy processRef it minted (Flow-A); bytes go to OUR API, never S3.
const BASE = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");
const PATH = "/api/public/documents";

export type EmbedDoc = {
  docId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: string;
};

type ApiDoc = Partial<EmbedDoc> & { docId: string };

const toDoc = (d: ApiDoc): EmbedDoc => ({
  docId: d.docId,
  filename: d.filename ?? "file",
  contentType: d.contentType ?? "application/octet-stream",
  sizeBytes: d.sizeBytes ?? 0,
  status: d.status ?? "READY",
});

export type EmbedUploadHandle = {
  done: Promise<EmbedDoc>;
  abort: () => void;
};

/** POST one file (multipart) to /api/public/documents with {token, processRef}, reporting progress.
 *  XHR (fetch has no upload-progress); one network retry. No auth/tenant headers — token is the auth. */
export function uploadEmbedDocument(
  token: string,
  processRef: string,
  file: File,
  onProgress?: (percent: number) => void,
): EmbedUploadHandle {
  let xhr: XMLHttpRequest | null = null;
  let aborted = false;

  const attempt = (canRetry: boolean): Promise<EmbedDoc> =>
    new Promise<EmbedDoc>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("token", token);
      form.append("processRef", processRef);

      const req = new XMLHttpRequest();
      xhr = req;
      req.open("POST", `${BASE}${PATH}`, true);
      // No Authorization, no X-Tenant-Id, no X-User-Id — the embed token authorizes this.
      req.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      };
      req.onload = () => {
        if (req.status >= 200 && req.status < 300) {
          try {
            onProgress?.(100);
            resolve(toDoc(req.responseText ? (JSON.parse(req.responseText) as ApiDoc) : ({ docId: "" } as ApiDoc)));
          } catch {
            reject(new Error("Malformed upload response"));
          }
        } else {
          let msg = req.status === 413 ? "File is too large." : `Upload failed (${req.status}).`;
          if (req.status === 429) msg = "Too many uploads — wait a moment and try again.";
          try {
            const d = JSON.parse(req.responseText);
            msg = d?.message || d?.error || msg;
          } catch {
            /* keep default */
          }
          reject(new Error(msg));
        }
      };
      req.onerror = () => (canRetry && !aborted ? attempt(false).then(resolve, reject) : reject(new Error("Network error during upload")));
      req.ontimeout = () => reject(new Error("Upload timed out"));
      req.onabort = () => reject(new Error("Upload cancelled"));
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

/** List this session's uploaded attachments (token + processRef scope). */
export async function listEmbedDocuments(token: string, processRef: string, signal?: AbortSignal): Promise<EmbedDoc[]> {
  const qs = new URLSearchParams({ token, processRef });
  const res = await fetch(`${BASE}${PATH}?${qs}`, { signal });
  if (!res.ok) throw new Error(`Could not load attachments (${res.status}).`);
  const list = await res.json();
  return Array.isArray(list) ? (list as ApiDoc[]).map(toDoc) : [];
}

/** Remove one attachment before submit. */
export async function deleteEmbedDocument(token: string, processRef: string, docId: string): Promise<void> {
  const qs = new URLSearchParams({ token, processRef });
  const res = await fetch(`${BASE}${PATH}/${encodeURIComponent(docId)}?${qs}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(`Could not delete attachment (${res.status}).`);
}

/** After submit: bind this session's uploads to the created form instance (best-effort). */
export async function linkEmbedDocuments(token: string, processRef: string, instanceId: string): Promise<void> {
  await fetch(`${BASE}${PATH}/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, processRef, instanceId }),
  }).catch(() => {});
}
