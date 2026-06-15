import { z } from "zod";
import { createAttribute } from "@coltorapps/builder";
import { isValidKey } from "../../lib/formSchema";

// Reusable field attributes, grouped the way Form.io groups them across the
// Display / Data / Validation / API / Conditional property tabs.

/* ----- Display ----- */
export const labelAttribute = createAttribute({
  name: "label",
  validate: (value) => z.string().min(1, "Label is required").parse(value),
});
export const placeholderAttribute = createAttribute({
  name: "placeholder",
  validate: (value) => z.string().optional().parse(value),
});
export const descriptionAttribute = createAttribute({
  name: "description",
  validate: (value) => z.string().optional().parse(value),
});
export const tooltipAttribute = createAttribute({
  name: "tooltip",
  validate: (value) => z.string().optional().parse(value),
});
export const prefixAttribute = createAttribute({
  name: "prefix",
  validate: (value) => z.string().optional().parse(value),
});
export const suffixAttribute = createAttribute({
  name: "suffix",
  validate: (value) => z.string().optional().parse(value),
});
export const labelPositionAttribute = createAttribute({
  name: "labelPosition",
  validate: (value) => z.enum(["top", "left", "right"]).optional().parse(value),
});
export const customClassAttribute = createAttribute({
  name: "customClass",
  validate: (value) => z.string().optional().parse(value),
});
export const hiddenAttribute = createAttribute({
  name: "hidden",
  validate: (value) => z.boolean().optional().parse(value),
});
export const disabledAttribute = createAttribute({
  name: "disabled",
  validate: (value) => z.boolean().optional().parse(value),
});
// Static content for HTML / Content / Heading components.
export const contentAttribute = createAttribute({
  name: "content",
  validate: (value) => z.string().optional().parse(value),
});

// Rich help content shown in a modal — a clickable link (e.g. "Terms and
// Conditions") next to a selection field that opens the HTML in a dialog.
export const contentLinkTextAttribute = createAttribute({
  name: "contentLinkText",
  validate: (value) => z.string().optional().parse(value),
});
export const contentHtmlAttribute = createAttribute({
  name: "contentHtml",
  validate: (value) => z.string().optional().parse(value),
});

/* ----- Data ----- */
export const defaultValueAttribute = createAttribute({
  name: "defaultValue",
  validate: (value) => z.string().optional().parse(value),
});
export const multipleAttribute = createAttribute({
  name: "multiple",
  validate: (value) => z.boolean().optional().parse(value),
});
// Options can be plain strings (legacy) or {label, value} pairs (Form.io style).
const optionSchema = z.union([
  z.string().min(1, "Option cannot be empty"),
  z.object({ label: z.string().min(1), value: z.string() }),
]);
export const optionsAttribute = createAttribute({
  name: "options",
  validate: (value) => z.array(optionSchema).min(1, "Add at least one option").parse(value),
});

/* ----- Validation ----- */
export const requiredAttribute = createAttribute({
  name: "required",
  validate: (value) => z.boolean().optional().parse(value),
});
export const minLengthAttribute = createAttribute({
  name: "minLength",
  validate: (value) => z.number().int().nonnegative().optional().parse(value),
});
export const maxLengthAttribute = createAttribute({
  name: "maxLength",
  validate: (value) => z.number().int().nonnegative().optional().parse(value),
});
export const minAttribute = createAttribute({
  name: "min",
  validate: (value) => z.number().optional().parse(value),
});
export const maxAttribute = createAttribute({
  name: "max",
  validate: (value) => z.number().optional().parse(value),
});
export const patternAttribute = createAttribute({
  name: "pattern",
  validate: (value) => z.string().optional().parse(value),
});
export const customMessageAttribute = createAttribute({
  name: "customMessage",
  validate: (value) => z.string().optional().parse(value),
});
export const validateOnAttribute = createAttribute({
  name: "validateOn",
  validate: (value) => z.enum(["change", "blur"]).optional().parse(value),
});

/* ----- API ----- */
export const keyAttribute = createAttribute({
  name: "key",
  // Empty is allowed (the renderer falls back to the entity id), but a provided
  // key must be a valid expression identifier so logic/calculations can use it.
  validate: (value) =>
    z
      .string()
      .optional()
      .refine(
        (v) => v === undefined || v === "" || isValidKey(v),
        "Use letters, numbers and underscores only (must start with a letter).",
      )
      .parse(value),
});
export const tagsAttribute = createAttribute({
  name: "tags",
  validate: (value) => z.string().optional().parse(value),
});

