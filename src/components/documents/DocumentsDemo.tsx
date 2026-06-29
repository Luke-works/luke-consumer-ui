// DocumentsDemo (DOC-11) — a self-contained usage example wiring DocumentUpload +
// DocumentView together for the SIGNATURES source-PDF flow. It exercises the full
// reusable path end-to-end against the shared DOCUMENTS layer (POST /api/documents →
// GET /api/documents/{id}/content) entirely through the auth gateway — no S3 in the
// Network tab, no X-User-Id from the browser.
//
// WHY a demo rather than rewiring SignatureBuilderPage:
//   The signatures designer currently uploads its source PDF via the sign-core contract
//   (signatureDefinitions.uploadDocument), which DOC-7 migrates onto this shared layer
//   SERVER-SIDE while keeping the existing client call. Swapping the client now would
//   duplicate/contradict that migration and risk regressions in the live designer. This
//   demo is the concrete, low-risk usage; production wiring of the designer is pending
//   DOC-7 (see report).
//
// SEAM for other capabilities — reuse these exact components, changing only the props:
//   • Email attachments:  <DocumentUpload kind="GENERIC"        capability="EMAIL"
//                            processRef={emailThreadRef} ownerEntityId={draftId} … />
//   • Form file fields:   <DocumentUpload kind="FORM_ATTACHMENT" capability="FORMS"
//                            processRef={formInstanceBusinessKey} taskId={taskId}
//                            ownerEntityId={formInstanceId} … />
import { useState } from "react";
import DocumentUpload from "./DocumentUpload";
import DocumentView from "./DocumentView";
import { SIGNATURES } from "../../lib/capabilities";
import type { Document } from "../../lib/documentsApi";

export default function DocumentsDemo({
  /** The owning signature definition/request id (Flow A: app-minted before any process). */
  processRef,
  ownerEntityId,
}: {
  processRef: string;
  ownerEntityId?: string;
}) {
  const [doc, setDoc] = useState<Document | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Source PDF</h3>
        <DocumentUpload
          processRef={processRef}
          kind="SIGNATURE_ATTACHMENT"
          capability={SIGNATURES}
          ownerEntityId={ownerEntityId}
          accept="application/pdf"
          maxBytes={25 * 1024 * 1024}
          label="Upload source PDF"
          onUploaded={setDoc}
        />
      </div>

      {doc && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Preview — {doc.filename}
          </h3>
          <DocumentView docId={doc.docId} contentType={doc.contentType} filename={doc.filename} />
        </div>
      )}
    </div>
  );
}
