// src/useFormBuilder.ts
import { useCallback, useMemo, useRef, useState } from "react";
import {
  createEntity,
  insert,
  remove,
  move,
  duplicate,
  reorder,
  updateAttributes as updateAttrsOp,
  setSettings as setSettingsOp,
  validateSchema
} from "@lukeflow/form-core";
var EMPTY = { root: [], entities: {} };
var HISTORY_LIMIT = 100;
function pushBounded(stack, snap) {
  stack.push(snap);
  if (stack.length > HISTORY_LIMIT) stack.shift();
}
function useFormBuilder(initialSchema = EMPTY) {
  const [schema, setSchemaState] = useState(initialSchema);
  const [selectedId, setSelectedId] = useState(null);
  const past = useRef([]);
  const future = useRef([]);
  const [, forceRender] = useState(0);
  const commit = useCallback((next) => {
    setSchemaState((prev) => {
      if (next === prev) return prev;
      pushBounded(past.current, prev);
      future.current = [];
      return next;
    });
  }, []);
  const select = useCallback((id) => setSelectedId(id), []);
  const addField = useCallback(
    (type, attributes = {}, target) => {
      const entity = createEntity(type, attributes);
      setSchemaState((prev) => {
        pushBounded(past.current, prev);
        future.current = [];
        return insert(prev, entity, target ?? {});
      });
      setSelectedId(entity.id);
    },
    []
  );
  const addFieldWithChildren = useCallback(
    (type, attributes, children, target) => {
      const root = createEntity(type, attributes);
      const kids = children.map((c) => createEntity(c.type, c.attributes ?? {}));
      setSchemaState((prev) => {
        pushBounded(past.current, prev);
        future.current = [];
        let s = insert(prev, root, target ?? {});
        for (const kid of kids) s = insert(s, kid, { parentId: root.id });
        return s;
      });
      setSelectedId(root.id);
    },
    []
  );
  const removeField = useCallback(
    (id) => {
      commit(remove(schema, id));
      setSelectedId((cur) => cur === id ? null : cur);
    },
    [commit, schema]
  );
  const moveField = useCallback((id, target) => commit(move(schema, id, target)), [commit, schema]);
  const duplicateField = useCallback((id) => commit(duplicate(schema, id)), [commit, schema]);
  const reorderField = useCallback(
    (parentId, fromIndex, toIndex) => commit(reorder(schema, parentId, fromIndex, toIndex)),
    [commit, schema]
  );
  const updateAttributes = useCallback(
    (id, patch) => commit(updateAttrsOp(schema, id, patch)),
    [commit, schema]
  );
  const setSettings = useCallback((patch) => commit(setSettingsOp(schema, patch)), [commit, schema]);
  const setSchema = useCallback((next) => commit(next), [commit]);
  const undo = useCallback(() => {
    setSchemaState((prev) => {
      const last = past.current.pop();
      if (last === void 0) return prev;
      pushBounded(future.current, prev);
      forceRender((n) => n + 1);
      return last;
    });
  }, []);
  const redo = useCallback(() => {
    setSchemaState((prev) => {
      const next = future.current.pop();
      if (next === void 0) return prev;
      pushBounded(past.current, prev);
      forceRender((n) => n + 1);
      return next;
    });
  }, []);
  const problems = useMemo(() => validateSchema(schema), [schema]);
  const hasErrors = useMemo(() => problems.some((d) => d.severity === "error"), [problems]);
  return {
    schema,
    selectedId,
    problems,
    hasErrors,
    select,
    addField,
    addFieldWithChildren,
    removeField,
    moveField,
    duplicateField,
    reorderField,
    updateAttributes,
    setSettings,
    setSchema,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0
  };
}

// src/FormBuilder.tsx
import { useMemo as useMemo5, useState as useState10, useEffect as useEffect9, useRef as useRef8, useImperativeHandle, forwardRef } from "react";
import { createPortal as createPortal3 } from "react-dom";

// src/SettingsPanel.tsx
import { useEffect as useEffect4, useId as useId2, useRef as useRef4, useState as useState5 } from "react";

// src/attributeEditors.ts
import { createDefaultFieldTypeRegistry } from "@lukeflow/form-core";
var REGISTRY = createDefaultFieldTypeRegistry();
var ATTRIBUTE_TABS = [
  { id: "display", label: "Display" },
  { id: "settings", label: "Settings" },
  { id: "data", label: "Data" },
  { id: "validation", label: "Validation" },
  { id: "api", label: "API" },
  { id: "conditional", label: "Conditional" },
  { id: "logic", label: "Logic" }
];
var TEXTUAL = ["textField", "textarea", "email", "url", "phoneNumber", "password"];
var OPTIONED = ["select", "searchSelect", "radio", "selectBoxes", "ranking"];
var NUMERIC = ["number", "currency"];
var GRIDS = ["dataGrid", "editGrid"];
function isDataField(type) {
  const ft = REGISTRY.get(type);
  return !!ft && ft.valueType !== "none";
}
function isContainerType(type) {
  return !!REGISTRY.get(type)?.isContainer;
}
function isStaticType(type) {
  return !!REGISTRY.get(type)?.isStatic;
}
var oneOf = (...types) => (e) => types.includes(e.type);
var data = (e) => isDataField(e.type);
var textual = (e) => TEXTUAL.includes(e.type);
var numeric = (e) => NUMERIC.includes(e.type);
var optioned = (e) => OPTIONED.includes(e.type);
var grid = (e) => GRIDS.includes(e.type);
var inGrid = (e, schema) => {
  for (const ent of Object.values(schema.entities ?? {})) {
    if (ent.children?.includes(e.id)) return GRIDS.includes(ent.type);
  }
  return false;
};
var CURRENCY_CODES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "CNY", "BRL", "ZAR"].map((c) => ({ label: c, value: c }));
function createDefaultAttributeEditors() {
  return [
    // ── DISPLAY ──────────────────────────────────────────────────────────────
    { id: "label", tab: "display", attribute: "label", label: "Label", control: "text", order: 1 },
    { id: "placeholder", tab: "display", attribute: "placeholder", label: "Placeholder", control: "text", order: 10, when: (e) => textual(e) || optioned(e) || numeric(e) },
    { id: "description", tab: "display", attribute: "description", label: "Description", control: "textarea", order: 20 },
    { id: "tooltip", tab: "display", attribute: "tooltip", label: "Tooltip", control: "text", order: 30, when: data },
    {
      id: "labelPosition",
      tab: "display",
      attribute: "labelPosition",
      label: "Label position",
      control: "select",
      order: 40,
      when: data,
      options: [
        { label: "Top", value: "top" },
        { label: "Left", value: "left" },
        { label: "Right", value: "right" }
      ]
    },
    { id: "hideLabel", tab: "display", attribute: "hideLabel", label: "Hide label", control: "checkbox", order: 50, when: data },
    { id: "customClass", tab: "display", attribute: "customClass", label: "Custom CSS class", control: "text", order: 60 },
    { id: "hidden", tab: "display", attribute: "hidden", label: "Hidden", control: "checkbox", order: 70 },
    { id: "disabled", tab: "display", attribute: "disabled", label: "Disabled", control: "checkbox", order: 80, when: data },
    // ── SETTINGS (structural config for layout containers + static blocks) ──────
    { id: "numColumns", tab: "settings", attribute: "numColumns", label: "Number of columns", control: "number", order: 10, when: oneOf("table", "columns"), hint: "How many equal columns to lay children out in." },
    { id: "numRows", tab: "settings", attribute: "numRows", label: "Number of rows", control: "number", order: 11, when: oneOf("table"), hint: "Minimum rows in the table grid (more rows are added as fields overflow)." },
    { id: "borders", tab: "settings", attribute: "borders", label: "Show borders", control: "checkbox", order: 12, appliesTo: ["columns"], hint: "Draw a border around each column." },
    { id: "verticalTabs", tab: "settings", attribute: "verticalTabs", label: "Vertical tabs", control: "checkbox", order: 20, appliesTo: ["tabs"], hint: "Lay the tab strip down the side instead of across the top." },
    { id: "navigation", tab: "settings", attribute: "navigation", label: "Navigation buttons", control: "checkbox", order: 21, appliesTo: ["tabs"], hint: "Add Previous / Next buttons that step through tabs in sequence." },
    { id: "validateBeforeNext", tab: "settings", attribute: "validateBeforeNext", label: "Validate before advancing", control: "checkbox", order: 22, appliesTo: ["tabs"], when: (e) => Boolean(e.attributes?.navigation), hint: "Block a forward move until the current tab's fields are valid." },
    // Content / heading blocks: their primary, type-specific config.
    { id: "content", tab: "settings", attribute: "content", label: "Content (HTML)", control: "textarea", order: 1, appliesTo: ["content", "html", "htmlElement"], hint: "Trusted HTML shown as-is (author-only, like Form.io's Content)." },
    {
      id: "headingSize",
      tab: "settings",
      attribute: "headingSize",
      label: "Size",
      control: "select",
      order: 1,
      appliesTo: ["heading"],
      hint: "The heading text is the Label.",
      options: [
        { label: "H1 \u2014 largest", value: "h1" },
        { label: "H2", value: "h2" },
        { label: "H3 (default)", value: "h3" },
        { label: "H4", value: "h4" },
        { label: "H5", value: "h5" },
        { label: "H6 \u2014 smallest", value: "h6" }
      ]
    },
    // Date / time fields default to the rich calendar + time picker; expose the per-field
    // native opt-out and the time-selector minute increment.
    { id: "nativeInput", tab: "settings", attribute: "nativeInput", label: "Use native input", control: "checkbox", order: 40, appliesTo: ["day", "datetime", "time"], hint: "Use the browser's native date/time input instead of the rich calendar / time picker." },
    { id: "minuteStep", tab: "settings", attribute: "minuteStep", label: "Minute step", control: "number", order: 41, appliesTo: ["datetime", "time"], when: (e) => !e.attributes?.nativeInput, hint: "Increment (in minutes) between options in the time selector. Default 1." },
    { id: "ratingMax", tab: "settings", attribute: "max", label: "Max stars", control: "number", order: 42, appliesTo: ["rating"], hint: "Number of stars to show (default 5)." },
    { id: "matrixMultiple", tab: "settings", attribute: "multiple", label: "Allow multiple per row", control: "checkbox", order: 43, appliesTo: ["matrix"], hint: "Use checkboxes instead of radios so each row can have several answers." },
    // Panel-like containers: collapse + a color theme for different purposes.
    { id: "collapsible", tab: "settings", attribute: "collapsible", label: "Collapsible", control: "checkbox", order: 30, appliesTo: ["panel", "well", "fieldset"] },
    { id: "collapsed", tab: "settings", attribute: "collapsed", label: "Initially collapsed", control: "checkbox", order: 31, appliesTo: ["panel", "well", "fieldset"], when: (e) => Boolean(e.attributes?.collapsible) },
    {
      id: "panelTheme",
      tab: "settings",
      attribute: "theme",
      label: "Color theme",
      control: "select",
      order: 32,
      appliesTo: ["panel", "well", "fieldset"],
      hint: "Tint the panel header/border to signal its purpose.",
      options: [
        { label: "Primary", value: "primary" },
        { label: "Secondary", value: "secondary" },
        { label: "Info", value: "info" },
        { label: "Success", value: "success" },
        { label: "Warning", value: "warning" },
        { label: "Danger", value: "danger" }
      ]
    },
    // ── DATA ─────────────────────────────────────────────────────────────────
    { id: "options", tab: "data", attribute: "options", label: "Options", control: "options", order: 1, when: optioned, hint: "List = one value per option; Label + Value = a distinct stored value per option." },
    { id: "matrixRows", tab: "data", attribute: "rows", label: "Rows", control: "options", order: 3, appliesTo: ["matrix"], hint: "Each row (question) of the survey grid." },
    { id: "matrixColumns", tab: "data", attribute: "columns", label: "Columns", control: "options", order: 4, appliesTo: ["matrix"], hint: "The answer choices (columns) shared by every row." },
    {
      id: "dataSource",
      tab: "data",
      attribute: "dataSource",
      label: "Minion data source",
      control: "dataSource",
      order: 2,
      // Option-bearing fields load their options from a minion; an address block names a geocoding
      // PROVIDER minion (Mapbox, Google, …) that returns address suggestions. Either way the key
      // stays server-side and the form is provider-agnostic.
      when: (e) => optioned(e) || e.type === "addressBlock",
      hint: "Load from a secure Minion (auth/authz stay server-side). For an address, this is the geocoding provider; map params to other fields."
    },
    { id: "defaultValue", tab: "data", attribute: "defaultValue", label: "Default value", control: "text", order: 10, when: (e) => data(e) && e.type !== "checkbox" && !optioned(e) },
    { id: "defaultChecked", tab: "data", attribute: "defaultChecked", label: "Checked by default", control: "checkbox", order: 10, when: oneOf("checkbox") },
    { id: "multiple", tab: "data", attribute: "multiple", label: "Allow multiple values", control: "checkbox", order: 20, when: (e) => textual(e) || e.type === "select" },
    { id: "inline", tab: "data", attribute: "inline", label: "Inline options", control: "checkbox", order: 25, when: oneOf("radio", "selectBoxes") },
    { id: "searchable", tab: "data", attribute: "searchable", label: "Searchable (type-ahead)", control: "checkbox", order: 26, when: oneOf("select") },
    { id: "rows", tab: "data", attribute: "rows", label: "Rows", control: "number", order: 30, when: oneOf("textarea") },
    { id: "decimalLimit", tab: "data", attribute: "decimalLimit", label: "Decimal places", control: "number", order: 31, when: numeric },
    { id: "delimiter", tab: "data", attribute: "delimiter", label: "Thousands separator", control: "checkbox", order: 32, when: numeric },
    { id: "currencyCode", tab: "data", attribute: "currencyCode", label: "Currency", control: "select", order: 33, when: oneOf("currency"), options: CURRENCY_CODES },
    { id: "inputMask", tab: "data", attribute: "inputMask", label: "Input mask", control: "text", order: 50, when: textual, hint: "9 = digit, a = letter, * = alphanumeric. e.g. (999) 999-9999" },
    { id: "clearable", tab: "data", attribute: "clearable", label: "Show clear (\xD7) button", control: "checkbox", order: 51, when: textual },
    { id: "showCharCount", tab: "data", attribute: "showCharCount", label: "Show character count", control: "checkbox", order: 52, when: textual },
    { id: "showWordCount", tab: "data", attribute: "showWordCount", label: "Show word count", control: "checkbox", order: 53, when: oneOf("textField", "textarea") },
    { id: "autoExpand", tab: "data", attribute: "autoExpand", label: "Auto-expand", control: "checkbox", order: 54, when: oneOf("textarea") },
    {
      id: "buttonAction",
      tab: "data",
      attribute: "buttonAction",
      label: "Button action",
      control: "select",
      order: 56,
      when: oneOf("button"),
      options: [
        { label: "Submit", value: "submit" },
        { label: "Reset", value: "reset" },
        { label: "Button", value: "button" }
      ]
    },
    { id: "allowType", tab: "data", attribute: "allowType", label: "Allow typed signature", control: "checkbox", order: 33, when: oneOf("signature"), hint: "Let the signer type their name (rendered in a script font) instead of drawing." },
    { id: "accept", tab: "data", attribute: "accept", label: "Accepted file types", control: "text", order: 34, when: oneOf("file"), placeholder: "image/*,.pdf" },
    { id: "maxFiles", tab: "data", attribute: "maxFiles", label: "Max files", control: "number", order: 35, when: oneOf("file") },
    { id: "maxSize", tab: "data", attribute: "maxSize", label: "Max size (MB)", control: "number", order: 36, when: oneOf("file") },
    { id: "minRows", tab: "data", attribute: "minRows", label: "Min rows", control: "number", order: 40, when: grid },
    { id: "maxRows", tab: "data", attribute: "maxRows", label: "Max rows", control: "number", order: 41, when: grid },
    { id: "persistent", tab: "data", attribute: "persistent", label: "Exclude from submission", control: "exclude", order: 80, when: data, hint: "Fields are saved by default. Check this to keep this field's value OUT of the saved payload." },
    { id: "clearOnHide", tab: "data", attribute: "clearOnHide", label: "Clear value when hidden", control: "checkbox", order: 81, when: data },
    // ── VALIDATION ─────────────────────────────────────────────────────────────
    { id: "required", tab: "validation", attribute: "required", label: "Required", control: "checkbox", order: 1, when: (e) => data(e) || grid(e) },
    {
      id: "requiredWhen",
      tab: "validation",
      attribute: "requiredWhen",
      label: "Required when (grid row)",
      control: "expression",
      order: 2,
      // Grid-cell-only: the engine evaluates `requiredWhen` per row, so only show it for grid cells
      // (a top-level field uses the Logic tab's require/optional rules instead).
      when: (e, schema) => data(e) && inGrid(e, schema),
      placeholder: "amount > 100",
      hint: "An expression over this row's fields \u2014 when truthy, this cell is required in that row (overrides the static Required)."
    },
    { id: "minLength", tab: "validation", attribute: "minLength", label: "Min length", control: "number", order: 10, when: textual },
    { id: "maxLength", tab: "validation", attribute: "maxLength", label: "Max length", control: "number", order: 11, when: textual },
    { id: "min", tab: "validation", attribute: "min", label: "Minimum", control: "number", order: 12, when: numeric },
    { id: "max", tab: "validation", attribute: "max", label: "Maximum", control: "number", order: 13, when: numeric },
    { id: "pattern", tab: "validation", attribute: "pattern", label: "Regex pattern", control: "text", order: 14, when: textual },
    { id: "minSelected", tab: "validation", attribute: "minSelected", label: "Min selected", control: "number", order: 20, when: oneOf("selectBoxes") },
    { id: "maxSelected", tab: "validation", attribute: "maxSelected", label: "Max selected", control: "number", order: 21, when: oneOf("selectBoxes") },
    { id: "minTags", tab: "validation", attribute: "minTags", label: "Min tags", control: "number", order: 22, when: oneOf("tags") },
    { id: "maxTags", tab: "validation", attribute: "maxTags", label: "Max tags", control: "number", order: 23, when: oneOf("tags") },
    {
      id: "validateOn",
      tab: "validation",
      attribute: "validateOn",
      label: "Validate on",
      control: "select",
      order: 50,
      when: data,
      options: [
        { label: "Change", value: "change" },
        { label: "Blur", value: "blur" }
      ]
    },
    { id: "minWords", tab: "validation", attribute: "minWords", label: "Min words", control: "number", order: 30, when: oneOf("textField", "textarea") },
    { id: "maxWords", tab: "validation", attribute: "maxWords", label: "Max words", control: "number", order: 31, when: oneOf("textField", "textarea") },
    { id: "minDate", tab: "validation", attribute: "minDate", label: "Earliest date", control: "text", order: 32, when: oneOf("day", "datetime"), hint: "ISO date, e.g. 2024-01-01" },
    { id: "maxDate", tab: "validation", attribute: "maxDate", label: "Latest date", control: "text", order: 33, when: oneOf("day", "datetime") },
    { id: "customMessage", tab: "validation", attribute: "customMessage", label: "Custom error message", control: "text", order: 60, when: data },
    {
      id: "asyncValidation",
      tab: "validation",
      attribute: "asyncValidation",
      label: "Async validation (Minion)",
      control: "asyncValidation",
      order: 70,
      when: data,
      hint: "Validate against a secure Minion (e.g. uniqueness). The field value is always sent as `value`."
    },
    // ── API ─────────────────────────────────────────────────────────────────
    { id: "key", tab: "api", attribute: "key", label: "Key", control: "text", order: 1, when: (e) => !isStaticType(e.type), hint: "Submission/scope key \u2014 letters, numbers, underscore; auto-made unique." },
    { id: "tags", tab: "api", attribute: "tags", label: "Field tags", control: "text", order: 10, placeholder: "comma,separated" },
    { id: "tabIndex", tab: "api", attribute: "tabIndex", label: "Tab index", control: "number", order: 20, when: data },
    { id: "autocomplete", tab: "api", attribute: "autocomplete", label: "Autocomplete", control: "checkbox", order: 30, when: textual },
    { id: "spellcheck", tab: "api", attribute: "spellcheck", label: "Spellcheck", control: "checkbox", order: 31, when: textual },
    { id: "autofocus", tab: "api", attribute: "autofocus", label: "Autofocus", control: "checkbox", order: 32, when: textual },
    // ── CONDITIONAL ─────────────────────────────────────────────────────────────
    { id: "logic", tab: "conditional", control: "logic", order: 1 },
    { id: "customConditional", tab: "conditional", attribute: "customConditional", label: "Advanced condition (show when\u2026)", control: "expression", order: 10, placeholder: 'country == "US"' },
    { id: "customConditionalJs", tab: "conditional", attribute: "customConditionalJs", label: "Condition (JavaScript)", control: "js", order: 20, placeholder: "show = data.country === 'US';" },
    // ── DATA: value computation (calculated / default-value) — a Data concern ────
    { id: "customDefaultValue", tab: "data", attribute: "customDefaultValue", label: "Default value (expression)", control: "expression", order: 11, when: data, placeholder: "firstName + ' ' + lastName" },
    { id: "calculateValue", tab: "data", attribute: "calculateValue", label: "Calculated value (expression)", control: "expression", order: 70, when: data, placeholder: "price * quantity" },
    { id: "calculateValueJs", tab: "data", attribute: "calculateValueJs", label: "Calculated value (JavaScript)", control: "js", order: 71, when: data, placeholder: "value = data.qty * data.price;" },
    { id: "allowCalculateOverride", tab: "data", attribute: "allowCalculateOverride", label: "Allow manual override", control: "checkbox", order: 72, when: data },
    // ── VALIDATION: custom validation expressions live with the other validators ──
    { id: "customValidation", tab: "validation", attribute: "customValidation", label: "Custom validation (expression)", control: "expression", order: 62, when: data, placeholder: "value > 0" },
    { id: "customValidationJs", tab: "validation", attribute: "customValidationJs", label: "Custom validation (JavaScript)", control: "js", order: 63, when: data, placeholder: "valid = input.length >= 3 ? true : 'Too short';" }
  ];
}
var defaultAttributeEditors = createDefaultAttributeEditors();
function mergeAttributeEditors(defaults, input) {
  if (!input) return defaults;
  if (typeof input === "function") return input([...defaults]);
  const byId = new Map(defaults.map((e) => [e.id, e]));
  const order = defaults.map((e) => e.id);
  for (const e of input) {
    if (e.remove) {
      byId.delete(e.id);
      continue;
    }
    if (!byId.has(e.id)) order.push(e.id);
    byId.set(e.id, e);
  }
  return order.map((id) => byId.get(id)).filter((e) => Boolean(e));
}
function editorsForEntity(editors, entity, schema) {
  return editors.filter((ed) => {
    if (ed.appliesTo && !ed.appliesTo.includes(entity.type)) return false;
    if (ed.when && !ed.when(entity, schema)) return false;
    return true;
  });
}
function editorsByTab(editors) {
  return ATTRIBUTE_TABS.map(({ id, label }) => ({
    tab: id,
    label,
    editors: editors.filter((e) => e.tab === id).sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  })).filter((g) => g.editors.length > 0);
}

