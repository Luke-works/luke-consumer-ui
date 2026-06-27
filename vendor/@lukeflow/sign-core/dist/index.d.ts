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

type AuthOptions = {
    /** Base URL of the API (standalone engine, or the gateway post-merge). */
    baseUrl: string;
    /** Returns the current bearer token (or null when signed out). */
    getToken?: () => string | null | undefined;
    /** Refresh the session on a 401; return truthy to retry the request once. */
    refresh?: () => Promise<unknown>;
};
declare function createTransport(opts: AuthOptions): {
    base: string;
    parse: <T>(res: Response) => Promise<T>;
    authedFetch: (tenant: string, path: string, init?: RequestInit, retry?: boolean) => Promise<Response>;
    reqJson: <T>(tenant: string, path: string, init?: RequestInit) => Promise<T>;
};
declare const seg: (s: string) => string;

/** Field kinds a signer fills during the ceremony. SIGNATURE/INITIALS capture a drawn/typed mark. */
type SignatureFieldType = "SIGNATURE" | "INITIALS" | "DATE" | "NAME" | "TEXT";
declare const FIELD_TYPES: SignatureFieldType[];
declare const FIELD_TYPE_LABEL: Record<SignatureFieldType, string>;
/** A signing party. Equal `order` values sign in parallel; ascending orders sign sequentially. */
type SignerRole = {
    id: string;
    label: string;
    /** 1-based signing order. */
    order: number;
    /** Per-signer identity check (defaults to NONE). */
    verify?: VerificationMethod;
    /** UI accent for this signer's fields (hex). Optional; the builder assigns one. */
    color?: string;
};
/**
 * A placed field. Coordinates are PDF points, TOP-LEFT origin (the engine flips Y) — the same
 * convention as the runtime SignatureField, so geometry helpers apply directly.
 */
type SchemaField = {
    id: string;
    /** The SignerRole.id that fills this field. */
    signerId: string;
    type: SignatureFieldType;
    /** 0-based page index. */
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
    required?: boolean;
    /** Caption for TEXT fields (ignored for others). */
    label?: string;
};
/** The source document, referenced by an opaque DocumentStore key (bytes live in the engine). */
type SignatureDocumentRef = {
    /** DocumentStore key; undefined until a document has been uploaded for the definition. */
    key?: string;
    name: string;
    pageCount?: number;
};
/**
 * A declared data attribute / merge variable, e.g. {{fullName}}. The campaign supplies a value
 * per variable at instance-start; values flow into the contract (prefill / process vars).
 */
type SchemaVariable = {
    key: string;
    label: string;
    required?: boolean;
    description?: string;
};
type SignatureRouting = "sequential" | "parallel";
type SignatureSchemaSettings = {
    /** Override the default e-sign consent/legal notice shown in the ceremony. */
    legalNotice?: string;
    /** Auto-expire unsigned instances after N days. */
    expiresInDays?: number;
};
type SignatureSchema = {
    document: SignatureDocumentRef;
    signers: SignerRole[];
    fields: SchemaField[];
    /** Declared merge variables ({{key}}) the campaign fills at instance-start. */
    variables: SchemaVariable[];
    routing: SignatureRouting;
    settings?: SignatureSchemaSettings;
};
/** A validation finding. `level` "error" blocks sign-off/publish; "warning" is advisory. */
type SchemaProblem = {
    level: "error" | "warning";
    message: string;
    fieldId?: string;
    signerId?: string;
};
/** Default signer palette colors (cycled as roles are added). */
declare const SIGNER_COLORS: string[];
/** A fresh, empty-but-valid-shaped schema for a new definition. */
declare function defaultSignatureSchema(documentName?: string): SignatureSchema;
/** Stable-ish id generator that does NOT use Math.random at module-eval time (caller-driven). */
declare function nextId(prefix: string, existing: ReadonlyArray<{
    id: string;
}>): string;
/**
 * Validate a schema. Errors gate legal sign-off + publish (mirrors the forms model where a
 * version can be checked in with problems but not signed off / published while errors remain).
 */
