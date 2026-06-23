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
function useFormBuilder(initialSchema = EMPTY) {
  const [schema, setSchemaState] = useState(initialSchema);
  const [selectedId, setSelectedId] = useState(null);
  const past = useRef([]);
  const future = useRef([]);
  const [, forceRender] = useState(0);
  const commit = useCallback((next) => {
    setSchemaState((prev) => {
      if (next === prev) return prev;
      past.current.push(prev);
      future.current = [];
      return next;
    });
  }, []);
  const select = useCallback((id) => setSelectedId(id), []);
  const addField = useCallback(
    (type, attributes = {}, target) => {
      const entity = createEntity(type, attributes);
      setSchemaState((prev) => {
        past.current.push(prev);
        future.current = [];
        return insert(prev, entity, target ?? {});
      });
      setSelectedId(entity.id);
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
      future.current.push(prev);
      forceRender((n) => n + 1);
      return last;
    });
  }, []);
  const redo = useCallback(() => {
    setSchemaState((prev) => {
      const next = future.current.pop();
      if (next === void 0) return prev;
      past.current.push(prev);
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
import { useMemo as useMemo2, useState as useState4, useEffect as useEffect2, useRef as useRef3, useImperativeHandle, forwardRef } from "react";
import { createPortal } from "react-dom";
import { FormRenderer } from "@lukeflow/form-react";

// src/SettingsPanel.tsx
import { useEffect, useState as useState2 } from "react";
import {
  parseExpression,
  createDefaultFieldTypeRegistry as createDefaultFieldTypeRegistry2
} from "@lukeflow/form-core";

// src/attributeEditors.ts
import { createDefaultFieldTypeRegistry } from "@lukeflow/form-core";
var REGISTRY = createDefaultFieldTypeRegistry();
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
    { id: "accept", tab: "data", attribute: "accept", label: "Accepted file types", control: "text", order: 34, when: oneOf("file"), placeholder: "image/*,.pdf" },
    { id: "maxFiles", tab: "data", attribute: "maxFiles", label: "Max files", control: "number", order: 35, when: oneOf("file") },
    { id: "maxSize", tab: "data", attribute: "maxSize", label: "Max size (MB)", control: "number", order: 36, when: oneOf("file") },
    { id: "minRows", tab: "data", attribute: "minRows", label: "Min rows", control: "number", order: 40, when: grid },
    { id: "maxRows", tab: "data", attribute: "maxRows", label: "Max rows", control: "number", order: 41, when: grid },
    { id: "persistent", tab: "data", attribute: "persistent", label: "Include in submission", control: "checkbox", order: 80, when: data, hint: "Uncheck to exclude this field from the saved payload." },
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
    // ── CONDITIONAL ─────────────────────────────────────────────────────────────
    { id: "logic", tab: "conditional", control: "logic", order: 1 },
    { id: "customConditional", tab: "conditional", attribute: "customConditional", label: "Advanced condition (show when\u2026)", control: "expression", order: 10, placeholder: 'country == "US"' },
    { id: "customConditionalJs", tab: "conditional", attribute: "customConditionalJs", label: "Condition (JavaScript)", control: "js", order: 20, placeholder: "show = data.country === 'US';" },
    // ── LOGIC ─────────────────────────────────────────────────────────────────
    { id: "calculateValue", tab: "logic", attribute: "calculateValue", label: "Calculated value (expression)", control: "expression", order: 1, when: data, placeholder: "price * quantity" },
    { id: "calculateValueJs", tab: "logic", attribute: "calculateValueJs", label: "Calculated value", control: "js", order: 2, when: data, placeholder: "value = data.qty * data.price;" },
    { id: "allowCalculateOverride", tab: "logic", attribute: "allowCalculateOverride", label: "Allow manual override", control: "checkbox", order: 3, when: data },
    { id: "customDefaultValue", tab: "logic", attribute: "customDefaultValue", label: "Default value (expression)", control: "expression", order: 10, when: data, placeholder: "firstName + ' ' + lastName" },
    { id: "customValidation", tab: "logic", attribute: "customValidation", label: "Custom validation (expression)", control: "expression", order: 20, when: data, placeholder: "value > 0" },
    { id: "customValidationJs", tab: "logic", attribute: "customValidationJs", label: "Validation", control: "js", order: 21, when: data, placeholder: "valid = input.length >= 3 ? true : 'Too short';" }
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
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var REGISTRY2 = createDefaultFieldTypeRegistry2();
function SettingsPanel({ builder, editors }) {
  const id = builder.selectedId;
  const entity = id ? builder.schema.entities[id] : void 0;
  const [activeTab, setActiveTab] = useState2("display");
  const entityType = entity?.type;
  useEffect(() => {
    setActiveTab("display");
  }, [id, entityType]);
  if (!id || !entity) {
    return /* @__PURE__ */ jsx("div", { className: "lf-settings", "aria-label": "Field settings", children: /* @__PURE__ */ jsx("p", { className: "lf-empty", children: "Select a field to edit its settings." }) });
  }
  const applicable = editorsForEntity(editors, entity, builder.schema);
  const groups = editorsByTab(applicable);
  const active = groups.find((g) => g.tab === activeTab) ?? groups[0];
  const fieldKeys = otherFieldKeys(builder.schema, id);
  const patch = (p) => builder.updateAttributes(id, p);
  return /* @__PURE__ */ jsxs("div", { className: "lf-settings", "aria-label": "Field settings", children: [
    /* @__PURE__ */ jsxs("h4", { children: [
      "Settings \u2014 ",
      entity.type
    ] }),
    /* @__PURE__ */ jsx("div", { className: "lf-settings-tabs", role: "tablist", "aria-label": "Field settings tabs", children: groups.map((g) => /* @__PURE__ */ jsx(
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
    /* @__PURE__ */ jsx("div", { className: "lf-settings-panel", role: "tabpanel", "aria-label": `${active?.label ?? ""} settings`, children: active?.editors.map((ed) => {
      const ctx = {
        entity,
        schema: builder.schema,
        fieldKeys,
        value: ed.attribute ? entity.attributes[ed.attribute] : void 0,
        setValue: ed.attribute ? (v) => patch({ [ed.attribute]: v }) : () => {
        },
        patch
      };
      return /* @__PURE__ */ jsx(Control, { editor: ed, ctx, builder, id, entity }, ed.id);
    }) })
  ] });
}
function Control({
  editor,
  ctx,
  builder,
  id,
  entity
}) {
  if (editor.render) return /* @__PURE__ */ jsx(Fragment, { children: editor.render(ctx) });
  switch (editor.control) {
    case "logic":
      return /* @__PURE__ */ jsx(LogicRules, { builder, id, entity });
    case "checkbox":
      return /* @__PURE__ */ jsx(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, inline: true, children: /* @__PURE__ */ jsx("input", { type: "checkbox", checked: Boolean(ctx.value), onChange: (e) => ctx.setValue(e.target.checked) }) });
    case "number":
      return /* @__PURE__ */ jsx(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx(
        "input",
        {
          type: "number",
          value: numStr(ctx.value),
          placeholder: editor.placeholder,
          onChange: (e) => ctx.setValue(e.target.value === "" ? void 0 : Number(e.target.value))
        }
      ) });
    case "textarea":
      return /* @__PURE__ */ jsx(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx("textarea", { value: str(ctx.value), placeholder: editor.placeholder, rows: 3, onChange: (e) => ctx.setValue(e.target.value) }) });
    case "select":
      return /* @__PURE__ */ jsx(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsxs("select", { value: str(ctx.value), onChange: (e) => ctx.setValue(e.target.value), children: [
        /* @__PURE__ */ jsx("option", { value: "" }),
        (editor.options ?? []).map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value))
      ] }) });
    case "options":
      return /* @__PURE__ */ jsx(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx(
        "textarea",
        {
          value: optionsToText(ctx.value),
          rows: 4,
          onChange: (e) => ctx.setValue(textToOptions(e.target.value))
        }
      ) });
    case "tags":
      return /* @__PURE__ */ jsx(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx(
        "input",
        {
          value: Array.isArray(ctx.value) ? ctx.value.join(", ") : str(ctx.value),
          placeholder: editor.placeholder,
          onChange: (e) => ctx.setValue(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
        }
      ) });
    case "dataSource":
      return /* @__PURE__ */ jsx(DataSourceControl, { editor, ctx });
    case "asyncValidation":
      return /* @__PURE__ */ jsx(AsyncValidationControl, { editor, ctx });
    case "expression":
      return /* @__PURE__ */ jsx(ExpressionControl, { editor, ctx });
    case "js":
      return /* @__PURE__ */ jsx(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "lf-code",
          spellCheck: false,
          value: str(ctx.value),
          placeholder: editor.placeholder,
          rows: 2,
          onChange: (e) => ctx.setValue(e.target.value)
        }
      ) });
    case "text":
    default:
      return /* @__PURE__ */ jsx(Labeled, { label: editor.label ?? editor.id, hint: editor.hint, children: /* @__PURE__ */ jsx("input", { value: str(ctx.value), placeholder: editor.placeholder, onChange: (e) => ctx.setValue(e.target.value) }) });
  }
}
function ExpressionControl({ editor, ctx }) {
  const value = str(ctx.value);
  const parsed = parseExpression(value);
  const error = parsed.ok ? null : parsed.error;
  return /* @__PURE__ */ jsx(
    Labeled,
    {
      label: editor.label ?? editor.id,
      hint: editor.hint,
      footer: error ? /* @__PURE__ */ jsx("span", { className: "lf-expr-error", role: "alert", children: error }) : void 0,
      children: /* @__PURE__ */ jsx(
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
  return /* @__PURE__ */ jsxs("fieldset", { className: "lf-settings-minion", children: [
    /* @__PURE__ */ jsx("legend", { children: editor.label ?? "Minion data source" }),
    /* @__PURE__ */ jsxs("label", { className: "lf-setting lf-setting-inline", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "checkbox",
          "aria-label": "Load options from a Minion",
          checked: enabled,
          onChange: (e) => ctx.setValue(e.target.checked ? { minion: ds?.minion ?? "" } : void 0)
        }
      ),
      /* @__PURE__ */ jsx("span", { className: "lf-setting-label", children: "Load options from a Minion" })
    ] }),
    editor.hint && /* @__PURE__ */ jsx("span", { className: "lf-setting-hint", children: editor.hint }),
    enabled && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Labeled, { label: "Minion operation", children: /* @__PURE__ */ jsx("input", { value: str(ds?.minion), placeholder: "listCities", onChange: (e) => set({ minion: e.target.value }) }) }),
      isSearch && /* @__PURE__ */ jsx(Labeled, { label: "Search param", children: /* @__PURE__ */ jsx("input", { value: str(ds?.searchParam), placeholder: "q", onChange: (e) => set({ searchParam: e.target.value }) }) }),
      /* @__PURE__ */ jsx(Labeled, { label: "Result path", children: /* @__PURE__ */ jsx("input", { value: str(ds?.resultPath), placeholder: "data", onChange: (e) => set({ resultPath: e.target.value }) }) }),
      /* @__PURE__ */ jsx(Labeled, { label: "Label path", children: /* @__PURE__ */ jsx("input", { value: str(ds?.labelPath), placeholder: "name", onChange: (e) => set({ labelPath: e.target.value }) }) }),
      /* @__PURE__ */ jsx(Labeled, { label: "Value path", children: /* @__PURE__ */ jsx("input", { value: str(ds?.valuePath), placeholder: "id", onChange: (e) => set({ valuePath: e.target.value }) }) }),
      !isSearch && /* @__PURE__ */ jsx(Labeled, { label: "Refetch", children: /* @__PURE__ */ jsxs("select", { value: str(ds?.trigger) || "load", onChange: (e) => set({ trigger: e.target.value }), children: [
        /* @__PURE__ */ jsx("option", { value: "load", children: "Once on load" }),
        /* @__PURE__ */ jsx("option", { value: "change", children: "When params change" })
      ] }) }),
      /* @__PURE__ */ jsx(
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
  return /* @__PURE__ */ jsxs("fieldset", { className: "lf-settings-minion", children: [
    /* @__PURE__ */ jsx("legend", { children: editor.label ?? "Async validation" }),
    /* @__PURE__ */ jsxs("label", { className: "lf-setting lf-setting-inline", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "checkbox",
          "aria-label": "Validate via a Minion",
          checked: enabled,
          onChange: (e) => ctx.setValue(e.target.checked ? { minion: av?.minion ?? "" } : void 0)
        }
      ),
      /* @__PURE__ */ jsx("span", { className: "lf-setting-label", children: "Validate via a Minion" })
    ] }),
    editor.hint && /* @__PURE__ */ jsx("span", { className: "lf-setting-hint", children: editor.hint }),
    enabled && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Labeled, { label: "Minion operation", children: /* @__PURE__ */ jsx("input", { value: str(av?.minion), placeholder: "checkEmail", onChange: (e) => set({ minion: e.target.value }) }) }),
      /* @__PURE__ */ jsx(Labeled, { label: "Error message", children: /* @__PURE__ */ jsx("input", { value: str(av?.message), placeholder: "Already taken", onChange: (e) => set({ message: e.target.value }) }) }),
      /* @__PURE__ */ jsx(
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
  const [rows, setRows] = useState2(() => Object.entries(params ?? {}));
  useEffect(() => {
    setRows(Object.entries(params ?? {}));
  }, [resetKey]);
  const commit = (next) => {
    setRows(next);
    const rec = {};
    for (const [k, v] of next) if (k) rec[k] = v;
    onChange(Object.keys(rec).length ? rec : void 0);
  };
  const setAt = (i, k, v) => commit(rows.map((e, j) => j === i ? [k, v] : e));
  return /* @__PURE__ */ jsxs("fieldset", { className: "lf-settings-params", children: [
    /* @__PURE__ */ jsx("legend", { children: legend }),
    rows.length === 0 && /* @__PURE__ */ jsx("p", { className: "lf-empty", children: "No params." }),
    rows.map(([k, v], i) => /* @__PURE__ */ jsxs("div", { className: "lf-param-row", role: "group", "aria-label": `Param ${i + 1}`, children: [
      /* @__PURE__ */ jsx("input", { "aria-label": `Param ${i + 1} name`, value: k, placeholder: "param", onChange: (e) => setAt(i, e.target.value, v) }),
      /* @__PURE__ */ jsx("span", { children: "\u2190" }),
      /* @__PURE__ */ jsxs("select", { "aria-label": `Param ${i + 1} field`, value: v, onChange: (e) => setAt(i, k, e.target.value), children: [
        /* @__PURE__ */ jsx("option", { value: "" }),
        fieldKeys.map((f) => /* @__PURE__ */ jsx("option", { value: f, children: f }, f))
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", "aria-label": `Remove param ${i + 1}`, onClick: () => commit(rows.filter((_, j) => j !== i)), children: "\u2715" })
    ] }, i)),
    /* @__PURE__ */ jsx("button", { type: "button", className: "lf-param-add", onClick: () => commit([...rows, ["", ""]]), children: "Add param" })
  ] });
}
function Labeled({
  label,
  hint,
  inline,
  footer,
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: "lf-setting-wrap", children: [
    /* @__PURE__ */ jsxs("label", { className: `lf-setting${inline ? " lf-setting-inline" : ""}`, children: [
      /* @__PURE__ */ jsx("span", { className: "lf-setting-label", children: label }),
      children
    ] }),
    hint && /* @__PURE__ */ jsx("span", { className: "lf-setting-hint", children: hint }),
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
  return /* @__PURE__ */ jsxs("fieldset", { className: "lf-settings-logic", children: [
    /* @__PURE__ */ jsx("legend", { children: "Conditional rules" }),
    parsed.length === 0 && /* @__PURE__ */ jsx("p", { className: "lf-empty", children: "No rules." }),
    parsed.map((r, i) => /* @__PURE__ */ jsxs("div", { className: "lf-logic-rule", role: "group", "aria-label": `Rule ${i + 1}`, children: [
      /* @__PURE__ */ jsx("span", { children: "When" }),
      /* @__PURE__ */ jsxs("select", { "aria-label": `Rule ${i + 1} field`, value: r.field, onChange: (e) => setRule(i, { field: e.target.value }), children: [
        /* @__PURE__ */ jsx("option", { value: "" }),
        fields.map((f) => /* @__PURE__ */ jsx("option", { value: f, children: f }, f))
      ] }),
      /* @__PURE__ */ jsx("select", { "aria-label": `Rule ${i + 1} operator`, value: r.op, onChange: (e) => setRule(i, { op: e.target.value }), children: LOGIC_OPS.map((o) => /* @__PURE__ */ jsx("option", { value: o.op, children: o.label }, o.op)) }),
      /* @__PURE__ */ jsx("input", { "aria-label": `Rule ${i + 1} value`, value: r.value, onChange: (e) => setRule(i, { value: e.target.value }) }),
      /* @__PURE__ */ jsx("span", { children: "\u2192" }),
      /* @__PURE__ */ jsx("select", { "aria-label": `Rule ${i + 1} action`, value: r.action, onChange: (e) => setRule(i, { action: e.target.value }), children: LOGIC_ACTIONS.map((act) => /* @__PURE__ */ jsx("option", { value: act, children: act }, act)) }),
      r.action === "setValue" && /* @__PURE__ */ jsx("input", { "aria-label": `Rule ${i + 1} set value`, value: r.setTo, onChange: (e) => setRule(i, { setTo: e.target.value }) }),
      /* @__PURE__ */ jsx("button", { type: "button", "aria-label": `Remove rule ${i + 1}`, onClick: () => commit(parsed.filter((_, j) => j !== i)), children: "\u2715" })
    ] }, i)),
    /* @__PURE__ */ jsx(
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
import { createContext, useContext, useRef as useRef2, useState as useState3 } from "react";
import { createDefaultFieldTypeRegistry as createDefaultFieldTypeRegistry4 } from "@lukeflow/form-core";

// src/NodePreview.tsx
import { createDefaultFieldTypeRegistry as createDefaultFieldTypeRegistry3 } from "@lukeflow/form-core";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var REGISTRY3 = createDefaultFieldTypeRegistry3();
function NodePreview({ entity }) {
  const a = entity.attributes;
  const ft = REGISTRY3.get(entity.type);
  if (ft?.isContainer) return null;
  const control = previewControl(entity);
  if (ft?.isStatic) return /* @__PURE__ */ jsx2("div", { className: "lf-pv-static", children: control });
  const labelPos = a.labelPosition === "left" || a.labelPosition === "right" ? a.labelPosition : "top";
  const hideLabel = Boolean(a.hideLabel);
  const label = str2(a.label) || str2(a.key) || entity.type;
  const desc = str2(a.description);
  return /* @__PURE__ */ jsxs2("div", { className: "lf-pv-field", "data-label-position": labelPos, "data-hide-label": hideLabel || void 0, children: [
    /* @__PURE__ */ jsxs2("span", { className: "lf-pv-fieldlabel", children: [
      label,
      a.required ? /* @__PURE__ */ jsx2("span", { className: "lf-pv-required", children: " *" }) : null,
      str2(a.tooltip) ? /* @__PURE__ */ jsxs2("span", { className: "lf-tooltip", children: [
        /* @__PURE__ */ jsx2("span", { className: "lf-tooltip-icon", children: " \u24D8" }),
        /* @__PURE__ */ jsx2("span", { className: "lf-tooltip-bubble", children: str2(a.tooltip) })
      ] }) : null
    ] }),
    control,
    desc ? /* @__PURE__ */ jsx2("span", { className: "lf-pv-desc", children: desc }) : null
  ] });
}
function previewControl(entity) {
  const a = entity.attributes;
  const ph = str2(a.placeholder);
  const dv = a.defaultValue != null && a.defaultValue !== "" ? String(a.defaultValue) : "";
  const ph2 = dv ? void 0 : ph;
  switch (entity.type) {
    case "textarea":
      return /* @__PURE__ */ jsx2("textarea", { className: "lf-pv-input", disabled: true, rows: typeof a.rows === "number" ? a.rows : 2, value: dv, placeholder: ph2 });
    case "number":
    case "currency":
      return /* @__PURE__ */ jsx2("input", { className: "lf-pv-input", disabled: true, type: "number", value: dv, placeholder: ph2 || (entity.type === "currency" ? "0.00" : "") });
    case "checkbox":
      return /* @__PURE__ */ jsxs2("label", { className: "lf-pv-check", children: [
        /* @__PURE__ */ jsx2("input", { type: "checkbox", disabled: true, defaultChecked: Boolean(a.defaultChecked) }),
        " ",
        str2(a.label) || "Checkbox"
      ] });
    case "select":
    case "searchSelect": {
      const opts = readOptions(a);
      return /* @__PURE__ */ jsxs2("select", { className: "lf-pv-input", disabled: true, children: [
        ph ? /* @__PURE__ */ jsx2("option", { children: ph }) : /* @__PURE__ */ jsx2("option", {}),
        opts.map((o, i) => /* @__PURE__ */ jsx2("option", { children: o.label }, i))
      ] });
    }
    case "radio":
    case "selectBoxes": {
      const opts = readOptions(a);
      const type = entity.type === "radio" ? "radio" : "checkbox";
      const shown = opts.length ? opts : [{ label: "Option 1", value: "1" }, { label: "Option 2", value: "2" }];
      return /* @__PURE__ */ jsx2("div", { className: "lf-pv-choices", children: shown.slice(0, 4).map((o, i) => /* @__PURE__ */ jsxs2("label", { className: "lf-pv-check", children: [
        /* @__PURE__ */ jsx2("input", { type, disabled: true }),
        " ",
        o.label
      ] }, i)) });
    }
    case "day":
    case "datetime":
      return /* @__PURE__ */ jsx2("input", { className: "lf-pv-input", disabled: true, type: entity.type === "datetime" ? "datetime-local" : "date" });
    case "time":
      return /* @__PURE__ */ jsx2("input", { className: "lf-pv-input", disabled: true, type: "time" });
    case "file":
      return /* @__PURE__ */ jsx2("div", { className: "lf-pv-file", children: "Choose file\u2026" });
    case "signature":
      return /* @__PURE__ */ jsx2("div", { className: "lf-pv-sign", children: "\u270E Signature" });
    case "tags":
    case "tagsField":
      return /* @__PURE__ */ jsx2("input", { className: "lf-pv-input", disabled: true, value: dv, placeholder: dv ? void 0 : ph || "Add tags\u2026" });
    case "button":
      return /* @__PURE__ */ jsx2("button", { className: "lf-pv-btn", type: "button", disabled: true, children: str2(a.label) || "Button" });
    case "heading":
      return /* @__PURE__ */ jsx2("div", { className: "lf-pv-heading", children: str2(a.label) || str2(a.content) || "Heading" });
    case "content":
    case "html":
    case "htmlElement":
      return /* @__PURE__ */ jsx2("div", { className: "lf-pv-muted", children: str2(a.content) || "Content" });
    case "divider":
    case "hr":
      return /* @__PURE__ */ jsx2("hr", { className: "lf-pv-hr" });
    default:
      return /* @__PURE__ */ jsx2("input", { className: "lf-pv-input", disabled: true, type: "text", value: dv, placeholder: ph2 });
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
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
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
  const [query, setQuery] = useState3("");
  const sel = builder.selectedId ? builder.schema.entities[builder.selectedId] : void 0;
  const intoContainer = sel && REGISTRY4.get(sel.type)?.isContainer ? builder.selectedId : null;
  const groups = extra && extra.length ? [...PALETTE_GROUPS, { group: "Custom", items: extra }] : PALETTE_GROUPS;
  const q = query.trim().toLowerCase();
  const matches = (it) => !q || it.label.toLowerCase().includes(q) || it.type.toLowerCase().includes(q);
  return /* @__PURE__ */ jsxs3("div", { className: "lf-palette", "aria-label": "Field palette", children: [
    /* @__PURE__ */ jsxs3("h4", { children: [
      "Add field",
      intoContainer ? ` \u2192 into ${labelOf(sel)}` : ""
    ] }),
    /* @__PURE__ */ jsx3(
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
      return /* @__PURE__ */ jsxs3("div", { className: "lf-palette-group", children: [
        /* @__PURE__ */ jsx3("h5", { className: "lf-palette-group-title", children: group }),
        visible.map((p) => /* @__PURE__ */ jsx3(
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
  return /* @__PURE__ */ jsx3(DndContext.Provider, { value: dnd, children });
}
function Canvas({ builder }) {
  const { schema } = builder;
  return /* @__PURE__ */ jsx3("div", { className: "lf-canvas", "aria-label": "Form canvas", children: schema.root.length === 0 ? /* @__PURE__ */ jsx3(RootDropzone, { empty: true }) : /* @__PURE__ */ jsx3("ol", { className: "lf-node-list", children: schema.root.map((id, i) => /* @__PURE__ */ jsx3(Node, { id, parentId: null, index: i, count: schema.root.length, builder, depth: 0 }, id)) }) });
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
  return /* @__PURE__ */ jsxs3("li", { className: "lf-node", "data-depth": depth, children: [
    /* @__PURE__ */ jsxs3(
      "div",
      {
        className: `lf-node-row${selected ? " is-selected" : ""}${over ? ` is-drop-${over}` : ""}${hidden ? " is-hidden" : ""}`,
        "data-drop": over ?? void 0,
        onDragOver: (e) => dnd.overNode(e, id, isContainer),
        onDragLeave: dnd.leave,
        onDrop: (e) => dnd.dropNode(e, id, parentId, index, isContainer),
        children: [
          /* @__PURE__ */ jsx3(
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
          /* @__PURE__ */ jsxs3("div", { className: "lf-node-body", onClick: () => builder.select(id), children: [
            /* @__PURE__ */ jsxs3("button", { type: "button", className: "lf-node-select", "aria-pressed": selected, "aria-label": `Edit ${labelOf(entity)}`, onClick: () => builder.select(id), children: [
              isContainer && /* @__PURE__ */ jsx3("span", { className: "lf-node-label", children: labelOf(entity) }),
              /* @__PURE__ */ jsx3("span", { className: "lf-node-type", children: entity.type }),
              hidden && /* @__PURE__ */ jsx3("span", { className: "lf-node-badge", children: "Hidden" })
            ] }),
            !isContainer && /* @__PURE__ */ jsx3("div", { className: "lf-node-preview", "aria-hidden": "true", children: /* @__PURE__ */ jsx3(NodePreview, { entity }) })
          ] }),
          /* @__PURE__ */ jsxs3("span", { className: "lf-node-actions", children: [
            /* @__PURE__ */ jsx3("button", { type: "button", "aria-label": `Move ${labelOf(entity)} up`, disabled: index === 0, onClick: () => builder.reorderField(parentId, index, index - 1), children: "\u2191" }),
            /* @__PURE__ */ jsx3("button", { type: "button", "aria-label": `Move ${labelOf(entity)} down`, disabled: index === count - 1, onClick: () => builder.reorderField(parentId, index, index + 1), children: "\u2193" }),
            /* @__PURE__ */ jsx3("button", { type: "button", "aria-label": `Duplicate ${labelOf(entity)}`, onClick: () => builder.duplicateField(id), children: "\u29C9" }),
            /* @__PURE__ */ jsx3("button", { type: "button", "aria-label": `Delete ${labelOf(entity)}`, onClick: () => builder.removeField(id), children: "\u2715" })
          ] })
        ]
      }
    ),
    isContainer && (children.length > 0 ? /* @__PURE__ */ jsx3("ol", { className: "lf-node-list", children: children.map((cid, i) => /* @__PURE__ */ jsx3(Node, { id: cid, parentId: id, index: i, count: children.length, builder, depth: depth + 1 }, cid)) }) : /* @__PURE__ */ jsx3(ContainerDropzone, { containerId: id, label: labelOf(entity) }))
  ] });
}
function ContainerDropzone({ containerId, label }) {
  const dnd = useDnd();
  const active = dnd.overEmpty === containerId;
  return /* @__PURE__ */ jsx3(
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
  return /* @__PURE__ */ jsx3(
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
var DndContext = createContext(null);
function useDnd() {
  const ctx = useContext(DndContext);
  if (!ctx) throw new Error("Canvas DnD context missing");
  return ctx;
}
function useCanvasDnd(builder) {
  const source = useRef2(null);
  const [over, setOver] = useState3(null);
  const [overEmpty, setOverEmpty] = useState3(null);
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
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var FormBuilder = forwardRef(function FormBuilder2({ initialSchema, onChange, extraFields, attributeEditors, settings = "panel", aside, className }, ref) {
  const b = useFormBuilder(initialSchema);
  useImperativeHandle(ref, () => ({ setSchema: b.setSchema, getSchema: () => b.schema }), [b.setSchema, b.schema]);
  const [showPreview, setShowPreview] = useState4(false);
  const editors = useMemo2(() => mergeAttributeEditors(createDefaultAttributeEditors(), attributeEditors), [attributeEditors]);
  const modal = settings === "modal";
  const onChangeRef = useRef3(onChange);
  onChangeRef.current = onChange;
  const mounted = useRef3(false);
  useEffect2(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onChangeRef.current?.(b.schema);
  }, [b.schema]);
  return /* @__PURE__ */ jsxs4("div", { className: `lf-builder ${className ?? ""}`, children: [
    /* @__PURE__ */ jsxs4("div", { className: "lf-builder-toolbar", children: [
      /* @__PURE__ */ jsx4("button", { type: "button", onClick: b.undo, disabled: !b.canUndo, "aria-label": "Undo", children: "Undo" }),
      /* @__PURE__ */ jsx4("button", { type: "button", onClick: b.redo, disabled: !b.canRedo, "aria-label": "Redo", children: "Redo" }),
      /* @__PURE__ */ jsx4("button", { type: "button", onClick: () => setShowPreview((p) => !p), "aria-pressed": showPreview, children: showPreview ? "Edit" : "Preview" }),
      /* @__PURE__ */ jsx4(ProblemsBadge, { builder: b })
    ] }),
    showPreview ? /* @__PURE__ */ jsx4("div", { className: "lf-builder-preview", "data-testid": "preview", children: /* @__PURE__ */ jsx4(FormRenderer, { schema: b.schema }) }) : /* @__PURE__ */ jsxs4(CanvasDndProvider, { builder: b, children: [
      /* @__PURE__ */ jsxs4("div", { className: `lf-builder-body${modal ? " lf-builder-body--modal" : ""}${modal && aside ? " lf-builder-body--aside" : ""}`, children: [
        /* @__PURE__ */ jsx4(Palette, { builder: b, extra: extraFields }),
        /* @__PURE__ */ jsx4(Canvas, { builder: b }),
        modal ? aside && /* @__PURE__ */ jsx4("aside", { className: "lf-builder-aside", children: aside }) : /* @__PURE__ */ jsx4(SettingsPanel, { builder: b, editors })
      ] }),
      modal && /* @__PURE__ */ jsx4(SettingsModal, { builder: b, editors })
    ] }),
    /* @__PURE__ */ jsx4(Problems, { builder: b })
  ] });
});
function SettingsModal({ builder, editors }) {
  const id = builder.selectedId;
  const entity = id ? builder.schema.entities[id] : void 0;
  const open = Boolean(id && entity);
  const dialogRef = useRef3(null);
  const select = builder.select;
  useEffect2(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") select(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, select]);
  useEffect2(() => {
    if (open) dialogRef.current?.focus();
  }, [open, id]);
  if (!open) return null;
  return createPortal(
    /* @__PURE__ */ jsx4(
      "div",
      {
        className: "lf-modal-overlay lf-builder",
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) builder.select(null);
        },
        children: /* @__PURE__ */ jsxs4("div", { ref: dialogRef, className: "lf-modal", role: "dialog", "aria-modal": "true", "aria-label": "Field settings", tabIndex: -1, children: [
          /* @__PURE__ */ jsxs4("div", { className: "lf-modal-header", children: [
            /* @__PURE__ */ jsx4("span", { className: "lf-modal-title", children: "Field settings" }),
            /* @__PURE__ */ jsx4("button", { type: "button", className: "lf-modal-close", "aria-label": "Close settings", onClick: () => builder.select(null), children: "\u2715" })
          ] }),
          /* @__PURE__ */ jsx4("div", { className: "lf-modal-body", children: /* @__PURE__ */ jsx4(SettingsPanel, { builder, editors }) })
        ] })
      }
    ),
    document.body
  );
}
function ProblemsBadge({ builder }) {
  const n = builder.problems.length;
  if (n === 0) return /* @__PURE__ */ jsx4("span", { className: "lf-problems-badge is-ok", children: "No problems" });
  return /* @__PURE__ */ jsxs4("span", { className: `lf-problems-badge${builder.hasErrors ? " is-error" : " is-warning"}`, children: [
    n,
    " problem",
    n === 1 ? "" : "s"
  ] });
}
function Problems({ builder }) {
  if (builder.problems.length === 0) return null;
  return /* @__PURE__ */ jsx4("div", { className: "lf-problems", role: "region", "aria-label": "Problems", children: /* @__PURE__ */ jsx4("ul", { children: builder.problems.map((d, i) => /* @__PURE__ */ jsx4("li", { className: `lf-problem is-${d.severity}`, children: /* @__PURE__ */ jsxs4("button", { type: "button", disabled: !d.entityId, onClick: () => d.entityId && builder.select(d.entityId), children: [
    /* @__PURE__ */ jsx4("span", { className: "lf-problem-code", children: d.code }),
    " ",
    d.message
  ] }) }, i)) }) });
}

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