"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  FormErrorBoundary: () => FormErrorBoundary,
  FormRenderer: () => FormRenderer,
  FormThemeProvider: () => FormThemeProvider,
  LocaleProvider: () => LocaleProvider,
  MinionProvider: () => MinionProvider,
  VERSION: () => VERSION,
  dataThemeAttr: () => dataThemeAttr,
  defaultSanitizeHtml: () => defaultSanitizeHtml,
  getLocaleDirection: () => getLocaleDirection,
  printSubmission: () => printSubmission,
  useFormEngine: () => useFormEngine,
  useFormTheme: () => useFormTheme,
  useLocale: () => useLocale,
  useMinionClient: () => useMinionClient,
  useMinionData: () => useMinionData,
  usePopoverTheme: () => usePopoverTheme,
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
var import_react15 = require("react");
var import_form_core7 = require("@lukeflow/form-core");

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
var DEFAULT_LOCALE = "en";
var identity = (s) => s;
var RTL_LANGUAGES = /* @__PURE__ */ new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "khw",
  "ks",
  "ps",
  "sd",
  "syr",
  "ug",
  "ur",
  "yi"
]);
function getLocaleDirection(locale) {
  try {
    const loc = new Intl.Locale(locale);
    const info = loc.textInfo;
    if (info?.direction === "rtl" || info?.direction === "ltr") return info.direction;
    return RTL_LANGUAGES.has(loc.language ?? "") ? "rtl" : "ltr";
  } catch {
    const lang = locale.toLowerCase().split(/[-_]/)[0] ?? "";
    return RTL_LANGUAGES.has(lang) ? "rtl" : "ltr";
  }
}
function makeFormatters(locale) {
  return {
    formatNumber: (value, options2) => {
      try {
        return new Intl.NumberFormat(locale, options2).format(value);
      } catch {
        return String(value);
      }
    },
    formatDate: (value, options2) => {
      try {
        return new Intl.DateTimeFormat(locale, options2).format(value);
      } catch {
        return String(value);
      }
    },
    plural: (count, forms) => {
      try {
        const rule = new Intl.PluralRules(locale).select(count);
        return forms[rule] ?? forms.other ?? "";
      } catch {
        return forms.other ?? "";
      }
    }
  };
}
var LocaleContext = (0, import_react3.createContext)({
  locale: DEFAULT_LOCALE,
  dir: "ltr",
  t: identity,
  ...makeFormatters(DEFAULT_LOCALE)
});
function LocaleProvider({
  locale = DEFAULT_LOCALE,
  dir,
  messages,
  t,
  children
}) {
  const formatters = (0, import_react3.useMemo)(() => makeFormatters(locale), [locale]);
  const resolvedDir = (0, import_react3.useMemo)(() => dir ?? getLocaleDirection(locale), [dir, locale]);
  const translate = (0, import_react3.useMemo)(
    () => t ?? (messages ? (s) => messages[s] ?? s : identity),
    [t, messages]
  );
  const info = (0, import_react3.useMemo)(
    () => ({ locale, dir: resolvedDir, t: translate, ...formatters }),
    [locale, resolvedDir, translate, formatters]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(LocaleContext.Provider, { value: info, children });
}
function useLocale() {
  return (0, import_react3.useContext)(LocaleContext);
}
function useTranslate() {
  return (0, import_react3.useContext)(LocaleContext).t;
}

// src/theme.tsx
var import_react4 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var FormThemeContext = (0, import_react4.createContext)({});
function FormThemeProvider({
  theme,
  colorScheme,
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(FormThemeContext.Provider, { value: { theme, colorScheme }, children });
}
function useFormTheme() {
  return (0, import_react4.useContext)(FormThemeContext);
}
function dataThemeAttr(scheme) {
  return scheme === "light" || scheme === "dark" ? scheme : void 0;
}
function usePopoverTheme() {
  const { theme, colorScheme } = useFormTheme();
  return { dataTheme: dataThemeAttr(colorScheme), themeStyle: theme ?? {} };
}

// src/errorBoundary.tsx
var import_react5 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var FormErrorBoundary = class extends import_react5.Component {
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
      return this.props.fallback ?? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { role: "alert", className: "lf-error lf-form-error", children: "Something went wrong displaying this form." });
    }
    return this.props.children;
  }
};

// src/render/sanitizeHtml.ts
var import_dompurify = __toESM(require("dompurify"), 1);
var ESCAPE = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);
}
var defaultSanitizeHtml = (dirty) => {
  if (typeof dirty !== "string" || dirty === "") return "";
  if (import_dompurify.default.isSupported) {
    return import_dompurify.default.sanitize(dirty, {
      USE_PROFILES: { html: true },
      // The content field is for RICH TEXT (formatting, links, lists, tables, images) — not
      // interactive forms or arbitrary layout. Forbidding form-associated tags closes a stored
      // phishing / off-site-POST vector (a `<form action>` is hoisted into a real form by the
      // browser), and forbidding inline `style` closes a CSS UI-redress / clickjacking vector
      // (e.g. a position:fixed full-viewport overlay over the real submit button). Hosts that
      // need either can loosen the policy via the `sanitizeHtml` prop.
      FORBID_TAGS: ["form", "input", "button", "textarea", "select", "option", "fieldset", "label"],
      FORBID_ATTR: ["style"]
    });
  }
  return escapeHtml(dirty);
};

// src/render/helpers.ts
var import_form_core3 = require("@lukeflow/form-core");
function scrollOptionIntoView(id) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  try {
    el?.scrollIntoView({ block: "nearest" });
  } catch {
  }
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
function keysValid(form, keys) {
  if (keys.length === 0) return true;
  const set = new Set(keys);
  return form.validate(keys).errorKeys.every((k) => !set.has(k));
}
function tooltipText(a) {
  const v = a?.tooltip;
  return typeof v === "string" && v ? v : void 0;
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
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
function fileDescriptors(list) {
  return list ? Array.from(list).map((f) => ({ name: f.name, size: f.size, type: f.type })) : [];
}

// src/render/controls/icons.tsx
var import_react6 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function XGlyph() {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "lf-x", viewBox: "0 0 24 24", width: "12", height: "12", "aria-hidden": "true", focusable: "false", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M18 6L6 18M6 6l12 12", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function CalendarGlyph() {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("svg", { className: "lf-cal-icon", viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("rect", { x: "3", y: "4.5", width: "18", height: "16", rx: "2", fill: "none", stroke: "currentColor", strokeWidth: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M3 9h18M8 2.5v4M16 2.5v4", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" })
  ] });
}

// src/render/controls/Tooltip.tsx
var import_react7 = require("react");
var import_react_dom = require("react-dom");
var import_jsx_runtime6 = require("react/jsx-runtime");
function Tooltip({ text }) {
  const ref = (0, import_react7.useRef)(null);
  const [anchor, setAnchor] = (0, import_react7.useState)(null);
  (0, import_react7.useEffect)(() => {
    if (!anchor) return;
    const win = ref.current?.ownerDocument?.defaultView;
    if (!win) return;
    const dismiss = () => setAnchor(null);
    win.addEventListener("scroll", dismiss, true);
    win.addEventListener("resize", dismiss);
    return () => {
      win.removeEventListener("scroll", dismiss, true);
      win.removeEventListener("resize", dismiss);
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
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { ref, className: "lf-tooltip", tabIndex: 0, role: "img", "aria-label": `Help: ${text}`, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "lf-tooltip-icon", "aria-hidden": "true", children: "i" }),
    anchor && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(TooltipBubble, { text, anchor, doc: ref.current?.ownerDocument ?? null })
  ] });
}
function TooltipBubble({ text, anchor, doc }) {
  const ref = (0, import_react7.useRef)(null);
  const [box, setBox] = (0, import_react7.useState)(null);
  (0, import_react7.useLayoutEffect)(() => {
    const el = ref.current;
    const win = el?.ownerDocument?.defaultView;
    if (!el || !win) return;
    const b = el.getBoundingClientRect();
    const M = 8;
    let place = "top";
    let top = anchor.top - b.height - 10;
    if (top < M) {
      place = "bottom";
      top = anchor.bottom + 10;
    }
    let left = anchor.cx - b.width / 2;
    left = Math.max(M, Math.min(left, win.innerWidth - b.width - M));
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
  const { dataTheme, themeStyle } = usePopoverTheme();
  const target = doc?.body ?? (typeof document !== "undefined" ? document.body : null);
  if (!target) return null;
  return (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
      "span",
      {
        ref,
        className: `lf-pop lf-tooltip-bubble--portal is-${box?.place ?? "top"}`,
        "data-theme": dataTheme,
        role: "tooltip",
        style: { ...themeStyle, position: "fixed", left: box?.left ?? anchor.cx, top: box?.top ?? anchor.top, visibility: box ? "visible" : "hidden" },
        children: [
          text,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "lf-tooltip-arrow", style: { left: box?.arrow ?? 0 } })
        ]
      }
    ),
    target
  );
}

