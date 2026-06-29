// DocumentView (DOC-11) — renders a stored document's bytes through the authed proxy
// (/api/documents/{docId}/content). Decides rendering by content type: react-pdf for
// PDFs, <img> for images, a download link for everything else. The content type is taken
// from the `contentType` prop, or fetched from the metadata GET /api/documents/{docId}.
//
// Bytes are fetched as a Blob with our Authorization + X-Tenant-Id headers (a bare URL in
// <img src>/react-pdf file= can't carry them), then wrapped in a blob: URL — exactly how
// the signatures builder loads its source PDF. The byte stream goes ONLY to OUR API,
// never to S3. X-User-Id is never sent from the browser.
import { useEffect, useMemo, useState } from "react";
import { Document as PdfDocument, Page } from "react-pdf";
import { FileDown, Loader2 } from "lucide-react";
import "../signatures/pdfWorker";
import { useAuth } from "../../context/AuthContext";
import { fetchContent, getDocument } from "../../lib/documentsApi";

export type DocumentViewProps = {
  docId: string;
  /** Skip the metadata round-trip when the caller already knows the type. */
  contentType?: string;
  filename?: string;
  /** Rendered CSS width for PDF pages (px). */
  width?: number;
  className?: string;
};

type Loaded = {
  /** Object URL for the fetched blob (revoked on cleanup). */
  url: string;
  contentType: string;
  filename: string;
};

export default function DocumentView({
  docId,
  contentType: contentTypeProp,
  filename: filenameProp,
  width = 680,
  className,
}: DocumentViewProps) {
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    if (!tenant) {
      setError("No active organization.");
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setError(null);
    setLoaded(null);

    (async () => {
      try {
        // Resolve the content type / filename — from props, else a metadata GET.
        let contentType = contentTypeProp;
        let filename = filenameProp;
        if (!contentType || !filename) {
          const meta = await getDocument(tenant, docId);
          contentType = contentType ?? meta.contentType;
          filename = filename ?? meta.filename;
        }
        const blob = await fetchContent(tenant, docId);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ url: objectUrl, contentType: contentType || blob.type || "", filename: filename || "document" });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the document.");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tenant, docId, contentTypeProp, filenameProp]);

  // Keep the react-pdf file prop referentially stable so it doesn't reload each render.
  const pdfFile = useMemo(() => (loaded ? loaded.url : null), [loaded]);

  if (error) {
    return (
      <div className={`rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 ${className ?? ""}`}>
        {error}
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className={`flex items-center gap-2 p-6 text-sm text-gray-400 ${className ?? ""}`}>
        <Loader2 className="size-4 animate-spin" /> Loading document…
      </div>
    );
  }

  const ct = loaded.contentType.toLowerCase();

  if (ct.includes("pdf")) {
    return (
      <div className={className}>
        <PdfDocument
          file={pdfFile}
          loading={<div className="p-6 text-sm text-gray-400">Loading document…</div>}
          error={<div className="p-6 text-sm text-error-500">Could not load the document.</div>}
          onLoadSuccess={({ numPages }) => setPages(numPages)}
        >
          {Array.from({ length: pages }, (_, i) => (
            <Page
              key={i}
              pageNumber={i + 1}
              width={width}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              className="mb-4 shadow-sm"
            />
          ))}
        </PdfDocument>
      </div>
    );
  }

  if (ct.startsWith("image/")) {
    return (
      <img
        src={loaded.url}
        alt={loaded.filename}
        className={`max-w-full rounded-lg border border-gray-200 dark:border-gray-800 ${className ?? ""}`}
      />
    );
  }

  // Fallback for any other content type: a download link to the (blob of the) content.
  return (
    <a
      href={loaded.url}
      download={loaded.filename}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5 ${className ?? ""}`}
    >
      <FileDown className="size-4" /> Download {loaded.filename}
    </a>
  );
}
