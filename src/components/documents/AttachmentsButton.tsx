// AttachmentsButton (DOC-11) — a drop-in top-right control that opens an Attachments panel for a
// case file (processRef). It lists the documents already attached, uploads new ones, views them
// inline (react-pdf / image / download), and deletes them — all through OUR API (/api/documents),
// never S3. Designed to sit in a form/task header; the count badge reflects current attachments.
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Modal } from "../ui/modal";
import { useAuth } from "../../context/AuthContext";
import DocumentUpload from "./DocumentUpload";
// Lazy so react-pdf (which needs DOMMatrix) loads only when a document is actually viewed —
// not when this button mounts. Keeps react-pdf out of the host page's chunk + jsdom unit tests.
const DocumentView = lazy(() => import("./DocumentView"));
import {
  deleteDocument,
  listDocuments,
  type Document,
  type DocumentKind,
} from "../../lib/documentsApi";

export type AttachmentsButtonProps = {
  /** Case-file folder these documents belong to (e.g. a form instance id). */
  processRef: string;
  capability: string;
  kind: DocumentKind;
  ownerEntityId?: string;
  taskId?: string;
  /** Optional <input accept> filter passed through to the uploader. */
  accept?: string;
  /** Client-side size guard (bytes) before upload; the server also caps (413). */
  maxBytes?: number;
  className?: string;
};

const ICON_BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5";

export default function AttachmentsButton({
  processRef,
  capability,
  kind,
  ownerEntityId,
  taskId,
  accept,
  maxBytes,
  className,
}: AttachmentsButtonProps) {
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;

  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Document | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(
    (signal?: AbortSignal) => {
      if (!tenant || !processRef) return Promise.resolve();
      setLoading(true);
      return listDocuments(tenant, { processRef, capability }, signal)
        .then((list) => {
          setDocs(list);
          setError(null);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Could not load attachments.");
        })
        .finally(() => setLoading(false));
    },
    [tenant, processRef, capability],
  );

  // Best-effort count for the badge (silent on failure — the panel surfaces errors).
  useEffect(() => {
    if (!tenant || !processRef) return;
    const ctrl = new AbortController();
    listDocuments(tenant, { processRef, capability }, ctrl.signal)
      .then(setDocs)
      .catch(() => {});
    return () => ctrl.abort();
  }, [tenant, processRef, capability]);

  const openPanel = () => {
    setSelected(null);
    setOpen(true);
    void refresh();
  };

  const onDelete = useCallback(
    (doc: Document) => {
      if (!tenant) return;
      setBusyId(doc.docId);
      deleteDocument(tenant, doc.docId)
        .then(() => {
          if (selected?.docId === doc.docId) setSelected(null);
          return refresh();
        })
        .catch((e: unknown) =>
          setError(e instanceof Error ? e.message : "Could not delete this attachment."),
        )
        .finally(() => setBusyId(null));
    },
    [tenant, selected, refresh],
  );

  const count = docs?.length ?? 0;

  return (
    <div className={className}>
      <button type="button" onClick={openPanel} className={ICON_BTN} aria-label="Attachments">
        <Paperclip className="size-4" />
        Attachments
        {count > 0 && (
          <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
            {count}
          </span>
        )}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        ariaLabel="Attachments"
        className="mx-4 w-full max-w-[680px]"
      >
        <div className="flex max-h-[85vh] flex-col p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2 pr-10">
            <Paperclip className="size-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Attachments</h2>
            {loading && <Loader2 className="size-4 animate-spin text-gray-400" />}
          </div>

          {selected ? (
            // ── Inline viewer ──────────────────────────────────────────────
            <div className="min-h-0 flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300"
              >
                <ArrowLeft className="size-4" /> Back to list
              </button>
              <p className="mb-3 truncate text-sm font-medium text-gray-700 dark:text-gray-200" title={selected.filename}>
                {selected.filename}
              </p>
              <Suspense
                fallback={
                  <div className="flex items-center gap-2 p-6 text-sm text-gray-400">
                    <Loader2 className="size-4 animate-spin" /> Loading viewer…
                  </div>
                }
              >
                <DocumentView
                  docId={selected.docId}
                  contentType={selected.contentType}
                  filename={selected.filename}
                  width={600}
                />
              </Suspense>
            </div>
          ) : (
            // ── Upload + list ──────────────────────────────────────────────
            <>
              <DocumentUpload
                processRef={processRef}
                kind={kind}
                capability={capability}
                ownerEntityId={ownerEntityId}
                taskId={taskId}
                accept={accept}
                maxBytes={maxBytes}
                label="Upload attachment"
                onUploaded={(doc) => {
                  setDocs((prev) => [doc, ...(prev ?? [])]);
                  void refresh();
                }}
              />

              {error && (
                <div className="mt-4 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">
                  {error}
                </div>
              )}

              <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
                {docs == null && loading ? (
                  <p className="py-8 text-center text-sm text-gray-400">Loading attachments…</p>
                ) : count === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No attachments yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {docs!.map((doc) => (
                      <li key={doc.docId} className="flex items-center gap-3 py-2.5">
                        <FileText className="size-5 shrink-0 text-gray-400" />
                        <button
                          type="button"
                          onClick={() => setSelected(doc)}
                          className="min-w-0 flex-1 text-left"
                          title={doc.filename}
                        >
                          <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                            {doc.filename}
                          </span>
                          <span className="block text-xs text-gray-400">
                            {formatBytes(doc.sizeBytes)}
                            {doc.status !== "READY" ? ` · ${doc.status}` : ""}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(doc)}
                          disabled={busyId === doc.docId}
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-error-50 hover:text-error-500 disabled:opacity-50 dark:hover:bg-error-500/10"
                          aria-label={`Delete ${doc.filename}`}
                        >
                          {busyId === doc.docId ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function formatBytes(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
