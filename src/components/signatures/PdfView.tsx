import { useMemo, type ReactNode } from "react";
import { Document, Page } from "react-pdf";
import "./pdfWorker";

export type PdfGeometry = {
  /** Native PDF page size in points (as react-pdf reports it — rotation-aware). */
  pdfW: number;
  pdfH: number;
  /** Rendered size in CSS pixels. */
  cssW: number;
  cssH: number;
  /** Page /Rotate in degrees. Non-zero means our top-left coords won't match the engine's
   *  un-rotated mediabox, so callers must refuse to place/sign on rotated pages (V1). */
  rotate: number;
};

/**
 * Renders one PDF page (from an uploaded File or a data:/URL string) at a fixed CSS width,
 * with an optional absolutely-positioned overlay and a click handler reporting CSS-pixel
 * coordinates relative to the page. Annotation/text layers are off (no extra CSS, faster).
 * Used by the field picker (create modal) and the public signing page.
 */
export default function PdfView({
  source,
  pageNumber = 1,
  width,
  onGeometry,
  onClick,
  onError,
  overlay,
}: {
  source: File | string;
  pageNumber?: number;
  width: number;
  onGeometry?: (g: PdfGeometry) => void;
  onClick?: (p: { cssX: number; cssY: number }) => void;
  onError?: (e: unknown) => void;
  overlay?: ReactNode;
}) {
  // Keep the file prop referentially stable so react-pdf doesn't reload each render.
  const file = useMemo(() => source, [source]);

  return (
    <div className="relative inline-block" style={{ width }}>
      <Document
        file={file}
        loading={<div className="p-6 text-sm text-gray-400">Loading document…</div>}
        error={<div className="p-6 text-sm text-error-500">Could not load the document.</div>}
        onLoadError={onError}
        onSourceError={onError}
      >
        <Page
          pageNumber={pageNumber}
          width={width}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          onLoadError={onError}
          onRenderError={onError}
          onLoadSuccess={(page) =>
            onGeometry?.({
              pdfW: page.originalWidth,
              pdfH: page.originalHeight,
              cssW: page.width,
              cssH: page.height,
              rotate: page.rotate ?? 0,
            })
          }
        />
      </Document>

      {onClick && (
        <div
          className="absolute inset-0 cursor-crosshair"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onClick({ cssX: e.clientX - r.left, cssY: e.clientY - r.top });
          }}
        />
      )}
      {overlay}
    </div>
  );
}
