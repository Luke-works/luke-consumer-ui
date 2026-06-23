"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ATTRIBUTE_TABS: () => ATTRIBUTE_TABS,
  FormBuilder: () => FormBuilder,
  NodePreview: () => NodePreview,
  SettingsPanel: () => SettingsPanel,
  VERSION: () => VERSION,
  createDefaultAttributeEditors: () => createDefaultAttributeEditors,
  defaultAttributeEditors: () => defaultAttributeEditors,
  editorsByTab: () => editorsByTab,
  editorsForEntity: () => editorsForEntity,
  isContainerType: () => isContainerType,
  isDataField: () => isDataField,
  isStaticType: () => isStaticType,
  mergeAttributeEditors: () => mergeAttributeEditors,
  useFormBuilder: () => useFormBuilder
});
module.exports = __toCommonJS(index_exports);

// src/useFormBuilder.ts
var import_react = require("react");
var import_form_core = require("@lukeflow/form-core");
var EMPTY = { root: [], entities: {} };
function useFormBuilder(initialSchema = EMPTY) {
  const [schema, setSchemaState] = (0, import_react.useState)(initialSchema);
  const [selectedId, setSelectedId] = (0, import_react.useState)(null);
  const past = (0, import_react.useRef)([]);
  const future = (0, import_react.useRef)([]);
  const [, forceRender] = (0, import_react.useState)(0);
  const commit = (0, import_react.useCallback)((next) => {
    setSchemaState((prev) => {
      if (next === prev) return prev;
      past.current.push(prev);
      future.current = [];
      return next;
    });
  }, []);
  const select = (0, import_react.useCallback)((id) => setSelectedId(id), []);
  const addField = (0, import_react.useCallback)(
    (type, attributes = {}, target) => {
      const entity = (0, import_form_core.createEntity)(type, attributes);
      setSchemaState((prev) => {
        past.current.push(prev);
        future.current = [];
        return (0, import_form_core.insert)(prev, entity, target ?? {});
      });
      setSelectedId(entity.id);
    },
    []
  );
  const removeField = (0, import_react.useCallback)(
    (id) => {
      commit((0, import_form_core.remove)(schema, id));
      setSelectedId((cur) => cur === id ? null : cur);
    },
    [commit, schema]
  );
  const moveField = (0, import_react.useCallback)((id, target) => commit((0, import_form_core.move)(schema, id, target)), [commit, schema]);
  const duplicateField = (0, import_react.useCallback)((id) => commit((0, import_form_core.duplicate)(schema, id)), [commit, schema]);
  const reorderField = (0, import_react.useCallback)(
    (parentId, fromIndex, toIndex) => commit((0, import_form_core.reorder)(schema, parentId, fromIndex, toIndex)),
    [commit, schema]
  );
  const updateAttributes = (0, import_react.useCallback)(
    (id, patch) => commit((0, import_form_core.updateAttributes)(schema, id, patch)),
    [commit, schema]
  );
  const setSettings = (0, import_react.useCallback)((patch) => commit((0, import_form_core.setSettings)(schema, patch)), [commit, schema]);
  const setSchema = (0, import_react.useCallback)((next) => commit(next), [commit]);
  const undo = (0, import_react.useCallback)(() => {
    setSchemaState((prev) => {
      const last = past.current.pop();
      if (last === void 0) return prev;
      future.current.push(prev);
      forceRender((n) => n + 1);
      return last;
    });
  }, []);
  const redo = (0, import_react.useCallback)(() => {
    setSchemaState((prev) => {
      const next = future.current.pop();
      if (next === void 0) return prev;
      past.current.push(prev);
      forceRender((n) => n + 1);
      return next;
    });
  }, []);
  const problems = (0, import_react.useMemo)(() => (0, import_form_core.validateSchema)(schema), [schema]);
  const hasErrors = (0, import_react.useMemo)(() => problems.some((d) => d.severity === "error"), [problems]);
  return {
    schema,
    selectedId,
    problems,
    hasErrors,
    select,
    addField,
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
var import_react4 = require("react");
var import_react_dom = require("react-dom");
var import_form_react = require("@lukeflow/form-react");

// src/SettingsPanel.tsx
var import_react2 = require("react");
var import_form_core3 = require("@lukeflow/form-core");

// src/attributeEditors.ts
var import_form_core2 = require("@lukeflow/form-core");
var REGISTRY = (0, import_form_core2.createDefaultFieldTypeRegistry)();
var ATTRIBUTE_TABS = [
  { id: "display", label: "Display" },
  { id: "data", label: "Data" },
  { id: "validation", label: "Validation" },
  { id: "api", label: "API" },
  { id: "conditional", label: "Conditional" },
  { id: "logic", label: "Logic" }
];
var TEXTUAL = ["textField", "textarea", "email", "url", "phoneNumber", "password"];
var OPTIONED = ["select", "searchSelect", "radio", "selectBoxes"];
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
    // ── DATA ─────────────────────────────────────────────────────────────────
    { id: "options", tab: "data", attribute: "options", label: "Options", control: "options", order: 1, when: optioned, hint: 'One per line \u2014 "Label|value" or just "Label".' },
    {
      id: "dataSource",
      tab: "data",
      attribute: "dataSource",
      label: "Minion data source",
      control: "dataSource",
      order: 2,
      when: optioned,
      hint: "Load options from a secure Minion (auth/authz stay server-side). Map params to other fields."
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
    { id: "numColumns", tab: "data", attribute: "numColumns", label: "Columns", control: "number", order: 55, when: oneOf("table") },
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
    { id: "accept", tab: "data", attribute: "accept", label: "Accepted file types", control: "text", order: 34, when: oneOf("file"), placeholder: "image/*,.pdf" },
    { id: "maxFiles", tab: "data", attribute: "maxFiles", label: "Max files", control: "number", order: 35, when: oneOf("file") },
    { id: "maxSize", tab: "data", attribute: "maxSize", label: "Max size (MB)", control: "number", order: 36, when: oneOf("file") },
    { id: "minRows", tab: "data", attribute: "minRows", label: "Min rows", control: "number", order: 40, when: grid },
    { id: "maxRows", tab: "data", attribute: "maxRows", label: "Max rows", control: "number", order: 41, when: grid },
    { id: "persistent", tab: "data", attribute: "persistent", label: "Exclude from submission", control: "exclude", order: 80, when: data, hint: "Fields are saved by default. Check this to keep this field's value OUT of the saved payload." },
    { id: "clearOnHide", tab: "data", attribute: "clearOnHide", label: "Clear value when hidden", control: "checkbox", order: 81, when: data },
    // ── VALIDATION ─────────────────────────────────────────────────────────────
    { id: "required", tab: "validation", attribute: "required", label: "Required", control: "checkbox", order: 1, when: (e) => data(e) || grid(e) },
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

// src/SettingsPanel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var REGISTRY2 = (0, import_form_core3.createDefaultFieldTypeRegistry)();
function SettingsPanel({ builder, editors }) {
  const id = builder.selectedId;
  const entity = id ? builder.schema.entities[id] : void 0;
  const [activeTab, setActiveTab] = (0, import_react2.useState)("display");
  const entityType = entity?.type;
  (0, import_react2.useEffect)(() => {
    setActiveTab("display");
  }, [id, entityType]);
  if (!id || !entity) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lf-settings", "aria-label": "Field settings", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "lf-empty", children: "Select a field to edit its settings." }) });
  }
  const applicable = editorsForEntity(editors, entity, builder.schema);
  const groups = editorsByTab(applicable);
  const active = groups.find((g) => g.tab === activeTab) ?? groups[0];
  const fieldKeys = otherFieldKeys(builder.schema, id);
  const patch = (p) => builder.updateAttributes(id, p);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lf-settings", "aria-label": "Field settings", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h4", { children: [
      "Settings \u2014 ",
      entity.type
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lf-settings-tabs", role: "tablist", "aria-label": "Field settings tabs", children: groups.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": active?.tab === g.tab,
        className: `lf-settings-tab${active?.tab === g.tab ? " is-active" : ""}`,
        onClick: () => setActiveTab(g.tab),
        children: g.label
      },
      g.tab
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lf-settings-panel", role: "tabpanel", "aria-label": `${active?.label ?? ""} settings`, children: (() => {
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
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Control, { editor: ed, ctx, builder, id, entity }, ed.id);
      };
      const toggles = editorsHere.filter(isToggle);
      const rest = editorsHere.filter((ed) => !isToggle(ed));
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        rest.map(renderEditor),
        toggles.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lf-checkbox-group", role: "group", "aria-label": "Toggles", children: toggles.map(renderEditor) })
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
  if (editor.render) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: editor.render(ctx) });
  switch (editor.control) {
    case "logic":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogicRules, { builder, id, entity });
    case "checkbox":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, inline: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: Boolean(ctx.value), onChange: (e) => ctx.setValue(e.target.checked) }) });
    // Inverted boolean for `persistent`: the field is included by default; CHECKED stores
    // `persistent: false` (exclude), UNCHECKED clears it (back to the default-included).
    case "exclude":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, inline: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: ctx.value === false, onChange: (e) => ctx.setValue(e.target.checked ? false : void 0) }) });
    case "number":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "number",
          value: numStr(ctx.value),
          placeholder: editor.placeholder,
          onChange: (e) => ctx.setValue(e.target.value === "" ? void 0 : Number(e.target.value))
        }
      ) });
    case "textarea":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { value: str(ctx.value), placeholder: editor.placeholder, rows: 3, onChange: (e) => ctx.setValue(e.target.value) }) });
    case "select":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: str(ctx.value), onChange: (e) => ctx.setValue(e.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "" }),
        (editor.options ?? []).map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: o.value, children: o.label }, o.value))
      ] }) });
    case "options":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "textarea",
        {
          value: optionsToText(ctx.value),
          rows: 4,
          onChange: (e) => ctx.setValue(textToOptions(e.target.value))
        }
      ) });
    case "tags":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          value: Array.isArray(ctx.value) ? ctx.value.join(", ") : str(ctx.value),
          placeholder: editor.placeholder,
          onChange: (e) => ctx.setValue(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
        }
      ) });
    case "dataSource":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DataSourceControl, { editor, ctx });
    case "asyncValidation":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AsyncValidationControl, { editor, ctx });
    case "expression":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExpressionControl, { editor, ctx });
    case "js":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(JsControl, { editor, ctx });
    case "text":
    default:
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: str(ctx.value), placeholder: editor.placeholder, onChange: (e) => ctx.setValue(e.target.value) }) });
  }
}
function JsControl({ editor, ctx }) {
  const value = str(ctx.value);
  const ref = (0, import_react2.useRef)(null);
  const [open, setOpen] = (0, import_react2.useState)(value !== "");
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "lf-js", open, onToggle: (e) => setOpen(e.target.open), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { className: "lf-js-summary", children: editor.label ?? editor.id }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lf-js-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lf-js-insert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lf-js-insert-label", children: "Insert:" }),
        tokens.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "lf-js-token", title: `Insert ${t.trim()}`, onClick: () => insert2(t), children: t.trim() }, t))
      ] }),
      editor.hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lf-setting-hint", children: editor.hint })
    ] })
  ] });
}
function ExpressionControl({ editor, ctx }) {
  const value = str(ctx.value);
  const parsed = (0, import_form_core3.parseExpression)(value);
  const error = parsed.ok ? null : parsed.error;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    Labeled,
    {
      label: editor.label ?? editor.id,
      hint: editor.hint,
      footer: error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lf-expr-error", role: "alert", children: error }) : void 0,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: "lf-settings-minion", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: editor.label ?? "Minion data source" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "lf-setting lf-setting-inline", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "checkbox",
          "aria-label": "Load options from a Minion",
          checked: enabled,
          onChange: (e) => ctx.setValue(e.target.checked ? { minion: ds?.minion ?? "" } : void 0)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lf-setting-label", children: "Load options from a Minion" })
    ] }),
    editor.hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lf-setting-hint", children: editor.hint }),
    enabled && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: "Minion operation", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: str(ds?.minion), placeholder: "listCities", onChange: (e) => set({ minion: e.target.value }) }) }),
      isSearch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: "Search param", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: str(ds?.searchParam), placeholder: "q", onChange: (e) => set({ searchParam: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: "Result path", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: str(ds?.resultPath), placeholder: "data", onChange: (e) => set({ resultPath: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: "Label path", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: str(ds?.labelPath), placeholder: "name", onChange: (e) => set({ labelPath: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: "Value path", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: str(ds?.valuePath), placeholder: "id", onChange: (e) => set({ valuePath: e.target.value }) }) }),
      !isSearch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: "Refetch", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: str(ds?.trigger) || "load", onChange: (e) => set({ trigger: e.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "load", children: "Once on load" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "change", children: "When params change" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: "lf-settings-minion", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: editor.label ?? "Async validation" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "lf-setting lf-setting-inline", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "checkbox",
          "aria-label": "Validate via a Minion",
          checked: enabled,
          onChange: (e) => ctx.setValue(e.target.checked ? { minion: av?.minion ?? "" } : void 0)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lf-setting-label", children: "Validate via a Minion" })
    ] }),
    editor.hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lf-setting-hint", children: editor.hint }),
    enabled && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: "Minion operation", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: str(av?.minion), placeholder: "checkEmail", onChange: (e) => set({ minion: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Labeled, { label: "Error message", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: str(av?.message), placeholder: "Already taken", onChange: (e) => set({ message: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
  const [rows, setRows] = (0, import_react2.useState)(() => Object.entries(params ?? {}));
  (0, import_react2.useEffect)(() => {
    setRows(Object.entries(params ?? {}));
  }, [resetKey]);
  const commit = (next) => {
    setRows(next);
    const rec = {};
    for (const [k, v] of next) if (k) rec[k] = v;
    onChange(Object.keys(rec).length ? rec : void 0);
  };
  const setAt = (i, k, v) => commit(rows.map((e, j) => j === i ? [k, v] : e));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: "lf-settings-params", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: legend }),
    rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "lf-empty", children: "No params." }),
    rows.map(([k, v], i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lf-param-row", role: "group", "aria-label": `Param ${i + 1}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { "aria-label": `Param ${i + 1} name`, value: k, placeholder: "param", onChange: (e) => setAt(i, e.target.value, v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u2190" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { "aria-label": `Param ${i + 1} field`, value: v, onChange: (e) => setAt(i, k, e.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "" }),
        fieldKeys.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: f, children: f }, f))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": `Remove param ${i + 1}`, onClick: () => commit(rows.filter((_, j) => j !== i)), children: "\u2715" })
    ] }, i)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "lf-param-add", onClick: () => commit([...rows, ["", ""]]), children: "Add param" })
  ] });
}
function Labeled({
  label,
  hint,
  inline,
  footer,
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lf-setting-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: `lf-setting${inline ? " lf-setting-inline" : ""}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lf-setting-label", children: label }),
      children
    ] }),
    hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lf-setting-hint", children: hint }),
    footer
  ] });
}
var LOGIC_OPS = [
  { op: "==", label: "equals" },
  { op: "!=", label: "not equals" },
  { op: ">", label: "greater than" },
  { op: "<", label: "less than" },
  { op: ">=", label: "at least" },
  { op: "<=", label: "at most" }
];
var LOGIC_ACTIONS = ["show", "hide", "require", "optional", "enable", "disable", "setValue"];
var WHEN_RE = /^\s*([A-Za-z_$][\w$]*)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/;
function LogicRules({ builder, id, entity }) {
  const rules = Array.isArray(entity.attributes.logic) ? entity.attributes.logic : [];
  const parsed = rules.map(parseRule);
  const fields = otherFieldKeys(builder.schema, id);
  const commit = (next) => {
    const logic = next.map((s) => ({
      when: buildWhen(s.field, s.op, s.value),
      action: s.action,
      ...s.action === "setValue" ? { value: toLiteral(s.setTo) } : {}
    }));
    builder.updateAttributes(id, { logic });
  };
  const setRule = (i, p) => commit(parsed.map((r, j) => j === i ? { ...r, ...p } : r));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: "lf-settings-logic", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: "Conditional rules" }),
    parsed.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "lf-empty", children: "No rules." }),
    parsed.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lf-logic-rule", role: "group", "aria-label": `Rule ${i + 1}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "When" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { "aria-label": `Rule ${i + 1} field`, value: r.field, onChange: (e) => setRule(i, { field: e.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "" }),
        fields.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: f, children: f }, f))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { "aria-label": `Rule ${i + 1} operator`, value: r.op, onChange: (e) => setRule(i, { op: e.target.value }), children: LOGIC_OPS.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: o.op, children: o.label }, o.op)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { "aria-label": `Rule ${i + 1} value`, value: r.value, onChange: (e) => setRule(i, { value: e.target.value }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u2192" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { "aria-label": `Rule ${i + 1} action`, value: r.action, onChange: (e) => setRule(i, { action: e.target.value }), children: LOGIC_ACTIONS.map((act) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: act, children: act }, act)) }),
      r.action === "setValue" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { "aria-label": `Rule ${i + 1} set value`, value: r.setTo, onChange: (e) => setRule(i, { setTo: e.target.value }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": `Remove rule ${i + 1}`, onClick: () => commit(parsed.filter((_, j) => j !== i)), children: "\u2715" })
    ] }, i)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "lf-logic-add",
        onClick: () => commit([...parsed, { field: fields[0] ?? "", op: "==", value: "", action: "show", setTo: "" }]),
        children: "Add rule"
      }
    )
  ] });
}
function parseRule(r) {
  const m = typeof r.when === "string" ? WHEN_RE.exec(r.when) : null;
  return {
    field: m?.[1] ?? "",
    op: m?.[2] ?? "==",
    value: m ? unLiteral(m[3] ?? "") : "",
    action: typeof r.action === "string" ? r.action : "show",
    setTo: typeof r.value === "string" ? unLiteral(r.value) : ""
  };
}
function buildWhen(field, op, value) {
  return field ? `${field} ${op} ${toLiteral(value)}` : "";
}
function toLiteral(v) {
  if (v === "true" || v === "false") return v;
  if (v.trim() !== "" && !Number.isNaN(Number(v))) return v;
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
function otherFieldKeys(schema, selfId) {
  const out = [];
  for (const [eid, e] of Object.entries(schema.entities ?? {})) {
    if (eid === selfId) continue;
    const k = e.attributes?.key;
    const ft = REGISTRY2.get(e.type);
    if (typeof k === "string" && k && !ft?.isContainer && !ft?.isStatic) out.push(k);
  }
  return out;
}
function str(v) {
  return typeof v === "string" ? v : "";
}
function numStr(v) {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}
function optionsToText(raw) {
  if (!Array.isArray(raw)) return "";
  return raw.map((o) => {
    if (typeof o === "string") return o;
    const obj = o;
    const label = String(obj.label ?? obj.value ?? "");
    const value = String(obj.value ?? "");
    return label === value ? label : `${label}|${value}`;
  }).join("\n");
}
function textToOptions(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [label, value] = line.split("|");
    const l = (label ?? "").trim();
    return { label: l, value: (value ?? l).trim() };
  });
}