// src/settings/LogicRules.tsx
import { useEffect, useMemo as useMemo2, useState as useState2 } from "react";
import {
  evaluateExpression
} from "@lukeflow/form-core";

// src/icons.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function svg(path, { size = 16, className }) {
  return /* @__PURE__ */ jsx("svg", { className: `lf-icon${className ? ` ${className}` : ""}`, viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true", focusable: "false", children: path });
}
function IconCheck(props = {}) {
  return svg(/* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }), props);
}
function IconX(props = {}) {
  return svg(/* @__PURE__ */ jsx("path", { d: "M18 6L6 18M6 6l12 12", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }), props);
}
function IconPencil(props = {}) {
  return svg(
    /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("path", { d: "M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsx("path", { d: "M13.5 7l3 3", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" })
    ] }),
    props
  );
}
function IconArrowUp(props = {}) {
  return svg(/* @__PURE__ */ jsx("path", { d: "M12 19V5M5 12l7-7 7 7", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }), props);
}
function IconArrowDown(props = {}) {
  return svg(/* @__PURE__ */ jsx("path", { d: "M12 5v14M5 12l7 7 7-7", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }), props);
}
function IconDuplicate(props = {}) {
  return svg(
    /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("rect", { x: "9", y: "9", width: "11", height: "11", rx: "2", fill: "none", stroke: "currentColor", strokeWidth: "2" }),
      /* @__PURE__ */ jsx("path", { d: "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
    ] }),
    props
  );
}
function IconReset(props = {}) {
  return svg(
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M4 12a8 8 0 1 0 2.3-5.6M4 4v3.2h3.2",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    ),
    props
  );
}
function IconUndo(props = {}) {
  return svg(
    /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("path", { d: "M9 14L4 9l5-5", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsx("path", { d: "M4 9h10.5a5.5 5.5 0 0 1 0 11H9", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
    ] }),
    props
  );
}
function IconRedo(props = {}) {
  return svg(
    /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("path", { d: "M15 14l5-5-5-5", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsx("path", { d: "M20 9H9.5a5.5 5.5 0 0 0 0 11H15", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
    ] }),
    props
  );
}
function IconEye(props = {}) {
  return svg(
    /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "3", fill: "none", stroke: "currentColor", strokeWidth: "2" })
    ] }),
    props
  );
}
function IconExternal(props = {}) {
  return svg(
    /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsx("path", { d: "M15 3h6v6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsx("path", { d: "M10 14L21 3", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
    ] }),
    props
  );
}

