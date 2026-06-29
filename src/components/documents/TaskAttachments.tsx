// TaskAttachments — the Attachments section for a task reading pane (the Form Inbox). Lists a case
// file's documents through OUR API (/api/documents, never S3), CLASSIFIED as Task attachments (bound to
// this Camunda task) vs Process attachments (case-level). A reviewer can PREVIEW each in a modal and
// DOWNLOAD it — but NOT delete it (submitted attachments are read-only here). Reviewers may still attach
// their own task-scoped document. Uses lazy DocumentView so react-pdf stays out of jsdom + the host chunk.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Loader2, Paperclip } from "lucide-react";
import { Modal } from "../ui/modal";
import DocumentUpload from "./DocumentUpload";
import { fetchContent, listDocuments, type Document } from "../../lib/documentsApi";

const DocumentView = lazy(() => import("./DocumentView"));

export type TaskAttachmentsProps = {
  tenant: string;
  /** The form instance id — the documents' ownerEntityId. We list by ownerEntityId (not processRef)
   *  so EMBED attachments (uploaded under a random Flow-A processRef, then bound to the instance)
   *  are included alongside authenticated ones. */
  ownerEntityId: string;
  /** The selected Camunda task; documents carrying this taskId are "Task attachments". */
  taskId?: string;
  className?: string;
};

type Scope = "TASK" | "PROCESS";
const scopeOf = (d: Document): Scope => (d.taskId ? "TASK" : "PROCESS");

export default function TaskAttachments({ tenant, ownerEntityId, taskId, className }: TaskAttachmentsProps) {
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Document | null>(null);   // the doc shown in the preview modal
  const [downloading, setDownloading] = useState(false);

  const refresh = useCallback(
    (signal?: AbortSignal) => {
      if (!tenant || !ownerEntityId) return Promise.resolve();
      setLoading(true);
      return listDocuments(tenant, { capability: "FORMS", ownerEntityId }, signal)
        .then((list) => { setDocs(list); setError(null); })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load attachments."))
        .finally(() => setLoading(false));
    },
    [tenant, ownerEntityId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void refresh(ctrl.signal);
    setPreview(null);
    return () => ctrl.abort();
  }, [refresh]);

  // Download = fetch the bytes through the authed proxy (never S3) and save them with the real filename.
  const download = useCallback(
    async (doc: Document) => {
      setDownloading(true);
      try {
        const blob = await fetchContent(tenant, doc.docId);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.filename || "attachment";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not download this attachment.");
      } finally {
        setDownloading(false);
      }
    },
    [tenant],
  );

  // Split into "Task attachments" (this task) and "Process attachments" (case-level / other tasks).
  const { taskDocs, processDocs } = useMemo(() => {
    const list = docs ?? [];
    return {
      taskDocs: list.filter((d) => scopeOf(d) === "TASK" && (!taskId || d.taskId === taskId)),
      processDocs: list.filter((d) => scopeOf(d) === "PROCESS" || (taskId != null && d.taskId != null && d.taskId !== taskId)),
    };
  }, [docs, taskId]);

  const count = docs?.length ?? 0;

  const row = (doc: Document) => (
    <li key={doc.docId} className="flex items-center gap-3 py-2.5">
      <FileText className="size-5 shrink-0 text-gray-400" />
      <button
        type="button"
        onClick={() => setPreview(doc)}
        className="min-w-0 flex-1 text-left"
        title={`Preview ${doc.filename}`}
      >
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{doc.filename}</span>
          <ScopeBadge scope={scopeOf(doc)} />
        </span>
        <span className="block text-xs text-gray-400">
          {formatBytes(doc.sizeBytes)}
          {doc.status !== "READY" ? ` · ${doc.status}` : ""}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setPreview(doc)}
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-50 hover:text-brand-600 dark:hover:bg-white/5 dark:hover:text-brand-400"
        aria-label={`Preview ${doc.filename}`}
      >
        <Eye className="size-4" />
      </button>
    </li>
  );

  return (
    <section className={`mt-6 border-t border-gray-100 pt-5 dark:border-gray-800 ${className ?? ""}`}>
      <div className="mb-3 flex items-center gap-2">
        <Paperclip className="size-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Attachments</h3>
        {count > 0 && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
            {count}
          </span>
        )}
        {loading && <Loader2 className="size-4 animate-spin text-gray-400" />}
      </div>

      {/* Reviewer can add a TASK-scoped attachment (taskId stamped → classified Task attachment). */}
      {taskId && (
        <DocumentUpload
          processRef={ownerEntityId}
          ownerEntityId={ownerEntityId}
          taskId={taskId}
          kind="FORM_ATTACHMENT"
          capability="FORMS"
          label="Attach to this task"
          onUploaded={() => void refresh()}
        />
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10">
          {error}
        </div>
      )}

      {docs == null && loading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading attachments…</p>
      ) : count === 0 ? (
        <p className="py-6 text-sm text-gray-400">No attachments on this submission.</p>
      ) : (
        <div className="mt-2 space-y-4">
          <Group title="Task attachments" hint="Added to this task" docs={taskDocs} row={row} emptyHint="None on this task yet." />
          <Group title="Process attachments" hint="Submitted with the form / case file" docs={processDocs} row={row} emptyHint="None." />
        </div>
      )}

      {/* Preview modal: render the document + a Download action. No delete (read-only for reviewers). */}
      <Modal
        isOpen={!!preview}
        onClose={() => setPreview(null)}
        ariaLabel="Attachment preview"
        className="mx-4 w-full max-w-[760px]"
      >
        {preview && (
          <div className="flex max-h-[88vh] flex-col p-6 sm:p-8">
            <div className="mb-4 flex items-center gap-2 pr-10">
              <FileText className="size-5 shrink-0 text-gray-500" />
              <h2 className="truncate text-base font-semibold text-gray-800 dark:text-white/90" title={preview.filename}>
                {preview.filename}
              </h2>
              <ScopeBadge scope={scopeOf(preview)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-100 p-3 dark:border-gray-800">
              <Suspense
                fallback={
                  <div className="flex items-center gap-2 p-6 text-sm text-gray-400">
                    <Loader2 className="size-4 animate-spin" /> Loading preview…
                  </div>
                }
              >
                <DocumentView docId={preview.docId} contentType={preview.contentType} filename={preview.filename} width={680} />
              </Suspense>
            </div>
            <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <button
                type="button"
                onClick={() => void download(preview)}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Download
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function Group({
  title, hint, docs, row, emptyHint,
}: {
  title: string;
  hint: string;
  docs: Document[];
  row: (d: Document) => React.ReactNode;
  emptyHint: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {title} <span className="ml-1 normal-case text-gray-300 dark:text-gray-500">· {hint}</span>
      </p>
      {docs.length === 0 ? (
        <p className="py-2 text-sm text-gray-400">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">{docs.map(row)}</ul>
      )}
    </div>
  );
}

function ScopeBadge({ scope }: { scope: Scope }) {
  const isTask = scope === "TASK";
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isTask
          ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
      }`}
    >
      {isTask ? "Task" : "Process"}
    </span>
  );
}

function formatBytes(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