// src/Canvas.tsx
var import_react3 = require("react");
var import_form_core5 = require("@lukeflow/form-core");

// src/NodePreview.tsx
var import_form_core4 = require("@lukeflow/form-core");
var import_jsx_runtime2 = require("react/jsx-runtime");
var REGISTRY3 = (0, import_form_core4.createDefaultFieldTypeRegistry)();
function NodePreview({ entity }) {
  const a = entity.attributes;
  const ft = REGISTRY3.get(entity.type);
  if (ft?.isContainer) return null;
  const control = previewControl(entity);
  if (ft?.isStatic) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lf-pv-static", children: control });
  const labelPos = a.labelPosition === "left" || a.labelPosition === "right" ? a.labelPosition : "top";
  const hideLabel = Boolean(a.hideLabel);
  const label = str2(a.label) || str2(a.key) || entity.type;
  const desc = str2(a.description);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lf-pv-field", "data-label-position": labelPos, "data-hide-label": hideLabel || void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "lf-pv-fieldlabel", children: [
      label,
      a.required ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "lf-pv-required", children: " *" }) : null,
      str2(a.tooltip) ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "lf-tooltip", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "lf-tooltip-icon", children: " \u24D8" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "lf-tooltip-bubble", children: str2(a.tooltip) })
      ] }) : null
    ] }),
    control,
    desc ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "lf-pv-desc", children: desc }) : null
  ] });
}
function previewControl(entity) {
  const a = entity.attributes;
  const ph = str2(a.placeholder);
  const dv = a.defaultValue != null && a.defaultValue !== "" ? String(a.defaultValue) : "";
  const ph2 = dv ? void 0 : ph;
  switch (entity.type) {
    case "textarea":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("textarea", { className: "lf-pv-input", disabled: true, rows: typeof a.rows === "number" ? a.rows : 2, value: dv, placeholder: ph2 });
    case "number":
    case "currency":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "lf-pv-input", disabled: true, type: "number", value: dv, placeholder: ph2 || (entity.type === "currency" ? "0.00" : "") });
    case "checkbox":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "lf-pv-check", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", disabled: true, defaultChecked: Boolean(a.defaultChecked) }),
        " ",
        str2(a.label) || "Checkbox"
      ] });
    case "select":
    case "searchSelect": {
      const opts = readOptions(a);
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { className: "lf-pv-input", disabled: true, children: [
        ph ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { children: ph }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", {}),
        opts.map((o, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { children: o.label }, i))
      ] });
    }
    case "radio":
    case "selectBoxes": {
      const opts = readOptions(a);
      const type = entity.type === "radio" ? "radio" : "checkbox";
      const shown = opts.length ? opts : [{ label: "Option 1", value: "1" }, { label: "Option 2", value: "2" }];
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lf-pv-choices", children: shown.slice(0, 4).map((o, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "lf-pv-check", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type, disabled: true }),
        " ",
        o.label
      ] }, i)) });
    }
    case "day":
    case "datetime":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "lf-pv-input", disabled: true, type: entity.type === "datetime" ? "datetime-local" : "date" });
    case "time":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "lf-pv-input", disabled: true, type: "time" });
    case "file":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lf-pv-file", children: "Choose file\u2026" });
    case "signature":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lf-pv-sign", children: "\u270E Signature" });
    case "tags":
    case "tagsField":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "lf-pv-input", disabled: true, value: dv, placeholder: dv ? void 0 : ph || "Add tags\u2026" });
    case "button":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "lf-pv-btn", type: "button", disabled: true, children: str2(a.label) || "Button" });
    case "heading":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lf-pv-heading", children: str2(a.label) || str2(a.content) || "Heading" });
    case "content":
    case "html":
    case "htmlElement":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lf-pv-muted", children: str2(a.content) || "Content" });
    case "divider":
    case "hr":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("hr", { className: "lf-pv-hr" });
    default:
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "lf-pv-input", disabled: true, type: "text", value: dv, placeholder: ph2 });
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

