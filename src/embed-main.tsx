import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ErrorBoundary from "./components/common/ErrorBoundary.tsx";
import FormEmbedView from "./pages/Forms/FormEmbedView.tsx";
import { applyFormsAutofillSetting } from "./lib/formsConfig.ts";

applyFormsAutofillSetting(); // forms autofill suppressed by default; VITE_FORMS_ALLOW_AUTOFILL=true opts out

// Standalone entry for the embed bundle that core-engine serves (Route B M2). No router, no app
// chrome, no auth context — just the form renderer. The token is injected by the server into the
// shell as window.__LUKE_EMBED_TOKEN__, with path/query fallbacks for local dev.
function resolveToken(): string | undefined {
  const injected = (window as unknown as { __LUKE_EMBED_TOKEN__?: string }).__LUKE_EMBED_TOKEN__;
  if (injected && injected !== "__EMBED_TOKEN__") return injected;
  const m = window.location.pathname.match(/\/embed\/([^/?#]+)/);
  if (m?.[1]) return decodeURIComponent(m[1]);
  return new URLSearchParams(window.location.search).get("token") ?? undefined;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary label="embed-root">
      <FormEmbedView token={resolveToken()} />
    </ErrorBoundary>
  </StrictMode>,
);
