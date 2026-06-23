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
  FormErrorBoundary: () => FormErrorBoundary,
  FormRenderer: () => FormRenderer,
  LocaleProvider: () => LocaleProvider,
  MinionProvider: () => MinionProvider,
  VERSION: () => VERSION,
  printSubmission: () => printSubmission,
  useFormEngine: () => useFormEngine,
  useMinionClient: () => useMinionClient,
  useMinionData: () => useMinionData,
  useTranslate: () => useTranslate
});
module.exports = __toCommonJS(index_exports);

// src/useFormEngine.ts
var import_react = require("react");
var import_form_core = require("@lukeflow/form-core");
function useFormEngine(schema, options2) {
  const engineRef = (0, import_react.useRef)(null);
  const schemaRef = (0, import_react.useRef)(null);
  if (engineRef.current === null || schemaRef.current !== schema) {
    engineRef.current = (0, import_form_core.createFormEngine)().init(schema, options2);
    schemaRef.current = schema;
  }
  const engine = engineRef.current;
  const [state, setState] = (0, import_react.useState)(() => engine.getState());
  const sync = (0, import_react.useCallback)(() => setState(engine.getState()), [engine]);
  const update = (0, import_react.useCallback)(
    (key, value) => {
      engine.update(key, value);
      sync();
    },
    [engine, sync]
  );
  const setValues = (0, import_react.useCallback)(
    (values, opts) => {
      engine.setValues(values, opts);
      sync();
    },
    [engine, sync]
  );
  const validate = (0, import_react.useCallback)(
    (fields) => {
      const report = engine.validate(fields);
      sync();
      return report;
    },
    [engine, sync]
  );
  const reset = (0, import_react.useCallback)(() => {
    engine.reset();
    sync();
  }, [engine, sync]);
  const getField = (0, import_react.useCallback)((key) => engine.getField(key), [engine]);
  const collect = (0, import_react.useCallback)(() => engine.collect(), [engine]);
  const getScope = (0, import_react.useCallback)(() => engine.getScope(), [engine]);
  const getDiagnostics = (0, import_react.useCallback)(() => engine.getDiagnostics(), [engine]);
  return { state, getField, update, setValues, validate, reset, collect, getScope, getDiagnostics, engine };
}

// src/FormRenderer.tsx
var import_react5 = require("react");
var import_react_dom = require("react-dom");
var import_form_core3 = require("@lukeflow/form-core");

