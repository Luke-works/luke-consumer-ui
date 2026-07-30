/**
 * Standalone entry for the PDF RENDER HARNESS. luke-file-proxy loads this bundle in headless Chromium,
 * injects the submission as `window.__LUKE_RENDER__ = { schema, data, theme }`, waits for
 * `window.__LUKE_RENDER_READY__`, then calls page.pdf() — producing a pixel-faithful PDF of the real
 * read-only FormRenderer (the same renderer used everywhere else). No router, no app chrome, no API.
 */
import { createRoot } from "react-dom/client";
import { FormThemeProvider, type FormTheme } from "@lukeflow/form-react";
import LukeFormRenderer from "./components/formBuilder/LukeFormRenderer";
// Load the SAME global stylesheet the live form gets (Tailwind base + the app's "Anek Telugu" web
// font) FIRST — otherwise the headless render falls back to the browser's serif default with the
// wrong metrics (looks nothing like the app + fields appear cramped/combined). Print overrides last.
import "./index.css";
import "./styles/render-print.css";

type RenderPayload = {
  /** The form schema JSON (string or object). */
  schema: string | Record<string, unknown>;
  /** The submitted values, keyed by field key. */
  data?: Record<string, unknown>;
  /** Optional theme tokens to match the form's branding. */
  theme?: FormTheme;
  /**
   * Submission provenance — the evidence block printed under the form so the PDF stands on its own as
   * a record of WHO submitted WHAT, from WHERE and WHEN. Server-supplied (core-engine captures it at
   * the submit choke point); omitted → no block, so older callers render exactly as before.
   */
  provenance?: {
    instanceId?: string;
    formCode?: string;
    version?: number;
    submittedAt?: string;
    ip?: string;
    userAgent?: string;
    via?: string;
    /** The exact statement the filler agreed to, and when — the consent record. */
    consentText?: string;
    consentAgreedAt?: string;
  };
};

/** How the submission reached us, in words a non-engineer can read in a legal context. */
const VIA_LABEL: Record<string, string> = {
  EMBED: "Embedded form on a website",
  RESPOND: "Emailed link, verified by one-time code",
  APP: "Completed in Lukeflow by a signed-in user",
};

/**
 * The "Submission record" block. Deliberately plain and dense — this is evidence, not decoration —
 * and it prints AFTER the form. `break-inside: avoid` keeps it from splitting across pages.
 */
function SubmissionRecord({ p }: { p: NonNullable<RenderPayload["provenance"]> }) {
  const rows: [string, string | undefined][] = [
    ["Submitted", p.submittedAt ? new Date(p.submittedAt).toLocaleString() : undefined],
    ["IP address", p.ip],
    ["Submitted via", p.via ? (VIA_LABEL[p.via] ?? p.via) : undefined],
    ["Device", p.userAgent],
    ["Form", p.formCode ? `${p.formCode}${p.version != null ? ` (version ${p.version})` : ""}` : undefined],
    ["Reference", p.instanceId],
  ];
  const present = rows.filter(([, v]) => v != null && v !== "");
  if (present.length === 0 && !p.consentText) return null;
  return (
    <section className="luke-submission-record">
      <h2>Submission record</h2>
      {present.length > 0 && (
        <table>
          <tbody>
            {present.map(([label, value]) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* The agreement gets its own quoted block, not a table cell: on a printed page this is the part
          someone will actually read back, and a wrapped multi-sentence statement crammed into a cell is
          both unreadable and easy to mistake for a truncation. */}
      {p.consentText && (
        <div className="luke-submission-record__consent">
          <p className="luke-submission-record__consent-label">
            Agreed to
            {p.consentAgreedAt ? ` on ${new Date(p.consentAgreedAt).toLocaleString()}` : ""}
          </p>
          <blockquote>“{p.consentText}”</blockquote>
        </div>
      )}
      <p className="luke-submission-record__note">
        Captured automatically by Lukeflow when the form was submitted. The IP address is the address
        observed at submission time
        {p.consentText ? "; the statement above is the exact wording the form presented" : ""}.
      </p>
    </section>
  );
}

const READY_FLAG = "__LUKE_RENDER_READY__";

/** Signal Chromium that layout + fonts have settled and the page is safe to print. */
function markReady(): void {
  const ready = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        (window as unknown as Record<string, unknown>)[READY_FLAG] = true;
      }),
    );
  // Wait for web fonts so text metrics are final before we flag ready (guards against reflow in the PDF).
  const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) fonts.ready.then(ready, ready);
  else ready();
}

const payload = (window as unknown as { __LUKE_RENDER__?: RenderPayload }).__LUKE_RENDER__;
const mount = document.getElementById("root");

if (payload && mount) {
  const schema = typeof payload.schema === "string" ? payload.schema : JSON.stringify(payload.schema);
  // allowJs=false: this harness renders untrusted author schemas in headless Chromium; submitted
  // values are already computed, so no author JS needs to run to produce the PDF.
  const form = (
    <>
      <LukeFormRenderer schema={schema} initialValues={payload.data} readOnly allowJs={false} />
      {payload.provenance ? <SubmissionRecord p={payload.provenance} /> : null}
    </>
  );
  createRoot(mount).render(payload.theme ? <FormThemeProvider theme={payload.theme}>{form}</FormThemeProvider> : form);
  markReady();
} else {
  // No payload → still flag ready so the renderer never hangs the browser (proxy will get a blank page).
  markReady();
}