declare function validateSignatureSchema(schema: SignatureSchema): SchemaProblem[];
/** True when the schema has no blocking errors (publishable / sign-off-able). */
declare function isSchemaSignable(schema: SignatureSchema): boolean;
/**
 * Coerce an unknown/partial value into a structurally-valid SignatureSchema. Drops fields that
 * reference missing signers, fills ids/defaults, and clamps enums — so a malformed stored draft
 * never crashes the builder (mirrors repairFormSchema).
 */
declare function repairSignatureSchema(input: unknown): SignatureSchema;
/** Parse a stored schema JSON string into a repaired SignatureSchema (never throws). */
declare function parseSignatureSchema(json: string | null | undefined): SignatureSchema;

/** Definition status (view-model casing, as the gateway emits). */
type SignatureDefinitionStatus = "draft" | "published" | "archived";
/** Snapshot of everything the gate needs. Kept flat so the host can assemble it cheaply. */
type LifecycleState = {
    status: SignatureDefinitionStatus;
    /** Is the current user holding the edit lock (checked out)? */
    checkedOut: boolean;
    /** Lock holder's id, if any (for "checked out by someone else"). */
    lockedBy?: string | null;
    /** The acting user's id (to compare against lockedBy). */
    userId?: string | null;
    /** Unsaved/unsnapshotted edits exist since the last check-in. */
    dirty: boolean;
    /** Highest checked-in version (0 = none yet). */
    latestVersion: number;
    /** Is the latest version signed off by legal? */
    latestVersionSignedOff: boolean;
    /** The live published version, if any. */
    publishedVersion?: number | null;
    /** Does the current draft pass schema validation (no blocking errors)? */
    schemaValid: boolean;
};
type LifecycleGate = {
    /** Someone else holds the lock — block edits, show takeover. */
    lockedByOther: boolean;
    /** May enter edit mode (acquire the lock). */
    canCheckout: boolean;
    /** May leave edit mode / discard the working draft. */
    canUndoCheckout: boolean;
    /** May snapshot the draft as a new immutable version (allowed even with errors). */
    canCheckIn: boolean;
    /** May record legal sign-off on the latest version (requires a clean, valid latest version). */
    canSignOff: boolean;
    /** May publish (promote the signed-off latest version live). */
    canPublish: boolean;
    /** May mint runtime instances (only when a published version exists). */
    canInstantiate: boolean;
    /** One-line reason the primary blocked action is unavailable (for tooltips). */
    reason?: string;
};
declare function lifecycleGate(s: LifecycleState): LifecycleGate;

/** A definition row (view model). `schema` is the editable draft JSON (a SignatureSchema). */
type StoredSignatureDefinition = {
    id: string;
    /** Stable external id (e.g. "SD-XKQW-27JUN26") — what runtime/Camunda resolves by. */
    code: string;
    name: string;
    description?: string;
    schema: string;
    status: SignatureDefinitionStatus;
    publishedVersion?: number | null;
    /** Highest checked-in version (0 = none). */
    latestVersion: number;
    /** Is the latest version signed off by legal? */
    latestVersionSignedOff: boolean;
    lockedBy?: string | null;
    deletedAt?: number | null;
    createdBy?: string;
    updatedBy?: string;
    createdByName?: string;
    updatedByName?: string;
    createdAt: number;
    updatedAt: number;
    /** Last legal review pass. */
    lastReviewedAt?: number | null;
    lastReviewedBy?: string | null;
};
/** An immutable checked-in version artifact. `signedOffAt` set = passed legal review. */
type SignatureArtifact = {
    version: number;
    schema: string;
    checkedInAt: number;
    by?: string;
    signedOffAt?: number | null;
    signedOffBy?: string | null;
};
type SignatureDefinitionAudit = {
    action: string;
    detail?: string;
    actor?: string;
    actorName?: string;
    at: number;
};
/** Result of uploading a source document at design time. */
type UploadedDocument = {
    key: string;
    name: string;
    pageCount?: number;
};
type SignatureDefinitionsClient = ReturnType<typeof createSignatureDefinitionsClient>;
/**
 * The design-time client. All calls are tenant-scoped and authed. Routes mirror the forms
 * definition API under `/api/signature-definitions` (the engine implements these as the
 * capability lands; the contract is fixed here so the consumer-ui can build against it).
 */