/* ----- Conditional ----- */
export const conditionalAttribute = createAttribute({
  name: "conditional",
  validate: (value) =>
    z
      .object({
        show: z.boolean().optional(),
        when: z.string().optional(),
        eq: z.string().optional(),
      })
      .optional()
      .parse(value),
});

/* ----- Logic (expressions, evaluated by the renderer) ----- */
// Expression that computes this field's value, e.g. `price * quantity`.
export const calculateValueAttribute = createAttribute({
  name: "calculateValue",
  validate: (value) => z.string().optional().parse(value),
});
// Expression returning true to SHOW the field, e.g. `age >= 18 and country == "US"`.
export const customConditionalAttribute = createAttribute({
  name: "customConditional",
  validate: (value) => z.string().optional().parse(value),
});
// Expression returning true when valid, e.g. `value > 0`.
export const customValidationAttribute = createAttribute({
  name: "customValidation",
  validate: (value) => z.string().optional().parse(value),
});

// Logic rules: when <condition> is true, apply an action to this field.
export const LOGIC_ACTIONS = ["show", "hide", "enable", "disable", "require", "optional", "setValue"] as const;
export const logicAttribute = createAttribute({
  name: "logic",
  validate: (value) =>
    z
      .array(z.object({ when: z.string(), action: z.enum(LOGIC_ACTIONS), value: z.string().optional() }))
      .optional()
      .parse(value),
});

// Button behaviour: submit the form, reset it to initial values, or a plain
// no-op button (for custom logic later).
export const BUTTON_ACTIONS = ["submit", "reset", "button"] as const;
export const buttonActionAttribute = createAttribute({
  name: "buttonAction",
  validate: (value) => z.enum(BUTTON_ACTIONS).optional().parse(value),
});

// Wizard: block advancing to the next step until this step's fields are valid.
export const blockedByValidationAttribute = createAttribute({
  name: "blockedByValidation",
  validate: (value) => z.boolean().optional().parse(value),
});

/* ===== Text Field extras (Form.io parity) ===== */
const bool = (v: unknown) => z.boolean().optional().parse(v);
const optStr = (v: unknown) => z.string().optional().parse(v);
const optInt = (v: unknown) => z.number().int().optional().parse(v);

// Display
export const hideLabelAttribute = createAttribute({ name: "hideLabel", validate: bool });
export const inputMaskAttribute = createAttribute({ name: "inputMask", validate: optStr });
export const tabIndexAttribute = createAttribute({ name: "tabIndex", validate: optInt });
export const autocompleteAttribute = createAttribute({ name: "autocomplete", validate: bool });
// Semantic browser-autofill hint (the HTML `autocomplete` token). Supersedes the
// boolean above; the renderer prefers this when set.
export const AUTOCOMPLETE_TOKENS = [
  "off", "on", "name", "given-name", "family-name", "nickname", "email", "username",
  "new-password", "current-password", "one-time-code", "organization", "organization-title",
  "street-address", "address-line1", "address-line2", "address-level2", "address-level1",
  "country", "country-name", "postal-code", "tel", "tel-national", "url",
  "cc-name", "cc-number", "cc-exp", "bday", "sex", "language",
] as const;
export const autocompleteTokenAttribute = createAttribute({
  name: "autocompleteToken",
  validate: (v) => z.enum(AUTOCOMPLETE_TOKENS).optional().parse(v),
});
export const autofocusAttribute = createAttribute({ name: "autofocus", validate: bool });
export const spellcheckAttribute = createAttribute({ name: "spellcheck", validate: bool });
export const showCharCountAttribute = createAttribute({ name: "showCharCount", validate: bool });
export const showWordCountAttribute = createAttribute({ name: "showWordCount", validate: bool });
// Render a ✕ that clears the field (single-value text-like fields only).
export const clearableAttribute = createAttribute({ name: "clearable", validate: bool });
// Data
export const textCaseAttribute = createAttribute({ name: "textCase", validate: (v) => z.enum(["uppercase", "lowercase"]).optional().parse(v) });
export const persistentAttribute = createAttribute({ name: "persistent", validate: bool });
export const clearOnHideAttribute = createAttribute({ name: "clearOnHide", validate: bool });
export const customDefaultValueAttribute = createAttribute({ name: "customDefaultValue", validate: optStr });
export const allowCalculateOverrideAttribute = createAttribute({ name: "allowCalculateOverride", validate: bool });
// Validation
export const minWordsAttribute = createAttribute({ name: "minWords", validate: (v) => z.number().int().nonnegative().optional().parse(v) });
export const maxWordsAttribute = createAttribute({ name: "maxWords", validate: (v) => z.number().int().nonnegative().optional().parse(v) });
export const errorLabelAttribute = createAttribute({ name: "errorLabel", validate: optStr });
export const uniqueAttribute = createAttribute({ name: "unique", validate: bool });

