import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { initObservability } from "./lib/observability.ts";
import { reportError } from "./lib/reportError.ts";
import { applyFormsAutofillSetting } from "./lib/formsConfig.ts";

initObservability(); // Sentry, only when VITE_SENTRY_DSN is set (no-op otherwise)

// Catch escapes that React's ErrorBoundary can't: rejected promises (e.g. a stray
// `void somePromise()`) and non-React runtime errors. Routed through reportError so
// they surface in the console (always) and Sentry (when a DSN is set).
window.addEventListener("unhandledrejection", (e) => reportError(e.reason, { kind: "unhandledrejection" }));
window.addEventListener("error", (e) => reportError(e.error ?? e.message, { kind: "error" }));
applyFormsAutofillSetting(); // forms autofill suppressed by default; VITE_FORMS_ALLOW_AUTOFILL=true opts out

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppWrapper>
        <App />
      </AppWrapper>
    </ThemeProvider>
  </StrictMode>,
);