// src/minions.tsx
var import_react2 = require("react");
var import_form_core2 = require("@lukeflow/form-core");
var import_jsx_runtime = require("react/jsx-runtime");
var MinionContext = (0, import_react2.createContext)(null);
function MinionProvider({ client, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MinionContext.Provider, { value: client, children });
}
function useMinionClient() {
  return (0, import_react2.useContext)(MinionContext);
}
var IDLE = { options: [], data: void 0, loading: false, error: null };
function useMinionData(entity, scope) {
  const client = useMinionClient();
  const ds = (0, import_form_core2.readDataSource)(entity.attributes);
  const params = ds ? (0, import_form_core2.resolveMinionParams)(ds, scope) : null;
  const key = ds ? JSON.stringify({ m: ds.minion, p: params }) : "";
  const [state, setState] = (0, import_react2.useState)(IDLE);
  (0, import_react2.useEffect)(() => {
    if (!client || !ds) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    client.request(ds.minion, params ?? {}, controller.signal).then((res) => {
      if (!controller.signal.aborted) setState({ options: (0, import_form_core2.toOptions)(res, ds), data: res, loading: false, error: null });
    }).catch((err) => {
      if (!controller.signal.aborted) {
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return () => controller.abort();
  }, [client, key]);
  return state;
}

// src/i18n.tsx
var import_react3 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var identity = (s) => s;
var LocaleContext = (0, import_react3.createContext)(identity);
function LocaleProvider({
  messages,
  t,
  children
}) {
  const fn = t ?? (messages ? (s) => messages[s] ?? s : identity);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(LocaleContext.Provider, { value: fn, children });
}
function useTranslate() {
  return (0, import_react3.useContext)(LocaleContext);
}

// src/errorBoundary.tsx
var import_react4 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var FormErrorBoundary = class extends import_react4.Component {
  constructor() {
    super(...arguments);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }
  render() {
    if (this.state.error) {
      return this.props.fallback ?? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { role: "alert", className: "lf-error lf-form-error", children: "Something went wrong displaying this form." });
    }
    return this.props.children;
  }
};

// src/FormRenderer.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function scrollOptionIntoView(id) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  try {
    el?.scrollIntoView({ block: "nearest" });
  } catch {
  }
}
function XGlyph() {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "lf-x", viewBox: "0 0 24 24", width: "12", height: "12", "aria-hidden": "true", focusable: "false", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M18 6L6 18M6 6l12 12", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function FormRenderer(props) {
  const { schema, initialValues, onSubmit, onChange, readOnly = false, registry, components, restore, onAutosave, autosaveDelay = 800, submitLabel = "Submit", theme, onEvent, errorFallback, onResult, autoSubmitSignal, playback, className } = props;
  const formClass = ["lf-form", className].filter(Boolean).join(" ");
  const engineOptions = { initialValues, registry, restore };
  const form = useFormEngine(schema, engineOptions);
  const [submitted, setSubmitted] = (0, import_react5.useState)(false);
  const client = useMinionClient();
  const [asyncErrors, setAsyncErrors] = (0, import_react5.useState)({});
  const onAutosaveRef = (0, import_react5.useRef)(onAutosave);
  onAutosaveRef.current = onAutosave;
  const autosaveTimer = (0, import_react5.useRef)(null);
  const flushAutosave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = null;
    onAutosaveRef.current?.(form.engine.serialize());
  };
  const scheduleAutosave = () => {
    if (!onAutosaveRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(flushAutosave, autosaveDelay);
  };
  (0, import_react5.useEffect)(() => () => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      onAutosaveRef.current?.(form.engine.serialize());
    }
  }, [form.engine]);
  const focusFirstError = (0, import_react5.useCallback)(
    (errorKeys) => {
      const firstKey = errorKeys[0];
      const id = firstKey ? form.getField(firstKey)?.entityId : void 0;
      if (id && typeof document !== "undefined") {
        requestAnimationFrame(() => document.getElementById(id)?.focus());
      }
    },
    [form]
  );
  const submitProgrammatic = (0, import_react5.useCallback)(() => {
    setSubmitted(true);
    const report = form.validate();
    onResult?.({ ok: report.ok, errorCount: report.errorKeys.length, errorKeys: report.errorKeys });
    if (report.ok) {
      const data = form.collect();
      onEvent?.({ type: "submit", data });
      onSubmit?.(data);
    } else {
      onEvent?.({ type: "invalid", errorKeys: report.errorKeys });
      focusFirstError(report.errorKeys);
    }
  }, [form, onResult, onEvent, onSubmit, focusFirstError]);
  (0, import_react5.useEffect)(() => {
    if (autoSubmitSignal) submitProgrammatic();
  }, [autoSubmitSignal]);
  const playbackSignal = playback?.signal;
  (0, import_react5.useEffect)(() => {
    if (!playback || !playbackSignal) return;
    let cancelled = false;
    const speed = playback.speed ?? 80;
    void (async () => {
      for (const step of playback.steps) {
        if (cancelled) return;
        form.update(step.key, step.value);
        await new Promise((r) => setTimeout(r, speed));
      }
      if (!cancelled) submitProgrammatic();
    })();
    return () => {
      cancelled = true;
    };
  }, [playbackSignal]);
  const reg = registry ?? (0, import_form_core3.createDefaultFieldTypeRegistry)();
  const comps = components ?? {};
  const t = useTranslate();
  const ctx = { form, reg, readOnly, showErrors: submitted, asyncErrors, components: comps, t, scope: form.getScope() };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    const sync = form.validate();
    onResult?.({ ok: sync.ok, errorCount: sync.errorKeys.length, errorKeys: sync.errorKeys });
    if (!sync.ok) {
      onEvent?.({ type: "invalid", errorKeys: sync.errorKeys });
      focusFirstError(sync.errorKeys);
      return;
    }
    const errs = await runAsyncValidations(schema, form, client);
    setAsyncErrors(errs);
    if (Object.keys(errs).length === 0) {
      const data = form.collect();
      onEvent?.({ type: "submit", data });
      onSubmit?.(data);
    } else {
      onEvent?.({ type: "async-invalid", errorKeys: Object.keys(errs) });
    }
  };
  const ctxWithChange = {
    ...ctx,
    form: {
      ...form,
      update: (key, value) => {
        form.update(key, value);
        if (Object.keys(asyncErrors).length) setAsyncErrors({});
        if (onChange) onChange(form.collect(), form.engine.getState());
        scheduleAutosave();
      }
    }
  };
  const pages = wizardPages(schema);
  const content = pages ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    FormWizardView,
    {
      pages,
      schema,
      form: ctxWithChange.form,
      reg,
      components: comps,
      readOnly,
      submitLabel,
      className: formClass,
      theme,
      onSubmit,
      onEvent
    }
  ) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("form", { noValidate: true, className: formClass, style: theme, onSubmit: handleSubmit, children: [
    schema.root.map((id) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RenderEntity, { id, schema, ctx: ctxWithChange }, id)),
    submitLabel !== null && !readOnly && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "submit", className: "lf-submit", children: t(submitLabel) })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(FormErrorBoundary, { fallback: errorFallback, onError: (error) => onEvent?.({ type: "error", error }), children: content });
}
function FormWizardView({
  pages,
  schema,
  form,
  reg,
  components,
  readOnly,
  submitLabel,
  className,
  theme,
  onSubmit,
  onEvent
}) {
  const [index, setIndex] = (0, import_react5.useState)(0);
  const [showErrors, setShowErrors] = (0, import_react5.useState)(false);
  const t = useTranslate();
  const pageRef = (0, import_react5.useRef)(null);
  const firstRender = (0, import_react5.useRef)(true);
  const visible = pages.filter((id) => form.state.fields[id]?.isVisible !== false);
  const safeIndex = Math.min(index, Math.max(0, visible.length - 1));
  const currentId = visible[safeIndex];
  const isLast = safeIndex >= visible.length - 1;
  (0, import_react5.useEffect)(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    pageRef.current?.focus();
  }, [safeIndex]);
  const ctx = { form, reg, readOnly, showErrors, asyncErrors: {}, components, t, scope: form.getScope() };
  const next = () => {
    if (!currentId) return;
    if (form.validate(pageFieldKeys(schema, currentId, form)).ok) {
      setShowErrors(false);
      setIndex(safeIndex + 1);
    } else {
      setShowErrors(true);
    }
  };
  const back = () => {
    setShowErrors(false);
    setIndex(Math.max(0, safeIndex - 1));
  };
  const submit = (e) => {
    e.preventDefault();
    const report = form.validate();
    if (report.ok) {
      setShowErrors(false);
      const data = form.collect();
      onEvent?.({ type: "submit", data });
      onSubmit?.(data);
    } else {
      setShowErrors(true);
      onEvent?.({ type: "invalid", errorKeys: report.errorKeys });
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("form", { noValidate: true, className, style: theme, onSubmit: submit, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ol", { className: "lf-wizard-steps", "aria-label": "Steps", children: visible.map((id, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("li", { className: i === safeIndex ? "is-active" : "", "aria-current": i === safeIndex ? "step" : void 0, children: t(pageLabel(schema, id, i)) }, id)) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { ref: pageRef, tabIndex: -1, className: "lf-wizard-page", role: "group", "aria-label": currentId ? pageLabel(schema, currentId, safeIndex) : "Page", children: currentId && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RenderEntity, { id: currentId, schema, ctx }) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-wizard-nav", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-wizard-back", onClick: back, disabled: safeIndex === 0, children: t("Back") }),
      !isLast && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-wizard-next", onClick: next, children: t("Next") }),
      isLast && submitLabel !== null && !readOnly && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "submit", className: "lf-submit", children: t(submitLabel) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "lf-wizard-progress", children: [
        t("Step"),
        " ",
        safeIndex + 1,
        " ",
        t("of"),
        " ",
        visible.length
      ] })
    ] })
  ] });
}
function RenderEntity({ id, schema, ctx }) {
  const entity = schema.entities[id];
  if (!entity) return null;
  const fs = ctx.form.state.fields[id];
  if (fs && !fs.isVisible) return null;
  const ft = ctx.reg.get(entity.type);
  if (ft?.isGrid)
    return entity.type === "editGrid" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(EditGridField, { entity, fs, ctx, schema }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(GridField, { entity, fs, ctx, schema });
  if (ft?.isStatic) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Static, { entity });
  if (ft?.isContainer) {
    if (entity.type === "tabs") return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TabsContainer, { entity, schema, ctx });
    if (entity.type === "panel" || entity.type === "well" || entity.type === "fieldset")
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(PanelBox, { entity, schema, ctx });
    const cols = entity.type === "table" ? Math.min(6, Math.max(1, Number(entity.attributes?.numColumns) || 2)) : void 0;
    const childStyle = cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : void 0;
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-container", "data-type": entity.type, children: [
      labelText(entity.attributes) && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-container-label", children: labelText(entity.attributes) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-container-children", style: childStyle, children: (entity.children ?? []).map((cid) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RenderEntity, { id: cid, schema, ctx }, cid)) })
    ] });
  }
  if (!fs) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { entity, fs, ctx });
}
function Field({ entity, fs, ctx }) {
  const a = entity.attributes ?? {};
  const id = entity.id;
  const key = fs.key;
  const live = useMinionData(entity, ctx.scope);
  const fieldOptions = live.options.length ? live.options : options(a);
  const disabled = fs.isDisabled || ctx.readOnly;
  const error = ctx.showErrors ? fs.error : null;
  const errId = error ? `${id}-error` : void 0;
  const descId = labelText(a, "description") ? `${id}-desc` : void 0;
  const set = (value) => ctx.form.update(key, value);
  const a11y = {
    id,
    name: key,
    disabled,
    "aria-invalid": error ? true : void 0,
    "aria-required": fs.isRequired ? true : void 0,
    "aria-describedby": [descId, errId].filter(Boolean).join(" ") || void 0
  };
  const ph = typeof a.placeholder === "string" ? a.placeholder : void 0;
  const inputProps = {};
  if (ph) inputProps.placeholder = ph;
  if (typeof a.maxLength === "number") inputProps.maxLength = a.maxLength;
  if (typeof a.minLength === "number") inputProps.minLength = a.minLength;
  if (typeof a.pattern === "string" && a.pattern) inputProps.pattern = a.pattern;
  if (a.autocomplete) inputProps.autoComplete = typeof a.autocompleteToken === "string" ? a.autocompleteToken : "on";
  if (typeof a.tabIndex === "number") inputProps.tabIndex = a.tabIndex;
  if (a.spellcheck !== void 0) inputProps.spellCheck = Boolean(a.spellcheck);
  if (a.autofocus) inputProps.autoFocus = true;
  const numProps = {};
  if (typeof a.min === "number") numProps.min = a.min;
  if (typeof a.max === "number") numProps.max = a.max;
  const Custom = ctx.components[entity.type];
  if (!Custom && entity.type === "radio") {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Group, { entity, fs, ctx, children: fieldOptions.map((o) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "lf-option", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "input",
        {
          type: "radio",
          name: key,
          value: o.value,
          checked: String(fs.value ?? "") === o.value,
          disabled,
          onChange: () => set(o.value)
        }
      ),
      ctx.t(o.label)
    ] }, o.value)) });
  }
  if (!Custom && entity.type === "selectBoxes") {
    const selected = new Set((Array.isArray(fs.value) ? fs.value : []).map(String));
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Group, { entity, fs, ctx, children: fieldOptions.map((o) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "lf-option", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "input",
        {
          type: "checkbox",
          value: o.value,
          checked: selected.has(o.value),
          disabled,
          onChange: (e) => {
            const next = new Set(selected);
            if (e.target.checked) next.add(o.value);
            else next.delete(o.value);
            set([...next]);
          }
        }
      ),
      ctx.t(o.label)
    ] }, o.value)) });
  }
  let control;
  if (Custom) {
    control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Custom, { entity, field: fs, value: fs.value, setValue: set, disabled, error: error?.message ?? null, id });
  } else
    switch (entity.type) {
      case "checkbox":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { type: "checkbox", ...a11y, checked: Boolean(fs.value), onChange: (e) => set(e.target.checked) });
        break;
      case "textarea":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "textarea",
          {
            ...a11y,
            ...inputProps,
            className: a.autoExpand ? "lf-autoexpand" : void 0,
            rows: typeof a.rows === "number" ? a.rows : void 0,
            value: asText(fs.value),
            onChange: (e) => set(e.target.value)
          }
        );
        break;
      case "select":
        control = a.searchable && (0, import_form_core3.readDataSource)(a) ? (
          // Searchable + Minion-backed → server-side type-ahead (re-queries as you type),
          // so a value beyond the first page is still findable (unlike a static filter).
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SearchSelect, { a11y, entity, value: fs.value, setValue: set, scope: ctx.scope, disabled, placeholder: ph })
        ) : a.searchable ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SearchableSelect, { a11y, options: fieldOptions, value: fs.value, setValue: set, placeholder: ph, required: fs.isRequired, disabled, t: ctx.t }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { ...a11y, value: asText(fs.value), onChange: (e) => set(e.target.value), children: [
          !fs.isRequired && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: ph ?? "" }),
          fieldOptions.map((o) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: o.value, children: ctx.t(o.label) }, o.value))
        ] });
        break;
      case "number":
      case "currency":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          NumberInput,
          {
            a11y,
            extra: { ...inputProps, ...numProps },
            value: fs.value,
            currency: entity.type === "currency" ? typeof a.currency === "string" ? a.currency : typeof a.currencyCode === "string" ? a.currencyCode : "USD" : void 0,
            prefix: typeof a.prefix === "string" ? a.prefix : void 0,
            suffix: typeof a.suffix === "string" ? a.suffix : void 0,
            onChange: set
          }
        );
        break;
      case "searchSelect":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SearchSelect, { a11y, entity, value: fs.value, setValue: set, scope: ctx.scope, disabled, placeholder: ph });
        break;
      case "tags":
      case "tagsField":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TagsInput, { a11y, value: asArray(fs.value), disabled, onChange: set, placeholder: ph });
        break;
      case "file":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(FileField, { a11y, multiple: Boolean(a.multiple), value: fs.value, disabled, onChange: set, entity, scope: ctx.scope });
        break;
      case "signature":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SignatureField, { a11y, value: fs.value, disabled, onChange: set, penColor: typeof a.penColor === "string" ? a.penColor : void 0 });
        break;
      default:
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          TextControl,
          {
            type: inputType(entity.type),
            a11y,
            extra: inputProps,
            mask: typeof a.inputMask === "string" ? a.inputMask : "",
            clearable: Boolean(a.clearable) && !disabled,
            value: fs.value,
            onChange: set
          }
        );
    }
  const labelPos = a.labelPosition === "left" || a.labelPosition === "right" ? a.labelPosition : "top";
  const hideLabel = Boolean(a.hideLabel);
  const fieldClass = ["lf-field", typeof a.customClass === "string" ? a.customClass : ""].filter(Boolean).join(" ");
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: fieldClass, "data-type": entity.type, "data-label-position": labelPos, "data-hide-label": hideLabel || void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { htmlFor: id, className: `lf-label${hideLabel ? " lf-sr-only" : ""}`, children: [
      ctx.t(labelText(a) ?? key),
      fs.isRequired && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-hidden": "true", children: " *" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tooltip, { text: tooltipText(a) })
    ] }),
    control,
    (Boolean(a.showCharCount) || Boolean(a.showWordCount)) && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { className: "lf-count", "aria-live": "off", children: [
      a.showCharCount ? `${asText(fs.value).length} characters` : "",
      a.showCharCount && a.showWordCount ? " \xB7 " : "",
      a.showWordCount ? `${wordCount(asText(fs.value))} words` : ""
    ] }),
    descId && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { id: descId, className: "lf-desc", children: ctx.t(labelText(a, "description")) }),
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { id: errId, role: "alert", className: "lf-error", children: ctx.t(error.message ?? "") }),
    !error && ctx.asyncErrors[key] && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "alert", className: "lf-error lf-error-async", children: ctx.t(ctx.asyncErrors[key]) })
  ] });
}
async function runAsyncValidations(schema, form, client) {
  if (!client) return {};
  const scope = form.getScope();
  const checks = [];
  for (const [id, fs] of Object.entries(form.state.fields)) {
    if (!fs.isVisible) continue;
    const av = (0, import_form_core3.readAsyncValidation)(schema.entities[id]?.attributes);
    if (!av) continue;
    checks.push(
      (0, import_form_core3.runAsyncValidation)(av, scope, fs.value, client).then((r) => [fs.key, r.valid ? null : r.message ?? "Invalid"]).catch(() => [fs.key, null])
    );
  }
  const errs = {};
  for (const [key, msg] of await Promise.all(checks)) if (msg) errs[key] = msg;
  return errs;
}
function Group({
  entity,
  fs,
  ctx,
  children
}) {
  const error = ctx.showErrors ? fs.error : null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("fieldset", { className: "lf-field lf-group", "data-type": entity.type, "aria-invalid": error ? true : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("legend", { className: "lf-label", children: [
      labelText(entity.attributes) ?? fs.key,
      fs.isRequired && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-hidden": "true", children: " *" })
    ] }),
    children,
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "alert", className: "lf-error", children: error.message })
  ] });
}
function GridField({
  entity,
  fs,
  ctx,
  schema
}) {
  const [page, setPage] = (0, import_react5.useState)(0);
  if (!fs) return null;
  const key = fs.key;
  const rows = Array.isArray(fs.value) ? fs.value : [];
  const cells = childFields(entity, schema);
  const disabled = ctx.readOnly;
  const error = ctx.showErrors ? fs.error : null;
  const top = ctx.scope;
  const hasAggregates = cells.some((c) => typeof c.attributes?.aggregate === "string");
  const pageSize = Number(entity.attributes?.pageSize) || 0;
  const paged = pageSize > 0 && rows.length > pageSize;
  const pageCount = paged ? Math.ceil(rows.length / pageSize) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const start = paged ? safePage * pageSize : 0;
  const visibleRows = paged ? rows.slice(start, start + pageSize) : rows;
  const replace = (next) => ctx.form.setValues({ [key]: next }, { markTouched: true });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-grid", "data-type": entity.type, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-container-label", children: labelText(entity.attributes) ?? key }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("table", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
        cells.map((c) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { scope: "col", children: labelText(c.attributes) ?? cellKey(c) }, c.id)),
        !disabled && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", {})
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("tbody", { children: visibleRows.map((row, j) => {
        const i = start + j;
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
          cells.map((c) => {
            const ck = cellKey(c);
            const path = `${key}[${i}].${ck}`;
            const value = row?.[ck];
            const visible = (0, import_form_core3.evaluateVisibility)(c.attributes, { ...top, ...row });
            return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: visible && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(GridCell, { type: c.type, value, disabled, options: options(c.attributes), onChange: (v) => ctx.form.update(path, v), "aria-label": `${labelText(c.attributes) ?? ck} row ${i + 1}` }) }, c.id);
          }),
          !disabled && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-row-remove", onClick: () => replace(rows.filter((_, k) => k !== i)), children: "Remove" }) })
        ] }, i);
      }) }),
      hasAggregates && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("tfoot", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { className: "lf-grid-aggregates", children: [
        cells.map((c) => {
          const kind = c.attributes?.aggregate;
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: typeof kind === "string" ? aggregate(rows, cellKey(c), kind) : "" }, c.id);
        }),
        !disabled && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", {})
      ] }) })
    ] }),
    paged && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-grid-pager", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", disabled: safePage === 0, onClick: () => setPage(safePage - 1), children: "Prev" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "lf-grid-page", children: [
        "Rows ",
        start + 1,
        "\u2013",
        Math.min(start + pageSize, rows.length),
        " of ",
        rows.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", disabled: safePage >= pageCount - 1, onClick: () => setPage(safePage + 1), children: "Next" })
    ] }),
    !disabled && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-row-add", onClick: () => replace([...rows, {}]), children: "Add row" }),
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "alert", className: "lf-error", children: error.message })
  ] });
}
function GridCell({
  type,
  value,
  disabled,
  options: opts,
  onChange,
  ...rest
}) {
  if (type === "checkbox") {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { type: "checkbox", ...rest, checked: Boolean(value), disabled, onChange: (e) => onChange(e.target.checked) });
  }
  if (type === "select") {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { ...rest, value: asText(value), disabled, onChange: (e) => onChange(e.target.value), children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "" }),
      opts.map((o) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: o.value, children: o.label }, o.value))
    ] });
  }
  const numeric = type === "number" || type === "currency";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "input",
    {
      type: "text",
      inputMode: numeric ? "decimal" : void 0,
      ...rest,
      value: asText(value),
      disabled,
      onChange: (e) => onChange(e.target.value)
    }
  );
}
function Static({ entity }) {
  const a = entity.attributes ?? {};
  if (entity.type === "heading") return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { className: "lf-heading", children: labelText(a) ?? "" });
  if (entity.type === "divider" || entity.type === "hr") return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("hr", { className: "lf-divider" });
  if (entity.type === "button") {
    const action = a.buttonAction === "reset" ? "reset" : a.buttonAction === "button" ? "button" : "submit";
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: action, className: "lf-button", "data-action": action, children: labelText(a) ?? "Submit" });
  }
  if (entity.type === "content" || entity.type === "html" || entity.type === "htmlElement") {
    const html = typeof a.content === "string" ? a.content : "";
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-content", "data-type": entity.type, dangerouslySetInnerHTML: { __html: html } });
  }
  const text = labelText(a) ?? labelText(a, "content") ?? "";
  if (!text) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-static", "data-type": entity.type, children: text });
}
var PANEL_THEMES = /* @__PURE__ */ new Set(["default", "primary", "secondary", "info", "success", "warning", "danger"]);
function PanelBox({ entity, schema, ctx }) {
  const a = entity.attributes ?? {};
  const collapsible = Boolean(a.collapsible);
  const [open, setOpen] = (0, import_react5.useState)(!(collapsible && a.collapsed));
  const raw = typeof a.theme === "string" ? a.theme : "";
  const theme = PANEL_THEMES.has(raw) ? raw : "default";
  const title = labelText(a);
  const bodyId = `${entity.id}-panel-body`;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: `lf-container lf-panel lf-panel--${theme}`, "data-type": entity.type, "data-collapsed": collapsible && !open ? "" : void 0, children: [
    collapsible ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { type: "button", className: "lf-panel-head", "aria-expanded": open, "aria-controls": bodyId, onClick: () => setOpen((o) => !o), children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-panel-caret", "aria-hidden": "true", children: open ? "\u25BE" : "\u25B8" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-panel-title", children: title ? ctx.t(title) : ctx.t("Panel") })
    ] }) : title && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-panel-head", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-panel-title", children: ctx.t(title) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { id: bodyId, className: "lf-container-children lf-panel-body", hidden: !open, children: (entity.children ?? []).map((cid) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RenderEntity, { id: cid, schema, ctx }, cid)) })
  ] });
}
function TabsContainer({ entity, schema, ctx }) {
  const children = entity.children ?? [];
  const [active, setActive] = (0, import_react5.useState)(0);
  const idx = Math.min(active, Math.max(0, children.length - 1));
  if (children.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-container lf-tabs", "data-type": "tabs" });
  const tabId = (i) => `${entity.id}-tab-${i}`;
  const panelId = (i) => `${entity.id}-panel-${i}`;
  const tabLabel = (cid, i) => {
    const c = schema.entities[cid];
    const l = c && typeof c.attributes?.label === "string" && c.attributes.label ? c.attributes.label : `Tab ${i + 1}`;
    return ctx.t(l);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-container lf-tabs", "data-type": "tabs", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-tabs-nav", role: "tablist", children: children.map((cid, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "button",
      {
        type: "button",
        role: "tab",
        id: tabId(i),
        "aria-selected": i === idx,
        "aria-controls": panelId(i),
        className: `lf-tab${i === idx ? " is-active" : ""}`,
        onClick: () => setActive(i),
        children: tabLabel(cid, i)
      },
      cid
    )) }),
    children.map((cid, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { role: "tabpanel", id: panelId(i), "aria-labelledby": tabId(i), hidden: i !== idx, className: "lf-tabpanel", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RenderEntity, { id: cid, schema, ctx }) }, cid))
  ] });
}
function labelText(a, attr = "label") {
  const v = a?.[attr];
  return typeof v === "string" && v ? v : void 0;
}
function asText(value) {
  return value == null ? "" : String(value);
}
function inputType(type) {
  switch (type) {
    case "email":
      return "email";
    case "url":
      return "url";
    case "password":
      return "password";
    case "phoneNumber":
      return "tel";
    case "day":
      return "date";
    case "time":
      return "time";
    case "datetime":
      return "datetime-local";
    default:
      return "text";
  }
}
function options(a) {
  const raw = a?.options ?? a?.values ?? a?.data?.values ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => {
    if (typeof o === "string") return { label: o, value: o };
    const obj = o;
    const value = String(obj.value ?? "");
    return { label: typeof obj.label === "string" ? obj.label : value, value };
  });
}
function childFields(entity, schema) {
  return (entity.children ?? []).map((id) => schema.entities[id]).filter((e) => Boolean(e));
}
function cellKey(e) {
  const k = e.attributes?.key;
  return typeof k === "string" && k ? k : e.id;
}
function aggregate(rows, ck, kind) {
  if (kind === "count") return String(rows.length);
  const nums = rows.map((r) => Number(r?.[ck])).filter((n) => !Number.isNaN(n));
  if (kind !== "count" && nums.length === 0) return "";
  switch (kind) {
    case "sum":
      return String(nums.reduce((a, b) => a + b, 0));
    case "avg":
      return String(nums.reduce((a, b) => a + b, 0) / nums.length);
    case "min":
      return String(Math.min(...nums));
    case "max":
      return String(Math.max(...nums));
    default:
      return "";
  }
}
function wizardPages(schema) {
  const root = schema.root ?? [];
  if (root.length === 1) {
    const only = root[0] ? schema.entities[root[0]] : void 0;
    if (only?.type === "wizard") {
      const pages2 = (only.children ?? []).filter((c) => schema.entities[c]?.type === "page");
      if (pages2.length) return pages2;
    }
  }
  const pages = root.filter((id) => schema.entities[id]?.type === "page");
  return pages.length > 0 && pages.length === root.length ? pages : null;
}
function pageLabel(schema, id, index) {
  return labelText(schema.entities[id]?.attributes) ?? `Step ${index + 1}`;
}
function pageFieldKeys(schema, pageId, form) {
  const out = [];
  const seen = /* @__PURE__ */ new Set([pageId]);
  const stack = [...schema.entities[pageId]?.children ?? []];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const key = form.state.fields[id]?.key;
    if (key) out.push(key);
    for (const c of schema.entities[id]?.children ?? []) stack.push(c);
  }
  return out;
}
function tooltipText(a) {
  const v = a?.tooltip;
  return typeof v === "string" && v ? v : void 0;
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function Tooltip({ text }) {
  const ref = (0, import_react5.useRef)(null);
  const [anchor, setAnchor] = (0, import_react5.useState)(null);
  (0, import_react5.useEffect)(() => {
    if (!anchor || typeof window === "undefined") return;
    const dismiss = () => setAnchor(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [anchor]);
  if (!text) return null;
  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  const hide = () => setAnchor(null);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { ref, className: "lf-tooltip", tabIndex: 0, role: "img", "aria-label": `Help: ${text}`, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-tooltip-icon", "aria-hidden": "true", children: "i" }),
    anchor && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TooltipBubble, { text, anchor })
  ] });
}
function TooltipBubble({ text, anchor }) {
  const ref = (0, import_react5.useRef)(null);
  const [box, setBox] = (0, import_react5.useState)(null);
  (0, import_react5.useLayoutEffect)(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const b = el.getBoundingClientRect();
    const M = 8;
    let place = "top";
    let top = anchor.top - b.height - 10;
    if (top < M) {
      place = "bottom";
      top = anchor.bottom + 10;
    }
    let left = anchor.cx - b.width / 2;
    left = Math.max(M, Math.min(left, window.innerWidth - b.width - M));
    let arrow = anchor.cx - left;
    if (arrow > b.width - 12) {
      left += arrow - (b.width - 12);
      arrow = b.width - 12;
    } else if (arrow < 12) {
      left -= 12 - arrow;
      arrow = 12;
    }
    setBox({ left, top, place, arrow });
  }, [anchor, text]);
  return (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "span",
      {
        ref,
        className: `lf-tooltip-bubble--portal is-${box?.place ?? "top"}`,
        role: "tooltip",
        style: { position: "fixed", left: box?.left ?? anchor.cx, top: box?.top ?? anchor.top, visibility: box ? "visible" : "hidden" },
        children: [
          text,
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-tooltip-arrow", style: { left: box?.arrow ?? 0 } })
        ]
      }
    ),
    document.body
  );
}
function SearchSelect({
  a11y,
  entity,
  value,
  setValue,
  scope,
  disabled,
  placeholder
}) {
  const client = useMinionClient();
  const ds = (0, import_form_core3.readDataSource)(entity.attributes);
  const dsRaw = entity.attributes?.dataSource;
  const searchParam = typeof dsRaw?.searchParam === "string" ? dsRaw.searchParam : "q";
  const [query, setQuery] = (0, import_react5.useState)("");
  const [open, setOpen] = (0, import_react5.useState)(false);
  const [options2, setOptions] = (0, import_react5.useState)([]);
  const [loading, setLoading] = (0, import_react5.useState)(false);
  const [selectedLabel, setSelectedLabel] = (0, import_react5.useState)("");
  const [active, setActive] = (0, import_react5.useState)(-1);
  const timer = (0, import_react5.useRef)(null);
  const blurTimer = (0, import_react5.useRef)(null);
  const clearBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };
  (0, import_react5.useEffect)(() => () => clearBlur(), []);
  const choose = (o) => {
    clearBlur();
    setValue(o.value);
    setSelectedLabel(o.label);
    setQuery("");
    setOpen(false);
    setActive(-1);
  };
  const optionId = (i) => `${a11y.id}-opt-${i}`;
  (0, import_react5.useEffect)(() => {
    if (open && active >= 0) scrollOptionIntoView(optionId(active));
  }, [active, open]);
  (0, import_react5.useEffect)(() => {
    if (!client || !ds || !open) return;
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController();
    timer.current = setTimeout(() => {
      setLoading(true);
      client.request(ds.minion, { ...(0, import_form_core3.resolveMinionParams)(ds, scope), [searchParam]: query }, controller.signal).then((res) => {
        if (!controller.signal.aborted) setOptions((0, import_form_core3.toOptions)(res, ds));
      }).catch(() => {
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 200);
    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, open, client]);
  const display = open ? query : selectedLabel || asText(value);
  const listId = `${a11y.id}-listbox`;
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options2.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && options2[active]) {
        e.preventDefault();
        choose(options2[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-search-select", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "input",
      {
        ...a11y,
        role: "combobox",
        "aria-expanded": open,
        "aria-controls": listId,
        "aria-autocomplete": "list",
        "aria-activedescendant": open && active >= 0 ? optionId(active) : void 0,
        autoComplete: "off",
        placeholder,
        value: display,
        disabled,
        onFocus: () => {
          clearBlur();
          setOpen(true);
        },
        onChange: (e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        },
        onKeyDown,
        onBlur: () => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }
      }
    ),
    open && (loading || options2.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("ul", { id: listId, role: "listbox", className: "lf-search-list", children: [
      loading && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("li", { className: "lf-search-loading", children: "Searching\u2026" }),
      options2.map((o, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "li",
        {
          id: optionId(i),
          role: "option",
          "aria-selected": i === active,
          className: i === active ? "is-active" : void 0,
          onMouseDown: (e) => {
            e.preventDefault();
            choose(o);
          },
          children: o.label
        },
        o.value
      ))
    ] })
  ] });
}
function SearchableSelect({
  a11y,
  options: options2,
  value,
  setValue,
  placeholder,
  required,
  disabled,
  t
}) {
  const [query, setQuery] = (0, import_react5.useState)("");
  const [open, setOpen] = (0, import_react5.useState)(false);
  const [active, setActive] = (0, import_react5.useState)(-1);
  const blurTimer = (0, import_react5.useRef)(null);
  const selected = options2.find((o) => o.value === asText(value));
  const q = query.trim().toLowerCase();
  const filtered = q ? options2.filter((o) => t(o.label).toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options2;
  const listId = `${a11y.id}-listbox`;
  const optionId = (i) => `${a11y.id}-opt-${i}`;
  const clearBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };
  (0, import_react5.useEffect)(() => () => clearBlur(), []);
  (0, import_react5.useEffect)(() => {
    if (open && active >= 0) scrollOptionIntoView(optionId(active));
  }, [active, open]);
  const choose = (o) => {
    clearBlur();
    setValue(o.value);
    setQuery("");
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && filtered[active]) {
        e.preventDefault();
        choose(filtered[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };
  const display = open ? query : selected ? t(selected.label) : asText(value);
  const showClear = !disabled && !required && asText(value) !== "" && !open;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-search-select", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "input",
      {
        ...a11y,
        role: "combobox",
        "aria-expanded": open,
        "aria-controls": listId,
        "aria-autocomplete": "list",
        "aria-activedescendant": open && active >= 0 ? optionId(active) : void 0,
        autoComplete: "off",
        placeholder: placeholder ?? (required ? void 0 : "Search\u2026"),
        value: display,
        onFocus: () => {
          clearBlur();
          setOpen(true);
        },
        onChange: (e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        },
        onKeyDown,
        onBlur: () => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }
      }
    ),
    showClear && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-search-clear", "aria-label": "Clear", onMouseDown: (e) => e.preventDefault(), onClick: () => setValue(""), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(XGlyph, {}) }),
    open && filtered.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { id: listId, role: "listbox", className: "lf-search-list", children: filtered.map((o, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "li",
      {
        id: optionId(i),
        role: "option",
        "aria-selected": o.value === asText(value),
        className: i === active ? "is-active" : void 0,
        onMouseDown: (e) => {
          e.preventDefault();
          choose(o);
        },
        children: t(o.label)
      },
      o.value
    )) })
  ] });
}
function TextControl({
  type,
  a11y,
  extra,
  mask,
  clearable,
  value,
  onChange
}) {
  const v = asText(value);
  const handle = (raw) => onChange(mask ? applyMask(raw, mask) : raw);
  const showClear = clearable && v !== "";
  const input = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { type, ...a11y, ...extra, value: v, onChange: (e) => handle(e.target.value) });
  if (!clearable) return input;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "lf-input-wrap", children: [
    input,
    showClear && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-clear", "aria-label": "Clear", onClick: () => onChange(""), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(XGlyph, {}) })
  ] });
}
function applyMask(raw, mask) {
  const data = [];
  for (const c of raw) if (/[0-9A-Za-z]/.test(c)) data.push(c);
  let out = "";
  let di = 0;
  for (const m of mask) {
    if (di >= data.length) break;
    if (m === "9" || m === "a" || m === "*") {
      const re = m === "9" ? /[0-9]/ : m === "a" ? /[A-Za-z]/ : /[0-9A-Za-z]/;
      while (di < data.length && !re.test(data[di])) di++;
      if (di < data.length) {
        out += data[di];
        di++;
      }
    } else {
      out += m;
    }
  }
  return out;
}
function wordCount(s) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}
function TagsInput({
  a11y,
  value,
  disabled,
  onChange,
  placeholder
}) {
  const [draft, setDraft] = (0, import_react5.useState)("");
  const tags = value.map(String);
  const add = (raw) => {
    const t = raw.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-tags", children: [
    tags.map((t) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "lf-tag", children: [
      t,
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", "aria-label": `Remove ${t}`, disabled, onClick: () => onChange(tags.filter((x) => x !== t)), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(XGlyph, {}) })
    ] }, t)),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "input",
      {
        ...a11y,
        type: "text",
        placeholder: tags.length === 0 ? placeholder : void 0,
        value: draft,
        onChange: (e) => setDraft(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && tags.length) {
            onChange(tags.slice(0, -1));
          }
        },
        onBlur: () => add(draft)
      }
    )
  ] });
}
function NumberInput({
  a11y,
  extra,
  value,
  currency,
  prefix,
  suffix,
  onChange
}) {
  const [focused, setFocused] = (0, import_react5.useState)(false);
  const raw = asText(value);
  let display = raw;
  if (!focused && raw !== "" && currency) {
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      try {
        display = new Intl.NumberFormat(void 0, { style: "currency", currency }).format(n);
      } catch {
        display = raw;
      }
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "lf-number", children: [
    prefix && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-affix lf-prefix", children: prefix }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "input",
      {
        type: "text",
        inputMode: "decimal",
        ...a11y,
        ...extra,
        value: display,
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        onChange: (e) => onChange(e.target.value)
      }
    ),
    suffix && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-affix lf-suffix", children: suffix })
  ] });
}
function FileField({
  a11y,
  multiple,
  value,
  disabled,
  onChange,
  entity,
  scope
}) {
  const client = useMinionClient();
  const storage = entity.attributes?.storage;
  const uploadMinion = typeof storage?.minion === "string" ? storage.minion : void 0;
  const [uploading, setUploading] = (0, import_react5.useState)(false);
  const [error, setError] = (0, import_react5.useState)(null);
  const files = Array.isArray(value) ? value : [];
  const handle = async (list) => {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    if (uploadMinion && client) {
      setUploading(true);
      setError(null);
      try {
        const params = {};
        for (const [p, k] of Object.entries(storage?.params ?? {})) params[p] = scope[k];
        const refs = await Promise.all(
          picked.map(async (f) => {
            const r = await client.request(uploadMinion, { ...params, file: f, name: f.name, size: f.size, type: f.type });
            return r && typeof r === "object" ? r : { name: f.name };
          })
        );
        onChange([...files, ...refs]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    } else {
      onChange(fileDescriptors(list));
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-file", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { ...a11y, type: "file", multiple, disabled: disabled || uploading, onChange: (e) => handle(e.target.files) }),
    uploading && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-file-uploading", children: "Uploading\u2026" }),
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "alert", className: "lf-error", children: error }),
    files.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "lf-file-list", children: files.map((f, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("li", { children: f.url ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("a", { href: f.url, target: "_blank", rel: "noreferrer", children: f.name ?? "file" }) : f.name ?? "file" }, i)) })
  ] });
}
function fileDescriptors(list) {
  return list ? Array.from(list).map((f) => ({ name: f.name, size: f.size, type: f.type })) : [];
}
function SignatureField({
  a11y,
  value,
  disabled,
  onChange,
  penColor
}) {
  const canvasRef = (0, import_react5.useRef)(null);
  const drawing = (0, import_react5.useRef)(false);
  const painted = (0, import_react5.useRef)("");
  const dataUrl = typeof value === "string" ? value : "";
  const [hasInk, setHasInk] = (0, import_react5.useState)(Boolean(dataUrl));
  const color = penColor || "#111827";
  const context = () => canvasRef.current?.getContext("2d") ?? null;
  (0, import_react5.useEffect)(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (dataUrl) {
      if (dataUrl === painted.current) return;
      painted.current = dataUrl;
      let cancelled = false;
      const img = new Image();
      img.onload = () => {
        if (cancelled || drawing.current || painted.current !== dataUrl) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = dataUrl;
      setHasInk(true);
      return () => {
        cancelled = true;
        img.onload = null;
      };
    }
    painted.current = "";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }, [dataUrl]);
  const at = (e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const sx = r.width ? canvas.width / r.width : 1;
    const sy = r.height ? canvas.height / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };
  const onDown = (e) => {
    if (disabled) return;
    const ctx = context();
    if (!ctx) return;
    drawing.current = true;
    const p = at(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
    }
  };
  const onMove = (e) => {
    if (!drawing.current) return;
    const ctx = context();
    if (!ctx) return;
    const p = at(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    painted.current = url;
    onChange(url);
  };
  const onUpRef = (0, import_react5.useRef)(onUp);
  onUpRef.current = onUp;
  (0, import_react5.useEffect)(() => {
    const up = () => {
      if (drawing.current) onUpRef.current();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    painted.current = "";
    setHasInk(false);
    onChange("");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-signature", "data-disabled": disabled || void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-signature-padwrap", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "canvas",
        {
          id: a11y.id,
          ref: canvasRef,
          "aria-label": "Signature pad",
          "aria-invalid": a11y["aria-invalid"],
          "aria-describedby": a11y["aria-describedby"],
          className: "lf-signature-pad",
          width: 600,
          height: 200,
          tabIndex: disabled ? -1 : 0,
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp
        }
      ),
      !hasInk && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-signature-hint", "aria-hidden": "true", children: disabled ? "" : "Sign here" })
    ] }),
    !disabled && hasInk && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-signature-clear", onClick: clear, children: "Clear" })
  ] });
}
function EditGridField({
  entity,
  fs,
  ctx,
  schema
}) {
  const [editing, setEditing] = (0, import_react5.useState)(null);
  if (!fs) return null;
  const key = fs.key;
  const rows = Array.isArray(fs.value) ? fs.value : [];
  const cells = childFields(entity, schema);
  const disabled = ctx.readOnly;
  const error = ctx.showErrors ? fs.error : null;
  const top = ctx.scope;
  const replace = (next) => ctx.form.setValues({ [key]: next }, { markTouched: true });
  const startAdd = () => setEditing({ index: rows.length, draft: {} });
  const startEdit = (i) => setEditing({ index: i, draft: { ...rows[i] ?? {} } });
  const removeRow = (i) => replace(rows.filter((_, k) => k !== i));
  const commitDraft = () => {
    if (!editing) return;
    const row = { ...editing.draft };
    for (const c of cells) {
      const ck = cellKey(c);
      if (ck in row) {
        const ft = ctx.reg.get(c.type);
        row[ck] = ft ? ft.coerce(row[ck]) : row[ck];
      }
    }
    const next = rows.slice();
    if (editing.index >= rows.length) next.push(row);
    else next[editing.index] = row;
    replace(next);
    setEditing(null);
  };
  const summary = (row) => cells.map((c) => {
    const v = row?.[cellKey(c)];
    return v == null || v === "" ? null : `${labelText(c.attributes) ?? cellKey(c)}: ${asText(v)}`;
  }).filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-edit-grid", "data-type": "editGrid", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-container-label", children: labelText(entity.attributes) ?? key }),
    rows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "lf-eg-rows", children: rows.map((row, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "lf-eg-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-eg-summary", children: summary(row) || /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("em", { className: "lf-eg-empty", children: "Empty row" }) }),
      !disabled && !editing && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "lf-eg-row-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-eg-edit", onClick: () => startEdit(i), children: ctx.t("Edit") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-eg-remove", onClick: () => removeRow(i), children: ctx.t("Remove") })
      ] })
    ] }, i)) }),
    editing && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-eg-editor", role: "group", "aria-label": editing.index >= rows.length ? "New row" : `Edit row ${editing.index + 1}`, children: [
      cells.map((c) => {
        const ck = cellKey(c);
        if (!(0, import_form_core3.evaluateVisibility)(c.attributes, { ...top, ...editing.draft })) return null;
        const label = labelText(c.attributes) ?? ck;
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "lf-eg-cell", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-eg-cell-label", children: ctx.t(label) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            GridCell,
            {
              type: c.type,
              value: editing.draft[ck],
              disabled: false,
              options: options(c.attributes),
              onChange: (v) => setEditing((e) => e ? { ...e, draft: { ...e.draft, [ck]: v } } : e),
              "aria-label": label
            }
          )
        ] }, c.id);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-eg-editor-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-eg-cancel", onClick: () => setEditing(null), children: ctx.t("Cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-eg-save", onClick: commitDraft, children: ctx.t("Save") })
      ] })
    ] }),
    !disabled && !editing && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-row-add", onClick: startAdd, children: ctx.t("Add another") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "alert", className: "lf-error", children: error.message })
  ] });
}

// src/print.ts
var import_form_core4 = require("@lukeflow/form-core");
function printSubmission(schema, data, options2) {
  const html = (0, import_form_core4.toPrintableHtml)(schema, data, options2);
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}

// src/index.ts
var VERSION = "0.1.0-alpha.0";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FormErrorBoundary,
  FormRenderer,
  LocaleProvider,
  MinionProvider,
  VERSION,
  printSubmission,
  useFormEngine,
  useMinionClient,
  useMinionData,
  useTranslate
});
//# sourceMappingURL=index.cjs.map