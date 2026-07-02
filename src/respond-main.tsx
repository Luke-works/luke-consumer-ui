import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import FormRespondView from "./pages/Forms/FormRespondView.tsx";
import { applyFormsAutofillSetting } from "./lib/formsConfig.ts";

applyFormsAutofillSetting(); // forms autofill suppressed by default; VITE_FORMS_ALLOW_AUTOFILL=true opts out

// Standalone entry for the outbound RECIPIENT bundle that core-engine serves (a different static
// serve from the main SPA). No router, no app chrome, no auth context — just the OTP-gated fill
// view. The token comes from the URL path (/respond/:token); the API is called SAME-ORIGIN (the
// build forces VITE_AUTH_API_URL="").
function resolveToken(): string | undefined {
  const injected = (window as unknown as { __LUKE_RESPOND_TOKEN__?: string }).__LUKE_RESPOND_TOKEN__;
  if (injected && injected !== "__RESPOND_TOKEN__") return injected;
  const m = window.location.pathname.match(/\/respond\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(window.location.search).get("token") ?? undefined;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FormRespondView token={resolveToken()} />
  </StrictMode>,
);
