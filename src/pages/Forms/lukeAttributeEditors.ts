/**
 * consumer-ui's domain-specific attribute editors, layered over @lukeflow/form-builder's
 * comprehensive defaults via the `attributeEditors` plugin slot. These are the extras the
 * package doesn't ship out of the box (input masks, char/word counts, signature pen,
 * button action, date bounds, table columns, …) — added here, in the app, WITHOUT forking
 * the package. The package merges these by `id` (append / replace / `remove`).
 */
import type { AttributeEditor } from "@lukeflow/form-builder";
import type { SchemaEntity } from "@lukeflow/form-core";

const oneOf =
  (...types: string[]) =>
  (e: SchemaEntity) =>
    types.includes(e.type);
const TEXTUAL = ["textField", "textarea", "email", "url", "phoneNumber", "password"];
const textual = (e: SchemaEntity) => TEXTUAL.includes(e.type);

export const lukeAttributeEditors: AttributeEditor[] = [
  // ── Display extras ──────────────────────────────────────────────────────────
  { id: "hideLabel", tab: "display", attribute: "hideLabel", label: "Hide label", control: "checkbox", order: 51, when: textual },

  // ── Data / input extras ─────────────────────────────────────────────────────
  { id: "inputMask", tab: "data", attribute: "inputMask", label: "Input mask", control: "text", order: 50, when: textual, hint: "e.g. (999) 999-9999" },
  { id: "autoExpand", tab: "data", attribute: "autoExpand", label: "Auto-expand", control: "checkbox", order: 51, when: oneOf("textarea") },
  { id: "clearable", tab: "data", attribute: "clearable", label: "Show clear (✕) button", control: "checkbox", order: 52, when: textual },
  { id: "showCharCount", tab: "data", attribute: "showCharCount", label: "Show character count", control: "checkbox", order: 53, when: textual },
  { id: "showWordCount", tab: "data", attribute: "showWordCount", label: "Show word count", control: "checkbox", order: 54, when: oneOf("textField", "textarea") },
  { id: "requireDecimal", tab: "data", attribute: "requireDecimal", label: "Require decimal", control: "checkbox", order: 55, when: oneOf("number", "currency") },
  { id: "enableTime", tab: "data", attribute: "enableTime", label: "Include time", control: "checkbox", order: 56, when: oneOf("datetime") },
  { id: "numColumns", tab: "data", attribute: "numColumns", label: "Columns", control: "number", order: 57, when: oneOf("table") },
  {
    id: "buttonAction",
    tab: "data",
    attribute: "buttonAction",
    label: "Button action",
    control: "select",
    order: 58,
    when: oneOf("button"),
    options: [
      { label: "Submit", value: "submit" },
      { label: "Reset", value: "reset" },
      { label: "Button", value: "button" },
    ],
  },
  { id: "penColor", tab: "data", attribute: "penColor", label: "Pen color", control: "text", order: 59, when: oneOf("signature"), hint: "Hex color, e.g. #1a1a1a" },

  // ── Validation extras ───────────────────────────────────────────────────────
  { id: "minWords", tab: "validation", attribute: "minWords", label: "Min words", control: "number", order: 30, when: oneOf("textField", "textarea") },
  { id: "maxWords", tab: "validation", attribute: "maxWords", label: "Max words", control: "number", order: 31, when: oneOf("textField", "textarea") },
  { id: "minDate", tab: "validation", attribute: "minDate", label: "Earliest date", control: "text", order: 32, when: oneOf("day", "datetime"), hint: "ISO date, e.g. 2024-01-01" },
  { id: "maxDate", tab: "validation", attribute: "maxDate", label: "Latest date", control: "text", order: 33, when: oneOf("day", "datetime") },
  { id: "unique", tab: "validation", attribute: "unique", label: "Must be unique", control: "checkbox", order: 40, when: textual },
  { id: "errorLabel", tab: "validation", attribute: "errorLabel", label: "Error label", control: "text", order: 61, when: textual },

  // ── API extras ──────────────────────────────────────────────────────────────
  { id: "autofocus", tab: "api", attribute: "autofocus", label: "Autofocus", control: "checkbox", order: 31, when: textual },
  { id: "spellcheck", tab: "api", attribute: "spellcheck", label: "Spellcheck", control: "checkbox", order: 32, when: textual },
];
