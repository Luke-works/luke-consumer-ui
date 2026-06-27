type SignatureStatus = "DRAFT" | "SENT" | "VIEWED" | "SIGNED" | "COMPLETED" | "VOIDED";
type VerificationMethod = "NONE" | "EMAIL_OTP" | "SMS_OTP" | "IDV";
/** Field placement in PDF points with a TOP-LEFT origin (the engine flips Y for the PDF). */
type SignatureField = {
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
};
type SignatureRequest = {
    id: string;
    code: string;
    name: string;
    status: SignatureStatus;
    signerEmail: string;
    signerName: string;
    verificationMethod: VerificationMethod;
    field: SignatureField;
    createdBy?: string;
    createdByName?: string;
    retainUntil?: number;
    createdAt?: number;
    sentAt?: number;
    signedAt?: number;
};
type SignatureAuditEvent = {
    action: string;
    actor?: string;
    ipAddress?: string;
    userAgent?: string;
    geoCountry?: string;
    geoCity?: string;
    ipRisk?: string;
    at?: number;
};
type SignatureDetail = {
    request: SignatureRequest;
    audit: SignatureAuditEvent[];
};
type SigningSession = {
    name: string;
    signerName: string;
    field: SignatureField;
    pdfBase64: string;
    verification: {
        required: boolean;
        method: VerificationMethod;
        sentTo?: string | null;
    };
};
/** Geometry reported by a rendered PDF page: native PDF size (points), rendered size (CSS px), rotation. */
type PdfGeometry = {
    pdfW: number;
    pdfH: number;
    cssW: number;
    cssH: number;
    /** Page /Rotate in degrees; non-zero means coords won't match the engine's un-rotated mediabox. */
    rotate: number;
};
/** Metadata for creating a request (the JSON part of the multipart upload). */
type CreateSignatureInput = {
    name: string;
    signerEmail: string;
    signerName: string;
    field: SignatureField;
    verificationMethod?: VerificationMethod;
    signerPhone?: string;
};
/** Public signer submission. */
type SubmitSignatureInput = {
    signaturePngBase64: string;
    consent: boolean;
    signerNameTyped?: string;
};

/** Thrown by the client on a non-2xx response. `status` lets callers branch (404/410/403/400…). */
declare class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, message: string, data?: unknown);
}

/** Fixed signature-field size in PDF points (matches the engine defaults). */
declare const DEFAULT_FIELD_SIZE: {
    readonly w: 160;
    readonly h: 50;
};
/** A rotated page (/Rotate ≠ 0) would misplace the stamp — callers refuse to place/sign on it. */
declare const isRotated: (g: PdfGeometry) => boolean;
/** Convert a click in rendered CSS pixels (relative to the page) to PDF points (top-left origin). */
declare function cssToPdf(g: PdfGeometry, cssX: number, cssY: number): {
    x: number;
    y: number;
};
/** Convert a field rect (PDF points) to a CSS-pixel overlay rect for the rendered page. */
declare function fieldToCssRect(g: PdfGeometry, field: SignatureField): {
    left: number;
    top: number;
    width: number;
    height: number;
};
/**
 * Place a fixed-size field centered on a click, clamped to the page. Size is clamped to the
 * page first (never overflow a small page), then the origin.
 */
declare function placeField(g: PdfGeometry, cssX: number, cssY: number, size?: {
    w: number;
    h: number;
}, page?: number): SignatureField;

/** Timestamps may arrive as epoch millis, an ISO string, or a Jackson [Y,M,D,h,m,s] array. */
declare const ms: (v: unknown) => number | undefined;
/** Defensive: coerce an unknown response to an array (some error bodies aren't arrays). */
declare function asArray<T>(v: unknown): T[];
type ApiSignature = Omit<SignatureRequest, "retainUntil" | "createdAt" | "sentAt" | "signedAt"> & {
    retainUntil?: unknown;
    createdAt?: unknown;
    sentAt?: unknown;
    signedAt?: unknown;
};
type ApiAudit = Omit<SignatureAuditEvent, "at"> & {
    at?: unknown;
};
declare const toSignature: (a: ApiSignature) => SignatureRequest;
declare const toAudit: (a: ApiAudit) => SignatureAuditEvent;

type SignaturesClientOptions = {
    /** Base URL of the signatures API (the standalone engine, or the gateway post-merge). */
    baseUrl: string;
    /** Returns the current bearer access token (or null when signed out). Optional. */
    getToken?: () => string | null | undefined;
    /** Refresh the session on a 401; return truthy to retry the request once. Optional. */
    refresh?: () => Promise<unknown>;
};
type SignaturesClient = ReturnType<typeof createSignaturesClient>;
declare function createSignaturesClient(opts: SignaturesClientOptions): {
    /** Create a DRAFT from a PDF + metadata (multipart). */
    createSignature(tenant: string, file: File, meta: CreateSignatureInput): Promise<SignatureRequest>;
    /** The tenant's requests, newest first. */
    listSignatures(tenant: string): Promise<SignatureRequest[]>;
    /** A single request + its IP-stamped audit trail. */
    getSignature(tenant: string, id: string): Promise<SignatureDetail>;
    /** Mint + return the public signing link (idempotent). */
    sendSignature(tenant: string, id: string): Promise<string>;
    /** Cancel a request. */
    voidSignature(tenant: string, id: string): Promise<SignatureRequest>;
    /** Download the sealed PDF (COMPLETED only) as a Blob. */
    downloadSigned(tenant: string, id: string): Promise<Blob>;
    /** Load a signing session by token (marks VIEWED). Throws ApiError(404|410) for bad links. */
    getSigningSession(token: string, signal?: AbortSignal): Promise<SigningSession>;
    /** Submit the drawn signature. Throws ApiError on 400/403/404/410. */
    submitSignature(token: string, input: SubmitSignatureInput, signal?: AbortSignal): Promise<{
        ok: boolean;
    }>;
};

export { ApiError, type CreateSignatureInput, DEFAULT_FIELD_SIZE, type PdfGeometry, type SignatureAuditEvent, type SignatureDetail, type SignatureField, type SignatureRequest, type SignatureStatus, type SignaturesClient, type SignaturesClientOptions, type SigningSession, type SubmitSignatureInput, type VerificationMethod, asArray, createSignaturesClient, cssToPdf, fieldToCssRect, isRotated, ms, placeField, toAudit, toSignature };