/* ===== Day ===== */
export const hideDayAttribute = createAttribute({ name: "hideDay", validate: bool });
export const hideMonthAttribute = createAttribute({ name: "hideMonth", validate: bool });
export const hideYearAttribute = createAttribute({ name: "hideYear", validate: bool });
export const dayFirstAttribute = createAttribute({ name: "dayFirst", validate: bool });
export const minYearAttribute = createAttribute({ name: "minYear", validate: optInt });
export const maxYearAttribute = createAttribute({ name: "maxYear", validate: optInt });

/* ===== Select typeahead ===== */
export const searchableAttribute = createAttribute({ name: "searchable", validate: bool });

/* ===== Table layout ===== */
export const numColumnsAttribute = createAttribute({ name: "numColumns", validate: (v) => z.number().int().min(1).max(6).optional().parse(v) });

/* ===== Grid (repeating rows) ===== */
export const minRowsAttribute = createAttribute({ name: "minRows", validate: (v) => z.number().int().nonnegative().optional().parse(v) });
export const maxRowsAttribute = createAttribute({ name: "maxRows", validate: (v) => z.number().int().positive().optional().parse(v) });

/* ===== Signature ===== */
export const footerAttribute = createAttribute({ name: "footer", validate: optStr });
export const penColorAttribute = createAttribute({ name: "penColor", validate: optStr });

/* ===== Choice / Date extras ===== */
export const defaultCheckedAttribute = createAttribute({ name: "defaultChecked", validate: bool });
export const inlineAttribute = createAttribute({ name: "inline", validate: bool });
export const minSelectedAttribute = createAttribute({ name: "minSelected", validate: (v) => z.number().int().nonnegative().optional().parse(v) });
export const maxSelectedAttribute = createAttribute({ name: "maxSelected", validate: (v) => z.number().int().nonnegative().optional().parse(v) });
export const enableTimeAttribute = createAttribute({ name: "enableTime", validate: bool });
export const minDateAttribute = createAttribute({ name: "minDate", validate: optStr });
export const maxDateAttribute = createAttribute({ name: "maxDate", validate: optStr });

/* ===== Currency ===== */
export const CURRENCY_CODES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "CNY", "BRL", "ZAR"] as const;
export const currencyCodeAttribute = createAttribute({
  name: "currencyCode",
  validate: (v) => z.enum(CURRENCY_CODES).optional().parse(v),
});

/* ===== Number extras ===== */
export const delimiterAttribute = createAttribute({ name: "delimiter", validate: bool });
export const decimalLimitAttribute = createAttribute({ name: "decimalLimit", validate: (v) => z.number().int().nonnegative().optional().parse(v) });
export const requireDecimalAttribute = createAttribute({ name: "requireDecimal", validate: bool });

/* ===== Text Area extras ===== */
export const rowsAttribute = createAttribute({ name: "rows", validate: (v) => z.number().int().positive().optional().parse(v) });
export const autoExpandAttribute = createAttribute({ name: "autoExpand", validate: bool });
export const editorAttribute = createAttribute({ name: "editor", validate: (v) => z.enum(["richtext"]).optional().parse(v) });

/* ===== Time extras ===== */
export const minTimeAttribute = createAttribute({ name: "minTime", validate: optStr });
export const maxTimeAttribute = createAttribute({ name: "maxTime", validate: optStr });
export const stepAttribute = createAttribute({ name: "step", validate: (v) => z.number().int().positive().optional().parse(v) });

/* ===== Tags extras ===== */
export const minTagsAttribute = createAttribute({ name: "minTags", validate: (v) => z.number().int().nonnegative().optional().parse(v) });
export const maxTagsAttribute = createAttribute({ name: "maxTags", validate: (v) => z.number().int().nonnegative().optional().parse(v) });

/* ===== File extras ===== */
export const acceptAttribute = createAttribute({ name: "accept", validate: optStr });
export const maxSizeAttribute = createAttribute({ name: "maxSize", validate: (v) => z.number().nonnegative().optional().parse(v) });
export const maxFilesAttribute = createAttribute({ name: "maxFiles", validate: (v) => z.number().int().positive().optional().parse(v) });
