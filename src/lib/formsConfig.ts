import { setAutofillSuppression } from "@lukeflow/form-react";

/**
 * Apply the deploy-wide forms autofill policy from the environment. Browser / password-manager
 * autofill is **suppressed by default** on every form input; set `VITE_FORMS_ALLOW_AUTOFILL=true`
 * to let the browser autofill forms normally (a quick operator-level opt-out — no code change).
 *
 * Call once at app boot, before any form renders. Both the main app and the embed bundle use it.
 */
export function applyFormsAutofillSetting(): void {
  const allow = import.meta.env.VITE_FORMS_ALLOW_AUTOFILL === "true";
  setAutofillSuppression(!allow);
}
