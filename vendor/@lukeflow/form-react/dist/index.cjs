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
  if (ft?.isGrid) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(GridField, { entity, fs, ctx, schema });
  if (ft?.isStatic) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Static, { entity });
  if (ft?.isContainer) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-container", "data-type": entity.type, children: [
      labelText(entity.attributes) && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-container-label", children: labelText(entity.attributes) }),
      (entity.children ?? []).map((cid) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RenderEntity, { id: cid, schema, ctx }, cid))
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
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("textarea", { ...a11y, value: asText(fs.value), onChange: (e) => set(e.target.value) });
        break;
      case "select":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { ...a11y, value: asText(fs.value), onChange: (e) => set(e.target.value), children: [
          !fs.isRequired && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "" }),
          fieldOptions.map((o) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: o.value, children: ctx.t(o.label) }, o.value))
        ] });
        break;
      case "number":
      case "currency":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          NumberInput,
          {
            a11y,
            value: fs.value,
            currency: entity.type === "currency" ? typeof a.currency === "string" ? a.currency : "USD" : void 0,
            prefix: typeof a.prefix === "string" ? a.prefix : void 0,
            suffix: typeof a.suffix === "string" ? a.suffix : void 0,
            onChange: set
          }
        );
        break;
      case "searchSelect":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SearchSelect, { a11y, entity, value: fs.value, setValue: set, scope: ctx.scope, disabled });
        break;
      case "tags":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TagsInput, { a11y, value: asArray(fs.value), disabled, onChange: set });
        break;
      case "file":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(FileField, { a11y, multiple: Boolean(a.multiple), value: fs.value, disabled, onChange: set, entity, scope: ctx.scope });
        break;
      case "signature":
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SignatureField, { a11y, value: fs.value, disabled, onChange: set });
        break;
      default:
        control = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { type: inputType(entity.type), ...a11y, value: asText(fs.value), onChange: (e) => set(e.target.value) });
    }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-field", "data-type": entity.type, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { htmlFor: id, className: "lf-label", children: [
      ctx.t(labelText(a) ?? key),
      fs.isRequired && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-hidden": "true", children: " *" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tooltip, { text: tooltipText(a) })
    ] }),
    control,
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
  if (!fs) return null;
  const key = fs.key;
  const rows = Array.isArray(fs.value) ? fs.value : [];
  const cells = childFields(entity, schema);
  const disabled = ctx.readOnly;
  const error = ctx.showErrors ? fs.error : null;
  const top = ctx.scope;
  const hasAggregates = cells.some((c) => typeof c.attributes?.aggregate === "string");
  const pageSize = Number(entity.attributes?.pageSize) || 0;
  const [page, setPage] = (0, import_react5.useState)(0);
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
  const text = labelText(a) ?? labelText(a, "content") ?? "";
  if (entity.type === "heading") return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { className: "lf-heading", children: text });
  if (entity.type === "divider" || entity.type === "hr") return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("hr", { className: "lf-divider" });
  if (!text) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "lf-static", "data-type": entity.type, children: text });
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
  if (!text) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "lf-tooltip", role: "img", "aria-label": `Help: ${text}`, title: text, children: " \u24D8" });
}
function SearchSelect({
  a11y,
  entity,
  value,
  setValue,
  scope,
  disabled
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
  const choose = (o) => {
    setValue(o.value);
    setSelectedLabel(o.label);
    setQuery("");
    setOpen(false);
    setActive(-1);
  };
  const optionId = (i) => `${a11y.id}-opt-${i}`;
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
        value: display,
        disabled,
        onFocus: () => setOpen(true),
        onChange: (e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        },
        onKeyDown,
        onBlur: () => setTimeout(() => setOpen(false), 150)
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
function TagsInput({
  a11y,
  value,
  disabled,
  onChange
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
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", "aria-label": `Remove ${t}`, disabled, onClick: () => onChange(tags.filter((x) => x !== t)), children: "\xD7" })
    ] }, t)),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "input",
      {
        ...a11y,
        type: "text",
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
  onChange
}) {
  const dataUrl = typeof value === "string" ? value : "";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "lf-signature", children: [
    dataUrl ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("img", { src: dataUrl, alt: "Signature", className: "lf-signature-preview" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("canvas", { id: a11y.id, "aria-label": "Signature pad", className: "lf-signature-pad", width: 300, height: 120, tabIndex: disabled ? -1 : 0 }),
    !disabled && dataUrl && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "lf-signature-clear", onClick: () => onChange(""), children: "Clear" })
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