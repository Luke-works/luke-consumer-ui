import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { initObservability } from "./lib/observability.ts";
import { applyFormsAutofillSetting } from "./lib/formsConfig.ts";

initObservability(); // Sentry, only when VITE_SENTRY_DSN is set (no-op otherwise)
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