// src/Canvas.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var REGISTRY4 = (0, import_form_core5.createDefaultFieldTypeRegistry)();
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
      { type: "file", label: "File Upload" },
      { type: "signature", label: "Signature" }
    ]
  },
  {
    group: "Layout",
    items: [
      { type: "panel", label: "Panel" },
      { type: "columns", label: "Columns" },
      { type: "tabs", label: "Tabs" },
      { type: "table", label: "Table", defaults: { numColumns: 2 } },
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
      { type: "dataGrid", label: "Data Grid" },
      { type: "editGrid", label: "Edit Grid" }
    ]
  },
  {
    group: "Wizard",
    items: [{ type: "page", label: "Page" }]
  }
];
function Palette({ builder, extra }) {
  const dnd = useDnd();
  const [query, setQuery] = (0, import_react3.useState)("");
  const sel = builder.selectedId ? builder.schema.entities[builder.selectedId] : void 0;
  const intoContainer = sel && REGISTRY4.get(sel.type)?.isContainer ? builder.selectedId : null;
  const groups = extra && extra.length ? [...PALETTE_GROUPS, { group: "Custom", items: extra }] : PALETTE_GROUPS;
  const q = query.trim().toLowerCase();
  const matches = (it) => !q || it.label.toLowerCase().includes(q) || it.type.toLowerCase().includes(q);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "lf-palette", "aria-label": "Field palette", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("h4", { children: [
      "Add field",
      intoContainer ? ` \u2192 into ${labelOf(sel)}` : ""
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "input",
      {
        type: "search",
        className: "lf-palette-search",
        placeholder: "Search fields\u2026",
        "aria-label": "Search fields",
        value: query,
        onChange: (e) => setQuery(e.target.value)
      }
    ),
    groups.map(({ group, items }) => {
      const visible = items.filter(matches);
      if (visible.length === 0) return null;
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "lf-palette-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h5", { className: "lf-palette-group-title", children: group }),
        visible.map((p) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
            onClick: () => builder.addField(p.type, { label: p.label, ...p.defaults ?? {} }, intoContainer ? { parentId: intoContainer } : void 0),
            children: p.label
          },
          p.type
        ))
      ] }, group);
    })
  ] });
}
function CanvasDndProvider({ builder, children }) {
  const dnd = useCanvasDnd(builder);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DndContext.Provider, { value: dnd, children });
}
function Canvas({ builder }) {
  const { schema } = builder;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "lf-canvas", "aria-label": "Form canvas", children: schema.root.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RootDropzone, { empty: true }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ol", { className: "lf-node-list", children: schema.root.map((id, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Node, { id, parentId: null, index: i, count: schema.root.length, builder, depth: 0 }, id)) }) });
}
function Node({
  id,
  parentId,
  index,
  count,
  builder,
  depth
}) {
  const dnd = useDnd();
  const entity = builder.schema.entities[id];
  if (!entity) return null;
  const selected = builder.selectedId === id;
  const children = entity.children ?? [];
  const isContainer = Boolean(REGISTRY4.get(entity.type)?.isContainer);
  const over = dnd.over?.id === id ? dnd.over.pos : null;
  const hidden = Boolean(entity.attributes?.hidden);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { className: "lf-node", "data-depth": depth, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        className: `lf-node-row${selected ? " is-selected" : ""}${over ? ` is-drop-${over}` : ""}${hidden ? " is-hidden" : ""}`,
        "data-drop": over ?? void 0,
        onDragOver: (e) => dnd.overNode(e, id, isContainer),
        onDragLeave: dnd.leave,
        onDrop: (e) => dnd.dropNode(e, id, parentId, index, isContainer),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "span",
            {
              className: "lf-node-grip",
              "aria-label": `Drag ${labelOf(entity)}`,
              draggable: true,
              onDragStart: (e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
                dnd.begin({ kind: "move", id });
              },
              onDragEnd: dnd.end,
              children: "\u283F"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "lf-node-body", onClick: () => builder.select(id), children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: "lf-node-select", "aria-pressed": selected, "aria-label": `Edit ${labelOf(entity)}`, onClick: () => builder.select(id), children: [
              isContainer && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "lf-node-label", children: labelOf(entity) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "lf-node-type", children: entity.type }),
              hidden && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "lf-node-badge", children: "Hidden" })
            ] }),
            !isContainer && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "lf-node-preview", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(NodePreview, { entity }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "lf-node-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", "aria-label": `Move ${labelOf(entity)} up`, disabled: index === 0, onClick: () => builder.reorderField(parentId, index, index - 1), children: "\u2191" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", "aria-label": `Move ${labelOf(entity)} down`, disabled: index === count - 1, onClick: () => builder.reorderField(parentId, index, index + 1), children: "\u2193" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", "aria-label": `Duplicate ${labelOf(entity)}`, onClick: () => builder.duplicateField(id), children: "\u29C9" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", "aria-label": `Delete ${labelOf(entity)}`, onClick: () => builder.removeField(id), children: "\u2715" })
          ] })
        ]
      }
    ),
    isContainer && (children.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ol", { className: "lf-node-list", children: children.map((cid, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Node, { id: cid, parentId: id, index: i, count: children.length, builder, depth: depth + 1 }, cid)) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ContainerDropzone, { containerId: id, label: labelOf(entity) }))
  ] });
}
function ContainerDropzone({ containerId, label }) {
  const dnd = useDnd();
  const active = dnd.overEmpty === containerId;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "div",
    {
      className: `lf-dropzone${active ? " is-over" : ""}`,
      "aria-label": `Drop into ${label}`,
      onDragOver: (e) => dnd.overEmptyContainer(e, containerId),
      onDragLeave: dnd.leave,
      onDrop: (e) => dnd.dropIntoEmpty(e, containerId),
      children: "Drop fields here"
    }
  );
}
function RootDropzone({ empty }) {
  const dnd = useDnd();
  const active = dnd.overEmpty === ROOT;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "div",
    {
      className: `lf-dropzone${active ? " is-over" : ""}`,
      "aria-label": "Drop into form",
      onDragOver: (e) => dnd.overEmptyContainer(e, ROOT),
      onDragLeave: dnd.leave,
      onDrop: (e) => dnd.dropIntoEmpty(e, ROOT),
      children: empty ? "Add a field to begin." : "Drop fields here"
    }
  );
}
var ROOT = "\0root";
var DndContext = (0, import_react3.createContext)(null);
function useDnd() {
  const ctx = (0, import_react3.useContext)(DndContext);
  if (!ctx) throw new Error("Canvas DnD context missing");
  return ctx;
}
function useCanvasDnd(builder) {
  const source = (0, import_react3.useRef)(null);
  const [over, setOver] = (0, import_react3.useState)(null);
  const [overEmpty, setOverEmpty] = (0, import_react3.useState)(null);
  const begin = (src) => {
    source.current = src;
  };
  const end = () => {
    source.current = null;
    setOver(null);
    setOverEmpty(null);
  };
  const leave = () => {
  };
  const canDrop = (targetId) => {
    const s = source.current;
    if (!s) return false;
    if (s.kind === "move" && s.id === targetId) return false;
    return true;
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
    if (!source.current) return;
    e.preventDefault();
    setOver(null);
    setOverEmpty(containerId);
  };
  const dropIntoEmpty = (e, containerId) => {
    e.preventDefault();
    const s = source.current;
    if (!s) return end();
    place(s, containerId === ROOT ? null : containerId, 0);
    end();
  };
  const place = (s, parentId, index) => {
    if (s.kind === "new") builder.addField(s.type, { label: s.label, ...s.defaults ?? {} }, { parentId, index });
    else builder.moveField(s.id, { parentId, index });
  };
  return { over, overEmpty, begin, end, leave, overNode, dropNode, overEmptyContainer, dropIntoEmpty };
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

// src/FormBuilder.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var FormBuilder = (0, import_react4.forwardRef)(function FormBuilder2({ initialSchema, onChange, extraFields, attributeEditors, settings = "panel", aside, className }, ref) {
  const b = useFormBuilder(initialSchema);
  (0, import_react4.useImperativeHandle)(ref, () => ({ setSchema: b.setSchema, getSchema: () => b.schema }), [b.setSchema, b.schema]);
  const [showPreview, setShowPreview] = (0, import_react4.useState)(false);
  const editors = (0, import_react4.useMemo)(() => mergeAttributeEditors(createDefaultAttributeEditors(), attributeEditors), [attributeEditors]);
  const modal = settings === "modal";
  const onChangeRef = (0, import_react4.useRef)(onChange);
  onChangeRef.current = onChange;
  const mounted = (0, import_react4.useRef)(false);
  (0, import_react4.useEffect)(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onChangeRef.current?.(b.schema);
  }, [b.schema]);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: `lf-builder ${className ?? ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-builder-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: b.undo, disabled: !b.canUndo, "aria-label": "Undo", children: "Undo" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: b.redo, disabled: !b.canRedo, "aria-label": "Redo", children: "Redo" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: () => setShowPreview((p) => !p), "aria-pressed": showPreview, children: showPreview ? "Edit" : "Preview" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ProblemsBadge, { builder: b })
    ] }),
    showPreview ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-builder-preview", "data-testid": "preview", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_form_react.FormRenderer, { schema: b.schema }) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(CanvasDndProvider, { builder: b, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: `lf-builder-body${modal ? " lf-builder-body--modal" : ""}${modal && aside ? " lf-builder-body--aside" : ""}`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Palette, { builder: b, extra: extraFields }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Canvas, { builder: b }),
        modal ? aside && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("aside", { className: "lf-builder-aside", children: aside }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SettingsPanel, { builder: b, editors })
      ] }),
      modal && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SettingsModal, { builder: b, editors })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Problems, { builder: b })
  ] });
});
function SettingsModal({ builder, editors }) {
  const id = builder.selectedId;
  const entity = id ? builder.schema.entities[id] : void 0;
  const open = Boolean(id && entity);
  const dialogRef = (0, import_react4.useRef)(null);
  const select = builder.select;
  (0, import_react4.useEffect)(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") select(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, select]);
  (0, import_react4.useEffect)(() => {
    if (open) dialogRef.current?.focus();
  }, [open, id]);
  if (!open) return null;
  return (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "div",
      {
        className: "lf-modal-overlay lf-builder",
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) builder.select(null);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { ref: dialogRef, className: "lf-modal", role: "dialog", "aria-modal": "true", "aria-label": "Field settings", tabIndex: -1, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-modal-header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-modal-title", children: "Field settings" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-modal-close", "aria-label": "Close settings", onClick: () => builder.select(null), children: "\u2715" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-modal-body", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SettingsPanel, { builder, editors }) })
        ] })
      }
    ),
    document.body
  );
}
function ProblemsBadge({ builder }) {
  const n = builder.problems.length;
  if (n === 0) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-problems-badge is-ok", children: "No problems" });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: `lf-problems-badge${builder.hasErrors ? " is-error" : " is-warning"}`, children: [
    n,
    " problem",
    n === 1 ? "" : "s"
  ] });
}
function Problems({ builder }) {
  if (builder.problems.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-problems", role: "region", "aria-label": "Problems", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { children: builder.problems.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("li", { className: `lf-problem is-${d.severity}`, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { type: "button", disabled: !d.entityId, onClick: () => d.entityId && builder.select(d.entityId), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-problem-code", children: d.code }),
    " ",
    d.message
  ] }) }, i)) }) });
}

// src/index.ts
var VERSION = "0.1.0-alpha.0";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
});
//# sourceMappingURL=index.cjs.map