// src/render/controls/Select.tsx
var import_react9 = require("react");
var import_react_dom2 = require("react-dom");
var import_form_core4 = require("@lukeflow/form-core");

// src/render/usePopover.ts
var import_react8 = require("react");
function useAnchoredPosition(anchorRef, open) {
  const [style, setStyle] = (0, import_react8.useState)(null);
  (0, import_react8.useLayoutEffect)(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const el = anchorRef.current;
    const win = el?.ownerDocument?.defaultView;
    if (!el || !win) return;
    const M = 8;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const spaceBelow = win.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const below = spaceBelow >= spaceAbove || spaceBelow > 320;
      const maxHeight = Math.max(120, (below ? spaceBelow : spaceAbove) - M);
      const left = Math.max(M, Math.min(r.left, win.innerWidth - r.width - M));
      setStyle({
        position: "fixed",
        left,
        right: "auto",
        minWidth: r.width,
        maxHeight,
        overflowY: "auto",
        ...below ? { top: r.bottom } : { bottom: win.innerHeight - r.top }
      });
    };
    measure();
    win.addEventListener("scroll", measure, true);
    win.addEventListener("resize", measure);
    return () => {
      win.removeEventListener("scroll", measure, true);
      win.removeEventListener("resize", measure);
    };
  }, [open, anchorRef]);
  return style;
}
function popoverTarget(anchorRef) {
  return anchorRef.current?.ownerDocument?.body ?? (typeof document !== "undefined" ? document.body : null);
}

// src/render/controls/Select.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
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
  const ds = (0, import_form_core4.readDataSource)(entity.attributes);
  const dsRaw = entity.attributes?.dataSource;
  const searchParam = typeof dsRaw?.searchParam === "string" ? dsRaw.searchParam : "q";
  const [query, setQuery] = (0, import_react9.useState)("");
  const [open, setOpen] = (0, import_react9.useState)(false);
  const [options2, setOptions] = (0, import_react9.useState)([]);
  const [loading, setLoading] = (0, import_react9.useState)(false);
  const [selectedLabel, setSelectedLabel] = (0, import_react9.useState)("");
  const [active, setActive] = (0, import_react9.useState)(-1);
  const timer = (0, import_react9.useRef)(null);
  const blurTimer = (0, import_react9.useRef)(null);
  const clearBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };
  (0, import_react9.useEffect)(() => () => clearBlur(), []);
  const choose = (o) => {
    clearBlur();
    setValue(o.value);
    setSelectedLabel(o.label);
    setQuery("");
    setOpen(false);
    setActive(-1);
  };
  const optionId = (i) => `${a11y.id}-opt-${i}`;
  (0, import_react9.useEffect)(() => {
    if (open && active >= 0) scrollOptionIntoView(optionId(active));
  }, [active, open]);
  (0, import_react9.useEffect)(() => {
    if (!client || !ds || !open) return;
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController();
    timer.current = setTimeout(() => {
      setLoading(true);
      client.request(ds.minion, { ...(0, import_form_core4.resolveMinionParams)(ds, scope), [searchParam]: query }, controller.signal).then((res) => {
        if (!controller.signal.aborted) setOptions((0, import_form_core4.toOptions)(res, ds));
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
  const wrapRef = (0, import_react9.useRef)(null);
  const popStyle = useAnchoredPosition(wrapRef, open && (loading || options2.length > 0));
  const { dataTheme, themeStyle } = usePopoverTheme();
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
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "lf-search-select", ref: wrapRef, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
    open && (loading || options2.length > 0) && popoverTarget(wrapRef) && (0, import_react_dom2.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("ul", { id: listId, role: "listbox", className: "lf-pop lf-search-list", "data-theme": dataTheme, style: { ...themeStyle, ...popStyle ?? {} }, children: [
        loading && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("li", { className: "lf-search-loading", children: "Searching\u2026" }),
        options2.map((o, i) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
      ] }),
      popoverTarget(wrapRef)
    )
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
  const [query, setQuery] = (0, import_react9.useState)("");
  const [open, setOpen] = (0, import_react9.useState)(false);
  const [active, setActive] = (0, import_react9.useState)(-1);
  const blurTimer = (0, import_react9.useRef)(null);
  const selected = options2.find((o) => o.value === asText(value));
  const q = query.trim().toLowerCase();
  const filtered = q ? options2.filter((o) => t(o.label).toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options2;
  const listId = `${a11y.id}-listbox`;
  const optionId = (i) => `${a11y.id}-opt-${i}`;
  const clearBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };
  (0, import_react9.useEffect)(() => () => clearBlur(), []);
  (0, import_react9.useEffect)(() => {
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
  const wrapRef = (0, import_react9.useRef)(null);
  const popStyle = useAnchoredPosition(wrapRef, open && filtered.length > 0);
  const { dataTheme, themeStyle } = usePopoverTheme();
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "lf-search-select", ref: wrapRef, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
    showClear && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "lf-search-clear", "aria-label": "Clear", onMouseDown: (e) => e.preventDefault(), onClick: () => setValue(""), children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(XGlyph, {}) }),
    open && filtered.length > 0 && popoverTarget(wrapRef) && (0, import_react_dom2.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { id: listId, role: "listbox", className: "lf-pop lf-search-list", "data-theme": dataTheme, style: { ...themeStyle, ...popStyle ?? {} }, children: filtered.map((o, i) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
      )) }),
      popoverTarget(wrapRef)
    )
  ] });
}

// src/render/controls/inputs.tsx
var import_react10 = require("react");
var import_form_core5 = require("@lukeflow/form-core");
var import_jsx_runtime8 = require("react/jsx-runtime");
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
  const input = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type, ...a11y, ...extra, value: v, onChange: (e) => handle(e.target.value) });
  if (!clearable) return input;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "lf-input-wrap", children: [
    input,
    showClear && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: "lf-clear", "aria-label": "Clear", onClick: () => onChange(""), children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(XGlyph, {}) })
  ] });
}
function TagsInput({
  a11y,
  value,
  disabled,
  onChange,
  placeholder
}) {
  const [draft, setDraft] = (0, import_react10.useState)("");
  const tags = value.map(String);
  const add = (raw) => {
    const t = raw.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "lf-tags", children: [
    tags.map((t) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "lf-tag", children: [
      t,
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", "aria-label": `Remove ${t}`, disabled, onClick: () => onChange(tags.filter((x) => x !== t)), children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(XGlyph, {}) })
    ] }, t)),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
  const { formatNumber } = useLocale();
  const [focused, setFocused] = (0, import_react10.useState)(false);
  const raw = asText(value);
  let display = raw;
  if (!focused && raw !== "" && currency) {
    const n = Number(raw);
    if (!Number.isNaN(n)) display = formatNumber(n, { style: "currency", currency });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "lf-number", children: [
    prefix && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "lf-affix lf-prefix", children: prefix }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
    suffix && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "lf-affix lf-suffix", children: suffix })
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
  const [uploading, setUploading] = (0, import_react10.useState)(false);
  const [error, setError] = (0, import_react10.useState)(null);
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
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "lf-file", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { ...a11y, type: "file", multiple, disabled: disabled || uploading, onChange: (e) => handle(e.target.files) }),
    uploading && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "lf-file-uploading", children: "Uploading\u2026" }),
    error && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { role: "alert", className: "lf-error", children: error }),
    files.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "lf-file-list", children: files.map((f, i) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("li", { children: f.url ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("a", { href: f.url, target: "_blank", rel: "noreferrer", children: f.name ?? "file" }) : f.name ?? "file" }, i)) })
  ] });
}