declare function createSignatureDefinitionsClient(opts: AuthOptions): {
    /** List definitions (optionally including soft-deleted). */
    list(tenant: string, opts2?: {
        deleted?: boolean;
    }): Promise<StoredSignatureDefinition[]>;
    get(tenant: string, id: string): Promise<StoredSignatureDefinition>;
    create(tenant: string, body: {
        name: string;
        description?: string;
    }): Promise<StoredSignatureDefinition>;
    patchMeta(tenant: string, id: string, body: {
        name?: string;
        description?: string;
    }): Promise<void>;
    /** Save the working draft (the SignatureSchema JSON). Debounce in the host. */
    saveDraft(tenant: string, id: string, schema: string): Promise<void>;
    /** Snapshot the draft as a new immutable version (allowed even with problems). */
    checkIn(tenant: string, id: string, schema: string): Promise<SignatureArtifact>;
    getVersions(tenant: string, id: string): Promise<SignatureArtifact[]>;
    getVersion(tenant: string, id: string, version: number): Promise<SignatureArtifact>;
    restoreVersion(tenant: string, id: string, version: number): Promise<void>;
    /** Record legal sign-off on the latest version (the review gate; enables publish). */
    signOff(tenant: string, id: string): Promise<StoredSignatureDefinition>;
    /** Publish a signed-off version live. */
    publish(tenant: string, id: string, version: number): Promise<void>;
    checkout(tenant: string, id: string, force?: boolean): Promise<StoredSignatureDefinition>;
    release(tenant: string, id: string, force?: boolean): Promise<void>;
    /** Discard the working draft, reverting to the published/latest version. */
    discard(tenant: string, id: string): Promise<void>;
    retire(tenant: string, id: string): Promise<void>;
    unretire(tenant: string, id: string): Promise<void>;
    softDelete(tenant: string, id: string): Promise<void>;
    restore(tenant: string, id: string): Promise<void>;
    purge(tenant: string, id: string): Promise<void>;
    audit(tenant: string, id: string): Promise<SignatureDefinitionAudit[]>;
    /** Upload the PDF to sign; returns the opaque key to store in schema.document.key. */
    uploadDocument(tenant: string, id: string, file: File): Promise<UploadedDocument>;
    /** Fetch a stored document by key (for rendering in the builder/preview). */
    fetchDocument(tenant: string, id: string, key: string): Promise<Blob>;
    /** Absolute URL of a stored document (when the host renders via a tokenized <embed>/viewer). */
    documentUrl(id: string, key: string): string;
};

