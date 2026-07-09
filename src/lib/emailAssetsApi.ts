// Client for uploading EMAIL ASSETS (images/logos used in email templates) to the
// dedicated public email-asset store. Bytes go to OUR gateway (→ luke-file-proxy →
// S3); the response gives an assetId, from which we build the DURABLE, PUBLIC URL a
// recipient's mail client loads via a bare <img src> (no auth):
//   {GATEWAY}/api/public/email-assets/{assetId}
// Scoped to tenant + template, EMAIL-capability gated on upload (enforced server-side).
// Mirrors uploadDocument (XHR for upload-progress; the browser sends bytes to us only).
import { ApiError, getAccessToken } from "./authApi";

const GATEWAY_BASE = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");

/** The durable, public URL for a stored email asset — safe to embed in a sent email. */
export function emailAssetUrl(assetId: string): string {
  return `${GATEWAY_BASE}/api/public/email-assets/${encodeURIComponent(assetId)}`;
}

export type UploadedEmailAsset = { assetId: string; url: string };

/**
 * Upload an image to the email-asset store for a template. Resolves with the assetId
 * and its public URL. Reports progress 0..100 when available.
 */
export function uploadEmailAsset(
  tenant: string,
  templateId: string | null | undefined,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedEmailAsset> {
  return new Promise<UploadedEmailAsset>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, file.name);
    if (templateId) form.append("templateId", templateId);

    const req = new XMLHttpRequest();
    req.open("POST", `${GATEWAY_BASE}/api/email-assets`, true);
    req.withCredentials = true; // include the refresh cookie (like fetch credentials:"include")
    const token = getAccessToken();
    if (token) req.setRequestHeader("Authorization", `Bearer ${token}`);
    req.setRequestHeader("X-Tenant-Id", tenant);
    // Do NOT set Content-Type — the browser sets the multipart boundary.
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
          const assetId = data?.assetId as string | undefined;
          if (!assetId) {
            reject(new ApiError(req.status, "Upload response had no assetId"));
            return;
          }
          onProgress?.(100);
          resolve({ assetId, url: emailAssetUrl(assetId) });
        } catch {
          reject(new ApiError(req.status, "Malformed upload response"));
        }
      } else {
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

    req.onerror = () => reject(new ApiError(0, "Network error during upload"));
    req.ontimeout = () => reject(new ApiError(0, "Upload timed out"));
    req.send(form);
  });
}
