// Attachments on a PUBLIC embedded form. Self-contained (no auth/session, no react-pdf — keeps the
// embed bundle light): upload files + list + remove, all token-scoped through /api/public/documents.
// The host page mints a high-entropy processRef and passes it here; on submit it links these to the
// created instance (see FormEmbedView). Bytes go to OUR API only, never to S3.
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, FileUp, Loader2, Paperclip, Trash2, X } from "lucide-react";
import {
  deleteEmbedDocument,
  listEmbedDocuments,
  uploadEmbedDocument,
  type EmbedDoc,
  type EmbedUploadHandle,
} from "../../lib/publicDocumentsApi";

type Phase = { state: "idle" } | { state: "uploading"; name: string; percent: number };

export default function EmbedAttachments({
  token,
  processRef,
  accept,
  maxBytes = 26_214_400, // 25 MiB — the server also enforces this (413)
  onCountChange,
}: {
  token: string;
  processRef: string;
  accept?: string;
  maxBytes?: number;
  /** Reports the current attachment count up to the host (drives the tab badge). */
  onCountChange?: (n: number) => void;
}) {
  const [docs, setDocs] = useState<EmbedDoc[]>([]);
  const [phase, setPhase] = useState<Phase>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleRef = useRef<EmbedUploadHandle | null>(null);

  const refresh = useCallback(
    (signal?: AbortSignal) =>
      listEmbedDocuments(token, processRef, signal)
        .then(setDocs)
        .catch(() => {}),
    [token, processRef],
  );

  useEffect(() => {
    const ctl = new AbortController();
    void refresh(ctl.signal);
    return () => ctl.abort();
  }, [refresh]);

  // Keep the host's tab badge in sync with the list.
  useEffect(() => {
    onCountChange?.(docs.length);
  }, [docs.length, onCountChange]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > maxBytes) {
      setError(`File is too large (max ${(maxBytes / (1024 * 1024)).toFixed(0)} MB).`);
      return;
    }
    setError(null);
    setPhase({ state: "uploading", name: file.name, percent: 0 });
    const handle = uploadEmbedDocument(token, processRef, file, (percent) =>
      setPhase((p) => (p.state === "uploading" ? { ...p, percent } : p)),
    );
    handleRef.current = handle;
    handle.done.then(
      (doc) => {
        handleRef.current = null;
        setPhase({ state: "idle" });
        setDocs((prev) => [doc, ...prev]);
        void refresh();
      },
      (err: unknown) => {
        handleRef.current = null;
        setPhase({ state: "idle" });
        setError(err instanceof Error ? err.message : "Upload failed.");
      },
    );
  };

  const remove = (doc: EmbedDoc) => {
    setBusyId(doc.docId);
    deleteEmbedDocument(token, processRef, doc.docId)
      .then(() => setDocs((prev) => prev.filter((d) => d.docId !== doc.docId)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not remove the file."))
      .finally(() => setBusyId(null));
  };

  const uploading = phase.state === "uploading";

  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Paperclip className="size-4" />
        Add any supporting files for this submission <span className="text-gray-400">(optional)</span>
      </p>

      <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={onPick} disabled={uploading} />

      {!uploading ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
        >
          <FileUp className="size-4" /> Add file
        </button>
      ) : (
        <div className="flex max-w-sm flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
            <span className="flex min-w-0 items-center gap-1.5">
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
              <span className="truncate" title={phase.name}>{phase.name}</span>
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              {phase.percent}%
              <button
                type="button"
                onClick={() => handleRef.current?.abort()}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10"
                aria-label="Cancel upload"
              >
                <X className="size-3.5" />
              </button>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-150" style={{ width: `${phase.percent}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-xs font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {docs.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {docs.map((doc) => (
            <li key={doc.docId} className="flex items-center gap-3 py-2">
              <FileText className="size-4 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200" title={doc.filename}>
                {doc.filename}
              </span>
              <span className="text-xs text-gray-400">{formatBytes(doc.sizeBytes)}</span>
              <button
                type="button"
                onClick={() => remove(doc)}
                disabled={busyId === doc.docId}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-error-50 hover:text-error-500 disabled:opacity-50 dark:hover:bg-error-500/10"
                aria-label={`Remove ${doc.filename}`}
              >
                {busyId === doc.docId ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