// src/settings/util.ts
import {
  createDefaultFieldTypeRegistry as createDefaultFieldTypeRegistry2
} from "@lukeflow/form-core";
var REGISTRY2 = createDefaultFieldTypeRegistry2();
function coerceScope(vals, typeByKey) {
  const out = {};
  for (const [k, raw] of Object.entries(vals)) {
    const ft = typeByKey[k] ? REGISTRY2.get(typeByKey[k]) : void 0;
    if (ft?.valueType === "boolean") out[k] = raw === "true" || raw === "1";
    else if (ft?.valueType === "number") out[k] = raw.trim() === "" ? "" : Number.isNaN(Number(raw)) ? raw : Number(raw);
    else if (ft) out[k] = raw;
    else if (raw === "true" || raw === "false") out[k] = raw === "true";
    else if (raw.trim() !== "" && !Number.isNaN(Number(raw))) out[k] = Number(raw);
    else out[k] = raw;
  }
  return out;
}
function toLiteral(v) {
  if (v === "true" || v === "false") return v;
  if (v.trim() !== "" && !Number.isNaN(Number(v)) && String(Number(v)) === v.trim()) return v;
  return JSON.stringify(v);
}
function unLiteral(v) {
  const t = v.trim();
  if (t.startsWith('"') && t.endsWith('"') || t.startsWith("'") && t.endsWith("'")) {
    try {
      return JSON.parse(t.replace(/^'|'$/g, '"'));
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function optionsOf(a) {
  const raw = a?.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => {
    if (typeof o === "string") return { label: o, value: o };
    const obj = o;
    const value = String(obj.value ?? obj.label ?? "");
    return { label: String(obj.label ?? obj.value ?? ""), value };
  });
}
function wordPresent(s, word) {
  return new RegExp(`(?:^|[^\\w$])${escapeRegExp(word)}(?:$|[^\\w$])`).test(s);
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function otherFieldKeys(schema, selfId) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [eid, e] of Object.entries(schema.entities ?? {})) {
    if (eid === selfId) continue;
    const k = e.attributes?.key;
    const ft = REGISTRY2.get(e.type);
    if (typeof k === "string" && k && !seen.has(k) && !ft?.isContainer && !ft?.isStatic) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
function str(v) {
  return typeof v === "string" ? v : "";
}
function numStr(v) {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

// src/settings/LogicRules.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var LOGIC_OPS = [
  { op: "==", label: "equals" },
  { op: "!=", label: "not equals" },
  { op: ">", label: "greater than" },
  { op: "<", label: "less than" },
  { op: ">=", label: "at least" },
  { op: "<=", label: "at most" }
];
var ACTION_PROPERTIES = [
  { key: "visibility", label: "Visibility", options: [{ label: "Visible", action: "show" }, { label: "Hidden", action: "hide" }] },
  { key: "required", label: "Required state", options: [{ label: "Required", action: "require" }, { label: "Optional", action: "optional" }] },
  { key: "enabled", label: "Enabled state", options: [{ label: "Enabled", action: "enable" }, { label: "Disabled", action: "disable" }] },
  { key: "value", label: "Value", options: [] }
  // special: setValue + a literal/field value
];
var ACTION_TO_PROPERTY = {
  show: "visibility",
  hide: "visibility",
  require: "required",
  optional: "required",
  enable: "enabled",
  disable: "enabled",
  setValue: "value"
};
var propertyOf = (action) => ACTION_TO_PROPERTY[action] ?? "visibility";
var WHEN_RE = /^\s*([A-Za-z_$][\w$]*)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/;
var _lrUid = 0;
var lrUid = () => `lr${++_lrUid}`;
function LogicRules({ builder, id, entity }) {
  const fields = otherFieldKeys(builder.schema, id);
  const { meta, typeByKey } = useMemo2(() => {
    const meta2 = {};
    for (const e of Object.values(builder.schema.entities ?? {})) {
      const k = e.attributes?.key;
      if (typeof k === "string" && k && !(k in meta2)) {
        const lbl = typeof e.attributes?.label === "string" && e.attributes.label ? e.attributes.label : k;
        meta2[k] = { label: capitalize(lbl), type: e.type, options: optionsOf(e.attributes) };
      }
    }
    const typeByKey2 = {};
    for (const k of Object.keys(meta2)) typeByKey2[k] = meta2[k].type;
    return { meta: meta2, typeByKey: typeByKey2 };
  }, [builder.schema.entities]);
  const readRules = () => {
    const raw = Array.isArray(entity.attributes.logic) ? entity.attributes.logic : [];
    const out = [];
    const whenOf = (r) => typeof r.when === "string" ? r.when : "";
    let i = 0;
    while (i < raw.length) {
      const w = whenOf(raw[i]);
      let j = i + 1;
      while (j < raw.length && whenOf(raw[j]) === w) j++;
      const group = raw.slice(i, j);
      const { conds, raw: rawWhen } = parseWhen(w);
      out.push({ id: lrUid(), conds, raw: rawWhen, actions: group.map((g) => parseAction(g, typeByKey)), collapsed: true });
      i = j;
    }
    return out;
  };
  const [parsed, setParsed] = useState2(readRules);
  const [testVals, setTestVals] = useState2({});
  useEffect(() => {
    setParsed(readRules());
    setTestVals({});
  }, [id]);
  const commit = (next) => {
    setParsed(next);
    const logic = [];
    for (const s of next) {
      const when = buildWhen(s);
      for (const a of s.actions) {
        logic.push({
          when,
          action: a.action,
          // setValue's value is a LITERAL or the bare key of another field (an expression
          // the engine evaluates to that field's live value).
          ...a.action === "setValue" ? { value: a.setSource === "field" ? a.setTo.trim() : toLiteral(a.setTo) } : {}
        });
      }
    }
    const prev = Array.isArray(entity.attributes.logic) ? entity.attributes.logic : [];
    if (JSON.stringify(prev) === JSON.stringify(logic)) return;
    builder.updateAttributes(id, { logic });
  };
  const setRule = (i, p) => commit(parsed.map((r, j) => j === i ? { ...r, ...p } : r));
  const setCond = (i, j, p) => setRule(i, { conds: parsed[i].conds.map((c, k) => k === j ? { ...c, ...p } : c) });
  const setAction = (i, ai, p) => setRule(i, { actions: parsed[i].actions.map((a, k) => k === ai ? { ...a, ...p } : a) });
  const addAction = (i) => setRule(i, { actions: [...parsed[i].actions, emptyAction()] });
  const removeAction = (i, ai) => setRule(i, { actions: parsed[i].actions.filter((_, k) => k !== ai) });
  const setTest = (ruleId, field, v) => setTestVals((prev) => ({ ...prev, [ruleId]: { ...prev[ruleId] ?? {}, [field]: v } }));
  const removeRule = (i) => {
    const removedId = parsed[i]?.id;
    commit(parsed.filter((_, j) => j !== i));
    if (removedId) setTestVals((prev) => {
      const { [removedId]: _drop, ...rest } = prev;
      return rest;
    });
  };
  const resetRule = (i) => setRule(i, { conds: [{ id: lrUid(), field: fields[0] ?? "", op: "==", value: "", editing: true }], actions: [emptyAction()], raw: void 0, collapsed: false });
  const saveRule = (i) => {
    const kept = parsed[i].conds.filter((c) => c.field);
    const conds = (kept.length ? kept : parsed[i].conds).map((c) => ({ ...c, editing: false }));
    setRule(i, { collapsed: true, conds });
  };
  return /* @__PURE__ */ jsxs2("fieldset", { className: "lf-settings-logic", children: [
    /* @__PURE__ */ jsx2("legend", { children: "Conditional rules" }),
    parsed.length === 0 && /* @__PURE__ */ jsx2("p", { className: "lf-empty", children: "No rules." }),
    parsed.map((r, i) => {
      const usedFields = r.raw != null ? fields.filter((f) => wordPresent(r.raw, f)) : [...new Set(r.conds.map((c) => c.field).filter(Boolean))];
      const when = buildWhen(r);
      const scope = coerceScope(testVals[r.id] ?? {}, typeByKey);
      const result = when ? Boolean(evaluateExpression(when, scope)) : null;
      if (r.collapsed) {
        return /* @__PURE__ */ jsx2("div", { className: "lf-logic-rule is-collapsed", role: "group", "aria-label": `Rule ${i + 1}`, children: /* @__PURE__ */ jsxs2("div", { className: "lf-logic-summary", children: [
          /* @__PURE__ */ jsx2("span", { className: "lf-logic-summary-text", title: ruleSummary(r, meta), children: ruleSummary(r, meta) }),
          /* @__PURE__ */ jsx2("button", { type: "button", className: "lf-logic-iconbtn", title: "Edit rule", "aria-label": `Edit rule ${i + 1}`, onClick: () => setRule(i, { collapsed: false }), children: /* @__PURE__ */ jsx2(IconPencil, { size: 14 }) }),
          /* @__PURE__ */ jsx2("button", { type: "button", className: "lf-logic-iconbtn lf-logic-iconbtn--danger", title: "Remove rule", "aria-label": `Remove rule ${i + 1}`, onClick: () => removeRule(i), children: /* @__PURE__ */ jsx2(IconX, { size: 14 }) })
        ] }) }, r.id);
      }
      return /* @__PURE__ */ jsxs2("div", { className: "lf-logic-rule", role: "group", "aria-label": `Rule ${i + 1}`, children: [
        r.raw != null ? /* @__PURE__ */ jsxs2("div", { className: "lf-logic-advanced", children: [
          /* @__PURE__ */ jsx2("span", { className: "lf-logic-advanced-label", children: "When (advanced expression)" }),
          /* @__PURE__ */ jsx2("textarea", { className: "lf-code", "aria-label": `Rule ${i + 1} expression`, spellCheck: false, rows: 2, value: r.raw, onChange: (e) => setRule(i, { raw: e.target.value }) }),
          /* @__PURE__ */ jsx2("span", { className: "lf-setting-hint", children: "This expression can't be split into simple conditions \u2014 edit it directly." })
        ] }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
          /* @__PURE__ */ jsx2("div", { className: "lf-logic-when-head", children: /* @__PURE__ */ jsx2("span", { className: "lf-logic-when", children: "When" }) }),
          r.conds.map((c, j) => {
            const opts = c.field ? meta[c.field]?.options ?? [] : [];
            const editing = c.editing !== false;
            return /* @__PURE__ */ jsxs2("div", { className: `lf-logic-cond${editing ? "" : " is-readonly"}`, children: [
              j > 0 && (editing ? /* @__PURE__ */ jsxs2("select", { className: "lf-logic-conn", "aria-label": `Rule ${i + 1} condition ${j + 1} connector`, value: c.connector ?? "and", onChange: (e) => setCond(i, j, { connector: e.target.value }), children: [
                /* @__PURE__ */ jsx2("option", { value: "and", children: "AND" }),
                /* @__PURE__ */ jsx2("option", { value: "or", children: "OR" })
              ] }) : /* @__PURE__ */ jsx2("span", { className: "lf-logic-conn-text", children: c.connector === "or" ? "OR" : "AND" })),
              editing ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
                /* @__PURE__ */ jsxs2("select", { "aria-label": `Rule ${i + 1} condition ${j + 1} field`, value: c.field, onChange: (e) => setCond(i, j, { field: e.target.value, value: "" }), children: [
                  /* @__PURE__ */ jsx2("option", { value: "" }),
                  fields.map((f) => /* @__PURE__ */ jsx2("option", { value: f, children: meta[f]?.label ?? capitalize(f) }, f))
                ] }),
                /* @__PURE__ */ jsx2("select", { "aria-label": `Rule ${i + 1} condition ${j + 1} operator`, value: c.op, onChange: (e) => setCond(i, j, { op: e.target.value }), children: LOGIC_OPS.map((o) => /* @__PURE__ */ jsx2("option", { value: o.op, children: o.label }, o.op)) }),
                opts.length > 0 ? /* @__PURE__ */ jsxs2("select", { "aria-label": `Rule ${i + 1} condition ${j + 1} value`, value: c.value, onChange: (e) => setCond(i, j, { value: e.target.value }), children: [
                  /* @__PURE__ */ jsx2("option", { value: "" }),
                  c.value && !opts.some((o) => o.value === c.value) && /* @__PURE__ */ jsxs2("option", { value: c.value, children: [
                    c.value,
                    " (not in options)"
                  ] }),
                  opts.map((o) => /* @__PURE__ */ jsx2("option", { value: o.value, children: o.label }, o.value))
                ] }) : /* @__PURE__ */ jsx2("input", { "aria-label": `Rule ${i + 1} condition ${j + 1} value`, value: c.value, onChange: (e) => setCond(i, j, { value: e.target.value }) }),
                /* @__PURE__ */ jsx2("button", { type: "button", className: "lf-logic-iconbtn lf-logic-iconbtn--ok", title: "Confirm condition", "aria-label": `Confirm condition ${j + 1} of rule ${i + 1}`, disabled: !c.field, onClick: () => setCond(i, j, { editing: false }), children: /* @__PURE__ */ jsx2(IconCheck, { size: 14 }) })
              ] }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
                /* @__PURE__ */ jsx2("span", { className: "lf-logic-cond-text", title: condText(c, meta), children: condText(c, meta) }),
                /* @__PURE__ */ jsx2("button", { type: "button", className: "lf-logic-iconbtn", title: "Edit condition", "aria-label": `Edit condition ${j + 1} of rule ${i + 1}`, onClick: () => setCond(i, j, { editing: true }), children: /* @__PURE__ */ jsx2(IconPencil, { size: 14 }) })
              ] }),
              /* @__PURE__ */ jsx2("button", { type: "button", className: "lf-logic-iconbtn lf-logic-iconbtn--danger", "aria-label": `Remove condition ${j + 1} of rule ${i + 1}`, title: "Remove condition", onClick: () => setRule(i, { conds: r.conds.filter((_, k) => k !== j) }), children: /* @__PURE__ */ jsx2(IconX, { size: 13 }) })
            ] }, c.id);
          }),
          /* @__PURE__ */ jsx2("button", { type: "button", className: "lf-logic-add-cond", onClick: () => setRule(i, { conds: [...r.conds, emptyCond()] }), children: "+ Add condition" })
        ] }),
        usedFields.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "lf-logic-test", role: "group", "aria-label": `Rule ${i + 1} test`, children: [
          /* @__PURE__ */ jsx2("span", { className: "lf-logic-test-label", children: "Test:" }),
          usedFields.map((f) => {
            const v = testVals[r.id]?.[f] ?? "";
            return /* @__PURE__ */ jsxs2("label", { className: "lf-logic-test-field", children: [
              /* @__PURE__ */ jsx2("span", { className: "lf-logic-test-key", children: meta[f]?.label ?? capitalize(f) }),
              /* @__PURE__ */ jsx2("input", { "aria-label": `Rule ${i + 1} test ${f}`, className: "lf-logic-test-input", size: Math.max(4, v.length + 1), value: v, onChange: (e) => setTest(r.id, f, e.target.value) })
            ] }, f);
          }),
          /* @__PURE__ */ jsxs2("span", { className: `lf-logic-result${result ? " is-true" : " is-false"}`, "aria-live": "polite", children: [
            "\u21D2 ",
            result ? "true" : "false"
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "lf-logic-then", children: [
          /* @__PURE__ */ jsx2("span", { className: "lf-logic-then-label", children: "\u2192 then" }),
          /* @__PURE__ */ jsxs2("div", { className: "lf-logic-actions-list", children: [
            r.actions.map((a, ai) => /* @__PURE__ */ jsxs2("div", { className: "lf-logic-action", children: [
              /* @__PURE__ */ jsx2("span", { className: "lf-logic-action-set", children: "set" }),
              /* @__PURE__ */ jsx2(
                "select",
                {
                  className: "lf-logic-prop",
                  "aria-label": `Rule ${i + 1} action ${ai + 1} property`,
                  value: propertyOf(a.action),
                  onChange: (e) => {
                    const prop = ACTION_PROPERTIES.find((p) => p.key === e.target.value);
                    if (!prop) return;
                    if (prop.key === "value") setAction(i, ai, { action: "setValue", setSource: a.setSource ?? "literal", setTo: "" });
                    else setAction(i, ai, { action: prop.options[0].action });
                  },
                  children: ACTION_PROPERTIES.map((p) => /* @__PURE__ */ jsx2("option", { value: p.key, children: p.label }, p.key))
                }
              ),
              /* @__PURE__ */ jsx2("span", { className: "lf-logic-then-eq", "aria-hidden": "true", children: "=" }),
              a.action === "setValue" ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
                /* @__PURE__ */ jsxs2("select", { "aria-label": `Rule ${i + 1} action ${ai + 1} value source`, value: a.setSource ?? "literal", onChange: (e) => setAction(i, ai, { setSource: e.target.value, setTo: "" }), children: [
                  /* @__PURE__ */ jsx2("option", { value: "literal", children: "a value" }),
                  /* @__PURE__ */ jsx2("option", { value: "field", children: "another field" })
                ] }),
                a.setSource === "field" ? /* @__PURE__ */ jsxs2("select", { "aria-label": `Rule ${i + 1} action ${ai + 1} set value`, value: a.setTo, onChange: (e) => setAction(i, ai, { setTo: e.target.value }), children: [
                  /* @__PURE__ */ jsx2("option", { value: "" }),
                  a.setTo && !fields.includes(a.setTo) && /* @__PURE__ */ jsxs2("option", { value: a.setTo, children: [
                    a.setTo,
                    " (not in fields)"
                  ] }),
                  fields.map((f) => /* @__PURE__ */ jsx2("option", { value: f, children: meta[f]?.label ?? capitalize(f) }, f))
                ] }) : /* @__PURE__ */ jsx2("input", { className: "lf-logic-setval", "aria-label": `Rule ${i + 1} action ${ai + 1} set value`, placeholder: "value to set", value: a.setTo, onChange: (e) => setAction(i, ai, { setTo: e.target.value }) })
              ] }) : /* @__PURE__ */ jsx2("select", { "aria-label": `Rule ${i + 1} action ${ai + 1} value`, value: a.action, onChange: (e) => setAction(i, ai, { action: e.target.value }), children: (ACTION_PROPERTIES.find((p) => p.key === propertyOf(a.action))?.options ?? []).map((o) => /* @__PURE__ */ jsx2("option", { value: o.action, children: o.label }, o.action)) }),
              r.actions.length > 1 && /* @__PURE__ */ jsx2("button", { type: "button", className: "lf-logic-iconbtn lf-logic-iconbtn--danger", "aria-label": `Remove action ${ai + 1} of rule ${i + 1}`, title: "Remove action", onClick: () => removeAction(i, ai), children: /* @__PURE__ */ jsx2(IconX, { size: 13 }) })
            ] }, a.id)),
            /* @__PURE__ */ jsx2("button", { type: "button", className: "lf-logic-add-cond", onClick: () => addAction(i), children: "+ Add action" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "lf-logic-rule-actions", children: [
          /* @__PURE__ */ jsxs2("button", { type: "button", className: "lf-logic-btn lf-logic-reset", title: "Reset this rule to its default", "aria-label": `Reset rule ${i + 1}`, onClick: () => resetRule(i), children: [
            /* @__PURE__ */ jsx2(IconReset, { size: 14 }),
            " Reset"
          ] }),
          /* @__PURE__ */ jsxs2("button", { type: "button", className: "lf-logic-btn lf-logic-save", title: "Save this rule (collapses it)", "aria-label": `Save rule ${i + 1}`, onClick: () => saveRule(i), children: [
            /* @__PURE__ */ jsx2(IconCheck, { size: 14 }),
            " Save"
          ] }),
          /* @__PURE__ */ jsxs2("button", { type: "button", className: "lf-logic-btn lf-logic-remove", title: "Remove this rule", "aria-label": `Remove rule ${i + 1}`, onClick: () => removeRule(i), children: [
            /* @__PURE__ */ jsx2(IconX, { size: 14 }),
            " Remove"
          ] })
        ] })
      ] }, r.id);
    }),
    /* @__PURE__ */ jsx2("button", { type: "button", className: "lf-logic-add", onClick: () => commit([...parsed, { id: lrUid(), conds: [{ id: lrUid(), field: fields[0] ?? "", op: "==", value: "", editing: true }], actions: [emptyAction()], collapsed: false }]), children: "Add rule" })
  ] });
}
function emptyCond() {
  return { id: lrUid(), field: "", op: "==", value: "", connector: "and", editing: true };
}
function emptyAction() {
  return { id: lrUid(), action: "show", setTo: "", setSource: "literal" };
}
function actionSummary(a, meta) {
  if (a.action === "setValue") {
    const to = a.setSource === "field" ? meta[a.setTo]?.label ?? a.setTo : a.setTo;
    return `Set Value = ${to || "\u2014"}`;
  }
  const prop = ACTION_PROPERTIES.find((p) => p.key === propertyOf(a.action));
  const valLabel = prop?.options.find((o) => o.action === a.action)?.label ?? capitalize(a.action);
  return `Set ${prop?.label ?? "property"} = ${valLabel}`;
}
function condText(c, meta) {
  if (!c.field) return "(incomplete)";
  const field = meta[c.field]?.label ?? capitalize(c.field);
  const op = LOGIC_OPS.find((o) => o.op === c.op)?.label ?? c.op;
  const opt = meta[c.field]?.options.find((o) => o.value === c.value);
  const value = opt ? opt.label : c.value === "" ? "(empty)" : c.value;
  return `${field} ${op} ${value}`;
}
function ruleSummary(r, meta) {
  const n = r.raw != null ? 1 : r.conds.filter((c) => c.field).length;
  const conds = n === 0 ? "always" : `${n} condition${n === 1 ? "" : "s"}`;
  const out = r.actions.map((a) => actionSummary(a, meta)).join(", ");
  return `When ${conds} \u2192 ${out}`;
}
function parseAction(r, typeByKey) {
  const action = typeof r.action === "string" && r.action in ACTION_TO_PROPERTY ? r.action : "show";
  let setSource = "literal";
  let setTo = "";
  if (action === "setValue" && typeof r.value === "string") {
    const raw = r.value.trim();
    if (/^[A-Za-z_$][\w$]*$/.test(raw) && raw !== "true" && raw !== "false" && typeByKey[raw]) {
      setSource = "field";
      setTo = raw;
    } else {
      setTo = unLiteral(r.value);
    }
  } else if (action === "setValue" && (typeof r.value === "number" || typeof r.value === "boolean")) {
    setTo = String(r.value);
  }
  return { id: lrUid(), action, setTo, setSource };
}
function parseWhen(when) {
  if (!when.trim()) return { conds: [emptyCond()] };
  const parts = splitConds(when);
  const conds = [];
  for (let k = 0; k < parts.length; k += 2) {
    const m = WHEN_RE.exec((parts[k] ?? "").trim());
    if (!m) return { conds: [], raw: when };
    const c = { id: lrUid(), field: m[1] ?? "", op: m[2] ?? "==", value: unLiteral(m[3] ?? ""), editing: false };
    if (k > 0) c.connector = parts[k - 1] === "or" ? "or" : "and";
    conds.push(c);
  }
  return conds.length ? { conds } : { conds: [], raw: when };
}
function splitConds(when) {
  const out = [];
  let token = "";
  let depth = 0;
  let quote = null;
  for (let i = 0; i < when.length; i++) {
    const ch = when[i];
    if (quote) {
      token += ch;
      if (ch === quote && when[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      token += ch;
      continue;
    }
    if (ch === "(") {
      depth++;
      token += ch;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      token += ch;
      continue;
    }
    if (depth === 0) {
      const m = /^\s+(and|or)\s+/.exec(when.slice(i));
      if (m) {
        out.push(token);
        out.push(m[1]);
        token = "";
        i += m[0].length - 1;
        continue;
      }
    }
    token += ch;
  }
  out.push(token);
  return out;
}
function buildWhen(rule) {
  if (rule.raw != null) return rule.raw;
  const valid = rule.conds.filter((c) => c.field);
  if (valid.length === 0) return "";
  let out = `${valid[0].field} ${valid[0].op} ${toLiteral(valid[0].value)}`;
  for (let k = 1; k < valid.length; k++) {
    const c = valid[k];
    const conn = c.connector === "or" ? "or" : "and";
    out += ` ${conn} ${c.field} ${c.op} ${toLiteral(c.value)}`;
  }
  return out;
}

// src/settings/OptionsControl.tsx
import { useEffect as useEffect2, useId, useRef as useRef2, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function OptionsControl({ editor, ctx }) {
  const [rows, setRows] = useState3(() => readOptionRows(ctx.value));
  const [shape, setShape] = useState3(() => inferShape(readOptionRows(ctx.value)));
  const [view, setView] = useState3("rows");
  const [draft, setDraft] = useState3("");
  const [jsonError, setJsonError] = useState3(null);
  const errId = useId();
  const sig = JSON.stringify(ctx.value ?? null);
  const lastSig = useRef2(sig);
  const lastId = useRef2(ctx.entity.id);
  const dirtyRef = useRef2(false);
  const pinnedRef = useRef2(false);
  const shapeRef = useRef2(shape);
  shapeRef.current = shape;
  const viewRef = useRef2(view);
  viewRef.current = view;
  const seedDraft = (text) => {
    setDraft(text);
    dirtyRef.current = false;
  };
  useEffect2(() => {
    if (lastId.current !== ctx.entity.id) {
      lastId.current = ctx.entity.id;
      lastSig.current = sig;
      pinnedRef.current = false;
      const next = readOptionRows(ctx.value);
      setRows(next);
      setShape(inferShape(next));
      setView("rows");
      seedDraft("");
      setJsonError(null);
    } else if (sig !== lastSig.current) {
      lastSig.current = sig;
      const next = readOptionRows(ctx.value);
      const sh = pinnedRef.current ? shapeRef.current : inferShape(next);
      setRows(next);
      setShape(sh);
      if (viewRef.current === "rows" || !dirtyRef.current) seedDraft(rowsToJson(next, sh));
      else setJsonError("The options changed elsewhere \u2014 Apply will overwrite that change.");
    }
  }, [sig, ctx.entity.id]);
  const commit = (next, sh = shape) => {
    setRows(next);
    const persisted = serializeOptions(next, sh);
    lastSig.current = JSON.stringify(persisted ?? null);
    ctx.setValue(persisted);
    return persisted;
  };
  const setLabel = (i, label) => commit(rows.map((r, j) => j === i ? { label, value: label } : r));
  const setField = (i, patch) => commit(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const addRow = () => commit([...rows, { label: `Option ${rows.length + 1}`, value: "" }]);
  const removeRow = (i) => commit(rows.filter((_, j) => j !== i));
  const pickShape = (sh) => {
    if (sh === shape) return;
    pinnedRef.current = true;
    setShape(sh);
    if (view === "json") {
      const parsed = parseOptionsJson(draft);
      if (parsed.ok) {
        const shaped = sh === "list" ? parsed.rows.map((r) => ({ label: r.label, value: r.label })) : parsed.rows;
        seedDraft(rowsToJson(shaped, sh));
        setJsonError(null);
      }
      return;
    }
    const adjusted = sh === "list" ? rows.map((r) => ({ label: r.label, value: r.label })) : rows;
    const stored = commit(adjusted, sh);
    seedDraft(rowsToJson(readOptionRows(stored), sh));
    setJsonError(null);
  };
  const openJson = () => {
    if (view === "json") return;
    seedDraft(rowsToJson(rows, shape));
    setJsonError(null);
    setView("json");
  };
  const applyJson = () => {
    const parsed = parseOptionsJson(draft);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      return;
    }
    setJsonError(null);
    const shaped = shape === "list" ? parsed.rows.map((r) => ({ label: r.label, value: r.label })) : parsed.rows;
    const stored = commit(shaped, shape);
    const storedRows = readOptionRows(stored);
    setRows(storedRows);
    seedDraft(rowsToJson(storedRows, shape));
  };
  const seg = (active, label, onClick) => /* @__PURE__ */ jsx3("button", { type: "button", className: `lf-opt-mode-btn${active ? " is-active" : ""}`, "aria-pressed": active, onClick, children: label });
  return /* @__PURE__ */ jsxs3("div", { className: "lf-setting-wrap", children: [
    /* @__PURE__ */ jsxs3("div", { className: "lf-options-head", children: [
      /* @__PURE__ */ jsx3("span", { className: "lf-setting-label", children: editor.label ?? "Options" }),
      /* @__PURE__ */ jsxs3("div", { className: "lf-opt-toggles", children: [
        /* @__PURE__ */ jsxs3("div", { className: "lf-opt-mode", role: "group", "aria-label": "Options shape", children: [
          seg(shape === "list", "List", () => pickShape("list")),
          seg(shape === "kv", "Label + Value", () => pickShape("kv"))
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "lf-opt-mode", role: "group", "aria-label": "Options edit mode", children: [
          seg(view === "rows", "Rows", () => setView("rows")),
          seg(view === "json", "JSON", openJson)
        ] })
      ] })
    ] }),
    view === "rows" ? /* @__PURE__ */ jsxs3("div", { className: "lf-options", children: [
      rows.length === 0 && /* @__PURE__ */ jsx3("p", { className: "lf-empty", children: "No options yet." }),
      rows.map(
        (o, i) => shape === "kv" ? /* @__PURE__ */ jsxs3("div", { className: "lf-opt-row", children: [
          /* @__PURE__ */ jsx3("input", { "aria-label": `Option ${i + 1} label`, className: "lf-opt-label", value: o.label, placeholder: "Label", onChange: (e) => setField(i, { label: e.target.value }) }),
          /* @__PURE__ */ jsx3("input", { "aria-label": `Option ${i + 1} value`, className: "lf-opt-value", value: o.value, placeholder: "Value", onChange: (e) => setField(i, { value: e.target.value }) }),
          /* @__PURE__ */ jsx3("button", { type: "button", className: "lf-opt-remove", "aria-label": `Remove option ${i + 1}`, onClick: () => removeRow(i), children: /* @__PURE__ */ jsx3(IconX, { size: 13 }) })
        ] }, i) : /* @__PURE__ */ jsxs3("div", { className: "lf-opt-row", children: [
          /* @__PURE__ */ jsx3("input", { "aria-label": `Option ${i + 1}`, className: "lf-opt-label", value: o.label, placeholder: "Option", onChange: (e) => setLabel(i, e.target.value) }),
          /* @__PURE__ */ jsx3("button", { type: "button", className: "lf-opt-remove", "aria-label": `Remove option ${i + 1}`, onClick: () => removeRow(i), children: /* @__PURE__ */ jsx3(IconX, { size: 13 }) })
        ] }, i)
      ),
      /* @__PURE__ */ jsx3("button", { type: "button", className: "lf-opt-add", onClick: addRow, children: "+ Add option" })
    ] }) : /* @__PURE__ */ jsxs3("div", { className: "lf-options-json", children: [
      /* @__PURE__ */ jsx3(
        "textarea",
        {
          className: "lf-opt-json",
          "aria-label": "Options as JSON",
          "aria-invalid": jsonError ? true : void 0,
          "aria-errormessage": jsonError ? errId : void 0,
          spellCheck: false,
          rows: Math.min(14, Math.max(4, draft.split("\n").length + 1)),
          value: draft,
          onChange: (e) => {
            dirtyRef.current = true;
            setDraft(e.target.value);
            if (jsonError) setJsonError(null);
          }
        }
      ),
      jsonError && /* @__PURE__ */ jsx3("p", { id: errId, className: "lf-opt-json-error", role: "alert", children: jsonError }),
      /* @__PURE__ */ jsxs3("div", { className: "lf-opt-json-foot", children: [
        /* @__PURE__ */ jsx3("button", { type: "button", className: "lf-opt-json-apply", onClick: applyJson, children: "Apply" }),
        /* @__PURE__ */ jsx3("span", { className: "lf-opt-json-hint", children: shape === "kv" ? 'A JSON array of { "label": "\u2026", "value": "\u2026" }.' : 'A JSON array of values \u2014 "Option A", "Option B", \u2026' })
      ] })
    ] }),
    editor.hint && /* @__PURE__ */ jsx3("span", { className: "lf-setting-hint", children: editor.hint })
  ] });
}
function readOptionRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => {
    if (typeof o === "string") return { label: o, value: o };
    const obj = o;
    return { label: String(obj.label ?? obj.value ?? ""), value: String(obj.value ?? "") };
  });
}
function inferShape(rows) {
  return rows.some((r) => r.value && r.value !== r.label) ? "kv" : "list";
}
function serializeOptions(rows, shape) {
  const kept = rows.filter((o) => o.label.trim() || o.value.trim());
  if (!kept.length) return void 0;
  if (shape === "list") return kept.map((o) => o.label.trim() || o.value.trim());
  return kept.map((o) => {
    const value = o.value.trim() || o.label.trim();
    return { label: o.label.trim() ? o.label : value, value };
  });
}
function rowsToJson(rows, shape) {
  return JSON.stringify(serializeOptions(rows, shape) ?? [], null, 2);
}
function parseOptionsJson(text) {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, rows: [] };
  let data2;
  try {
    data2 = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e.message}` };
  }
  if (!Array.isArray(data2)) return { ok: false, error: "Expected a JSON array of options." };
  const rows = [];
  for (let i = 0; i < data2.length; i++) {
    const item = data2[i];
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      const s = String(item);
      rows.push({ label: s, value: s });
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const obj = item;
      if (!isPrimitive(obj.label) || !isPrimitive(obj.value)) {
        return { ok: false, error: `Item ${i + 1}: label and value must be a string, number, or boolean.` };
      }
      const label = obj.label != null ? String(obj.label) : obj.value != null ? String(obj.value) : "";
      const value = obj.value != null ? String(obj.value) : label;
      if (!label && !value) return { ok: false, error: `Item ${i + 1} has no label or value.` };
      rows.push({ label, value });
    } else {
      return { ok: false, error: `Item ${i + 1} must be a string or an object.` };
    }
  }
  return { ok: true, rows };
}
function isPrimitive(x) {
  return x == null || typeof x === "string" || typeof x === "number" || typeof x === "boolean";
}

// src/settings/editors.tsx
import { useEffect as useEffect3, useRef as useRef3, useState as useState4 } from "react";
import { parseExpression } from "@lukeflow/form-core";
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function JsControl({ editor, ctx }) {
  const value = str(ctx.value);
  const ref = useRef3(null);
  const [open, setOpen] = useState4(value !== "");
  const insert2 = (token) => {
    const el = ref.current;
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    ctx.setValue(next);
    const restore = () => {
      if (el) {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      }
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
    else restore();
  };
  const outVar = editor.attribute === "customConditionalJs" ? "show" : editor.attribute === "customValidationJs" ? "valid" : "value";
  const tokens = [`${outVar} = `, ...editor.attribute === "customValidationJs" ? ["input"] : [], ...ctx.fieldKeys.map((k) => `data.${k}`)];
  return /* @__PURE__ */ jsxs4("details", { className: "lf-js", open, onToggle: (e) => setOpen(e.target.open), children: [
    /* @__PURE__ */ jsx4("summary", { className: "lf-js-summary", children: editor.label ?? editor.id }),
    /* @__PURE__ */ jsxs4("div", { className: "lf-js-body", children: [
      /* @__PURE__ */ jsx4(
        "textarea",
        {
          ref,
          className: "lf-code",
          "aria-label": editor.label ?? editor.id,
          spellCheck: false,
          value,
          placeholder: editor.placeholder,
          rows: 5,
          onChange: (e) => ctx.setValue(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs4("div", { className: "lf-js-insert", children: [
        /* @__PURE__ */ jsx4("span", { className: "lf-js-insert-label", children: "Insert:" }),
        tokens.map((t) => /* @__PURE__ */ jsx4("button", { type: "button", className: "lf-js-token", title: `Insert ${t.trim()}`, onClick: () => insert2(t), children: t.trim() }, t))
      ] }),
      editor.hint && /* @__PURE__ */ jsx4("span", { className: "lf-setting-hint", children: editor.hint })
    ] })
  ] });
}
function ExpressionControl({ editor, ctx }) {
  const value = str(ctx.value);
  const parsed = parseExpression(value);
  const error = parsed.ok ? null : parsed.error;
  return /* @__PURE__ */ jsx4(
    Labeled,
    {
      label: editor.label ?? editor.id,
      hint: editor.hint,
      footer: error ? /* @__PURE__ */ jsx4("span", { className: "lf-expr-error", role: "alert", children: error }) : void 0,
      children: /* @__PURE__ */ jsx4(
        "textarea",
        {
          className: "lf-code",
          spellCheck: false,
          value,
          placeholder: editor.placeholder,
          rows: 2,
          "aria-invalid": error ? true : void 0,
          onChange: (e) => ctx.setValue(e.target.value)
        }
      )
    }
  );
}
function DataSourceControl({ editor, ctx }) {
  const ds = ctx.value && typeof ctx.value === "object" ? ctx.value : null;
  const enabled = ds !== null;
  const isSearch = ctx.entity.type === "searchSelect";
  const set = (p) => ctx.setValue({ ...ds ?? {}, ...p });
  return /* @__PURE__ */ jsxs4("fieldset", { className: "lf-settings-minion", children: [
    /* @__PURE__ */ jsx4("legend", { children: editor.label ?? "Minion data source" }),
    /* @__PURE__ */ jsxs4("label", { className: "lf-setting lf-setting-inline", children: [
      /* @__PURE__ */ jsx4(
        "input",
        {
          type: "checkbox",
          "aria-label": "Load options from a Minion",
          checked: enabled,
          onChange: (e) => ctx.setValue(e.target.checked ? { minion: ds?.minion ?? "" } : void 0)
        }
      ),
      /* @__PURE__ */ jsx4("span", { className: "lf-setting-label", children: "Load options from a Minion" })
    ] }),
    editor.hint && /* @__PURE__ */ jsx4("span", { className: "lf-setting-hint", children: editor.hint }),
    enabled && /* @__PURE__ */ jsxs4(Fragment3, { children: [
      /* @__PURE__ */ jsx4(Labeled, { label: "Minion operation", children: /* @__PURE__ */ jsx4("input", { value: str(ds?.minion), placeholder: "listCities", onChange: (e) => set({ minion: e.target.value }) }) }),
      isSearch && /* @__PURE__ */ jsx4(Labeled, { label: "Search param", children: /* @__PURE__ */ jsx4("input", { value: str(ds?.searchParam), placeholder: "q", onChange: (e) => set({ searchParam: e.target.value }) }) }),
      /* @__PURE__ */ jsx4(Labeled, { label: "Result path", children: /* @__PURE__ */ jsx4("input", { value: str(ds?.resultPath), placeholder: "data", onChange: (e) => set({ resultPath: e.target.value }) }) }),
      /* @__PURE__ */ jsx4(Labeled, { label: "Label path", children: /* @__PURE__ */ jsx4("input", { value: str(ds?.labelPath), placeholder: "name", onChange: (e) => set({ labelPath: e.target.value }) }) }),
      /* @__PURE__ */ jsx4(Labeled, { label: "Value path", children: /* @__PURE__ */ jsx4("input", { value: str(ds?.valuePath), placeholder: "id", onChange: (e) => set({ valuePath: e.target.value }) }) }),
      !isSearch && /* @__PURE__ */ jsx4(Labeled, { label: "Refetch", children: /* @__PURE__ */ jsxs4("select", { value: str(ds?.trigger) || "load", onChange: (e) => set({ trigger: e.target.value }), children: [
        /* @__PURE__ */ jsx4("option", { value: "load", children: "Once on load" }),
        /* @__PURE__ */ jsx4("option", { value: "change", children: "When params change" })
      ] }) }),
      /* @__PURE__ */ jsx4(
        ParamsEditor,
        {
          legend: "Request params (param \u2190 field)",
          params: ds?.params,
          fieldKeys: ctx.fieldKeys,
          resetKey: `${ctx.entity.id}:dataSource`,
          onChange: (params) => set({ params })
        }
      )
    ] })
  ] });
}
function AsyncValidationControl({ editor, ctx }) {
  const av = ctx.value && typeof ctx.value === "object" ? ctx.value : null;
  const enabled = av !== null;
  const set = (p) => ctx.setValue({ ...av ?? {}, ...p });
  return /* @__PURE__ */ jsxs4("fieldset", { className: "lf-settings-minion", children: [
    /* @__PURE__ */ jsx4("legend", { children: editor.label ?? "Async validation" }),
    /* @__PURE__ */ jsxs4("label", { className: "lf-setting lf-setting-inline", children: [
      /* @__PURE__ */ jsx4(
        "input",
        {
          type: "checkbox",
          "aria-label": "Validate via a Minion",
          checked: enabled,
          onChange: (e) => ctx.setValue(e.target.checked ? { minion: av?.minion ?? "" } : void 0)
        }
      ),
      /* @__PURE__ */ jsx4("span", { className: "lf-setting-label", children: "Validate via a Minion" })
    ] }),
    editor.hint && /* @__PURE__ */ jsx4("span", { className: "lf-setting-hint", children: editor.hint }),
    enabled && /* @__PURE__ */ jsxs4(Fragment3, { children: [
      /* @__PURE__ */ jsx4(Labeled, { label: "Minion operation", children: /* @__PURE__ */ jsx4("input", { value: str(av?.minion), placeholder: "checkEmail", onChange: (e) => set({ minion: e.target.value }) }) }),
      /* @__PURE__ */ jsx4(Labeled, { label: "Error message", children: /* @__PURE__ */ jsx4("input", { value: str(av?.message), placeholder: "Already taken", onChange: (e) => set({ message: e.target.value }) }) }),
      /* @__PURE__ */ jsx4(
        ParamsEditor,
        {
          legend: "Extra params (param \u2190 field)",
          params: av?.params,
          fieldKeys: ctx.fieldKeys,
          resetKey: `${ctx.entity.id}:asyncValidation`,
          onChange: (params) => set({ params })
        }
      )
    ] })
  ] });
}
function ParamsEditor({
  legend,
  params,
  fieldKeys,
  resetKey,
  onChange
}) {
  const [rows, setRows] = useState4(() => Object.entries(params ?? {}));
  useEffect3(() => {
    setRows(Object.entries(params ?? {}));
  }, [resetKey]);
  const commit = (next) => {
    setRows(next);
    const rec = {};
    for (const [k, v] of next) if (k) rec[k] = v;
    onChange(Object.keys(rec).length ? rec : void 0);
  };
  const setAt = (i, k, v) => commit(rows.map((e, j) => j === i ? [k, v] : e));
  return /* @__PURE__ */ jsxs4("fieldset", { className: "lf-settings-params", children: [
    /* @__PURE__ */ jsx4("legend", { children: legend }),
    rows.length === 0 && /* @__PURE__ */ jsx4("p", { className: "lf-empty", children: "No params." }),
    rows.map(([k, v], i) => /* @__PURE__ */ jsxs4("div", { className: "lf-param-row", role: "group", "aria-label": `Param ${i + 1}`, children: [
      /* @__PURE__ */ jsx4("input", { "aria-label": `Param ${i + 1} name`, value: k, placeholder: "param", onChange: (e) => setAt(i, e.target.value, v) }),
      /* @__PURE__ */ jsx4("span", { children: "\u2190" }),
      /* @__PURE__ */ jsxs4("select", { "aria-label": `Param ${i + 1} field`, value: v, onChange: (e) => setAt(i, k, e.target.value), children: [
        /* @__PURE__ */ jsx4("option", { value: "" }),
        fieldKeys.map((f) => /* @__PURE__ */ jsx4("option", { value: f, children: f }, f))
      ] }),
      /* @__PURE__ */ jsx4("button", { type: "button", "aria-label": `Remove param ${i + 1}`, onClick: () => commit(rows.filter((_, j) => j !== i)), children: /* @__PURE__ */ jsx4(IconX, { size: 13 }) })
    ] }, i)),
    /* @__PURE__ */ jsx4("button", { type: "button", className: "lf-param-add", onClick: () => commit([...rows, ["", ""]]), children: "Add param" })
  ] });
}
function Labeled({
  label,
  hint,
  inline,
  footer,
  children
}) {
  return /* @__PURE__ */ jsxs4("div", { className: "lf-setting-wrap", children: [
    /* @__PURE__ */ jsxs4("label", { className: `lf-setting${inline ? " lf-setting-inline" : ""}`, children: [
      /* @__PURE__ */ jsx4("span", { className: "lf-setting-label", children: label }),
      children
    ] }),
    hint && /* @__PURE__ */ jsx4("span", { className: "lf-setting-hint", children: hint }),
    footer
  ] });
}

// src/SettingsPanel.tsx
import { Fragment as Fragment4, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function SettingsPanel({ builder, editors }) {
  const id = builder.selectedId;
  const entity = id ? builder.schema.entities[id] : void 0;
  const [activeTab, setActiveTab] = useState5("display");
  const entityType = entity?.type;
  useEffect4(() => {
    setActiveTab("display");
  }, [id, entityType]);
  const uid = useId2();
  const navRef = useRef4(null);
  if (!id || !entity) {
    return /* @__PURE__ */ jsx5("div", { className: "lf-settings", "aria-label": "Field settings", children: /* @__PURE__ */ jsx5("p", { className: "lf-empty", children: "Select a field to edit its settings." }) });
  }
  const applicable = editorsForEntity(editors, entity, builder.schema);
  const groups = editorsByTab(applicable);
  const active = groups.find((g) => g.tab === activeTab) ?? groups[0];
  const fieldKeys = otherFieldKeys(builder.schema, id);
  const patch = (p) => builder.updateAttributes(id, p);
  const tabId = (t) => `${uid}-tab-${t}`;
  const panelId = `${uid}-panel`;
  const onTabKey = (e) => {
    const i = groups.findIndex((g) => g.tab === active?.tab);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % groups.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + groups.length) % groups.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = groups.length - 1;
    else return;
    e.preventDefault();
    setActiveTab(groups[next].tab);
    navRef.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  return /* @__PURE__ */ jsxs5("div", { className: "lf-settings", "aria-label": "Field settings", children: [
    /* @__PURE__ */ jsxs5("h4", { children: [
      "Settings \u2014 ",
      entity.type
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "lf-settings-tabs", role: "tablist", "aria-label": "Field settings tabs", ref: navRef, children: groups.map((g) => /* @__PURE__ */ jsx5(
      "button",
      {
        type: "button",
        role: "tab",
        id: tabId(g.tab),
        "aria-selected": active?.tab === g.tab,
        "aria-controls": panelId,
        tabIndex: active?.tab === g.tab ? 0 : -1,
        className: `lf-settings-tab${active?.tab === g.tab ? " is-active" : ""}`,
        onKeyDown: onTabKey,
        onClick: () => setActiveTab(g.tab),
        children: g.label
      },
      g.tab
    )) }),
    /* @__PURE__ */ jsx5("div", { className: "lf-settings-panel", role: "tabpanel", id: panelId, "aria-labelledby": active ? tabId(active.tab) : void 0, children: (() => {
      const editorsHere = active?.editors ?? [];
      const isToggle = (ed) => ed.control === "checkbox" || ed.control === "exclude";
      const renderEditor = (ed) => {
        const ctx = {
          entity,
          schema: builder.schema,
          fieldKeys,
          value: ed.attribute ? entity.attributes[ed.attribute] : void 0,
          setValue: ed.attribute ? (v) => patch({ [ed.attribute]: v }) : () => {
          },
          patch
        };
        return /* @__PURE__ */ jsx5(Control, { editor: ed, ctx, builder, id, entity }, ed.id);
      };
      const toggles = editorsHere.filter(isToggle);
      const rest = editorsHere.filter((ed) => !isToggle(ed));
      return /* @__PURE__ */ jsxs5(Fragment4, { children: [
        rest.map(renderEditor),
        toggles.length > 0 && /* @__PURE__ */ jsx5("div", { className: "lf-checkbox-group", role: "group", "aria-label": "Toggles", children: toggles.map(renderEditor) })
      ] });
    })() })
  ] });
}
function Control({
  editor,
  ctx,
  builder,
  id,
  entity
}) {
  if (editor.render) return /* @__PURE__ */ jsx5(Fragment4, { children: editor.render(ctx) });
  switch (editor.control) {
    case "logic":
      return /* @__PURE__ */ jsx5(LogicRules, { builder, id, entity });
    case "checkbox":
      return /* @__PURE__ */ jsx5(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, inline: true, children: /* @__PURE__ */ jsx5("input", { type: "checkbox", checked: Boolean(ctx.value), onChange: (e) => ctx.setValue(e.target.checked) }) });
    // Inverted boolean for `persistent`: the field is included by default; CHECKED stores
    // `persistent: false` (exclude), UNCHECKED clears it (back to the default-included).
    case "exclude":
      return /* @__PURE__ */ jsx5(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, inline: true, children: /* @__PURE__ */ jsx5("input", { type: "checkbox", checked: ctx.value === false, onChange: (e) => ctx.setValue(e.target.checked ? false : void 0) }) });
    case "number":
      return /* @__PURE__ */ jsx5(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx5(
        "input",
        {
          type: "number",
          value: numStr(ctx.value),
          placeholder: editor.placeholder,
          onChange: (e) => ctx.setValue(e.target.value === "" ? void 0 : Number(e.target.value))
        }
      ) });
    case "textarea":
      return /* @__PURE__ */ jsx5(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx5("textarea", { value: str(ctx.value), placeholder: editor.placeholder, rows: 3, onChange: (e) => ctx.setValue(e.target.value) }) });
    case "select":
      return /* @__PURE__ */ jsx5(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsxs5("select", { value: str(ctx.value), onChange: (e) => ctx.setValue(e.target.value), children: [
        /* @__PURE__ */ jsx5("option", { value: "" }),
        (editor.options ?? []).map((o) => /* @__PURE__ */ jsx5("option", { value: o.value, children: o.label }, o.value))
      ] }) });
    case "options":
      return /* @__PURE__ */ jsx5(OptionsControl, { editor, ctx });
    case "tags":
      return /* @__PURE__ */ jsx5(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx5(
        "input",
        {
          value: Array.isArray(ctx.value) ? ctx.value.join(", ") : str(ctx.value),
          placeholder: editor.placeholder,
          onChange: (e) => ctx.setValue(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
        }
      ) });
    case "dataSource":
      return /* @__PURE__ */ jsx5(DataSourceControl, { editor, ctx });
    case "asyncValidation":
      return /* @__PURE__ */ jsx5(AsyncValidationControl, { editor, ctx });
    case "expression":
      return /* @__PURE__ */ jsx5(ExpressionControl, { editor, ctx });
    case "js":
      return /* @__PURE__ */ jsx5(JsControl, { editor, ctx });
    case "text":
    default:
      return /* @__PURE__ */ jsx5(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx5("input", { value: str(ctx.value), placeholder: editor.placeholder, onChange: (e) => ctx.setValue(e.target.value) }) });
  }
}

// src/Canvas.tsx
import { createContext, useContext, useEffect as useEffect5, useId as useId3, useMemo as useMemo3, useRef as useRef5, useState as useState7 } from "react";
import { createDefaultFieldTypeRegistry as createDefaultFieldTypeRegistry5, createFormEngine } from "@lukeflow/form-core";

// src/NodePreview.tsx
import { createDefaultFieldTypeRegistry as createDefaultFieldTypeRegistry3 } from "@lukeflow/form-core";
import { FormErrorBoundary } from "@lukeflow/form-react";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var REGISTRY3 = createDefaultFieldTypeRegistry3();
var NOOP = () => {
};
function NodePreview({ entity, field, components }) {
  const a = entity.attributes;
  const ft = REGISTRY3.get(entity.type);
  const Custom = components?.[entity.type];
  if (ft?.isContainer && !Custom) return null;
  const control = Custom ? /* @__PURE__ */ jsx6(CustomPreview, { Custom, entity, field }) : previewControl(entity, field);
  if (!Custom && ft?.isStatic) return /* @__PURE__ */ jsx6("div", { className: "lf-pv-static", children: control });
  const labelPos = a.labelPosition === "left" || a.labelPosition === "right" ? a.labelPosition : "top";
  const hideLabel = Boolean(a.hideLabel);
  const label = str2(a.label) || str2(a.key) || entity.type;
  const desc = str2(a.description);
  const required = field ? field.isRequired : Boolean(a.required);
  return /* @__PURE__ */ jsxs6("div", { className: "lf-pv-field", "data-label-position": labelPos, "data-hide-label": hideLabel || void 0, children: [
    /* @__PURE__ */ jsxs6("span", { className: "lf-pv-fieldlabel", children: [
      label,
      required ? /* @__PURE__ */ jsx6("span", { className: "lf-pv-required", children: " *" }) : null,
      str2(a.tooltip) ? /* @__PURE__ */ jsxs6("span", { className: "lf-tooltip", children: [
        /* @__PURE__ */ jsx6("span", { className: "lf-tooltip-icon", "aria-hidden": "true", children: "i" }),
        /* @__PURE__ */ jsx6("span", { className: "lf-tooltip-bubble", children: str2(a.tooltip) })
      ] }) : null
    ] }),
    control,
    desc ? /* @__PURE__ */ jsx6("span", { className: "lf-pv-desc", children: desc }) : null
  ] });
}
function CustomPreview({ Custom, entity, field }) {
  const fs = field ?? fallbackFieldState(entity);
  return /* @__PURE__ */ jsx6("div", { className: "lf-pv-custom", children: /* @__PURE__ */ jsx6(FormErrorBoundary, { fallback: /* @__PURE__ */ jsx6("span", { className: "lf-pv-muted", children: entity.type }), children: /* @__PURE__ */ jsx6(Custom, { entity, field: fs, value: fs.value, setValue: NOOP, disabled: true, error: null, id: `pv-${entity.id}` }) }) });
}
function fallbackFieldState(entity) {
  const a = entity.attributes;
  return {
    entityId: entity.id,
    key: str2(a.key) || entity.type,
    value: a.defaultValue ?? "",
    isVisible: true,
    isDisabled: true,
    isRequired: Boolean(a.required),
    isDirty: false,
    isTouched: false,
    error: null,
    computed: { source: "seed", priority: 0 }
  };
}
function previewControl(entity, field) {
  const a = entity.attributes;
  const ph = str2(a.placeholder);
  const ev = field ? field.value : a.defaultValue;
  const dv = Array.isArray(ev) ? ev.join(", ") : ev != null && ev !== "" ? String(ev) : "";
  const ph2 = dv ? void 0 : ph;
  const selected = entity.type === "selectBoxes" ? new Set((Array.isArray(ev) ? ev : []).map(String)) : new Set(ev != null && ev !== "" ? [String(ev)] : []);
  switch (entity.type) {
    case "textarea":
      return /* @__PURE__ */ jsx6("textarea", { className: "lf-pv-input", disabled: true, rows: typeof a.rows === "number" ? a.rows : 2, value: dv, placeholder: ph2 });
    case "number":
    case "currency":
      return /* @__PURE__ */ jsx6("input", { className: "lf-pv-input", disabled: true, type: "number", value: dv, placeholder: ph2 || (entity.type === "currency" ? "0.00" : "") });
    case "checkbox":
      return /* @__PURE__ */ jsxs6("label", { className: "lf-pv-check", children: [
        /* @__PURE__ */ jsx6("input", { type: "checkbox", disabled: true, checked: field ? Boolean(field.value) : Boolean(a.defaultChecked) }),
        " ",
        str2(a.label) || "Checkbox"
      ] });
    case "select":
    case "searchSelect": {
      const opts = readOptions(a);
      return /* @__PURE__ */ jsxs6("select", { className: "lf-pv-input", disabled: true, children: [
        ph ? /* @__PURE__ */ jsx6("option", { children: ph }) : /* @__PURE__ */ jsx6("option", {}),
        opts.map((o, i) => /* @__PURE__ */ jsx6("option", { children: o.label }, i))
      ] });
    }
    case "radio":
    case "selectBoxes": {
      const opts = readOptions(a);
      const type = entity.type === "radio" ? "radio" : "checkbox";
      const shown = opts.length ? opts : [{ label: "Option 1", value: "1" }, { label: "Option 2", value: "2" }];
      return /* @__PURE__ */ jsx6("div", { className: "lf-pv-choices", children: shown.slice(0, 4).map((o, i) => /* @__PURE__ */ jsxs6("label", { className: "lf-pv-check", children: [
        /* @__PURE__ */ jsx6("input", { type, disabled: true, checked: selected.has(o.value) }),
        " ",
        o.label
      ] }, i)) });
    }
    // Date / time fields render the RICH picker in the live form by default; reflect that on the
    // canvas (an input + a calendar/clock hint), unless the field opts into the native input.
    case "day":
    case "datetime":
      return a.nativeInput ? /* @__PURE__ */ jsx6("input", { className: "lf-pv-input", disabled: true, type: entity.type === "datetime" ? "datetime-local" : "date", value: dv }) : /* @__PURE__ */ jsxs6("span", { className: "lf-pv-datefield", children: [
        /* @__PURE__ */ jsx6("input", { className: "lf-pv-input", disabled: true, value: dv, placeholder: entity.type === "datetime" ? "YYYY-MM-DDTHH:MM" : "YYYY-MM-DD" }),
        /* @__PURE__ */ jsx6("span", { className: "lf-pv-cal", "aria-hidden": "true", children: "\u{1F4C5}" })
      ] });
    case "time":
      return a.nativeInput ? /* @__PURE__ */ jsx6("input", { className: "lf-pv-input", disabled: true, type: "time", value: dv }) : /* @__PURE__ */ jsxs6("span", { className: "lf-pv-datefield", children: [
        /* @__PURE__ */ jsx6("input", { className: "lf-pv-input", disabled: true, value: dv, placeholder: "HH:MM" }),
        /* @__PURE__ */ jsx6("span", { className: "lf-pv-cal", "aria-hidden": "true", children: "\u{1F551}" })
      ] });
    case "file":
      return /* @__PURE__ */ jsx6("div", { className: "lf-pv-file", children: "Choose file\u2026" });
    case "signature":
      return /* @__PURE__ */ jsx6("div", { className: "lf-pv-sign", children: "\u270E Signature" });
    case "tags":
    case "tagsField":
      return /* @__PURE__ */ jsx6("input", { className: "lf-pv-input", disabled: true, value: dv, placeholder: dv ? void 0 : ph || "Add tags\u2026" });
    case "button":
      return /* @__PURE__ */ jsx6("button", { className: "lf-pv-btn", type: "button", disabled: true, children: str2(a.label) || "Button" });
    case "heading": {
      const size = typeof a.headingSize === "string" && /^h[1-6]$/.test(a.headingSize) ? a.headingSize : "h3";
      return /* @__PURE__ */ jsx6("div", { className: `lf-pv-heading lf-pv-heading--${size}`, children: str2(a.label) || str2(a.content) || "Heading" });
    }
    case "content":
    case "html":
    case "htmlElement":
      return /* @__PURE__ */ jsx6("div", { className: "lf-pv-muted", children: str2(a.content) || "Content" });
    case "divider":
    case "hr":
      return /* @__PURE__ */ jsx6("hr", { className: "lf-pv-hr" });
    default:
      return /* @__PURE__ */ jsx6("input", { className: "lf-pv-input", disabled: true, type: "text", value: dv, placeholder: ph2 });
  }
}
function str2(v) {
  return typeof v === "string" ? v : "";
}
function readOptions(a) {
  const raw = a.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => {
    if (typeof o === "string") return { label: o, value: o };
    const obj = o;
    const value = String(obj.value ?? obj.label ?? "");
    return { label: String(obj.label ?? obj.value ?? ""), value };
  });
}

// src/palette.tsx
import { useState as useState6 } from "react";
import { createDefaultFieldTypeRegistry as createDefaultFieldTypeRegistry4 } from "@lukeflow/form-core";

// src/paletteIcons.tsx
import { Fragment as Fragment5, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var S = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
function Svg({ children }) {
  return /* @__PURE__ */ jsx7("svg", { className: "lf-palette-icon", viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true", focusable: "false", children });
}
var box = /* @__PURE__ */ jsx7("rect", { x: "3", y: "6", width: "18", height: "12", rx: "2", ...S });
var ICONS = {
  textField: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("line", { x1: "4", y1: "9", x2: "20", y2: "9", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "4", y1: "14", x2: "13", y2: "14", ...S })
  ] }),
  textarea: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "6", y1: "9", x2: "18", y2: "9", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "6", y1: "12", x2: "18", y2: "12", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "6", y1: "15", x2: "13", y2: "15", ...S })
  ] }),
  email: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "6", width: "18", height: "12", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M4 8l8 6 8-6", ...S })
  ] }),
  url: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("path", { d: "M9 13a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-6-6l-1 1", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M15 11a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 6 6l1-1", ...S })
  ] }),
  phoneNumber: /* @__PURE__ */ jsx7("path", { d: "M6 3h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z", ...S }),
  password: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "5", y: "10", width: "14", height: "9", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M8 10V8a4 4 0 0 1 8 0v2", ...S })
  ] }),
  number: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("line", { x1: "9", y1: "4", x2: "7", y2: "20", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "17", y1: "4", x2: "15", y2: "20", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "4", y1: "9", x2: "20", y2: "9", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "4", y1: "15", x2: "20", y2: "15", ...S })
  ] }),
  currency: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("line", { x1: "12", y1: "3", x2: "12", y2: "21", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8", ...S })
  ] }),
  checkbox: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "4", y: "4", width: "16", height: "16", rx: "3", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M8 12l3 3 5-6", ...S })
  ] }),
  selectBoxes: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "4", y: "4", width: "7", height: "7", rx: "1.5", ...S }),
    /* @__PURE__ */ jsx7("rect", { x: "4", y: "14", width: "7", height: "6", rx: "1.5", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M6 7.5l1.5 1.5L10 6", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "14", y1: "7", x2: "20", y2: "7", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "14", y1: "17", x2: "20", y2: "17", ...S })
  ] }),
  select: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    box,
    /* @__PURE__ */ jsx7("path", { d: "M9 11l3 3 3-3", ...S })
  ] }),
  searchSelect: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    box,
    /* @__PURE__ */ jsx7("circle", { cx: "11", cy: "11", r: "2.5", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "13", y1: "13", x2: "16", y2: "16", ...S })
  ] }),
  radio: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("circle", { cx: "7", cy: "8", r: "3", ...S }),
    /* @__PURE__ */ jsx7("circle", { cx: "7", cy: "8", r: "1", fill: "currentColor", stroke: "none" }),
    /* @__PURE__ */ jsx7("line", { x1: "13", y1: "8", x2: "20", y2: "8", ...S }),
    /* @__PURE__ */ jsx7("circle", { cx: "7", cy: "16", r: "3", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "13", y1: "16", x2: "20", y2: "16", ...S })
  ] }),
  button: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "8", width: "18", height: "8", rx: "4", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "8", y1: "12", x2: "16", y2: "12", ...S })
  ] }),
  datetime: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "3", y1: "9", x2: "21", y2: "9", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "8", y1: "3", x2: "8", y2: "7", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "16", y1: "3", x2: "16", y2: "7", ...S })
  ] }),
  day: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "3", y1: "9", x2: "21", y2: "9", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "8", y1: "3", x2: "8", y2: "7", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "16", y1: "3", x2: "16", y2: "7", ...S })
  ] }),
  time: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("circle", { cx: "12", cy: "12", r: "8", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M12 8v4l3 2", ...S })
  ] }),
  tags: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("path", { d: "M4 4h7l9 9-7 7-9-9V4z", ...S }),
    /* @__PURE__ */ jsx7("circle", { cx: "8", cy: "8", r: "1.3", fill: "currentColor", stroke: "none" })
  ] }),
  file: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("path", { d: "M12 16V6m0 0l-4 4m4-4l4 4", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M5 18a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3", ...S })
  ] }),
  signature: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("path", { d: "M3 18c3 0 4-9 6-9s2 6 4 6 2-4 4-4", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "3", y1: "21", x2: "21", y2: "21", ...S })
  ] }),
  panel: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "3", y1: "9", x2: "21", y2: "9", ...S })
  ] }),
  well: /* @__PURE__ */ jsx7("rect", { x: "3", y: "6", width: "18", height: "12", rx: "3", ...S }),
  fieldset: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "6", width: "18", height: "13", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "7", y1: "6", x2: "13", y2: "6", stroke: "var(--lf-bg,#fff)", strokeWidth: "3" })
  ] }),
  columns: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "5", width: "7", height: "14", rx: "1.5", ...S }),
    /* @__PURE__ */ jsx7("rect", { x: "14", y: "5", width: "7", height: "14", rx: "1.5", ...S })
  ] }),
  tabs: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("path", { d: "M3 8h6l1-2h4l1 2h6", ...S }),
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "8", width: "18", height: "11", rx: "2", ...S })
  ] }),
  table: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "3", y1: "10", x2: "21", y2: "10", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "3", y1: "15", x2: "21", y2: "15", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "12", y1: "5", x2: "12", y2: "19", ...S })
  ] }),
  content: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("line", { x1: "4", y1: "7", x2: "20", y2: "7", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "4", y1: "12", x2: "20", y2: "12", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "4", y1: "17", x2: "14", y2: "17", ...S })
  ] }),
  heading: /* @__PURE__ */ jsx7(Fragment5, { children: /* @__PURE__ */ jsx7("path", { d: "M6 5v14M18 5v14M6 12h12", ...S }) }),
  divider: /* @__PURE__ */ jsx7("line", { x1: "3", y1: "12", x2: "21", y2: "12", ...S }),
  dataGrid: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "3", y1: "10", x2: "21", y2: "10", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "3", y1: "14.5", x2: "21", y2: "14.5", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "11", y1: "5", x2: "11", y2: "19", ...S })
  ] }),
  editGrid: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "3", y1: "11", x2: "21", y2: "11", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M14 16l2-2 2 2-2 2h-2v-2z", ...S })
  ] }),
  page: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("rect", { x: "5", y: "3", width: "14", height: "18", rx: "2", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "8", y1: "8", x2: "16", y2: "8", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "8", y1: "12", x2: "16", y2: "12", ...S }),
    /* @__PURE__ */ jsx7("line", { x1: "8", y1: "16", x2: "13", y2: "16", ...S })
  ] }),
  array: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("path", { d: "M7 4H4v16h3", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M17 4h3v16h-3", ...S }),
    /* @__PURE__ */ jsx7("circle", { cx: "9.5", cy: "12", r: "1.1", fill: "currentColor", stroke: "none" }),
    /* @__PURE__ */ jsx7("circle", { cx: "12", cy: "12", r: "1.1", fill: "currentColor", stroke: "none" }),
    /* @__PURE__ */ jsx7("circle", { cx: "14.5", cy: "12", r: "1.1", fill: "currentColor", stroke: "none" })
  ] }),
  map: /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7("path", { d: "M8.5 4C6.5 4 6.5 6 6.5 8s0 4-2 4c2 0 2 2 2 4s0 4 2 4", ...S }),
    /* @__PURE__ */ jsx7("path", { d: "M15.5 4c2 0 2 2 2 4s0 4 2 4c-2 0-2 2-2 4s0 4-2 4", ...S })
  ] })
};
var GENERIC = /* @__PURE__ */ jsxs7(Fragment5, { children: [
  box,
  /* @__PURE__ */ jsx7("line", { x1: "7", y1: "12", x2: "14", y2: "12", ...S })
] });
function paletteIcon(type) {
  return /* @__PURE__ */ jsx7(Svg, { children: ICONS[type] ?? GENERIC });
}

// src/palette.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var REGISTRY4 = createDefaultFieldTypeRegistry4();
var OPTS = { options: ["Option 1", "Option 2"] };
var PALETTE_GROUPS = [
  {
    group: "Basic",
    items: [
      { type: "textField", label: "Text" },
      { type: "textarea", label: "Text Area" },
      { type: "number", label: "Number" },
      { type: "password", label: "Password" },
      { type: "checkbox", label: "Checkbox" },
      { type: "selectBoxes", label: "Select Boxes", defaults: OPTS },
      { type: "select", label: "Select", defaults: OPTS },
      { type: "radio", label: "Radio", defaults: OPTS },
      { type: "button", label: "Button", defaults: { label: "Submit" } }
    ]
  },
  {
    group: "Advanced",
    items: [
      { type: "email", label: "Email" },
      { type: "url", label: "URL" },
      { type: "phoneNumber", label: "Phone Number", defaults: { inputMask: "(999) 999-9999" } },
      { type: "currency", label: "Currency", defaults: { currencyCode: "USD", decimalLimit: 2 } },
      { type: "datetime", label: "Date / Time" },
      { type: "time", label: "Time" },
      { type: "day", label: "Date" },
      { type: "tags", label: "Tags" },
      // File Upload intentionally removed from the palette: file attachments are handled by the host's
      // dedicated Attachments section, not as a form field. The renderer/engine keep `file` support so
      // any pre-existing schema with a file field still renders (backward-compatible), but new forms
      // can't add one here.
      { type: "signature", label: "Signature" },
      { type: "rating", label: "Rating", defaults: { max: 5 } },
      { type: "ranking", label: "Ranking", defaults: OPTS },
      { type: "matrix", label: "Matrix", defaults: { rows: [{ label: "Row 1", value: "row1" }, { label: "Row 2", value: "row2" }], columns: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] } },
      { type: "addressBlock", label: "Address" },
      { type: "richText", label: "Rich Text" },
      { type: "dataGrid", label: "Data Grid" },
      { type: "editGrid", label: "Edit Grid" }
    ]
  },
  {
    group: "Layout",
    items: [
      { type: "panel", label: "Panel" },
      { type: "columns", label: "Columns", defaults: { numColumns: 2 } },
      { type: "tabs", label: "Tabs" },
      { type: "table", label: "Table", defaults: { numColumns: 2, numRows: 2 } },
      { type: "well", label: "Well" },
      { type: "fieldset", label: "Field Set" },
      { type: "content", label: "Content", defaults: { content: "Add your content here." } },
      { type: "heading", label: "Heading" },
      { type: "divider", label: "Divider" }
    ]
  },
  {
    group: "Data",
    items: [
      // Data carriers — hold structured data for form mechanics (logic/calculate). They
      // render nothing in the live form but stay in scope and the submission payload.
      { type: "array", label: "Array" },
      { type: "map", label: "Map" }
    ]
  },
  {
    group: "Wizard",
    items: [{ type: "page", label: "Page" }]
  }
];
function Palette({ builder, extra }) {
  const dnd = useDnd();
  const [query, setQuery] = useState6("");
  const sel = builder.selectedId ? builder.schema.entities[builder.selectedId] : void 0;
  const intoContainer = sel && REGISTRY4.get(sel.type)?.isContainer ? builder.selectedId : null;
  const groups = extra && extra.length ? [...PALETTE_GROUPS, { group: "Custom", items: extra }] : PALETTE_GROUPS;
  const q = query.trim().toLowerCase();
  const matches = (it) => !q || it.label.toLowerCase().includes(q) || it.type.toLowerCase().includes(q);
  return /* @__PURE__ */ jsxs8("div", { className: "lf-palette", "aria-label": "Field palette", children: [
    /* @__PURE__ */ jsxs8("h4", { children: [
      "Add field",
      intoContainer ? ` \u2192 into ${labelOf(sel)}` : ""
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "lf-palette-search-wrap", children: [
      /* @__PURE__ */ jsxs8("svg", { className: "lf-palette-search-icon", viewBox: "0 0 24 24", width: "15", height: "15", "aria-hidden": "true", focusable: "false", children: [
        /* @__PURE__ */ jsx8("circle", { cx: "11", cy: "11", r: "7", fill: "none", stroke: "currentColor", strokeWidth: "2" }),
        /* @__PURE__ */ jsx8("line", { x1: "16.5", y1: "16.5", x2: "21", y2: "21", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" })
      ] }),
      /* @__PURE__ */ jsx8(
        "input",
        {
          type: "text",
          className: "lf-palette-search",
          placeholder: "Search fields\u2026",
          "aria-label": "Search fields",
          autoComplete: "off",
          value: query,
          onChange: (e) => setQuery(e.target.value)
        }
      ),
      query && /* @__PURE__ */ jsx8("button", { type: "button", className: "lf-palette-search-clear", "aria-label": "Clear search", onClick: () => setQuery(""), children: /* @__PURE__ */ jsx8(IconX, { size: 13 }) })
    ] }),
    groups.map(({ group, items }) => {
      const visible = items.filter(matches);
      if (visible.length === 0) return null;
      return /* @__PURE__ */ jsxs8("div", { className: "lf-palette-group", children: [
        /* @__PURE__ */ jsx8("h5", { className: "lf-palette-group-title", children: group }),
        visible.map((p) => /* @__PURE__ */ jsxs8(
          "button",
          {
            type: "button",
            className: "lf-palette-item",
            draggable: true,
            onDragStart: (e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData("text/plain", p.type);
              dnd.begin({ kind: "new", type: p.type, label: p.label, defaults: p.defaults });
            },
            onDragEnd: dnd.end,
            onClick: () => {
              const target = intoContainer ? { parentId: intoContainer } : void 0;
              if (p.type === "tabs") {
                builder.addFieldWithChildren(
                  "tabs",
                  { label: p.label },
                  [
                    { type: "panel", attributes: { label: "Tab 1" } },
                    { type: "panel", attributes: { label: "Tab 2" } }
                  ],
                  target
                );
              } else {
                builder.addField(p.type, { label: p.label, ...p.defaults ?? {} }, target);
              }
            },
            children: [
              /* @__PURE__ */ jsx8("span", { className: "lf-palette-item-icon", "aria-hidden": "true", children: paletteIcon(p.type) }),
              /* @__PURE__ */ jsx8("span", { className: "lf-palette-item-label", children: p.label })
            ]
          },
          `${p.type}:${p.label}`
        ))
      ] }, group);
    })
  ] });
}

// src/Canvas.tsx
import { Fragment as Fragment6, jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var REGISTRY5 = createDefaultFieldTypeRegistry5();
var PreviewContext = createContext({ fields: {}, components: {}, kbdHelpId: "lf-kbd-dnd-help" });
var useBuilderPreview = () => useContext(PreviewContext);
function CanvasDndProvider({ builder, children }) {
  const dnd = useCanvasDnd(builder);
  return /* @__PURE__ */ jsx9(DndContext.Provider, { value: dnd, children });
}
function Canvas({ builder, components, registry }) {
  const { schema } = builder;
  const dnd = useDnd();
  const fields = useMemo3(() => {
    try {
      return createFormEngine().init(schema, registry ? { registry } : void 0).getState().fields;
    } catch {
      return {};
    }
  }, [schema, registry]);
  const kbdHelpId = useId3();
  const preview = useMemo3(() => ({ fields, components: components ?? {}, kbdHelpId }), [fields, components, kbdHelpId]);
  return /* @__PURE__ */ jsx9(PreviewContext.Provider, { value: preview, children: /* @__PURE__ */ jsxs9(
    "div",
    {
      className: `lf-canvas${dnd.dragging ? " is-dragging" : ""}${dnd.overEmpty === ROOT ? " is-drop" : ""}`,
      "aria-label": "Form canvas",
      onDragOver: (e) => dnd.overEmptyContainer(e, ROOT),
      onDragLeave: dnd.leave,
      onDrop: (e) => dnd.dropIntoEmpty(e, ROOT, schema.root.length),
      children: [
        schema.root.length === 0 ? /* @__PURE__ */ jsx9("p", { className: "lf-canvas-empty", children: "Add a field to begin \u2014 drag one from the palette, or click it." }) : /* @__PURE__ */ jsx9("ol", { className: "lf-node-list", children: schema.root.map((id, i) => /* @__PURE__ */ jsx9(Node, { id, parentId: null, index: i, count: schema.root.length, builder, depth: 0 }, id)) }),
        /* @__PURE__ */ jsx9("span", { id: kbdHelpId, style: SR_ONLY, children: "Press Space or Enter to pick up, then the arrow keys to move (up/down to reorder, right to nest into the item above, left to move out). Press Space or Enter to drop, or Escape to cancel." }),
        /* @__PURE__ */ jsx9("div", { "aria-live": "assertive", style: SR_ONLY, children: dnd.announcement })
      ]
    }
  ) });
}
var SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };
function Node({
  id,
  parentId,
  index,
  count,
  builder,
  depth
}) {
  const dnd = useDnd();
  const { fields, components, kbdHelpId } = useBuilderPreview();
  const grabbed = dnd.grabbedId === id;
  const gripRef = useRef5(null);
  const grabbedRef = useRef5(grabbed);
  grabbedRef.current = grabbed;
  useEffect5(() => {
    if (grabbed) gripRef.current?.focus();
  }, [grabbed, parentId, index]);
  const entity = builder.schema.entities[id];
  if (!entity) return null;
  const selected = builder.selectedId === id;
  const children = entity.children ?? [];
  const isContainer = Boolean(REGISTRY5.get(entity.type)?.isContainer);
  const over = dnd.over?.id === id ? dnd.over.pos : null;
  const fs = fields[id];
  const hidden = Boolean(entity.attributes?.hidden) || (fs ? !fs.isVisible : false);
  const colLayout = entity.type === "columns" || entity.type === "table";
  const colCap = entity.type === "table" ? 12 : 6;
  const numCols = colLayout ? Math.min(colCap, Math.max(1, ((raw) => Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 2)(Number(entity.attributes?.numColumns)))) : 0;
  const numRows = entity.type === "table" ? Math.max(0, Math.round(Number(entity.attributes?.numRows)) || 0) : 0;
  const borderedCols = entity.type === "table" || entity.type === "columns" && Boolean(entity.attributes?.borders);
  const offGrid = (cid) => {
    const c = builder.schema.entities[cid];
    return Boolean(c && (c.type === "array" || c.type === "map" || c.attributes?.hidden || fields[cid]?.isVisible === false));
  };
  const onGripKeyDown = (e) => {
    const label = labelOf(entity);
    if (!grabbed) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        dnd.beginGrab(id, label);
      }
      return;
    }
    switch (e.key) {
      case " ":
      case "Enter":
        e.preventDefault();
        dnd.endGrab(label);
        break;
      case "Escape":
        e.preventDefault();
        dnd.cancelGrab(label);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (index > 0) {
          builder.reorderField(parentId, index, index - 1);
          dnd.announce(`${label} moved to position ${index} of ${count}.`);
        } else dnd.announce(`${label} is already first.`);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (index < count - 1) {
          builder.reorderField(parentId, index, index + 1);
          dnd.announce(`${label} moved to position ${index + 2} of ${count}.`);
        } else dnd.announce(`${label} is already last.`);
        break;
      case "ArrowRight": {
        e.preventDefault();
        const siblings = parentId == null ? builder.schema.root : builder.schema.entities[parentId]?.children ?? [];
        const prevId = siblings[index - 1];
        const prev = prevId ? builder.schema.entities[prevId] : void 0;
        if (prev && REGISTRY5.get(prev.type)?.isContainer) {
          builder.moveField(id, { parentId: prevId, index: prev.children?.length ?? 0 });
          dnd.announce(`${label} moved into ${labelOf(prev)}.`);
        } else dnd.announce(`No container above ${label} to move into.`);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (parentId != null) {
          const parentEntity = builder.schema.entities[parentId];
          const parentLoc = locate(builder.schema, parentId);
          builder.moveField(id, { parentId: parentLoc?.parentId ?? null, index: (parentLoc?.index ?? 0) + 1 });
          dnd.announce(`${label} moved out of ${parentEntity ? labelOf(parentEntity) : "its container"}.`);
        } else dnd.announce(`${label} is already at the top level.`);
        break;
      }
      default:
        break;
    }
  };
  return /* @__PURE__ */ jsxs9("li", { className: `lf-node${isContainer ? " is-container" : ""}`, "data-depth": depth, children: [
    over === "before" && /* @__PURE__ */ jsx9(DropIndicator, { pos: "before" }),
    /* @__PURE__ */ jsxs9(
      "div",
      {
        className: `lf-node-row${selected ? " is-selected" : ""}${over === "into" ? " is-drop-into" : ""}${hidden ? " is-hidden" : ""}${grabbed ? " is-grabbed" : ""}`,
        "data-drop": over ?? void 0,
        onDragOver: (e) => {
          e.stopPropagation();
          dnd.overNode(e, id, isContainer);
        },
        onDragLeave: dnd.leave,
        onDrop: (e) => {
          e.stopPropagation();
          dnd.dropNode(e, id, parentId, index, isContainer);
        },
        children: [
          /* @__PURE__ */ jsx9(
            "span",
            {
              ref: gripRef,
              className: "lf-node-grip",
              role: "button",
              tabIndex: 0,
              "aria-pressed": grabbed,
              "aria-label": grabbed ? `Moving ${labelOf(entity)}` : `Drag ${labelOf(entity)}`,
              "aria-describedby": kbdHelpId,
              "aria-keyshortcuts": "Space Enter ArrowUp ArrowDown ArrowLeft ArrowRight Escape",
              draggable: true,
              onKeyDown: onGripKeyDown,
              onBlur: () => {
                window.setTimeout(() => {
                  if (grabbedRef.current && !document.activeElement?.closest(".lf-node-grip")) dnd.endGrab(labelOf(entity));
                }, 0);
              },
              onDragStart: (e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
                dnd.begin({ kind: "move", id });
              },
              onDragEnd: dnd.end,
              children: "\u283F"
            }
          ),
          /* @__PURE__ */ jsxs9("div", { className: "lf-node-body", onClick: () => builder.select(id), children: [
            /* @__PURE__ */ jsxs9("button", { type: "button", className: "lf-node-select", "aria-pressed": selected, "aria-label": `Edit ${labelOf(entity)}`, onClick: () => builder.select(id), children: [
              isContainer && /* @__PURE__ */ jsx9("span", { className: "lf-node-label", children: labelOf(entity) }),
              /* @__PURE__ */ jsx9("span", { className: "lf-node-type", children: entity.type }),
              hidden && /* @__PURE__ */ jsx9("span", { className: "lf-node-badge", children: "Hidden" })
            ] }),
            !isContainer && // `inert` (React 19) removes the preview from the a11y/focus/pointer tree entirely
            // — belt-and-suspenders for custom components that may not honor `disabled`.
            /* @__PURE__ */ jsx9("div", { className: "lf-node-preview", "aria-hidden": "true", inert: true, children: /* @__PURE__ */ jsx9(NodePreview, { entity, field: fs, components }) })
          ] }),
          /* @__PURE__ */ jsxs9("span", { className: "lf-node-actions", children: [
            /* @__PURE__ */ jsx9("button", { type: "button", "aria-label": `Move ${labelOf(entity)} up`, disabled: index === 0, onClick: () => builder.reorderField(parentId, index, index - 1), children: /* @__PURE__ */ jsx9(IconArrowUp, { size: 15 }) }),
            /* @__PURE__ */ jsx9("button", { type: "button", "aria-label": `Move ${labelOf(entity)} down`, disabled: index === count - 1, onClick: () => builder.reorderField(parentId, index, index + 1), children: /* @__PURE__ */ jsx9(IconArrowDown, { size: 15 }) }),
            /* @__PURE__ */ jsx9("button", { type: "button", "aria-label": `Duplicate ${labelOf(entity)}`, onClick: () => builder.duplicateField(id), children: /* @__PURE__ */ jsx9(IconDuplicate, { size: 15 }) }),
            /* @__PURE__ */ jsx9("button", { type: "button", "aria-label": `Delete ${labelOf(entity)}`, onClick: () => builder.removeField(id), children: /* @__PURE__ */ jsx9(IconX, { size: 15 }) })
          ] })
        ]
      }
    ),
    isContainer && /* @__PURE__ */ jsxs9(
      "div",
      {
        className: `lf-node-children${dnd.overEmpty === id ? " is-drop" : ""}`,
        onDragOver: (e) => {
          e.stopPropagation();
          dnd.overEmptyContainer(e, id);
        },
        onDragLeave: dnd.leave,
        onDrop: (e) => {
          e.stopPropagation();
          dnd.dropIntoEmpty(e, id, children.length);
        },
        children: [
          entity.type === "table" && children.length > 0 && (() => {
            const cols = numCols;
            const rows = Math.max(numRows, Math.ceil(children.length / cols), 1);
            return /* @__PURE__ */ jsx9("ol", { className: "lf-node-list lf-node-table", "data-cols": cols, style: { display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, alignItems: "stretch" }, children: Array.from({ length: rows * cols }, (_, i) => {
              const cid = children[i];
              return cid ? /* @__PURE__ */ jsx9(Node, { id: cid, parentId: id, index: i, count: children.length, builder, depth: depth + 1 }, cid) : /* @__PURE__ */ jsx9("li", { className: "lf-node-cell-empty", "aria-hidden": "true" }, `empty-${i}`);
            }) });
          })(),
          entity.type !== "table" && children.length > 0 && (() => {
            const gridIds = colLayout ? children.filter((cid) => !offGrid(cid)) : children;
            const belowIds = colLayout ? children.filter(offGrid) : [];
            const gridCols = colLayout && children.length > 1 ? numCols : 0;
            const nodeOf = (cid) => /* @__PURE__ */ jsx9(Node, { id: cid, parentId: id, index: children.indexOf(cid), count: children.length, builder, depth: depth + 1 }, cid);
            return /* @__PURE__ */ jsxs9(Fragment6, { children: [
              /* @__PURE__ */ jsx9(
                "ol",
                {
                  className: `lf-node-list${borderedCols ? " lf-node-list--bordered" : ""}`,
                  "data-cols": gridCols || void 0,
                  style: gridCols ? { display: "grid", gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, alignItems: "start" } : void 0,
                  children: gridIds.map(nodeOf)
                }
              ),
              belowIds.length > 0 && /* @__PURE__ */ jsx9("ol", { className: "lf-node-list lf-node-list--offgrid", children: belowIds.map(nodeOf) })
            ] });
          })(),
          entity.type === "tabs" && /* @__PURE__ */ jsx9("button", { type: "button", className: "lf-add-tab", onClick: () => builder.addField("panel", { label: `Tab ${children.length + 1}` }, { parentId: id }), children: "+ Add tab" }),
          /* @__PURE__ */ jsx9(ContainerDropzone, { containerId: id, label: labelOf(entity), compact: children.length > 0, index: children.length })
        ]
      }
    ),
    over === "after" && /* @__PURE__ */ jsx9(DropIndicator, { pos: "after" })
  ] });
}
function DropIndicator({ pos }) {
  return /* @__PURE__ */ jsx9("div", { className: `lf-drop-indicator is-${pos}`, "aria-hidden": "true", children: /* @__PURE__ */ jsx9("span", { className: "lf-drop-dot" }) });
}
function ContainerDropzone({ containerId, label, compact, index }) {
  const dnd = useDnd();
  const active = dnd.overEmpty === containerId;
  return /* @__PURE__ */ jsx9(
    "div",
    {
      className: `lf-dropzone${compact ? " lf-dropzone--compact" : ""}${active ? " is-over" : ""}`,
      "aria-label": `Drop into ${label}`,
      onDragOver: (e) => {
        e.stopPropagation();
        dnd.overEmptyContainer(e, containerId);
      },
      onDragLeave: dnd.leave,
      onDrop: (e) => {
        e.stopPropagation();
        dnd.dropIntoEmpty(e, containerId, index);
      },
      children: compact ? `+ Add field into ${label}` : "Drop fields here"
    }
  );
}
var ROOT = "\0root";
var DndContext = createContext(null);
function useDnd() {
  const ctx = useContext(DndContext);
  if (!ctx) throw new Error("Canvas DnD context missing");
  return ctx;
}
function useCanvasDnd(builder) {
  const source = useRef5(null);
  const [over, setOver] = useState7(null);
  const [overEmpty, setOverEmpty] = useState7(null);
  const [dragging, setDragging] = useState7(false);
  const [grabbedId, setGrabbedId] = useState7(null);
  const [announcement, setAnnouncement] = useState7("");
  const grabOrigin = useRef5(null);
  const announce = (msg) => setAnnouncement(msg);
  const beginGrab = (id, label) => {
    grabOrigin.current = builder.schema;
    setGrabbedId(id);
    announce(`Grabbed ${label}. Use the arrow keys to move it, Space or Enter to drop, Escape to cancel.`);
  };
  const endGrab = (label) => {
    grabOrigin.current = null;
    setGrabbedId(null);
    announce(`Dropped ${label}.`);
  };
  const cancelGrab = (label) => {
    if (grabOrigin.current) builder.setSchema(grabOrigin.current);
    grabOrigin.current = null;
    setGrabbedId(null);
    announce(`Move of ${label} cancelled.`);
  };
  const begin = (src) => {
    setGrabbedId(null);
    source.current = src;
    setDragging(true);
  };
  const end = () => {
    source.current = null;
    setOver(null);
    setOverEmpty(null);
    setDragging(false);
  };
  const leave = () => {
  };
  const canDrop = (targetId) => {
    const s = source.current;
    if (!s) return false;
    if (s.kind === "move" && s.id === targetId) return false;
    return true;
  };
  const cannotDropInto = (containerId) => {
    const s = source.current;
    if (!s || s.kind !== "move" || containerId === ROOT) return false;
    return s.id === containerId || isDescendant(builder.schema, s.id, containerId);
  };
  const posFor = (e, isContainer) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (isContainer) {
      const third = rect.height / 3;
      if (y < third) return "before";
      if (y > rect.height - third) return "after";
      return "into";
    }
    return y < rect.height / 2 ? "before" : "after";
  };
  const overNode = (e, id, isContainer) => {
    if (!canDrop(id)) return;
    e.preventDefault();
    setOverEmpty(null);
    setOver({ id, pos: posFor(e, isContainer) });
  };
  const dropNode = (e, id, parentId, index, isContainer) => {
    e.preventDefault();
    const s = source.current;
    if (!s || s.kind === "move" && s.id === id) return end();
    const pos = posFor(e, isContainer);
    if (pos === "into") {
      place(s, id, 0);
    } else {
      let target = pos === "before" ? index : index + 1;
      if (s.kind === "move") {
        const from = locate(builder.schema, s.id);
        if ((from?.parentId ?? null) === (parentId ?? null) && from !== null && from.index < target) target -= 1;
      }
      place(s, parentId, target);
    }
    end();
  };
  const overEmptyContainer = (e, containerId) => {
    if (!source.current || cannotDropInto(containerId)) return;
    e.preventDefault();
    setOver(null);
    setOverEmpty(containerId);
  };
  const dropIntoEmpty = (e, containerId, index = 0) => {
    e.preventDefault();
    const s = source.current;
    if (!s || cannotDropInto(containerId)) return end();
    place(s, containerId === ROOT ? null : containerId, index);
    end();
  };
  const place = (s, parentId, index) => {
    if (s.kind === "new") builder.addField(s.type, { label: s.label, ...s.defaults ?? {} }, { parentId, index });
    else builder.moveField(s.id, { parentId, index });
  };
  return { over, overEmpty, dragging, begin, end, leave, overNode, dropNode, overEmptyContainer, dropIntoEmpty, grabbedId, announcement, beginGrab, endGrab, cancelGrab, announce };
}
function isDescendant(schema, ancestorId, maybeId) {
  const stack = [...schema.entities[ancestorId]?.children ?? []];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    if (id === maybeId) return true;
    for (const c of schema.entities[id]?.children ?? []) stack.push(c);
  }
  return false;
}
function locate(schema, id) {
  const rootIdx = (schema.root ?? []).indexOf(id);
  if (rootIdx >= 0) return { parentId: null, index: rootIdx };
  for (const [eid, e] of Object.entries(schema.entities ?? {})) {
    const i = e.children?.indexOf(id) ?? -1;
    if (i >= 0) return { parentId: eid, index: i };
  }
  return null;
}
function labelOf(e) {
  const l = e.attributes?.label;
  if (typeof l === "string" && l) return l;
  const k = e.attributes?.key;
  return typeof k === "string" && k ? k : e.id;
}

// src/builder/PreviewModal.tsx
import { useMemo as useMemo4, useState as useState8, useEffect as useEffect7, useRef as useRef6 } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { FormRenderer } from "@lukeflow/form-react";

// src/builder/useDialogFocus.ts
import { useEffect as useEffect6 } from "react";
function useDialogFocus(open, dialogRef) {
  useEffect6(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    const focusable = () => Array.from(
      dialog.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )
    );
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const f = focusable();
      if (f.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || a === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && a === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialog.contains(a)) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("keydown", onKey);
      const others = Array.from(document.querySelectorAll('.lf-modal-overlay [role="dialog"]')).filter((d) => d !== dialog && document.contains(d));
      const restoreTo = others[others.length - 1] ?? trigger;
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus();
    };
  }, [open, dialogRef]);
}

// src/builder/PreviewModal.tsx
import { Fragment as Fragment7, jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
function PreviewModal({
  schema,
  onClose,
  notify,
  components,
  registry
}) {
  const [view, setView] = useState8("form");
  const [copied, setCopied] = useState8(false);
  const [submitResult, setSubmitResult] = useState8(null);
  const dialogRef = useRef6(null);
  const copyTimer = useRef6(null);
  const json = useMemo4(() => JSON.stringify(schema, null, 2), [schema]);
  useDialogFocus(true, dialogRef);
  useEffect7(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [onClose]);
  const copyJson = () => {
    const p = navigator.clipboard?.writeText(json);
    if (!p) return;
    p.then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
    });
  };
  const openInNewTab = () => {
    if (!openPreviewWindow(schema, { components, registry })) notify("Pop-up blocked \u2014 allow pop-ups to open the preview in a new tab.");
  };
  return createPortal(
    /* @__PURE__ */ jsx10("div", { className: "lf-modal-overlay lf-builder", onMouseDown: (e) => e.target === e.currentTarget && onClose(), children: /* @__PURE__ */ jsxs10("div", { ref: dialogRef, className: "lf-modal lf-preview-modal", role: "dialog", "aria-modal": "true", "aria-label": "Form preview", tabIndex: -1, children: [
      /* @__PURE__ */ jsxs10("div", { className: "lf-modal-header", children: [
        /* @__PURE__ */ jsx10("span", { className: "lf-modal-title", children: "Preview" }),
        /* @__PURE__ */ jsxs10("div", { className: "lf-modal-actions", children: [
          /* @__PURE__ */ jsxs10("div", { className: "lf-seg", role: "tablist", "aria-label": "Preview mode", children: [
            /* @__PURE__ */ jsx10("button", { type: "button", role: "tab", "aria-selected": view === "form", className: `lf-seg-btn${view === "form" ? " is-active" : ""}`, onClick: () => setView("form"), children: "Form" }),
            /* @__PURE__ */ jsx10("button", { type: "button", role: "tab", "aria-selected": view === "json", className: `lf-seg-btn${view === "json" ? " is-active" : ""}`, onClick: () => setView("json"), children: "JSON" })
          ] }),
          view === "json" && /* @__PURE__ */ jsx10("button", { type: "button", className: "lf-modal-ghost", onClick: copyJson, children: copied ? "Copied \u2713" : "Copy" }),
          /* @__PURE__ */ jsxs10("button", { type: "button", className: "lf-modal-ghost", onClick: openInNewTab, children: [
            /* @__PURE__ */ jsx10(IconExternal, {}),
            "Open in new tab"
          ] }),
          /* @__PURE__ */ jsx10("button", { type: "button", className: "lf-iconbtn lf-iconbtn--close", "aria-label": "Close preview", title: "Close", onClick: onClose, children: "\u2715" })
        ] })
      ] }),
      /* @__PURE__ */ jsx10("div", { className: "lf-modal-body", children: view === "form" ? /* @__PURE__ */ jsxs10(Fragment7, { children: [
        /* @__PURE__ */ jsx10("div", { className: "lf-builder-preview", "data-testid": "preview", children: /* @__PURE__ */ jsx10(
          FormRenderer,
          {
            schema,
            components,
            registry,
            onResult: (r) => setSubmitResult({ ok: r.ok, errorKeys: r.errorKeys }),
            onSubmit: (data2) => setSubmitResult({ ok: true, data: data2 })
          }
        ) }),
        submitResult && (submitResult.ok ? /* @__PURE__ */ jsxs10("div", { className: "lf-preview-result is-ok", role: "status", "data-testid": "preview-result", children: [
          /* @__PURE__ */ jsx10("strong", { children: "\u2713 Valid \u2014 submission payload" }),
          /* @__PURE__ */ jsx10("pre", { className: "lf-json", children: JSON.stringify(submitResult.data ?? {}, null, 2) })
        ] }) : /* @__PURE__ */ jsxs10("div", { className: "lf-preview-result is-error", role: "status", "data-testid": "preview-result", children: [
          /* @__PURE__ */ jsxs10("strong", { children: [
            "\u2715 ",
            submitResult.errorKeys?.length ?? 0,
            " field(s) need attention"
          ] }),
          submitResult.errorKeys && submitResult.errorKeys.length > 0 && /* @__PURE__ */ jsxs10("span", { className: "lf-preview-result-keys", children: [
            " \u2014 ",
            submitResult.errorKeys.join(", ")
          ] })
        ] }))
      ] }) : /* @__PURE__ */ jsx10("pre", { className: "lf-json", "data-testid": "preview-json", children: json }) })
    ] }) }),
    document.body
  );
}
function openPreviewWindow(schema, opts) {
  if (typeof window === "undefined") return false;
  const w = window.open("", "_blank");
  if (!w) return false;
  const doc = w.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Form preview</title></head><body></body></html>');
  doc.close();
  for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
    doc.head.appendChild(node.cloneNode(true));
  }
  Object.assign(doc.body.style, { margin: "0", padding: "40px 16px", background: "#f3f4f6", minHeight: "100vh", boxSizing: "border-box" });
  const mount = doc.createElement("div");
  mount.className = "lf-preview-page";
  Object.assign(mount.style, {
    maxWidth: "640px",
    margin: "0 auto",
    padding: "28px",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    boxShadow: "0 10px 30px rgba(16, 24, 40, 0.08)",
    boxSizing: "border-box"
  });
  doc.body.appendChild(mount);
  const root = createRoot(mount);
  root.render(/* @__PURE__ */ jsx10(FormRenderer, { schema, components: opts?.components, registry: opts?.registry }));
  const teardown = () => {
    try {
      root.unmount();
    } catch {
    }
  };
  const onOpenerUnload = () => teardown();
  w.addEventListener("beforeunload", () => {
    teardown();
    window.removeEventListener("beforeunload", onOpenerUnload);
  });
  window.addEventListener("beforeunload", onOpenerUnload);
  return true;
}

// src/builder/SettingsModal.tsx
import { useState as useState9, useEffect as useEffect8, useRef as useRef7 } from "react";
import { createPortal as createPortal2 } from "react-dom";
import { Fragment as Fragment8, jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function SettingsModal({ builder, editors, notify }) {
  const id = builder.selectedId;
  const entity = id ? builder.schema.entities[id] : void 0;
  const open = Boolean(id && entity);
  const dialogRef = useRef7(null);
  const select = builder.select;
  const snapshot = useRef7(null);
  const schema = builder.schema;
  const [confirmDiscard, setConfirmDiscard] = useState9(false);
  const openedKey = useRef7(null);
  const key = open ? id : null;
  if (key !== openedKey.current) {
    openedKey.current = key;
    if (open) snapshot.current = schema;
    if (confirmDiscard) setConfirmDiscard(false);
  }
  const dirty = open && snapshot.current != null && snapshot.current !== schema;
  const close = () => select(null);
  const saveClose = (explicit = false) => {
    if (explicit && dirty) notify("Your settings have been successfully updated.");
    select(null);
  };
  const doDiscard = () => {
    if (snapshot.current) builder.setSchema(snapshot.current);
    setConfirmDiscard(false);
    select(null);
  };
  const latest = useRef7({ saveClose, confirmDiscard });
  latest.current = { saveClose, confirmDiscard };
  useEffect8(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (latest.current.confirmDiscard) setConfirmDiscard(false);
      else latest.current.saveClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  useDialogFocus(open, dialogRef);
  useEffect8(() => {
    if (open) dialogRef.current?.focus();
  }, [open, id]);
  if (!open) return null;
  return createPortal2(
    /* @__PURE__ */ jsx11(
      "div",
      {
        className: "lf-modal-overlay lf-builder",
        onMouseDown: (e) => {
          if (e.target !== e.currentTarget) return;
          if (confirmDiscard) return;
          saveClose();
        },
        children: /* @__PURE__ */ jsxs11("div", { ref: dialogRef, className: "lf-modal", role: "dialog", "aria-modal": "true", "aria-label": "Field settings", tabIndex: -1, children: [
          /* @__PURE__ */ jsxs11("div", { className: "lf-modal-header", children: [
            /* @__PURE__ */ jsxs11("span", { className: "lf-modal-title", children: [
              "Field settings",
              dirty ? /* @__PURE__ */ jsx11("span", { className: "lf-modal-dirty", children: " \u2022 Unsaved changes" }) : null
            ] }),
            /* @__PURE__ */ jsx11("div", { className: "lf-modal-actions", children: dirty ? /* @__PURE__ */ jsxs11(Fragment8, { children: [
              /* @__PURE__ */ jsx11("button", { type: "button", className: "lf-iconbtn lf-iconbtn--discard", "aria-label": "Discard & close", title: "Discard & close", onClick: () => setConfirmDiscard(true), children: /* @__PURE__ */ jsx11(IconX, {}) }),
              /* @__PURE__ */ jsx11("button", { type: "button", className: "lf-iconbtn lf-iconbtn--save", "aria-label": "Save & close", title: "Save & close", onClick: () => saveClose(true), children: /* @__PURE__ */ jsx11(IconCheck, {}) })
            ] }) : /* @__PURE__ */ jsx11("button", { type: "button", className: "lf-iconbtn lf-iconbtn--close", "aria-label": "Close", title: "Close", onClick: close, children: /* @__PURE__ */ jsx11(IconX, {}) }) })
          ] }),
          /* @__PURE__ */ jsx11("div", { className: "lf-modal-body", children: /* @__PURE__ */ jsx11(SettingsPanel, { builder, editors }) }),
          confirmDiscard && /* @__PURE__ */ jsx11("div", { className: "lf-confirm-overlay", onMouseDown: (e) => e.target === e.currentTarget && setConfirmDiscard(false), children: /* @__PURE__ */ jsxs11("div", { className: "lf-confirm", role: "alertdialog", "aria-modal": "true", "aria-label": "Discard changes?", children: [
            /* @__PURE__ */ jsx11("p", { className: "lf-confirm-msg", children: "Are you sure? All your changes for this field will be lost." }),
            /* @__PURE__ */ jsxs11("div", { className: "lf-confirm-actions", children: [
              /* @__PURE__ */ jsx11("button", { type: "button", className: "lf-confirm-no", onClick: () => setConfirmDiscard(false), children: "No" }),
              /* @__PURE__ */ jsx11("button", { type: "button", className: "lf-confirm-yes", onClick: doDiscard, children: "Yes, discard" })
            ] })
          ] }) })
        ] })
      }
    ),
    document.body
  );
}

// src/builder/Problems.tsx
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
function ProblemsBadge({ builder }) {
  const n = builder.problems.length;
  return /* @__PURE__ */ jsx12("span", { "aria-live": "polite", className: n === 0 ? "lf-problems-badge is-ok" : `lf-problems-badge${builder.hasErrors ? " is-error" : " is-warning"}`, children: n === 0 ? "No problems" : `${n} problem${n === 1 ? "" : "s"}` });
}
function Problems({ builder }) {
  if (builder.problems.length === 0) return null;
  return /* @__PURE__ */ jsx12("div", { className: "lf-problems", role: "region", "aria-label": "Problems", children: /* @__PURE__ */ jsx12("ul", { children: builder.problems.map((d, i) => /* @__PURE__ */ jsx12("li", { className: `lf-problem is-${d.severity}`, children: /* @__PURE__ */ jsxs12("button", { type: "button", disabled: !d.entityId, onClick: () => d.entityId && builder.select(d.entityId), children: [
    /* @__PURE__ */ jsx12("span", { className: "lf-problem-code", children: d.code }),
    " ",
    d.message
  ] }) }, i)) }) });
}

// src/FormBuilder.tsx
import { jsx as jsx13, jsxs as jsxs13 } from "react/jsx-runtime";
var FormBuilder = forwardRef(function FormBuilder2({ initialSchema, onChange, extraFields, components, registry, attributeEditors, settings = "panel", aside, hidePreview, className }, ref) {
  const b = useFormBuilder(initialSchema);
  useImperativeHandle(ref, () => ({ setSchema: b.setSchema, getSchema: () => b.schema }), [b.setSchema, b.schema]);
  const [showPreview, setShowPreview] = useState10(false);
  const [toast, setToast] = useState10(null);
  const editors = useMemo5(() => mergeAttributeEditors(createDefaultAttributeEditors(), attributeEditors), [attributeEditors]);
  const modal = settings === "modal";
  useEffect9(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect9(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        b.redo();
      } else if (key === "z") {
        e.preventDefault();
        b.undo();
      } else if (key === "y") {
        e.preventDefault();
        b.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [b.undo, b.redo]);
  const onChangeRef = useRef8(onChange);
  onChangeRef.current = onChange;
  const mounted = useRef8(false);
  useEffect9(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onChangeRef.current?.(b.schema);
  }, [b.schema]);
  return /* @__PURE__ */ jsxs13("div", { className: `lf-builder ${className ?? ""}`, children: [
    /* @__PURE__ */ jsxs13("div", { className: "lf-builder-toolbar", children: [
      /* @__PURE__ */ jsxs13("button", { type: "button", onClick: b.undo, disabled: !b.canUndo, "aria-label": "Undo", title: "Undo (\u2318/Ctrl+Z)", children: [
        /* @__PURE__ */ jsx13(IconUndo, {}),
        "Undo"
      ] }),
      /* @__PURE__ */ jsxs13("button", { type: "button", onClick: b.redo, disabled: !b.canRedo, "aria-label": "Redo", title: "Redo (\u2318/Ctrl+Shift+Z)", children: [
        /* @__PURE__ */ jsx13(IconRedo, {}),
        "Redo"
      ] }),
      !hidePreview && /* @__PURE__ */ jsxs13("button", { type: "button", onClick: () => setShowPreview(true), title: "Preview the form", children: [
        /* @__PURE__ */ jsx13(IconEye, {}),
        "Preview"
      ] }),
      /* @__PURE__ */ jsx13(ProblemsBadge, { builder: b })
    ] }),
    /* @__PURE__ */ jsxs13(CanvasDndProvider, { builder: b, children: [
      /* @__PURE__ */ jsxs13("div", { className: `lf-builder-body${modal ? " lf-builder-body--modal" : ""}${modal && aside ? " lf-builder-body--aside" : ""}`, children: [
        /* @__PURE__ */ jsx13(Palette, { builder: b, extra: extraFields }),
        /* @__PURE__ */ jsx13(Canvas, { builder: b, components, registry }),
        modal ? aside && /* @__PURE__ */ jsx13("aside", { className: "lf-builder-aside", children: aside }) : /* @__PURE__ */ jsx13(SettingsPanel, { builder: b, editors })
      ] }),
      modal && /* @__PURE__ */ jsx13(SettingsModal, { builder: b, editors, notify: setToast })
    ] }),
    showPreview && /* @__PURE__ */ jsx13(PreviewModal, { schema: b.schema, components, registry, onClose: () => setShowPreview(false), notify: setToast }),
    /* @__PURE__ */ jsx13(Problems, { builder: b }),
    toast && createPortal3(
      /* @__PURE__ */ jsxs13("div", { className: "lf-toast lf-builder", role: "status", children: [
        /* @__PURE__ */ jsx13("span", { className: "lf-toast-tick", "aria-hidden": "true", children: /* @__PURE__ */ jsx13(IconCheck, {}) }),
        " ",
        toast
      ] }),
      document.body
    )
  ] });
});

// src/index.ts
var VERSION = "0.1.0-alpha.0";
export {
  ATTRIBUTE_TABS,
  FormBuilder,
  NodePreview,
  SettingsPanel,
  VERSION,
  createDefaultAttributeEditors,
  defaultAttributeEditors,
  editorsByTab,
  editorsForEntity,
  isContainerType,
  isDataField,
  isStaticType,
  mergeAttributeEditors,
  useFormBuilder
};
//# sourceMappingURL=index.js.map