// src/render/controls/SignatureField.tsx
var import_react11 = require("react");
var import_jsx_runtime9 = require("react/jsx-runtime");
function SignatureField({
  a11y,
  value,
  disabled,
  onChange,
  penColor,
  allowType
}) {
  const canvasRef = (0, import_react11.useRef)(null);
  const drawing = (0, import_react11.useRef)(false);
  const painted = (0, import_react11.useRef)("");
  const dataUrl = typeof value === "string" ? value : "";
  const [hasInk, setHasInk] = (0, import_react11.useState)(Boolean(dataUrl));
  const [mode, setMode] = (0, import_react11.useState)("draw");
  const [typed, setTyped] = (0, import_react11.useState)("");
  const color = penColor || "#111827";
  const context = () => canvasRef.current?.getContext("2d") ?? null;
  const drawTyped = (name) => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const trimmed = name.trim();
    if (trimmed) {
      ctx.fillStyle = color;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.font = '64px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';
      ctx.fillText(trimmed, canvas.width / 2, canvas.height / 2);
    }
    painted.current = "";
    setHasInk(Boolean(trimmed));
    onChange(trimmed ? canvas.toDataURL("image/png") : "");
  };
  (0, import_react11.useEffect)(() => {
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
    if (disabled || mode === "type") return;
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
  const onUpRef = (0, import_react11.useRef)(onUp);
  onUpRef.current = onUp;
  (0, import_react11.useEffect)(() => {
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
    setTyped("");
    setHasInk(false);
    onChange("");
  };
  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
  };
  const typedTimer = (0, import_react11.useRef)(null);
  (0, import_react11.useEffect)(() => () => {
    if (typedTimer.current) clearTimeout(typedTimer.current);
  }, []);
  const onTypedChange = (name) => {
    setTyped(name);
    if (typedTimer.current) clearTimeout(typedTimer.current);
    typedTimer.current = setTimeout(() => drawTyped(name), 180);
  };
  const flushTyped = () => {
    if (typedTimer.current) {
      clearTimeout(typedTimer.current);
      typedTimer.current = null;
    }
    drawTyped(typed);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "lf-signature", "data-disabled": disabled || void 0, children: [
    allowType && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "lf-signature-modes", role: "group", "aria-label": "Signature mode", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", "aria-pressed": mode === "draw", className: `lf-signature-mode${mode === "draw" ? " is-active" : ""}`, onClick: () => switchMode("draw"), disabled, children: "Draw" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", "aria-pressed": mode === "type", className: `lf-signature-mode${mode === "type" ? " is-active" : ""}`, onClick: () => switchMode("type"), disabled, children: "Type" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "lf-signature-padwrap", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "canvas",
        {
          id: a11y.id,
          ref: canvasRef,
          "aria-label": a11y["aria-label"] ?? "Signature pad",
          "aria-invalid": a11y["aria-invalid"],
          "aria-describedby": a11y["aria-describedby"],
          className: "lf-signature-pad",
          "data-mode": mode,
          width: 600,
          height: 200,
          tabIndex: disabled || mode === "type" ? -1 : 0,
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp
        }
      ),
      !hasInk && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "lf-signature-hint", "aria-hidden": "true", children: disabled ? "" : mode === "type" ? "Type your name below" : "Sign here" })
    ] }),
    allowType && mode === "type" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "input",
      {
        type: "text",
        className: "lf-signature-typed",
        "aria-label": "Typed signature name",
        placeholder: "Type your full name",
        value: typed,
        disabled,
        onChange: (e) => onTypedChange(e.target.value),
        onBlur: flushTyped
      }
    ),
    !disabled && hasInk && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: "lf-signature-clear", onClick: clear, children: "Clear" })
  ] });
}

// src/render/controls/DateField.tsx
var import_react12 = require("react");
var import_react_dom3 = require("react-dom");
var import_jsx_runtime10 = require("react/jsx-runtime");
var pad = (n) => String(n).padStart(2, "0");
var daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  if (mo < 0 || mo > 11 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}
function parseTime(value, kind) {
  const re = kind === "time" ? /^(\d{2}):(\d{2})/ : /T(\d{2}):(\d{2})/;
  const m = re.exec(value);
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return { h, min };
}
function format(kind, date, time) {
  const d = date ? `${date.y}-${pad(date.m + 1)}-${pad(date.d)}` : "";
  const t = time ? `${pad(time.h)}:${pad(time.min)}` : "";
  if (kind === "time") return t;
  if (kind === "day") return d;
  if (!d) return "";
  return `${d}T${t || "00:00"}`;
}
function monthMatrix(y, m) {
  const firstWeekday = new Date(y, m, 1).getDay();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(y, m, 1 - firstWeekday + i);
    cells.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() });
  }
  return cells;
}
var sameDay = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;
var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var monthLabel = (y, m, locale) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(y, m, 1));
var dayLabel = (c, locale) => new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(c.y, c.m, c.d));
function weekdayLabels(locale) {
  try {
    const narrow = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    const long = new Intl.DateTimeFormat(locale, { weekday: "long" });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2024, 0, 7 + i);
      return { narrow: narrow.format(d), long: long.format(d) };
    });
  } catch {
    return WEEKDAYS.map((w) => ({ narrow: w[0] ?? "", long: w }));
  }
}
function DateField({
  a11y,
  kind,
  value,
  disabled,
  onChange,
  clearable,
  minuteStep = 1
}) {
  const { locale } = useLocale();
  const weekdays = weekdayLabels(locale);
  const raw = typeof value === "string" ? value : "";
  const date = parseDate(raw);
  const time = parseTime(raw, kind);
  const hasCal = kind === "day" || kind === "datetime";
  const hasTime = kind === "datetime" || kind === "time";
  const minStep = Math.max(1, Math.floor(minuteStep) || 1);
  const timeDisabled = disabled || kind === "datetime" && !date;
  const [open, setOpen] = (0, import_react12.useState)(false);
  const today = (() => {
    const n = /* @__PURE__ */ new Date();
    return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
  })();
  const [view, setView] = (0, import_react12.useState)(date ?? today);
  const [focused, setFocused] = (0, import_react12.useState)(date ?? today);
  const wrapRef = (0, import_react12.useRef)(null);
  const inputRef = (0, import_react12.useRef)(null);
  const gridRef = (0, import_react12.useRef)(null);
  const popRef = (0, import_react12.useRef)(null);
  const popStyle = useAnchoredPosition(wrapRef, open && hasCal);
  const { dataTheme, themeStyle } = usePopoverTheme();
  (0, import_react12.useEffect)(() => {
    if (!open) return;
    const onDown = (e) => {
      const t = e.target;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  (0, import_react12.useEffect)(() => {
    if (!open) return;
    const base = parseDate(typeof value === "string" ? value : "") ?? today;
    setView(base);
    setFocused(base);
  }, [open]);
  (0, import_react12.useEffect)(() => {
    if (!open || !hasCal) return;
    gridRef.current?.querySelector('[data-focused="true"]')?.focus();
  }, [open, focused, view, hasCal]);
  const openCal = () => {
    if (!disabled) setOpen(true);
  };
  const closeToInput = () => {
    setOpen(false);
    inputRef.current?.focus();
  };
  const commitDate = (d) => {
    onChange(format(kind, d, time ?? (kind === "datetime" ? { h: 0, min: 0 } : null)));
  };
  const pickDay = (c) => {
    commitDate(c);
    closeToInput();
  };
  const setTimePart = (h, min) => {
    onChange(format(kind, kind === "time" ? null : date ?? today, { h, min }));
  };
  const shiftFocus = (deltaDays) => {
    const dt = new Date(focused.y, focused.m, focused.d + deltaDays);
    const next = { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
    setFocused(next);
    if (next.m !== view.m || next.y !== view.y) setView(next);
  };
  const shiftMonth = (delta) => {
    const dt = new Date(view.y, view.m + delta, 1);
    setView({ y: dt.getFullYear(), m: dt.getMonth(), d: 1 });
    const clampD = Math.min(focused.d, daysInMonth(dt.getFullYear(), dt.getMonth()));
    setFocused({ y: dt.getFullYear(), m: dt.getMonth(), d: clampD });
  };
  const onGridKey = (e) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        shiftFocus(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        shiftFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        shiftFocus(-7);
        break;
      case "ArrowDown":
        e.preventDefault();
        shiftFocus(7);
        break;
      case "Home":
        e.preventDefault();
        shiftFocus(-new Date(focused.y, focused.m, focused.d).getDay());
        break;
      case "End":
        e.preventDefault();
        shiftFocus(6 - new Date(focused.y, focused.m, focused.d).getDay());
        break;
      case "PageUp":
        e.preventDefault();
        shiftMonth(-1);
        break;
      case "PageDown":
        e.preventDefault();
        shiftMonth(1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pickDay(focused);
        break;
      case "Escape":
        e.preventDefault();
        closeToInput();
        break;
      default:
        break;
    }
  };
  const cells = hasCal ? monthMatrix(view.y, view.m) : [];
  const showClear = clearable && !disabled && raw !== "";
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "lf-datefield", ref: wrapRef, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "lf-datefield-input", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        "input",
        {
          ...a11y,
          ref: inputRef,
          type: "text",
          inputMode: kind === "time" ? "numeric" : void 0,
          autoComplete: "off",
          placeholder: kind === "day" ? "YYYY-MM-DD" : kind === "time" ? "HH:MM" : "YYYY-MM-DDTHH:MM",
          value: raw,
          disabled,
          onChange: (e) => onChange(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "ArrowDown" && hasCal) {
              e.preventDefault();
              openCal();
            } else if (e.key === "Escape" && open) {
              setOpen(false);
            }
          }
        }
      ),
      showClear && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "lf-datefield-clear", "aria-label": "Clear", onClick: () => onChange(""), children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(XGlyph, {}) }),
      hasCal && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        "button",
        {
          type: "button",
          className: "lf-datefield-toggle",
          "aria-label": open ? "Close calendar" : "Open calendar",
          "aria-haspopup": "grid",
          "aria-expanded": open,
          disabled,
          onClick: () => open ? closeToInput() : openCal(),
          children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(CalendarGlyph, {})
        }
      )
    ] }),
    hasTime && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "lf-datefield-time", title: kind === "datetime" && !date ? "Pick a date first" : void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "select",
        {
          "aria-label": "Hour",
          disabled: timeDisabled,
          value: time ? time.h : "",
          onChange: (e) => {
            if (e.target.value === "") return;
            setTimePart(+e.target.value, time?.min ?? 0);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "" }),
            Array.from({ length: 24 }, (_, h) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: h, children: pad(h) }, h))
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { "aria-hidden": "true", children: ":" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "select",
        {
          "aria-label": "Minute",
          disabled: timeDisabled,
          value: time ? time.min : "",
          onChange: (e) => {
            if (e.target.value === "") return;
            setTimePart(time?.h ?? 0, +e.target.value);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "" }),
            Array.from({ length: Math.ceil(60 / minStep) }, (_, i) => i * minStep).map((min) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: min, children: pad(min) }, min))
          ]
        }
      )
    ] }),
    open && hasCal && popoverTarget(wrapRef) && (0, import_react_dom3.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { ref: popRef, className: "lf-pop lf-datefield-pop", "data-theme": dataTheme, role: "dialog", "aria-label": "Choose date", style: { ...themeStyle, ...popStyle ?? {} }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "lf-cal-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "lf-cal-nav", "aria-label": "Previous month", onClick: () => shiftMonth(-1), children: "\u2039" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "lf-cal-title", "aria-live": "polite", children: monthLabel(view.y, view.m, locale) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "lf-cal-nav", "aria-label": "Next month", onClick: () => shiftMonth(1), children: "\u203A" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "lf-cal-grid", role: "grid", ref: gridRef, onKeyDown: onGridKey, children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "lf-cal-row", role: "row", children: weekdays.map((w, i) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "columnheader", className: "lf-cal-wd", "aria-label": w.long, children: w.narrow }, i)) }),
          Array.from({ length: 6 }, (_, week) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "lf-cal-row", role: "row", children: cells.slice(week * 7, week * 7 + 7).map((c) => {
            const inMonth = c.m === view.m;
            const isSel = date != null && sameDay(c, date);
            const isFocused = sameDay(c, focused);
            const isToday = sameDay(c, today);
            return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
              "button",
              {
                type: "button",
                role: "gridcell",
                "data-focused": isFocused || void 0,
                "aria-label": dayLabel(c, locale),
                "aria-selected": isSel,
                "aria-current": isToday ? "date" : void 0,
                tabIndex: isFocused ? 0 : -1,
                className: `lf-cal-day${inMonth ? "" : " is-outside"}${isSel ? " is-selected" : ""}${isToday ? " is-today" : ""}`,
                onClick: () => pickDay(c),
                children: c.d
              },
              `${c.y}-${c.m}-${c.d}`
            );
          }) }, week))
        ] })
      ] }),
      popoverTarget(wrapRef)
    )
  ] });
}