/** Instance + per-recipient lifecycle states. */
type SignatureInstanceState = "CREATED" | "SENT" | "OPENED" | "IN_PROGRESS" | "COMPLETED" | "DECLINED" | "EXPIRED" | "CANCELLED";
type RecipientState = "PENDING" | "SENT" | "OPENED" | "SIGNED" | "DECLINED";
declare const SIGNATURE_INSTANCE_STATES: SignatureInstanceState[];
declare const isTerminalInstanceState: (s: string) => boolean;
/** The campaign instance (sender view). */
type SignatureInstance = {
    id: string;
    token: string;
    name: string;
    definitionCode: string;
    definitionVersion: number;
    state: SignatureInstanceState;
    /** Closure seal outcome: undefined until completed, then "SEALED" | "FAILED". */
    sealStatus?: "SEALED" | "FAILED" | null;
    /** Supplied data-attribute values ({{key}} → value). */
    values: Record<string, string>;
    /** Camunda binding (set once the process starts). */
    businessKey?: string;
    processInstanceId?: string | null;
    createdBy?: string;
    createdByName?: string;
    createdAt?: number;
    completedAt?: number;
    expiresAt?: number;
};
/** One recipient (signer) of an instance, with their signing link token (sender-visible). */
type InstanceRecipient = {
    signerId: string;
    name: string;
    email: string;
    order: number;
    verify: string;
    state: RecipientState;
    signToken: string;
    signedAt?: number;
};
type SignatureInstanceDetail = {
    instance: SignatureInstance;
    recipients: InstanceRecipient[];
};
/** Public per-recipient signing session (token-authenticated; the recipient's portion only). */
type RecipientSession = {
    documentName?: string;
    signerName: string;
    pdfBase64: string;
    fields: {
        id: string;
        type: string;
        page: number;
        x: number;
        y: number;
        w: number;
        h: number;
    }[];
    values: Record<string, string>;
    state: SignatureInstanceState;
};
/** Campaign-start input: bind recipients to signer roles + supply the variable values. */
type CampaignInput = {
    definitionCode: string;
    /** Pin a version; omit for the live published version. */
    version?: number;
    /** Optional campaign/contract name (defaults to the definition name). */
    name?: string;
    recipients: {
        signerId: string;
        name: string;
        email: string;
    }[];
    values?: Record<string, string>;
    expiresInDays?: number;
};
type RecipientSignInput = {
    signaturePngBase64: string;
    consent: boolean;
};
type SignatureInstancesClient = ReturnType<typeof createSignatureInstancesClient>;
/**
 * Runtime instance client. Authed/tenant-scoped for the sender (start/list/track/cancel); the
 * public per-recipient signing surface takes only the recipient token (no auth/tenant headers).
 */
declare function createSignatureInstancesClient(opts: AuthOptions): {
    /** Start a campaign → one instance + its recipients (with signing tokens). */
    startCampaign(tenant: string, input: CampaignInput): Promise<SignatureInstanceDetail>;
    listInstances(tenant: string, opts2?: {
        definitionCode?: string;
    }): Promise<SignatureInstance[]>;
    getInstance(tenant: string, id: string): Promise<SignatureInstanceDetail>;
    cancelInstance(tenant: string, id: string): Promise<SignatureInstance>;
    remindRecipient(tenant: string, id: string, signerId: string): Promise<void>;
    /** Retry sealing a completed instance whose closure seal failed. */
    reseal(tenant: string, id: string): Promise<SignatureInstance>;
    /** Download the final sealed PDF (COMPLETED + SEALED only). */
    downloadSigned(tenant: string, id: string): Promise<Blob>;
    getRecipientSession(token: string, signal?: AbortSignal): Promise<RecipientSession>;
    signAsRecipient(token: string, input: RecipientSignInput, signal?: AbortSignal): Promise<{
        ok: boolean;
    }>;
};

export { ApiError, type AuthOptions, type CampaignInput, type CreateSignatureInput, DEFAULT_FIELD_SIZE, FIELD_TYPES, FIELD_TYPE_LABEL, type InstanceRecipient, type LifecycleGate, type LifecycleState, type PdfGeometry, type RecipientSession, type RecipientSignInput, type RecipientState, SIGNATURE_INSTANCE_STATES, SIGNER_COLORS, type SchemaField, type SchemaProblem, type SchemaVariable, type SignatureArtifact, type SignatureAuditEvent, type SignatureDefinitionAudit, type SignatureDefinitionStatus, type SignatureDefinitionsClient, type SignatureDetail, type SignatureDocumentRef, type SignatureField, type SignatureFieldType, type SignatureInstance, type SignatureInstanceDetail, type SignatureInstanceState, type SignatureInstancesClient, type SignatureRequest, type SignatureRouting, type SignatureSchema, type SignatureSchemaSettings, type SignatureStatus, type SignaturesClient, type SignaturesClientOptions, type SignerRole, type SigningSession, type StoredSignatureDefinition, type SubmitSignatureInput, type UploadedDocument, type VerificationMethod, asArray, createSignatureDefinitionsClient, createSignatureInstancesClient, createSignaturesClient, createTransport, cssToPdf, defaultSignatureSchema, fieldToCssRect, isRotated, isSchemaSignable, isTerminalInstanceState, lifecycleGate, ms, nextId, parseSignatureSchema, placeField, repairSignatureSchema, seg, toAudit, toSignature, validateSignatureSchema };
