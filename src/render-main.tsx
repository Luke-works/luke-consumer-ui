/**
 * Standalone entry for the PDF RENDER HARNESS. luke-file-proxy loads this bundle in headless Chromium,
 * injects the submission as `window.__LUKE_RENDER__ = { schema, data, theme }`, waits for
 * `window.__LUKE_RENDER_READY__`, then calls page.pdf() — producing a pixel-faithful PDF of the real
 * read-only FormRenderer (the same renderer used everywhere else). No router, no app chrome, no API.
 */
import { createRoot } from "react-dom/client";
import { FormThemeProvider, type FormTheme } from "@lukeflow/form-react";
import LukeFormRenderer from "./components/formBuilder/LukeFormRenderer";
import "./styles/render-print.css";

type RenderPayload = {
  /** The form schema JSON (string or object). */
  schema: string | Record<string, unknown>;
  /** The submitted values, keyed by field key. */
  data?: Record<string, unknown>;
  /** Optional theme tokens to match the form's branding. */
  theme?: FormTheme;
};

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
  const form = <LukeFormRenderer schema={schema} initialValues={payload.data} readOnly />;
  createRoot(mount).render(payload.theme ? <FormThemeProvider theme={payload.theme}>{form}</FormThemeProvider> : form);
  markReady();
} else {
  // No payload → still flag ready so the renderer never hangs the browser (proxy will get a blank page).
  markReady();
}
