// DEV-ONLY showcase for the @lukeflow/sign-react ceremony components. Mounted at
// /sign-preview only when import.meta.env.DEV, so it never ships to production. It needs no
// backend and no auth: it feeds a bundled sample PDF + a mock signing session straight into the
// real SigningCeremony, and demos the sender-side DocumentViewer placement.
import { useEffect, useState } from "react";
import { DocumentViewer, SigningCeremony, AdoptSignature } from "@lukeflow/sign-react";
import {
  DEFAULT_FIELD_SIZE,
  fieldToCssRect,
  isRotated,
  placeField,
  type PdfGeometry,
  type SignatureField,
  type SigningSession,
} from "../../lib/signaturesApi";

const SAMPLE_PDF_URL = "/sample.pdf";

type Tab = "ceremony" | "sender" | "adopt";

export default function SignaturesPreview() {
  const [tab, setTab] = useState<Tab>("ceremony");
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(SAMPLE_PDF_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`sample.pdf ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (active) setPdfBase64(toBase64(buf));
      })
      .catch((e) => active && setLoadErr(String(e)));
    return () => {
      active = false;
    };
  }, []);

  const session: SigningSession | null = pdfBase64
    ? {
        name: "Mutual Non-Disclosure Agreement",
        signerName: "Jane Doe",
        field: { page: 1, x: 130, y: 600, w: 180, h: 56 },
        pdfBase64,
        verification: { required: false, method: "NONE" },
      }
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6" }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 16px",
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          position: "sticky",
          top: 0,
          zIndex: 10,
          alignItems: "center",
        }}
      >
        <strong style={{ marginRight: 12, fontSize: 14 }}>Signatures preview (dev)</strong>
        {(["ceremony", "sender", "adopt"] as Tab[]).map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              cursor: "pointer",
              border: `1px solid ${tab === tk ? "#465fff" : "#e5e7eb"}`,
              background: tab === tk ? "rgba(70,95,255,0.12)" : "transparent",
              color: tab === tk ? "#465fff" : "#6b7280",
            }}
          >
            {tk === "ceremony" ? "Signer ceremony" : tk === "sender" ? "Sender: place field" : "Adopt signature"}
          </button>
        ))}
      </div>

      {loadErr && <p style={{ padding: 24, color: "#ef4444" }}>Couldn’t load sample.pdf: {loadErr}</p>}
      {!loadErr && !session && <p style={{ padding: 24, color: "#9ca3af" }}>Loading sample document…</p>}

      {session && tab === "ceremony" && (
        <SigningCeremony
          session={session}
          brandName="Lukeflow"
          onSubmit={async (input) => {
            // Mock submit — just log and resolve so the success screen shows.
            console.log("[preview] submit", { hasPng: !!input.signaturePngBase64, name: input.signerNameTyped });
            await new Promise((r) => setTimeout(r, 600));
          }}
        />
      )}

      {tab === "sender" && <SenderDemo />}

      {tab === "adopt" && (
        <div style={{ maxWidth: 560, margin: "32px auto", background: "#fff", padding: 24, borderRadius: 12, border: "1px solid #e5e7eb" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Adopt signature (Draw / Type / Upload)</h2>
          <AdoptSignature signerName="Jane Doe" onChange={() => {}} />
        </div>
      )}
    </div>
  );
}

function SenderDemo() {
  const [field, setField] = useState<SignatureField | null>(null);
  const [rotated, setRotated] = useState(false);

  return (
    <div style={{ maxWidth: 720, margin: "24px auto", background: "#fff", padding: 24, borderRadius: 12, border: "1px solid #e5e7eb" }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Place the signature field</h2>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        {rotated
          ? "That page is rotated — not supported."
          : field
            ? `Placed on page ${field.page + 1}. Click to move it, or change pages.`
            : "Click on the page to drop the field. Use the toolbar to change pages or zoom."}
      </p>
      <DocumentViewer
        source={SAMPLE_PDF_URL}
        baseWidth={560}
        onClick={({ page, cssX, cssY, geometry }) => {
          if (isRotated(geometry)) return setRotated(true);
          setRotated(false);
          setField(placeField(geometry, cssX, cssY, DEFAULT_FIELD_SIZE, page));
        }}
        renderOverlay={({ page, geometry }: { page: number; geometry: PdfGeometry }) => {
          if (!field || field.page !== page) return null;
          const r = fieldToCssRect(geometry, field);
          return (
            <div
              style={{
                position: "absolute",
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                border: "2px solid #465fff",
                background: "rgba(70,95,255,0.15)",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#465fff",
                pointerEvents: "none",
              }}
            >
              Sign here
            </div>
          );
        }}
      />
    </div>
  );
}

function toBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