// src/render/controls/richControls.tsx
var import_react13 = require("react");
var import_jsx_runtime11 = require("react/jsx-runtime");
function RatingField({
  a11y,
  value,
  max = 5,
  disabled,
  onChange
}) {
  const cap = Math.max(1, Math.floor(max) || 5);
  const current = Math.min(cap, Math.max(0, Math.floor(Number(value) || 0)));
  const groupRef = (0, import_react13.useRef)(null);
  const focusStar = (n) => groupRef.current?.querySelectorAll("button")[Math.max(1, n) - 1]?.focus();
  const set = (n) => !disabled && onChange(n === current ? 0 : n);
  const onKey = (e) => {
    if (disabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(cap, current + 1);
      onChange(next);
      focusStar(next);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(0, current - 1);
      onChange(next);
      focusStar(next);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { ref: groupRef, className: "lf-rating", role: "radiogroup", "aria-labelledby": `${a11y.id}-label`, "aria-describedby": a11y["aria-describedby"], "aria-required": a11y["aria-required"], "aria-invalid": a11y["aria-invalid"], id: a11y.id, children: Array.from({ length: cap }, (_, i) => i + 1).map((n) => {
    const filled = n <= current;
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      "button",
      {
        type: "button",
        role: "radio",
        "aria-checked": n === current,
        "aria-label": `${n} ${n === 1 ? "star" : "stars"}`,
        className: `lf-star${filled ? " is-filled" : ""}`,
        disabled,
        tabIndex: n === (current || 1) ? 0 : -1,
        onClick: () => set(n),
        onKeyDown: onKey,
        children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { "aria-hidden": "true", children: filled ? "\u2605" : "\u2606" })
      },
      n
    );
  }) });
}
function RankingField({
  a11y,
  entity,
  value,
  disabled,
  onChange
}) {
  const opts = options(entity.attributes);
  const byValue = new Map(opts.map((o) => [o.value, o]));
  const optionValues = [...new Set(opts.map((o) => o.value))];
  const seen = /* @__PURE__ */ new Set();
  const seeded = asArray(value).map(String).filter((v) => byValue.has(v) && !seen.has(v) && (seen.add(v), true));
  const order = [...seeded, ...optionValues.filter((v) => !seen.has(v))];
  const [announce, setAnnounce] = (0, import_react13.useState)("");
  const move = (i, delta) => {
    if (disabled) return;
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setAnnounce(`${byValue.get(order[i])?.label ?? order[i]} moved to position ${j + 1} of ${order.length}`);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("ol", { className: "lf-ranking", id: a11y.id, "aria-labelledby": `${a11y.id}-label`, "aria-describedby": a11y["aria-describedby"], children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("li", { className: "lf-sr-only", "aria-live": "polite", children: announce }),
    order.map((v, i) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("li", { className: "lf-rank-item", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "lf-rank-pos", "aria-hidden": "true", children: i + 1 }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "lf-rank-label", children: byValue.get(v)?.label ?? v }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "lf-rank-controls", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "lf-rank-btn", disabled: disabled || i === 0, "aria-label": `Move ${byValue.get(v)?.label ?? v} up`, onClick: () => move(i, -1), children: "\u2191" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "lf-rank-btn", disabled: disabled || i === order.length - 1, "aria-label": `Move ${byValue.get(v)?.label ?? v} down`, onClick: () => move(i, 1), children: "\u2193" })
      ] })
    ] }, v))
  ] });
}
function MatrixField({
  a11y,
  entity,
  value,
  disabled,
  onChange
}) {
  const a = entity.attributes ?? {};
  const rows = Array.isArray(a.rows) ? a.rows : [];
  const cols = Array.isArray(a.columns) ? a.columns : [];
  const multiple = Boolean(a.multiple);
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const setCell = (rowV, colV) => {
    if (disabled) return;
    if (multiple) {
      const cur = asArray(data[rowV]).map(String);
      const next = cur.includes(colV) ? cur.filter((x) => x !== colV) : [...cur, colV];
      onChange({ ...data, [rowV]: next });
    } else {
      onChange({ ...data, [rowV]: colV });
    }
  };
  const checked = (rowV, colV) => multiple ? asArray(data[rowV]).map(String).includes(colV) : asText(data[rowV]) === colV;
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("table", { className: "lf-matrix", id: a11y.id, "aria-labelledby": `${a11y.id}-label`, "aria-describedby": a11y["aria-describedby"], children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { className: "lf-matrix-corner" }),
      cols.map((c) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { scope: "col", className: "lf-matrix-col", children: c.label }, c.value))
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("tbody", { children: rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { role: multiple ? "group" : "radiogroup", "aria-label": r.label, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { scope: "row", className: "lf-matrix-row", children: r.label }),
      cols.map((c) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { className: "lf-matrix-cell", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "input",
        {
          type: multiple ? "checkbox" : "radio",
          name: `${a11y.id}-${r.value}`,
          "aria-label": `${r.label}: ${c.label}`,
          checked: checked(r.value, c.value),
          disabled,
          onChange: () => setCell(r.value, c.value)
        }
      ) }, c.value))
    ] }, r.value)) })
  ] });
}
var ADDRESS_PARTS = [
  { key: "line1", label: "Address line 1", autocomplete: "address-line1" },
  { key: "line2", label: "Address line 2", autocomplete: "address-line2" },
  { key: "city", label: "City", autocomplete: "address-level2" },
  { key: "region", label: "State / Province", autocomplete: "address-level1" },
  { key: "postalCode", label: "Postal code", autocomplete: "postal-code" },
  { key: "country", label: "Country", autocomplete: "country-name" }
];
function AddressBlockField({
  a11y,
  value,
  disabled,
  onChange
}) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const setPart = (k, v) => !disabled && onChange({ ...data, [k]: v });
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "lf-address", role: "group", tabIndex: -1, "aria-labelledby": `${a11y.id}-label`, "aria-describedby": a11y["aria-describedby"], "aria-invalid": a11y["aria-invalid"], id: a11y.id, children: ADDRESS_PARTS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: `lf-address-part lf-address-${p.key}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("label", { htmlFor: `${a11y.id}-${p.key}`, className: "lf-address-label", children: p.label }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      "input",
      {
        id: `${a11y.id}-${p.key}`,
        type: "text",
        autoComplete: p.autocomplete,
        value: asText(data[p.key]),
        disabled,
        onChange: (e) => setPart(p.key, e.target.value)
      }
    )
  ] }, p.key)) });
}
var RT_COMMANDS = [
  { cmd: "bold", label: "Bold", icon: "B" },
  { cmd: "italic", label: "Italic", icon: "I" },
  { cmd: "underline", label: "Underline", icon: "U" },
  { cmd: "insertUnorderedList", label: "Bulleted list", icon: "\u2022\u2014" },
  { cmd: "insertOrderedList", label: "Numbered list", icon: "1." }
];
function RichTextField({
  a11y,
  value,
  disabled,
  onChange,
  sanitizeHtml = defaultSanitizeHtml
}) {
  const ref = (0, import_react13.useRef)(null);
  const initial = (0, import_react13.useRef)(sanitizeHtml(asText(value)));
  const emit = () => {
    if (ref.current) onChange(sanitizeHtml(ref.current.innerHTML));
  };
  (0, import_react13.useEffect)(() => {
    const el = ref.current;
    if (!el) return;
    const incoming = sanitizeHtml(asText(value));
    if (incoming !== el.innerHTML && el.ownerDocument.activeElement !== el) el.innerHTML = incoming;
  }, [value, sanitizeHtml]);
  const exec = (cmd) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(cmd, false);
    emit();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "lf-richtext", children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "lf-rt-toolbar", role: "toolbar", "aria-label": "Text formatting", "aria-controls": a11y.id, children: RT_COMMANDS.map((c) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "lf-rt-btn", "aria-label": c.label, title: c.label, disabled, onMouseDown: (e) => e.preventDefault(), onClick: () => exec(c.cmd), children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { "aria-hidden": "true", children: c.icon }) }, c.cmd)) }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      "div",
      {
        ref,
        id: a11y.id,
        className: "lf-rt-editor",
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": `${a11y.id}-label`,
        "aria-describedby": a11y["aria-describedby"],
        "aria-required": a11y["aria-required"],
        "aria-invalid": a11y["aria-invalid"],
        "aria-readonly": disabled || void 0,
        contentEditable: !disabled,
        suppressContentEditableWarning: true,
        onInput: emit,
        onBlur: emit,
        dangerouslySetInnerHTML: { __html: initial.current }
      }
    )
  ] });
}

// src/render/containers.tsx
var import_react14 = require("react");
var import_form_core6 = require("@lukeflow/form-core");
var import_jsx_runtime12 = require("react/jsx-runtime");
function Group({
  entity,
  fs,
  ctx,
  children
}) {
  const error = ctx.showErrors ? fs.error : null;
  const asyncMsg = !error ? ctx.asyncErrors[fs.key] : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("fieldset", { className: "lf-field lf-group", "data-type": entity.type, "aria-invalid": error || asyncMsg ? true : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("legend", { className: "lf-label", children: [
      labelText(entity.attributes) ?? fs.key,
      fs.isRequired && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { "aria-hidden": "true", children: " *" })
    ] }),
    children,
    error && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { role: "alert", className: "lf-error", children: error.message }),
    !error && asyncMsg && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { role: "alert", className: "lf-error lf-error-async", children: ctx.t(asyncMsg) })
  ] });
}
function GridField({
  entity,
  fs,
  ctx,
  schema
}) {
  const [page, setPage] = (0, import_react14.useState)(0);
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
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "lf-grid", "data-type": entity.type, children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "lf-container-label", children: labelText(entity.attributes) ?? key }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("table", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("tr", { children: [
        cells.map((c) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("th", { scope: "col", children: labelText(c.attributes) ?? cellKey(c) }, c.id)),
        !disabled && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("th", {})
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("tbody", { children: visibleRows.map((row, j) => {
        const i = start + j;
        return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("tr", { children: [
          cells.map((c) => {
            const ck = cellKey(c);
            const path = `${key}[${i}].${ck}`;
            const value = row?.[ck];
            const visible = (0, import_form_core6.evaluateVisibility)(c.attributes, { ...top, ...row }, { allowJs: ctx.allowJs, jsEvaluator: ctx.jsEvaluator });
            const required = (0, import_form_core6.evaluateRequired)(c.attributes, { ...top, ...row });
            return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("td", { children: visible && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              GridCell,
              {
                type: c.type,
                value,
                disabled,
                required,
                options: options(c.attributes),
                onChange: (v) => ctx.form.update(path, v),
                entity: c,
                scope: { ...top, ...row },
                id: path,
                "aria-label": `${labelText(c.attributes) ?? ck} row ${i + 1}`
              }
            ) }, c.id);
          }),
          !disabled && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "lf-row-remove", onClick: () => replace(rows.filter((_, k) => k !== i)), children: "Remove" }) })
        ] }, i);
      }) }),
      hasAggregates && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("tfoot", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("tr", { className: "lf-grid-aggregates", children: [
        cells.map((c) => {
          const kind = c.attributes?.aggregate;
          return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("td", { children: typeof kind === "string" ? aggregate(rows, cellKey(c), kind) : "" }, c.id);
        }),
        !disabled && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("td", {})
      ] }) })
    ] }),
    paged && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "lf-grid-pager", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", disabled: safePage === 0, onClick: () => setPage(safePage - 1), children: "Prev" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "lf-grid-page", children: [
        "Rows ",
        start + 1,
        "\u2013",
        Math.min(start + pageSize, rows.length),
        " of ",
        rows.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", disabled: safePage >= pageCount - 1, onClick: () => setPage(safePage + 1), children: "Next" })
    ] }),
    !disabled && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "lf-row-add", onClick: () => replace([...rows, {}]), children: "Add row" }),
    error && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { role: "alert", className: "lf-error", children: error.message })
  ] });
}
function GridCell({
  type,
  value,
  disabled,
  required,
  options: opts,
  onChange,
  entity,
  scope,
  id,
  ...rest
}) {
  const a = entity?.attributes ?? {};
  const ariaRequired = required || void 0;
  const a11y = { id: id ?? "", name: id ?? "", disabled, "aria-label": rest["aria-label"], "aria-required": ariaRequired };
  if (type === "checkbox") {
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("input", { type: "checkbox", ...rest, "aria-required": ariaRequired, checked: Boolean(value), disabled, onChange: (e) => onChange(e.target.checked) });
  }
  if (type === "selectBoxes") {
    const selected = new Set((Array.isArray(value) ? value : []).map(String));
    const toggle = (v, on) => {
      const next = new Set(selected);
      if (on) next.add(v);
      else next.delete(v);
      onChange([...next]);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "lf-cell-choices", role: "group", "aria-label": rest["aria-label"], "aria-required": ariaRequired, children: opts.map((o) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "lf-cell-check", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("input", { type: "checkbox", checked: selected.has(o.value), disabled, onChange: (e) => toggle(o.value, e.target.checked) }),
      " ",
      o.label
    ] }, o.value)) });
  }
  if (type === "select" || type === "radio") {
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("select", { ...rest, "aria-required": ariaRequired, value: asText(value), disabled, onChange: (e) => onChange(e.target.value), children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: "" }),
      opts.map((o) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: o.value, children: o.label }, o.value))
    ] });
  }
  if (type === "file") {
    const fileEntity = entity ?? { id: id ?? "", type: "file", attributes: a };
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(FileField, { a11y, multiple: Boolean(a.multiple), value, disabled, onChange, entity: fileEntity, scope: scope ?? {} });
  }
  if (type === "signature") {
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(SignatureField, { a11y, value, disabled, onChange, penColor: typeof a.penColor === "string" ? a.penColor : void 0, allowType: Boolean(a.allowType) });
  }
  if (type === "textarea") {
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("textarea", { ...rest, "aria-required": ariaRequired, rows: 2, value: asText(value), disabled, onChange: (e) => onChange(e.target.value) });
  }
  const mask = typeof a.inputMask === "string" ? a.inputMask : "";
  const numeric = type === "number" || type === "currency";
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
    "input",
    {
      type: mask || numeric ? "text" : inputType(type),
      inputMode: numeric ? "decimal" : void 0,
      ...rest,
      "aria-required": ariaRequired,
      value: mask ? applyMask(asText(value), mask) : asText(value),
      disabled,
      onChange: (e) => onChange(mask ? applyMask(e.target.value, mask) : e.target.value)
    }
  );
}
function Static({ entity, sanitizeHtml = defaultSanitizeHtml }) {
  const a = entity.attributes ?? {};
  if (entity.type === "heading") {
    const text2 = labelText(a) ?? labelText(a, "content");
    if (!text2) return null;
    const size = typeof a.headingSize === "string" && /^h[1-6]$/.test(a.headingSize) ? a.headingSize : "h3";
    const Tag = size;
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Tag, { className: `lf-heading lf-heading--${size}`, children: text2 });
  }
  if (entity.type === "divider" || entity.type === "hr") return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("hr", { className: "lf-divider" });
  if (entity.type === "button") {
    const action = a.buttonAction === "reset" ? "reset" : a.buttonAction === "button" ? "button" : "submit";
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: action, className: "lf-button", "data-action": action, children: labelText(a) ?? "Submit" });
  }
  if (entity.type === "content" || entity.type === "html" || entity.type === "htmlElement") {
    const html = typeof a.content === "string" ? a.content : "";
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "lf-content", "data-type": entity.type, dangerouslySetInnerHTML: { __html: sanitizeHtml(html) } });
  }
  const text = labelText(a) ?? labelText(a, "content") ?? "";
  if (!text) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "lf-static", "data-type": entity.type, children: text });
}
var PANEL_THEMES = /* @__PURE__ */ new Set(["default", "primary", "secondary", "info", "success", "warning", "danger"]);
function PanelBox({ entity, schema, ctx, Render }) {
  const a = entity.attributes ?? {};
  const collapsible = Boolean(a.collapsible);
  const [open, setOpen] = (0, import_react14.useState)(!(collapsible && a.collapsed));
  const raw = typeof a.theme === "string" ? a.theme : "";
  const theme = PANEL_THEMES.has(raw) ? raw : "default";
  const title = labelText(a);
  const bodyId = `${entity.id}-panel-body`;
  const Wrapper = entity.type === "fieldset" ? "fieldset" : "section";
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Wrapper, { className: `lf-container lf-panel lf-panel--${theme}`, "data-type": entity.type, "data-collapsed": collapsible && !open ? "" : void 0, children: [
    collapsible ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("button", { type: "button", className: "lf-panel-head", "aria-expanded": open, "aria-controls": bodyId, onClick: () => setOpen((o) => !o), children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "lf-panel-caret", "aria-hidden": "true", children: open ? "\u25BE" : "\u25B8" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "lf-panel-title", children: title ? ctx.t(title) : ctx.t("Panel") })
    ] }) : title && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "lf-panel-head", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "lf-panel-title", children: ctx.t(title) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { id: bodyId, className: "lf-container-children lf-panel-body", hidden: !open, children: (entity.children ?? []).map((cid) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Render, { id: cid, schema, ctx }, cid)) })
  ] });
}
function TabsContainer({ entity, schema, ctx, Render }) {
  const a = entity.attributes ?? {};
  const children = entity.children ?? [];
  const [active, setActive] = (0, import_react14.useState)(0);
  const [focusIdx, setFocusIdx] = (0, import_react14.useState)(0);
  const [revealErrors, setRevealErrors] = (0, import_react14.useState)(false);
  const navRef = (0, import_react14.useRef)(null);
  const idx = Math.min(active, Math.max(0, children.length - 1));
  const vertical = Boolean(a.verticalTabs);
  const navigation = Boolean(a.navigation);
  const validateBeforeNext = Boolean(a.validateBeforeNext);
  const rootClass = `lf-container lf-tabs${vertical ? " lf-tabs--vertical" : ""}`;
  if (children.length === 0)
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: `${rootClass} lf-tabs--empty`, "data-type": "tabs", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "lf-tabs-empty", children: "No tabs yet \u2014 add fields to create tabs." }) });
  const tabId = (i) => `${entity.id}-tab-${i}`;
  const panelId = (i) => `${entity.id}-panel-${i}`;
  const tabLabel = (cid, i) => {
    const c = schema.entities[cid];
    const l = c && typeof c.attributes?.label === "string" && c.attributes.label ? c.attributes.label : `Tab ${i + 1}`;
    return ctx.t(l);
  };
  const activeTabKeys = () => {
    const cid = children[idx];
    const child = schema.entities[cid];
    const isContainer = child ? Boolean(ctx.reg.get(child.type)?.isContainer) : false;
    return isContainer ? pageFieldKeys(schema, cid, ctx.form) : [ctx.form.state.fields[cid]?.key].filter(Boolean);
  };
  const go = (target) => {
    const clamped = Math.max(0, Math.min(children.length - 1, target));
    if (validateBeforeNext && clamped > idx && !keysValid(ctx.form, activeTabKeys())) {
      setRevealErrors(true);
      return;
    }
    setRevealErrors(false);
    setActive(clamped);
    setFocusIdx(clamped);
  };
  const moveFocus = (to) => {
    const i = Math.max(0, Math.min(children.length - 1, to));
    setFocusIdx(i);
    navRef.current?.querySelectorAll('[role="tab"]')[i]?.focus();
  };
  const onTabKeyDown = (e) => {
    const fwd = vertical ? "ArrowDown" : "ArrowRight";
    const back = vertical ? "ArrowUp" : "ArrowLeft";
    if (e.key === fwd) e.preventDefault(), moveFocus(focusIdx + 1);
    else if (e.key === back) e.preventDefault(), moveFocus(focusIdx - 1);
    else if (e.key === "Home") e.preventDefault(), moveFocus(0);
    else if (e.key === "End") e.preventDefault(), moveFocus(children.length - 1);
  };
  const tabCtx = revealErrors ? { ...ctx, showErrors: true } : ctx;
  const renderTab = (cid) => {
    const child = schema.entities[cid];
    const isContainer = child ? Boolean(ctx.reg.get(child.type)?.isContainer) : false;
    return isContainer ? (child.children ?? []).map((gid) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Render, { id: gid, schema, ctx: tabCtx }, gid)) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Render, { id: cid, schema, ctx: tabCtx });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: rootClass, "data-type": "tabs", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "lf-tabs-nav", role: "tablist", "aria-orientation": vertical ? "vertical" : void 0, ref: navRef, children: children.map((cid, i) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "button",
      {
        type: "button",
        role: "tab",
        id: tabId(i),
        "aria-selected": i === idx,
        "aria-controls": panelId(i),
        tabIndex: i === focusIdx ? 0 : -1,
        className: `lf-tab${i === idx ? " is-active" : ""}`,
        onKeyDown: onTabKeyDown,
        onClick: () => go(i),
        children: tabLabel(cid, i)
      },
      cid
    )) }),
    children.map((cid, i) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { role: "tabpanel", id: panelId(i), "aria-labelledby": tabId(i), hidden: i !== idx, className: "lf-tabpanel", children: renderTab(cid) }, cid)),
    navigation && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "lf-tabs-foot", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "lf-tabs-prev", disabled: idx === 0, onClick: () => go(idx - 1), children: ctx.t("Previous") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "lf-tabs-progress", "aria-live": "polite", children: [
        idx + 1,
        " / ",
        children.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "lf-tabs-next", disabled: idx >= children.length - 1, onClick: () => go(idx + 1), children: ctx.t("Next") })
    ] })
  ] });
}
function TableGrid({ entity, schema, ctx, Render }) {
  const a = entity.attributes ?? {};
  const cols = Math.min(12, Math.max(1, Math.round(Number(a.numColumns)) || 2));
  const minRows = Math.max(0, Math.round(Number(a.numRows)) || 0);
  const children = entity.children ?? [];
  const rows = Math.max(minRows, Math.ceil(children.length / cols), 1);
  const title = labelText(a);
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("table", { className: "lf-table", "data-type": "table", children: [
    title && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("caption", { className: "lf-container-label", children: ctx.t(title) }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("tbody", { children: Array.from({ length: rows }).map((_, r) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("tr", { children: Array.from({ length: cols }).map((_2, c) => {
      const cid = children[r * cols + c];
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("td", { children: cid ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Render, { id: cid, schema, ctx }) : null }, c);
    }) }, r)) })
  ] });
}
function EditGridField({
  entity,
  fs,
  ctx,
  schema
}) {
  const [editing, setEditing] = (0, import_react14.useState)(null);
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
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "lf-edit-grid", "data-type": "editGrid", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "lf-container-label", children: labelText(entity.attributes) ?? key }),
    rows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "lf-eg-rows", children: rows.map((row, i) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { className: "lf-eg-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "lf-eg-summary", children: summary(row) || /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("em", { className: "lf-eg-empty", children: "Empty row" }) }),
      !disabled && !editing && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "lf-eg-row-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "lf-eg-edit", onClick: () => startEdit(i), children: ctx.t("Edit") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "lf-eg-remove", onClick: () => removeRow(i), children: ctx.t("Remove") })
      ] })
    ] }, i)) }),
    editing && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "lf-eg-editor", role: "group", "aria-label": editing.index >= rows.length ? "New row" : `Edit row ${editing.index + 1}`, children: [
      cells.map((c) => {
        const ck = cellKey(c);
        const rowScope = { ...top, ...editing.draft };
        if (!(0, import_form_core6.evaluateVisibility)(c.attributes, rowScope, { allowJs: ctx.allowJs, jsEvaluator: ctx.jsEvaluator })) return null;
        const label = labelText(c.attributes) ?? ck;
        const required = (0, import_form_core6.evaluateRequired)(c.attributes, rowScope);
        return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "lf-eg-cell", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "lf-eg-cell-label", children: [
            ctx.t(label),
            required && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { "aria-hidden": "true", children: " *" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            GridCell,
            {
              type: c.type,
              value: editing.draft[ck],
              disabled: false,
              required,
              options: options(c.attributes),
              onChange: (v) => setEditing((e) => e ? { ...e, draft: { ...e.draft, [ck]: v } } : e),
              entity: c,
              scope: rowScope,
              id: `${key}-eg-${ck}`,
              "aria-label": label
            }
          )
        ] }, c.id);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "lf-eg-editor-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "lf-eg-cancel", onClick: () => setEditing(null), children: ctx.t("Cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "lf-eg-save", onClick: commitDraft, children: ctx.t("Save") })
      ] })
    ] }),
    !disabled && !editing && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "lf-row-add", onClick: startAdd, children: ctx.t("Add another") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { role: "alert", className: "lf-error", children: error.message })
  ] });
}

// src/FormRenderer.tsx
var import_jsx_runtime13 = require("react/jsx-runtime");
function FormRenderer(props) {
  const { schema, initialValues, onSubmit, onChange, readOnly = false, registry, components, restore, onAutosave, autosaveDelay = 800, submitLabel = "Submit", theme, colorScheme, virtualize, sanitizeHtml, allowJs, jsEvaluator, onEvent, errorFallback, onResult, autoSubmitSignal, playback, className } = props;
  const formClass = ["lf-form", virtualize && "lf-virtualized", className].filter(Boolean).join(" ");
  const engineOptions = { initialValues, registry, restore, allowJs, jsEvaluator };
  const form = useFormEngine(schema, engineOptions);
  const [submitted, setSubmitted] = (0, import_react15.useState)(false);
  const client = useMinionClient();
  const [asyncErrors, setAsyncErrors] = (0, import_react15.useState)({});
  const onAutosaveRef = (0, import_react15.useRef)(onAutosave);
  onAutosaveRef.current = onAutosave;
  const autosaveTimer = (0, import_react15.useRef)(null);
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
  (0, import_react15.useEffect)(() => () => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      onAutosaveRef.current?.(form.engine.serialize());
    }
  }, [form.engine]);
  const focusFirstError = (0, import_react15.useCallback)(
    (errorKeys) => {
      if (typeof document === "undefined") return;
      for (const key of errorKeys) {
        const id = form.getField(key)?.entityId;
        const el = id ? document.getElementById(id) : null;
        if (el) {
          requestAnimationFrame(() => el.focus());
          return;
        }
      }
    },
    [form]
  );
  const submitProgrammatic = (0, import_react15.useCallback)(() => {
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
  (0, import_react15.useEffect)(() => {
    if (autoSubmitSignal) submitProgrammatic();
  }, [autoSubmitSignal]);
  const playbackSignal = playback?.signal;
  (0, import_react15.useEffect)(() => {
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
  const reg = registry ?? (0, import_form_core7.createDefaultFieldTypeRegistry)();
  const comps = components ?? {};
  const { t, dir } = useLocale();
  const themeCtx = useFormTheme();
  const mergedTokens = { ...themeCtx.theme, ...theme };
  const resolvedScheme = colorScheme ?? themeCtx.colorScheme;
  const mergedTheme = mergedTokens;
  const dataTheme = dataThemeAttr(resolvedScheme);
  const sanitize = sanitizeHtml ?? defaultSanitizeHtml;
  const ctx = { form, reg, readOnly, showErrors: submitted, asyncErrors, components: comps, t, sanitizeHtml: sanitize, allowJs: allowJs !== false, jsEvaluator, scope: form.getScope() };
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
  const content = pages ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
      theme: mergedTheme,
      dataTheme,
      sanitizeHtml: sanitize,
      allowJs,
      jsEvaluator,
      onSubmit,
      onResult,
      onEvent
    }
  ) : /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("form", { noValidate: true, dir, "data-theme": dataTheme, className: formClass, style: mergedTheme, onSubmit: handleSubmit, children: [
    schema.root.map((id) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(RenderEntity, { id, schema, ctx: ctxWithChange }, id)),
    submitLabel !== null && !readOnly && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "submit", className: "lf-submit", children: t(submitLabel) })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(FormErrorBoundary, { fallback: errorFallback, onError: (error) => onEvent?.({ type: "error", error }), children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(FormThemeProvider, { theme: mergedTokens, colorScheme: resolvedScheme, children: content }) });
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
  dataTheme,
  sanitizeHtml,
  allowJs,
  jsEvaluator,
  onSubmit,
  onResult,
  onEvent
}) {
  const [index, setIndex] = (0, import_react15.useState)(0);
  const [showErrors, setShowErrors] = (0, import_react15.useState)(false);
  const { t, dir } = useLocale();
  const pageRef = (0, import_react15.useRef)(null);
  const firstRender = (0, import_react15.useRef)(true);
  const visible = pages.filter((id) => form.state.fields[id]?.isVisible !== false);
  const safeIndex = Math.min(index, Math.max(0, visible.length - 1));
  const currentId = visible[safeIndex];
  const isLast = safeIndex >= visible.length - 1;
  (0, import_react15.useEffect)(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    pageRef.current?.focus();
  }, [safeIndex]);
  const ctx = { form, reg, readOnly, showErrors, asyncErrors: {}, components, t, sanitizeHtml: sanitizeHtml ?? defaultSanitizeHtml, allowJs: allowJs !== false, jsEvaluator, scope: form.getScope() };
  const next = () => {
    if (!currentId) return;
    if (keysValid(form, pageFieldKeys(schema, currentId, form))) {
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
    onResult?.({ ok: report.ok, errorCount: report.errorKeys.length, errorKeys: report.errorKeys });
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
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("form", { noValidate: true, dir, "data-theme": dataTheme, className, style: theme, onSubmit: submit, children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("ol", { className: "lf-wizard-steps", "aria-label": "Steps", children: visible.map((id, i) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("li", { className: i === safeIndex ? "is-active" : "", "aria-current": i === safeIndex ? "step" : void 0, children: t(pageLabel(schema, id, i)) }, id)) }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { ref: pageRef, tabIndex: -1, className: "lf-wizard-page", role: "group", "aria-label": currentId ? pageLabel(schema, currentId, safeIndex) : "Page", children: currentId && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(RenderEntity, { id: currentId, schema, ctx }) }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "lf-wizard-nav", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "lf-wizard-back", onClick: back, disabled: safeIndex === 0, children: t("Back") }),
      !isLast && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "lf-wizard-next", onClick: next, children: t("Next") }),
      isLast && submitLabel !== null && !readOnly && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "submit", className: "lf-submit", children: t(submitLabel) }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "lf-wizard-progress", children: [
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
  if (entity.type === "array" || entity.type === "map") return null;
  const ft = ctx.reg.get(entity.type);
  if (ft?.isGrid)
    return entity.type === "editGrid" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(EditGridField, { entity, fs, ctx, schema }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(GridField, { entity, fs, ctx, schema });
  if (ft?.isStatic) return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Static, { entity, sanitizeHtml: ctx.sanitizeHtml });
  if (ft?.isContainer) {
    if (entity.type === "tabs") return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(TabsContainer, { entity, schema, ctx, Render: RenderEntity });
    if (entity.type === "panel" || entity.type === "well" || entity.type === "fieldset")
      return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(PanelBox, { entity, schema, ctx, Render: RenderEntity });
    if (entity.type === "table") return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(TableGrid, { entity, schema, ctx, Render: RenderEntity });
    let cols;
    if (entity.type === "columns") {
      const raw = Number(entity.attributes?.numColumns);
      const declared = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 2;
      const childCount = entity.children?.length ?? 0;
      cols = childCount <= 1 ? 1 : Math.min(6, Math.max(1, declared));
    }
    const childStyle = cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : void 0;
    const bordered = Boolean(entity.attributes?.borders);
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: `lf-container${bordered ? " lf-container--bordered" : ""}`, "data-type": entity.type, children: [
      labelText(entity.attributes) && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "lf-container-label", children: labelText(entity.attributes) }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "lf-container-children", style: childStyle, children: (entity.children ?? []).map((cid) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(RenderEntity, { id: cid, schema, ctx }, cid)) })
    ] });
  }
  if (!fs) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Field, { entity, fs, ctx });
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
  const asyncErrId = !error && ctx.asyncErrors[key] ? `${id}-async-error` : void 0;
  const descId = labelText(a, "description") ? `${id}-desc` : void 0;
  const set = (value) => ctx.form.update(key, value);
  const a11y = {
    id,
    name: key,
    disabled,
    "aria-invalid": error || asyncErrId ? true : void 0,
    "aria-required": fs.isRequired ? true : void 0,
    "aria-describedby": [descId, errId, asyncErrId].filter(Boolean).join(" ") || void 0
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
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Group, { entity, fs, ctx, children: fieldOptions.map((o) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "lf-option", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Group, { entity, fs, ctx, children: fieldOptions.map((o) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "lf-option", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
    control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Custom, { entity, field: fs, value: fs.value, setValue: set, disabled, error: error?.message ?? null, id });
  } else
    switch (entity.type) {
      case "checkbox":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("input", { type: "checkbox", ...a11y, checked: Boolean(fs.value), onChange: (e) => set(e.target.checked) });
        break;
      case "textarea":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
        control = a.searchable && (0, import_form_core7.readDataSource)(a) ? (
          // Searchable + Minion-backed → server-side type-ahead (re-queries as you type),
          // so a value beyond the first page is still findable (unlike a static filter).
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(SearchSelect, { a11y, entity, value: fs.value, setValue: set, scope: ctx.scope, disabled, placeholder: ph })
        ) : a.searchable ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(SearchableSelect, { a11y, options: fieldOptions, value: fs.value, setValue: set, placeholder: ph, required: fs.isRequired, disabled, t: ctx.t }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("select", { ...a11y, value: asText(fs.value), onChange: (e) => set(e.target.value), children: [
          fs.isRequired ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: "", disabled: true, hidden: true, children: ph ?? "Select\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: "", children: ph ?? "" }),
          fieldOptions.map((o) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: o.value, children: ctx.t(o.label) }, o.value))
        ] });
        break;
      case "number":
      case "currency":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(SearchSelect, { a11y, entity, value: fs.value, setValue: set, scope: ctx.scope, disabled, placeholder: ph });
        break;
      case "tags":
      case "tagsField":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(TagsInput, { a11y, value: asArray(fs.value), disabled, onChange: set, placeholder: ph });
        break;
      case "file":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(FileField, { a11y, multiple: Boolean(a.multiple), value: fs.value, disabled, onChange: set, entity, scope: ctx.scope });
        break;
      case "signature":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(SignatureField, { a11y, value: fs.value, disabled, onChange: set, penColor: typeof a.penColor === "string" ? a.penColor : void 0, allowType: Boolean(a.allowType) });
        break;
      case "rating":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(RatingField, { a11y, value: fs.value, max: typeof a.max === "number" ? a.max : 5, disabled, onChange: set });
        break;
      case "ranking":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(RankingField, { a11y, entity, value: fs.value, disabled, onChange: set });
        break;
      case "matrix":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(MatrixField, { a11y, entity, value: fs.value, disabled, onChange: set });
        break;
      case "addressBlock":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(AddressBlockField, { a11y, value: fs.value, disabled, onChange: set });
        break;
      case "richText":
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(RichTextField, { a11y, value: fs.value, disabled, onChange: set, sanitizeHtml: ctx.sanitizeHtml });
        break;
      case "day":
      case "datetime":
      case "time":
        control = a.nativeInput ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(TextControl, { type: inputType(entity.type), a11y, extra: inputProps, mask: typeof a.inputMask === "string" ? a.inputMask : "", clearable: Boolean(a.clearable) && !disabled, value: fs.value, onChange: set }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          DateField,
          {
            a11y,
            kind: entity.type,
            value: fs.value,
            disabled,
            onChange: set,
            clearable: Boolean(a.clearable) && !disabled,
            minuteStep: typeof a.minuteStep === "number" ? a.minuteStep : 1
          }
        );
        break;
      default:
        control = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: fieldClass, "data-type": entity.type, "data-label-position": labelPos, "data-hide-label": hideLabel || void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { htmlFor: id, id: `${id}-label`, className: `lf-label${hideLabel ? " lf-sr-only" : ""}`, children: [
      ctx.t(labelText(a) ?? key),
      fs.isRequired && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { "aria-hidden": "true", children: " *" }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Tooltip, { text: tooltipText(a) })
    ] }),
    control,
    (Boolean(a.showCharCount) || Boolean(a.showWordCount)) && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { className: "lf-count", "aria-live": "off", children: [
      a.showCharCount ? `${asText(fs.value).length} characters` : "",
      a.showCharCount && a.showWordCount ? " \xB7 " : "",
      a.showWordCount ? `${wordCount(asText(fs.value))} words` : ""
    ] }),
    descId && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { id: descId, className: "lf-desc", children: ctx.t(labelText(a, "description")) }),
    error && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { id: errId, role: "alert", className: "lf-error", children: ctx.t(error.message ?? "") }),
    !error && ctx.asyncErrors[key] && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { id: asyncErrId, role: "alert", className: "lf-error lf-error-async", children: ctx.t(ctx.asyncErrors[key]) })
  ] });
}
async function runAsyncValidations(schema, form, client) {
  if (!client) return {};
  const scope = form.getScope();
  const checks = [];
  for (const [id, fs] of Object.entries(form.state.fields)) {
    if (!fs.isVisible) continue;
    const av = (0, import_form_core7.readAsyncValidation)(schema.entities[id]?.attributes);
    if (!av) continue;
    checks.push(
      (0, import_form_core7.runAsyncValidation)(av, scope, fs.value, client).then((r) => [fs.key, r.valid ? null : r.message ?? "Invalid"]).catch(() => [fs.key, null])
    );
  }
  const errs = {};
  for (const [key, msg] of await Promise.all(checks)) if (msg) errs[key] = msg;
  return errs;
}

// src/print.ts
var import_form_core8 = require("@lukeflow/form-core");
function printSubmission(schema, data, options2) {
  const html = (0, import_form_core8.toPrintableHtml)(schema, data, options2);
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
  FormThemeProvider,
  LocaleProvider,
  MinionProvider,
  VERSION,
  dataThemeAttr,
  defaultSanitizeHtml,
  getLocaleDirection,
  printSubmission,
  useFormEngine,
  useFormTheme,
  useLocale,
  useMinionClient,
  useMinionData,
  usePopoverTheme,
  useTranslate
});
//# sourceMappingURL=index.cjs.map