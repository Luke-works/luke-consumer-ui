// DocumentUpload (DOC-11) — a reusable control that POSTs one file as multipart/form-data
// to /api/documents through the auth gateway, with upload progress + one network retry.
// The browser sends bytes to OUR API only (never S3); core computes the checksum. The
// active tenant comes from the session (X-Tenant-Id); X-User-Id is NEVER sent.
//
// Styling mirrors the signatures pages (brand-/gray-/error- Tailwind tokens, lucide icons,
// dark-mode variants).
import { useCallback, useId, useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  uploadDocument,
  type Document,
  type DocumentKind,
  type UploadHandle,
} from "../../lib/documentsApi";

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

export type DocumentUploadProps = {
  /** Process business key (case-file folder). Flow A mints it up front; Flow B = a running businessKey. */
  processRef: string;
  kind: DocumentKind;
  capability: string;
  taskId?: string;
  ownerEntityId?: string;
  /** Called with the persisted Document (status READY) after a successful upload. */
  onUploaded: (doc: Document) => void;
  /** Optional <input accept> filter, e.g. "application/pdf,image/*". */
  accept?: string;
  /** Reject (client-side) files larger than this many bytes before uploading. The server
   *  also caps at LUKE_DOCSTORE_MAX_BYTES (413); this is just a friendlier early guard. */
  maxBytes?: number;
  /** Optional label for the choose-file button. */
  label?: string;
  className?: string;
};

type Phase =
  | { state: "idle" }
  | { state: "uploading"; filename: string; percent: number }
  | { state: "error"; message: string };

export default function DocumentUpload({
  processRef,
  kind,
  capability,
  taskId,
  ownerEntityId,
  onUploaded,
  accept,
  maxBytes,
  label = "Upload file",
  className,
}: DocumentUploadProps) {
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const [phase, setPhase] = useState<Phase>({ state: "idle" });

  const begin = useCallback(
    (file: File) => {
      if (!tenant) {
        setPhase({ state: "error", message: "No active organization — sign in and pick an org." });
        return;
      }
      if (maxBytes != null && file.size > maxBytes) {
        const mb = (maxBytes / (1024 * 1024)).toFixed(0);
        setPhase({ state: "error", message: `File is too large (max ${mb} MB).` });
        return;
      }
      setPhase({ state: "uploading", filename: file.name, percent: 0 });
      const handle = uploadDocument(
        tenant,
        file,
        { processRef, kind, capability, taskId, ownerEntityId },
        (percent) =>
          setPhase((p) => (p.state === "uploading" ? { ...p, percent } : p)),
      );
      handleRef.current = handle;
      handle.done.then(
        (doc) => {
          handleRef.current = null;
          setPhase({ state: "idle" });
          onUploaded(doc);
        },
        (err) => {
          handleRef.current = null;
          setPhase({
            state: "error",
            message: err instanceof Error ? err.message : "Upload failed.",
          });
        },
      );
    },
    [tenant, processRef, kind, capability, taskId, ownerEntityId, maxBytes, onUploaded],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input so re-picking the same file fires onChange again.
      e.target.value = "";
      if (file) begin(file);
    },
    [begin],
  );

  const cancel = useCallback(() => {
    handleRef.current?.abort();
    handleRef.current = null;
    setPhase({ state: "idle" });
  }, []);

  const uploading = phase.state === "uploading";

  return (
    <div className={className}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={onPick}
        disabled={uploading}
      />

      {!uploading && (
        <button
          type="button"
          className={`${BTN} bg-brand-500 text-white hover:bg-brand-600`}
          onClick={() => inputRef.current?.click()}
        >
          <FileUp className="size-4" /> {label}
        </button>
      )}

      {uploading && (
        <div className="flex w-full max-w-sm flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
            <span className="flex min-w-0 items-center gap-1.5">
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
              <span className="truncate" title={phase.filename}>{phase.filename}</span>
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              {phase.percent}%
              <button
                type="button"
                onClick={cancel}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10"
                aria-label="Cancel upload"
              >
                <X className="size-3.5" />
              </button>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-150"
              style={{ width: `${phase.percent}%` }}
              role="progressbar"
              aria-valuenow={phase.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      {phase.state === "error" && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">
          <span>{phase.message}</span>
          <button
            type="button"
            onClick={() => setPhase({ state: "idle" })}
            className="shrink-0 text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
