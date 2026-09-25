// src/useFormEngine.ts
import { useCallback, useRef, useState } from "react";
import {
  createFormEngine
} from "@lukeflow/form-core";
function useFormEngine(schema, options2) {
  const engineRef = useRef(null);
  const schemaRef = useRef(null);
  if (engineRef.current === null || schemaRef.current !== schema) {
    engineRef.current = createFormEngine().init(schema, options2);
    schemaRef.current = schema;
  }
  const engine = engineRef.current;
  const [state, setState] = useState(() => engine.getState());
  const sync = useCallback(() => setState(engine.getState()), [engine]);
  const update = useCallback(
    (key, value) => {
      engine.update(key, value);
      sync();
    },
    [engine, sync]
  );
  const setValues = useCallback(
    (values, opts) => {
      engine.setValues(values, opts);
      sync();
    },
    [engine, sync]
  );
  const validate = useCallback(
    (fields) => {
      const report = engine.validate(fields);
      sync();
      return report;
    },
    [engine, sync]
  );
  const reset = useCallback(() => {
    engine.reset();
    sync();
  }, [engine, sync]);
  const getField = useCallback((key) => engine.getField(key), [engine]);
  const collect = useCallback(() => engine.collect(), [engine]);
  const getScope = useCallback(() => engine.getScope(), [engine]);
  const getDiagnostics = useCallback(() => engine.getDiagnostics(), [engine]);
  return { state, getField, update, setValues, validate, reset, collect, getScope, getDiagnostics, engine };
}

// src/FormRenderer.tsx
import { useState as useState11, useEffect as useEffect8, useRef as useRef9, useCallback as useCallback2, useMemo as useMemo4 } from "react";
import {
  createDefaultFieldTypeRegistry,
  submitButtonId,
  readAsyncValidation,
  runAsyncValidation,
  readDataSource as readDataSource4
} from "@lukeflow/form-core";

// src/minions.tsx
import { createContext, useContext, useEffect, useState as useState2 } from "react";
import {
  readDataSource,
  resolveMinionParams,
  toOptions
} from "@lukeflow/form-core";
import { jsx } from "react/jsx-runtime";
var MinionContext = createContext(null);
function MinionProvider({ client, children }) {
  return /* @__PURE__ */ jsx(MinionContext.Provider, { value: client, children });
}
function useMinionClient() {
  return useContext(MinionContext);
}
var IDLE = { options: [], data: void 0, loading: false, error: null };
function useMinionData(entity, scope) {
  const client = useMinionClient();
  const ds = readDataSource(entity.attributes);
  const params = ds ? resolveMinionParams(ds, scope) : null;
  const key = ds ? JSON.stringify({ m: ds.minion, p: params }) : "";
  const [state, setState] = useState2(IDLE);
  useEffect(() => {
    if (!client || !ds) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    client.request(ds.minion, params ?? {}, controller.signal).then((res) => {
      if (!controller.signal.aborted) setState({ options: toOptions(res, ds), data: res, loading: false, error: null });
    }).catch((err) => {
      if (!controller.signal.aborted) {
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return () => controller.abort();
  }, [client, key]);
  return state;
}

// src/render/controls/PaymentField.tsx
import { useEffect as useEffect2, useMemo as useMemo3, useRef as useRef2 } from "react";
import {
  coercePaymentValue,
  currencyOf,
  readPaymentAttributes,
  resolvePaymentAmount,
  toMajorString
} from "@lukeflow/form-core";

// src/i18n.tsx
import { createContext as createContext2, useContext as useContext2, useMemo } from "react";
import { jsx as jsx2 } from "react/jsx-runtime";
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
var LocaleContext = createContext2({
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
  const formatters = useMemo(() => makeFormatters(locale), [locale]);
  const resolvedDir = useMemo(() => dir ?? getLocaleDirection(locale), [dir, locale]);
  const translate = useMemo(
    () => t ?? (messages ? (s) => messages[s] ?? s : identity),
    [t, messages]
  );
  const info = useMemo(
    () => ({ locale, dir: resolvedDir, t: translate, ...formatters }),
    [locale, resolvedDir, translate, formatters]
  );
  return /* @__PURE__ */ jsx2(LocaleContext.Provider, { value: info, children });
}
function useLocale() {
  return useContext2(LocaleContext);
}
function useTranslate() {
  return useContext2(LocaleContext).t;
}

// src/payments.tsx
import { createContext as createContext3, useContext as useContext3, useMemo as useMemo2, useSyncExternalStore } from "react";
import { jsx as jsx3 } from "react/jsx-runtime";
var NOT_READY = "The payment form hasn't finished loading. Please wait a moment and try again.";
var UNAVAILABLE = "Card payments aren't available right now. Please try again later.";
function createPaymentSession(processor) {
  let state = { phase: "loading", complete: false, error: null };
  let mount = null;
  const listeners = /* @__PURE__ */ new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const l of [...listeners]) l();
  };
  const message = (err, fallback) => err instanceof Error && err.message ? err.message : typeof err === "string" && err ? err : fallback;
  const unavailable = () => state.phase === "unavailable";
  const finish = (patch) => set(unavailable() ? { phase: "unavailable", error: UNAVAILABLE } : patch);
  return {
    processor,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async validate() {
      if (!mount || state.phase === "unavailable") {
        const msg = state.phase === "unavailable" ? UNAVAILABLE : NOT_READY;
        set({ error: msg });
        return msg;
      }
      set({ phase: "validating", error: null });
      try {
        const err = await mount.validate();
        finish({ phase: "ready", error: err });
        return unavailable() ? UNAVAILABLE : err;
      } catch (e) {
        const msg = message(e, "Check your payment details and try again.");
        finish({ phase: "ready", error: msg });
        return unavailable() ? UNAVAILABLE : msg;
      }
    },
    async confirm(clientSecret, amount) {
      if (!mount || state.phase === "unavailable") {
        const msg = state.phase === "unavailable" ? UNAVAILABLE : NOT_READY;
        set({ error: msg });
        return { status: "failed", message: msg };
      }
      set({ phase: "confirming", error: null });
      try {
        const result = await mount.confirm(clientSecret, amount);
        if (result.status === "failed") finish({ phase: "ready", error: result.message });
        else set({ phase: result.status, error: null });
        return result;
      } catch (e) {
        const msg = message(e, "The payment didn't go through. Please try again.");
        finish({ phase: "ready", error: msg });
        return { status: "failed", message: msg };
      }
    },
    setError(error) {
      set({ error });
    },
    _attach(m) {
      mount = m;
      const stale = state.error === NOT_READY || state.error === UNAVAILABLE;
      set(stale ? { phase: "ready", error: null } : { phase: "ready" });
      return () => {
        if (mount === m) {
          mount = null;
          set({ phase: "loading", complete: false });
        }
      };
    },
    _setPhase(phase, error) {
      set(error === void 0 ? { phase } : { phase, error });
    },
    _setComplete(complete) {
      if (complete !== state.complete) set({ complete });
    }
  };
}
var PaymentsContext = createContext3(null);
function PaymentsProvider({ session, pricingSchema = null, children }) {
  const value = useMemo2(() => ({ session, pricingSchema }), [session, pricingSchema]);
  return /* @__PURE__ */ jsx3(PaymentsContext.Provider, { value, children });
}
function usePaymentSession() {
  return useContext3(PaymentsContext)?.session ?? null;
}
function usePaymentPricingSchema() {
  return useContext3(PaymentsContext)?.pricingSchema ?? null;
}
var IDLE2 = { phase: "unavailable", complete: false, error: null };
var noop = () => () => {
};
function usePaymentState(session) {
  return useSyncExternalStore(
    session ? session.subscribe : noop,
    () => session ? session.getState() : IDLE2,
    () => session ? session.getState() : IDLE2
  );
}
var PAYMENT_UNAVAILABLE_MESSAGE = UNAVAILABLE;

// src/render/controls/PaymentField.tsx
import { Fragment, jsx as jsx4, jsxs } from "react/jsx-runtime";
function provisionalAmount(entity, currency) {
  const cfg = readPaymentAttributes(entity);
  const positive = (n) => typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : 0;
  if (cfg.amountMode === "entered") return positive(cfg.minAmountMinor) || currency.minimumMinor;
  return positive(cfg.amountMinor) || currency.minimumMinor;
}
function PaymentField({ a11y, entity, schema, scope, value, readOnly, t }) {
  const { formatNumber, locale } = useLocale();
  const session = usePaymentSession();
  const pricingSchema = usePaymentPricingSchema() ?? schema;
  const state = usePaymentState(readOnly ? null : session);
  const cfg = readPaymentAttributes(entity);
  const currency = currencyOf(cfg.currency);
  const resolution = useMemo3(() => resolvePaymentAmount(pricingSchema, scope), [pricingSchema, scope]);
  const money = (minor, c) => formatNumber(Number(toMajorString(minor, c)), {
    style: "currency",
    currency: c.code,
    minimumFractionDigits: c.exponent,
    maximumFractionDigits: c.exponent
  });
  const fill = (template, amount) => t(template, { amount }).replace("{amount}", amount);
  let summary;
  if (!currency) summary = t("Payment isn't set up yet.");
  else if (resolution.ok) summary = fill("Total: {amount}", money(resolution.amountMinor, currency));
  else if (cfg.amountMode === "perUnit" && typeof cfg.amountMinor === "number" && cfg.amountMinor > 0)
    summary = fill("{amount} each", money(cfg.amountMinor, currency));
  else if (cfg.amountMode === "entered") summary = t("Enter the amount you'd like to pay.");
  else summary = t("Payment isn't set up yet.");
  const amountMinor = currency ? resolution.ok ? resolution.amountMinor : provisionalAmount(entity, currency) : 0;
  const boxRef = useRef2(null);
  const mountRef = useRef2(null);
  const amountRef = useRef2(amountMinor);
  amountRef.current = amountMinor;
  const code = currency?.code ?? null;
  useEffect2(() => {
    const box = boxRef.current;
    if (!session || readOnly || !code || !box) return;
    let cancelled = false;
    let detach = null;
    let mounted = null;
    const abort = new AbortController();
    session._setPhase("loading");
    session.processor.mount({
      container: box,
      amountMinor: amountRef.current,
      currency: code,
      locale,
      onChange: ({ complete }) => session._setComplete(complete),
      onLoadError: () => {
        if (!cancelled) session._setPhase("unavailable", PAYMENT_UNAVAILABLE_MESSAGE);
      },
      signal: abort.signal
    }).then((m) => {
      if (cancelled) {
        m.destroy();
        return;
      }
      mounted = m;
      mountRef.current = m;
      detach = session._attach(m);
    }).catch(() => {
      if (!cancelled) session._setPhase("unavailable", PAYMENT_UNAVAILABLE_MESSAGE);
    });
    return () => {
      cancelled = true;
      abort.abort();
      mountRef.current = null;
      detach?.();
      mounted?.destroy();
    };
  }, [session, readOnly, code, locale]);
  const phase = state.phase;
  useEffect2(() => {
    if (!code || phase !== "ready") return;
    void Promise.resolve(mountRef.current?.update({ amountMinor, currency: code })).catch(() => {
    });
  }, [amountMinor, code, phase]);
  const errId = state.error ? `${a11y.id}-payment-error` : void 0;
  const describedBy = [a11y["aria-describedby"], errId].filter(Boolean).join(" ") || void 0;
  const recorded = coercePaymentValue(value);
  const recordedCurrency = currencyOf(recorded.currency);
  const charged = recordedCurrency && recorded.amountMinor > 0 ? money(recorded.amountMinor, recordedCurrency) : "";
  let body;
  if (readOnly) {
    const text = recorded.status === "paid" ? fill("Paid {amount}", charged) : recorded.status === "pending" ? t("Payment pending") : recorded.status === "failed" ? t("Payment failed") : t("Not paid");
    body = /* @__PURE__ */ jsx4("p", { className: "lf-payment-status", "data-status": recorded.status, children: text.trim() });
  } else if (!session && recorded.status === "paid") {
    body = /* @__PURE__ */ jsx4("p", { className: "lf-payment-status", "data-status": "paid", children: fill("Paid {amount}", charged).trim() });
  } else if (!session) {
    body = /* @__PURE__ */ jsx4("p", { className: "lf-payment-note", children: t("Card details are collected securely when this form is live.") });
  } else {
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx4("div", { ref: boxRef, className: "lf-payment-element", "data-phase": phase }),
      phase === "loading" && /* @__PURE__ */ jsx4("p", { className: "lf-payment-note", "aria-live": "polite", children: t("Loading secure payment form\u2026") }),
      (phase === "confirming" || phase === "validating") && /* @__PURE__ */ jsx4("p", { className: "lf-payment-note", "aria-live": "polite", children: t("Processing payment\u2026") })
    ] });
  }
  return /* @__PURE__ */ jsxs(
    "div",
    {
      id: a11y.id,
      role: "group",
      className: "lf-payment",
      "aria-labelledby": `${a11y.id}-label`,
      "aria-describedby": describedBy,
      "aria-busy": phase === "loading" || phase === "confirming" || phase === "validating" || void 0,
      "data-phase": readOnly ? "readonly" : session ? phase : "preview",
      tabIndex: -1,
      children: [
        /* @__PURE__ */ jsx4("p", { className: "lf-payment-summary", children: summary }),
        body,
        state.error && /* @__PURE__ */ jsx4("p", { id: errId, role: "alert", className: "lf-error", children: t(state.error) })
      ]
    }
  );
}

// src/theme.tsx
import { createContext as createContext4, useContext as useContext4 } from "react";
import { jsx as jsx5 } from "react/jsx-runtime";
var FormThemeContext = createContext4({});
function FormThemeProvider({
  theme,
  colorScheme,
  children
}) {
  return /* @__PURE__ */ jsx5(FormThemeContext.Provider, { value: { theme, colorScheme }, children });
}
function useFormTheme() {
  return useContext4(FormThemeContext);
}
function dataThemeAttr(scheme) {
  return scheme === "light" || scheme === "dark" ? scheme : void 0;
}
function usePopoverTheme() {
  const { theme, colorScheme } = useFormTheme();
  return { dataTheme: dataThemeAttr(colorScheme), themeStyle: theme ?? {} };
}

// src/errorBoundary.tsx
import { Component } from "react";
import { jsx as jsx6 } from "react/jsx-runtime";
var FormErrorBoundary = class extends Component {
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
      return this.props.fallback ?? /* @__PURE__ */ jsx6("div", { role: "alert", className: "lf-error lf-form-error", children: "Something went wrong displaying this form." });
    }
    return this.props.children;
  }
};

// src/render/sanitizeHtml.ts
import DOMPurify from "dompurify";
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
  if (DOMPurify.isSupported) {
    return DOMPurify.sanitize(dirty, {
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
import "@lukeflow/form-core";
var autofillSuppressed = true;
function setAutofillSuppression(enabled) {
  autofillSuppressed = enabled !== false;
}
function isAutofillSuppressed() {
  return autofillSuppressed;
}
function noAutofill(seed) {
  if (!autofillSuppressed) return {};
  return {
    autoComplete: `nf-${seed || "x"}`,
    "data-lpignore": "true",
    "data-1p-ignore": "true",
    "data-form-type": "other"
  };
}
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
import "react";
import { jsx as jsx7, jsxs as jsxs2 } from "react/jsx-runtime";
function XGlyph() {
  return /* @__PURE__ */ jsx7("svg", { className: "lf-x", viewBox: "0 0 24 24", width: "12", height: "12", "aria-hidden": "true", focusable: "false", children: /* @__PURE__ */ jsx7("path", { d: "M18 6L6 18M6 6l12 12", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function CalendarGlyph() {
  return /* @__PURE__ */ jsxs2("svg", { className: "lf-cal-icon", viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false", children: [
    /* @__PURE__ */ jsx7("rect", { x: "3", y: "4.5", width: "18", height: "16", rx: "2", fill: "none", stroke: "currentColor", strokeWidth: "2" }),
    /* @__PURE__ */ jsx7("path", { d: "M3 9h18M8 2.5v4M16 2.5v4", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" })
  ] });
}

// src/render/controls/Tooltip.tsx
import { useState as useState3, useEffect as useEffect3, useLayoutEffect, useRef as useRef3 } from "react";
import { createPortal } from "react-dom";
import { jsx as jsx8, jsxs as jsxs3 } from "react/jsx-runtime";
function Tooltip({ text }) {
  const ref = useRef3(null);
  const [anchor, setAnchor] = useState3(null);
  useEffect3(() => {
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
  return /* @__PURE__ */ jsxs3("span", { ref, className: "lf-tooltip", tabIndex: 0, role: "img", "aria-label": `Help: ${text}`, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, children: [
    /* @__PURE__ */ jsx8("span", { className: "lf-tooltip-icon", "aria-hidden": "true", children: "i" }),
    anchor && /* @__PURE__ */ jsx8(TooltipBubble, { text, anchor, doc: ref.current?.ownerDocument ?? null })
  ] });
}
function TooltipBubble({ text, anchor, doc }) {
  const ref = useRef3(null);
  const [box, setBox] = useState3(null);
  useLayoutEffect(() => {
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
  return createPortal(
    /* @__PURE__ */ jsxs3(
      "span",
      {
        ref,
        className: `lf-pop lf-tooltip-bubble--portal is-${box?.place ?? "top"}`,
        "data-theme": dataTheme,
        role: "tooltip",
        style: { ...themeStyle, position: "fixed", left: box?.left ?? anchor.cx, top: box?.top ?? anchor.top, visibility: box ? "visible" : "hidden" },
        children: [
          text,
          /* @__PURE__ */ jsx8("span", { className: "lf-tooltip-arrow", style: { left: box?.arrow ?? 0 } })
        ]
      }
    ),
    target
  );
}

// src/render/controls/Select.tsx
import { useState as useState5, useEffect as useEffect4, useRef as useRef4 } from "react";
import { createPortal as createPortal2 } from "react-dom";
import {
  readDataSource as readDataSource2,
  resolveMinionParams as resolveMinionParams2,
  toOptions as toOptions2
} from "@lukeflow/form-core";

// src/render/usePopover.ts
import { useLayoutEffect as useLayoutEffect2, useState as useState4 } from "react";
function useAnchoredPosition(anchorRef, open) {
  const [style, setStyle] = useState4(null);
  useLayoutEffect2(() => {
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
import { jsx as jsx9, jsxs as jsxs4 } from "react/jsx-runtime";
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
  const ds = readDataSource2(entity.attributes);
  const dsRaw = entity.attributes?.dataSource;
  const searchParam = typeof dsRaw?.searchParam === "string" ? dsRaw.searchParam : "q";
  const [query, setQuery] = useState5("");
  const [open, setOpen] = useState5(false);
  const [options2, setOptions] = useState5([]);
  const [loading, setLoading] = useState5(false);
  const [selectedLabel, setSelectedLabel] = useState5("");
  const [active, setActive] = useState5(-1);
  const timer = useRef4(null);
  const blurTimer = useRef4(null);
  const clearBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };
  useEffect4(() => () => clearBlur(), []);
  const choose = (o) => {
    clearBlur();
    setValue(o.value);
    setSelectedLabel(o.label);
    setQuery("");
    setOpen(false);
    setActive(-1);
  };
  const optionId = (i) => `${a11y.id}-opt-${i}`;
  useEffect4(() => {
    if (open && active >= 0) scrollOptionIntoView(optionId(active));
  }, [active, open]);
  useEffect4(() => {
    if (!client || !ds || !open) return;
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController();
    timer.current = setTimeout(() => {
      setLoading(true);
      client.request(ds.minion, { ...resolveMinionParams2(ds, scope), [searchParam]: query }, controller.signal).then((res) => {
        if (!controller.signal.aborted) setOptions(toOptions2(res, ds));
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
  const display2 = open ? query : selectedLabel || asText(value);
  const listId = `${a11y.id}-listbox`;
  const wrapRef = useRef4(null);
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
  return /* @__PURE__ */ jsxs4("div", { className: "lf-search-select", ref: wrapRef, children: [
    /* @__PURE__ */ jsx9(
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
        value: display2,
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
    open && (loading || options2.length > 0) && popoverTarget(wrapRef) && createPortal2(
      /* @__PURE__ */ jsxs4("ul", { id: listId, role: "listbox", className: "lf-pop lf-search-list", "data-theme": dataTheme, style: { ...themeStyle, ...popStyle ?? {} }, children: [
        loading && /* @__PURE__ */ jsx9("li", { className: "lf-search-loading", children: "Searching\u2026" }),
        options2.map((o, i) => /* @__PURE__ */ jsx9(
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
  const [query, setQuery] = useState5("");
  const [open, setOpen] = useState5(false);
  const [active, setActive] = useState5(-1);
  const blurTimer = useRef4(null);
  const selected = options2.find((o) => o.value === asText(value));
  const q = query.trim().toLowerCase();
  const filtered = q ? options2.filter((o) => t(o.label).toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options2;
  const listId = `${a11y.id}-listbox`;
  const optionId = (i) => `${a11y.id}-opt-${i}`;
  const clearBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };
  useEffect4(() => () => clearBlur(), []);
  useEffect4(() => {
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
  const display2 = open ? query : selected ? t(selected.label) : asText(value);
  const showClear = !disabled && !required && asText(value) !== "" && !open;
  const wrapRef = useRef4(null);
  const popStyle = useAnchoredPosition(wrapRef, open && filtered.length > 0);
  const { dataTheme, themeStyle } = usePopoverTheme();
  return /* @__PURE__ */ jsxs4("div", { className: "lf-search-select", ref: wrapRef, children: [
    /* @__PURE__ */ jsx9(
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
        value: display2,
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
    showClear && /* @__PURE__ */ jsx9("button", { type: "button", className: "lf-search-clear", "aria-label": "Clear", onMouseDown: (e) => e.preventDefault(), onClick: () => setValue(""), children: /* @__PURE__ */ jsx9(XGlyph, {}) }),
    open && filtered.length > 0 && popoverTarget(wrapRef) && createPortal2(
      /* @__PURE__ */ jsx9("ul", { id: listId, role: "listbox", className: "lf-pop lf-search-list", "data-theme": dataTheme, style: { ...themeStyle, ...popStyle ?? {} }, children: filtered.map((o, i) => /* @__PURE__ */ jsx9(
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
import { useState as useState6 } from "react";
import "@lukeflow/form-core";
import { jsx as jsx10, jsxs as jsxs5 } from "react/jsx-runtime";
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
  const input = /* @__PURE__ */ jsx10("input", { type, ...a11y, ...extra, value: v, onChange: (e) => handle(e.target.value) });
  if (!clearable) return input;
  return /* @__PURE__ */ jsxs5("span", { className: "lf-input-wrap", children: [
    input,
    showClear && /* @__PURE__ */ jsx10("button", { type: "button", className: "lf-clear", "aria-label": "Clear", onClick: () => onChange(""), children: /* @__PURE__ */ jsx10(XGlyph, {}) })
  ] });
}
function TagsInput({
  a11y,
  value,
  disabled,
  onChange,
  placeholder
}) {
  const [draft, setDraft] = useState6("");
  const tags = value.map(String);
  const add = (raw) => {
    const t = raw.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  };
  return /* @__PURE__ */ jsxs5("div", { className: "lf-tags", children: [
    tags.map((t) => /* @__PURE__ */ jsxs5("span", { className: "lf-tag", children: [
      t,
      /* @__PURE__ */ jsx10("button", { type: "button", "aria-label": `Remove ${t}`, disabled, onClick: () => onChange(tags.filter((x) => x !== t)), children: /* @__PURE__ */ jsx10(XGlyph, {}) })
    ] }, t)),
    /* @__PURE__ */ jsx10(
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
  decimalLimit,
  delimiter,
  onChange
}) {
  const { formatNumber } = useLocale();
  const [focused, setFocused] = useState6(false);
  const raw = asText(value);
  let display2 = raw;
  if (!focused && raw !== "") {
    const n = Number(raw);
    const fixed = typeof decimalLimit === "number" && Number.isFinite(decimalLimit) && decimalLimit >= 0;
    if (!Number.isNaN(n) && (currency || fixed || delimiter)) {
      display2 = formatNumber(n, {
        ...currency ? { style: "currency", currency } : {},
        ...fixed ? { minimumFractionDigits: decimalLimit, maximumFractionDigits: decimalLimit } : {},
        // A plain number groups only when the author asked; currency groups by locale convention.
        ...currency ? {} : { useGrouping: Boolean(delimiter) }
      });
    }
  }
  return /* @__PURE__ */ jsxs5("span", { className: "lf-number", children: [
    prefix && /* @__PURE__ */ jsx10("span", { className: "lf-affix lf-prefix", children: prefix }),
    /* @__PURE__ */ jsx10(
      "input",
      {
        type: "text",
        inputMode: "decimal",
        ...a11y,
        ...extra,
        value: display2,
        onFocus: () => setFocused(true),
        onBlur: () => {
          setFocused(false);
          a11y.onBlur?.();
        },
        onChange: (e) => onChange(e.target.value)
      }
    ),
    suffix && /* @__PURE__ */ jsx10("span", { className: "lf-affix lf-suffix", children: suffix })
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
  const [uploading, setUploading] = useState6(false);
  const [error, setError] = useState6(null);
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
  return /* @__PURE__ */ jsxs5("div", { className: "lf-file", children: [
    /* @__PURE__ */ jsx10(
      "input",
      {
        ...a11y,
        type: "file",
        accept: typeof entity.attributes?.accept === "string" && entity.attributes.accept ? entity.attributes.accept : void 0,
        multiple,
        disabled: disabled || uploading,
        onChange: (e) => handle(e.target.files)
      }
    ),
    uploading && /* @__PURE__ */ jsx10("span", { className: "lf-file-uploading", children: "Uploading\u2026" }),
    error && /* @__PURE__ */ jsx10("p", { role: "alert", className: "lf-error", children: error }),
    files.length > 0 && /* @__PURE__ */ jsx10("ul", { className: "lf-file-list", children: files.map((f, i) => /* @__PURE__ */ jsx10("li", { children: typeof f.url === "string" && /^(https?:|mailto:)/i.test(f.url.trim()) ? /* @__PURE__ */ jsx10("a", { href: f.url, target: "_blank", rel: "noreferrer", children: f.name ?? "file" }) : f.name ?? "file" }, i)) })
  ] });
}

// src/render/controls/SignatureField.tsx
import { useState as useState7, useEffect as useEffect5, useRef as useRef5 } from "react";
import { jsx as jsx11, jsxs as jsxs6 } from "react/jsx-runtime";
function SignatureField({
  a11y,
  value,
  disabled,
  onChange,
  penColor,
  allowType
}) {
  const canvasRef = useRef5(null);
  const drawing = useRef5(false);
  const painted = useRef5("");
  const dataUrl = typeof value === "string" ? value : "";
  const [hasInk, setHasInk] = useState7(Boolean(dataUrl));
  const [mode, setMode] = useState7("draw");
  const [typed, setTyped] = useState7("");
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
  useEffect5(() => {
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
  const onUpRef = useRef5(onUp);
  onUpRef.current = onUp;
  useEffect5(() => {
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
  const typedTimer = useRef5(null);
  useEffect5(() => () => {
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
  return /* @__PURE__ */ jsxs6("div", { className: "lf-signature", "data-disabled": disabled || void 0, children: [
    allowType && /* @__PURE__ */ jsxs6("div", { className: "lf-signature-modes", role: "group", "aria-label": "Signature mode", children: [
      /* @__PURE__ */ jsx11("button", { type: "button", "aria-pressed": mode === "draw", className: `lf-signature-mode${mode === "draw" ? " is-active" : ""}`, onClick: () => switchMode("draw"), disabled, children: "Draw" }),
      /* @__PURE__ */ jsx11("button", { type: "button", "aria-pressed": mode === "type", className: `lf-signature-mode${mode === "type" ? " is-active" : ""}`, onClick: () => switchMode("type"), disabled, children: "Type" })
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "lf-signature-padwrap", children: [
      /* @__PURE__ */ jsx11(
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
      !hasInk && /* @__PURE__ */ jsx11("span", { className: "lf-signature-hint", "aria-hidden": "true", children: disabled ? "" : mode === "type" ? "Type your name below" : "Sign here" })
    ] }),
    allowType && mode === "type" && /* @__PURE__ */ jsx11(
      "input",
      {
        type: "text",
        className: "lf-signature-typed",
        ...noAutofill(`${a11y.id}-typed`),
        "aria-label": "Typed signature name",
        placeholder: "Type your full name",
        value: typed,
        disabled,
        onChange: (e) => onTypedChange(e.target.value),
        onBlur: flushTyped
      }
    ),
    !disabled && hasInk && /* @__PURE__ */ jsx11("button", { type: "button", className: "lf-signature-clear", onClick: clear, children: "Clear" })
  ] });
}

// src/render/controls/DateField.tsx
import { useState as useState8, useEffect as useEffect6, useRef as useRef6 } from "react";
import { createPortal as createPortal3 } from "react-dom";
import { jsx as jsx12, jsxs as jsxs7 } from "react/jsx-runtime";
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
function display(kind, raw) {
  return kind === "datetime" && raw.includes("T") ? raw.replace("T", " ") : raw;
}
function toStored(kind, typed) {
  if (kind !== "datetime") return typed;
  return typed.includes(" ") && !typed.includes("T") ? typed.replace(" ", "T") : typed;
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
  const raw = toStored(kind, typeof value === "string" ? value : "");
  const date = parseDate(raw);
  const time = parseTime(raw, kind);
  const hasCal = kind === "day" || kind === "datetime";
  const hasTime = kind === "datetime" || kind === "time";
  const minStep = Math.max(1, Math.floor(minuteStep) || 1);
  const timeDisabled = disabled || kind === "datetime" && !date;
  const [open, setOpen] = useState8(false);
  const today = (() => {
    const n = /* @__PURE__ */ new Date();
    return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
  })();
  const [view, setView] = useState8(date ?? today);
  const [focused, setFocused] = useState8(date ?? today);
  const wrapRef = useRef6(null);
  const inputRef = useRef6(null);
  const gridRef = useRef6(null);
  const popRef = useRef6(null);
  const popStyle = useAnchoredPosition(wrapRef, open && hasCal);
  const { dataTheme, themeStyle } = usePopoverTheme();
  useEffect6(() => {
    if (!open) return;
    const onDown = (e) => {
      const t = e.target;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect6(() => {
    if (!open) return;
    const base = parseDate(typeof value === "string" ? value : "") ?? today;
    setView(base);
    setFocused(base);
  }, [open]);
  useEffect6(() => {
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
  return /* @__PURE__ */ jsxs7("div", { className: "lf-datefield", ref: wrapRef, children: [
    /* @__PURE__ */ jsxs7("div", { className: "lf-datefield-input", children: [
      /* @__PURE__ */ jsx12(
        "input",
        {
          ...a11y,
          ref: inputRef,
          type: "text",
          inputMode: kind === "time" ? "numeric" : void 0,
          autoComplete: "off",
          placeholder: kind === "day" ? "YYYY-MM-DD" : kind === "time" ? "HH:MM" : "YYYY-MM-DD HH:MM",
          value: display(kind, raw),
          disabled,
          onChange: (e) => onChange(toStored(kind, e.target.value)),
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
      showClear && /* @__PURE__ */ jsx12("button", { type: "button", className: "lf-datefield-clear", "aria-label": "Clear", onClick: () => onChange(""), children: /* @__PURE__ */ jsx12(XGlyph, {}) }),
      hasCal && /* @__PURE__ */ jsx12(
        "button",
        {
          type: "button",
          className: "lf-datefield-toggle",
          "aria-label": open ? "Close calendar" : "Open calendar",
          "aria-haspopup": "grid",
          "aria-expanded": open,
          disabled,
          onClick: () => open ? closeToInput() : openCal(),
          children: /* @__PURE__ */ jsx12(CalendarGlyph, {})
        }
      )
    ] }),
    hasTime && /* @__PURE__ */ jsxs7("span", { className: "lf-datefield-time", title: kind === "datetime" && !date ? "Pick a date first" : void 0, children: [
      /* @__PURE__ */ jsxs7(
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
            /* @__PURE__ */ jsx12("option", { value: "" }),
            Array.from({ length: 24 }, (_, h) => /* @__PURE__ */ jsx12("option", { value: h, children: pad(h) }, h))
          ]
        }
      ),
      /* @__PURE__ */ jsx12("span", { "aria-hidden": "true", children: ":" }),
      /* @__PURE__ */ jsxs7(
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
            /* @__PURE__ */ jsx12("option", { value: "" }),
            Array.from({ length: Math.ceil(60 / minStep) }, (_, i) => i * minStep).map((min) => /* @__PURE__ */ jsx12("option", { value: min, children: pad(min) }, min))
          ]
        }
      )
    ] }),
    open && hasCal && popoverTarget(wrapRef) && createPortal3(
      /* @__PURE__ */ jsxs7("div", { ref: popRef, className: "lf-pop lf-datefield-pop", "data-theme": dataTheme, role: "dialog", "aria-label": "Choose date", style: { ...themeStyle, ...popStyle ?? {} }, children: [
        /* @__PURE__ */ jsxs7("div", { className: "lf-cal-head", children: [
          /* @__PURE__ */ jsx12("button", { type: "button", className: "lf-cal-nav", "aria-label": "Previous month", onClick: () => shiftMonth(-1), children: "\u2039" }),
          /* @__PURE__ */ jsx12("span", { className: "lf-cal-title", "aria-live": "polite", children: monthLabel(view.y, view.m, locale) }),
          /* @__PURE__ */ jsx12("button", { type: "button", className: "lf-cal-nav", "aria-label": "Next month", onClick: () => shiftMonth(1), children: "\u203A" })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "lf-cal-grid", role: "grid", ref: gridRef, onKeyDown: onGridKey, children: [
          /* @__PURE__ */ jsx12("div", { className: "lf-cal-row", role: "row", children: weekdays.map((w, i) => /* @__PURE__ */ jsx12("span", { role: "columnheader", className: "lf-cal-wd", "aria-label": w.long, children: w.narrow }, i)) }),
          Array.from({ length: 6 }, (_, week) => /* @__PURE__ */ jsx12("div", { className: "lf-cal-row", role: "row", children: cells.slice(week * 7, week * 7 + 7).map((c) => {
            const inMonth = c.m === view.m;
            const isSel = date != null && sameDay(c, date);
            const isFocused = sameDay(c, focused);
            const isToday = sameDay(c, today);
            return /* @__PURE__ */ jsx12(
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
import { useEffect as useEffect7, useRef as useRef7, useState as useState9 } from "react";
import { createPortal as createPortal4 } from "react-dom";
import {
  ADDRESS_REQUIRED_PARTS,
  readDataSource as readDataSource3,
  resolveMinionParams as resolveMinionParams3,
  toAddressSuggestions
} from "@lukeflow/form-core";
import { jsx as jsx13, jsxs as jsxs8 } from "react/jsx-runtime";
function StepperField({
  a11y,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange
}) {
  const by = Math.abs(step) || 1;
  const lo = typeof min === "number" ? min : void 0;
  const hi = typeof max === "number" ? max : void 0;
  const current = typeof value === "number" && Number.isFinite(value) ? value : void 0;
  const clamp = (n) => {
    let out = n;
    if (lo !== void 0) out = Math.max(lo, out);
    if (hi !== void 0) out = Math.min(hi, out);
    const places = (String(by).split(".")[1] ?? "").length;
    return places ? Number(out.toFixed(places)) : out;
  };
  const nudge = (dir) => {
    if (disabled) return;
    onChange(clamp((current ?? 0) + dir * by));
  };
  const atMin = current !== void 0 && lo !== void 0 && current <= lo;
  const atMax = current !== void 0 && hi !== void 0 && current >= hi;
  return /* @__PURE__ */ jsxs8("div", { className: "lf-stepper", children: [
    /* @__PURE__ */ jsx13(
      "button",
      {
        type: "button",
        className: "lf-stepper-btn",
        tabIndex: -1,
        "aria-hidden": "true",
        disabled: disabled || atMin,
        onClick: () => nudge(-1),
        children: "\u2212"
      }
    ),
    /* @__PURE__ */ jsx13(
      "input",
      {
        ...a11y,
        type: "number",
        className: "lf-stepper-input",
        inputMode: Number.isInteger(by) ? "numeric" : "decimal",
        value: current ?? "",
        min: lo,
        max: hi,
        step: by,
        disabled,
        onChange: (e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(void 0);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : void 0);
        },
        onBlur: () => current !== void 0 && onChange(clamp(current))
      }
    ),
    /* @__PURE__ */ jsx13(
      "button",
      {
        type: "button",
        className: "lf-stepper-btn",
        tabIndex: -1,
        "aria-hidden": "true",
        disabled: disabled || atMax,
        onClick: () => nudge(1),
        children: "+"
      }
    )
  ] });
}
function RatingField({
  a11y,
  value,
  max = 5,
  disabled,
  onChange
}) {
  const cap = Math.max(1, Math.floor(max) || 5);
  const current = Math.min(cap, Math.max(0, Math.floor(Number(value) || 0)));
  const groupRef = useRef7(null);
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
  return /* @__PURE__ */ jsx13("div", { ref: groupRef, className: "lf-rating", role: "radiogroup", "aria-labelledby": `${a11y.id}-label`, "aria-describedby": a11y["aria-describedby"], "aria-required": a11y["aria-required"], "aria-invalid": a11y["aria-invalid"], id: a11y.id, children: Array.from({ length: cap }, (_, i) => i + 1).map((n) => {
    const filled = n <= current;
    return /* @__PURE__ */ jsx13(
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
        children: /* @__PURE__ */ jsx13("span", { "aria-hidden": "true", children: filled ? "\u2605" : "\u2606" })
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
  const [announce, setAnnounce] = useState9("");
  const move = (i, delta) => {
    if (disabled) return;
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setAnnounce(`${byValue.get(order[i])?.label ?? order[i]} moved to position ${j + 1} of ${order.length}`);
  };
  return /* @__PURE__ */ jsxs8("ol", { className: "lf-ranking", id: a11y.id, "aria-labelledby": `${a11y.id}-label`, "aria-describedby": a11y["aria-describedby"], children: [
    /* @__PURE__ */ jsx13("li", { className: "lf-sr-only", "aria-live": "polite", children: announce }),
    order.map((v, i) => /* @__PURE__ */ jsxs8("li", { className: "lf-rank-item", children: [
      /* @__PURE__ */ jsx13("span", { className: "lf-rank-pos", "aria-hidden": "true", children: i + 1 }),
      /* @__PURE__ */ jsx13("span", { className: "lf-rank-label", children: byValue.get(v)?.label ?? v }),
      /* @__PURE__ */ jsxs8("span", { className: "lf-rank-controls", children: [
        /* @__PURE__ */ jsx13("button", { type: "button", className: "lf-rank-btn", disabled: disabled || i === 0, "aria-label": `Move ${byValue.get(v)?.label ?? v} up`, onClick: () => move(i, -1), children: "\u2191" }),
        /* @__PURE__ */ jsx13("button", { type: "button", className: "lf-rank-btn", disabled: disabled || i === order.length - 1, "aria-label": `Move ${byValue.get(v)?.label ?? v} down`, onClick: () => move(i, 1), children: "\u2193" })
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
  return /* @__PURE__ */ jsxs8("table", { className: "lf-matrix", id: a11y.id, "aria-labelledby": `${a11y.id}-label`, "aria-describedby": a11y["aria-describedby"], children: [
    /* @__PURE__ */ jsx13("thead", { children: /* @__PURE__ */ jsxs8("tr", { children: [
      /* @__PURE__ */ jsx13("td", { className: "lf-matrix-corner" }),
      cols.map((c) => /* @__PURE__ */ jsx13("th", { scope: "col", className: "lf-matrix-col", children: c.label }, c.value))
    ] }) }),
    /* @__PURE__ */ jsx13("tbody", { children: rows.map((r) => /* @__PURE__ */ jsxs8("tr", { role: multiple ? "group" : "radiogroup", "aria-label": r.label, children: [
      /* @__PURE__ */ jsx13("th", { scope: "row", className: "lf-matrix-row", children: r.label }),
      cols.map((c) => /* @__PURE__ */ jsx13("td", { className: "lf-matrix-cell", children: /* @__PURE__ */ jsx13(
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
  { key: "streetAddress", label: "Street address" },
  { key: "steNumber", label: "Apt, suite, etc." },
  { key: "city", label: "City" },
  { key: "region", label: "State / Province" },
  { key: "postalCode", label: "Postal code" },
  { key: "country", label: "Country" }
];
var ADDRESS_REQUIRED = new Set(ADDRESS_REQUIRED_PARTS);
var DEFAULT_COUNTRY_CONFIG = { regionLabel: "State / Province", postalLabel: "Postal code" };
var COUNTRY_ADDRESS_CONFIG = {
  US: { regionLabel: "State", postalLabel: "ZIP code", postalPattern: /^\d{5}(-\d{4})?$/, postalExample: "12345" },
  GB: { regionLabel: "County", postalLabel: "Postcode", postalPattern: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/, postalExample: "SW1A 1AA" },
  IN: { regionLabel: "State", postalLabel: "PIN code", postalPattern: /^\d{6}$/, postalExample: "560001" },
  CA: { regionLabel: "Province", postalLabel: "Postal code", postalPattern: /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/, postalExample: "K1A 0B1" },
  AU: { regionLabel: "State / Territory", postalLabel: "Postcode", postalPattern: /^\d{4}$/, postalExample: "2000" },
  DE: { regionLabel: "State", postalLabel: "Postal code", postalPattern: /^\d{5}$/, postalExample: "10115" },
  FR: { regionLabel: "Region", postalLabel: "Postal code", postalPattern: /^\d{5}$/, postalExample: "75001" },
  JP: { regionLabel: "Prefecture", postalLabel: "Postal code", postalPattern: /^\d{3}-?\d{4}$/, postalExample: "100-0001" },
  BR: { regionLabel: "State", postalLabel: "CEP", postalPattern: /^\d{5}-?\d{3}$/, postalExample: "01000-000" }
};
var COUNTRY_NAME_TO_CODE = {
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "us": "US",
  "united kingdom": "GB",
  "uk": "GB",
  "great britain": "GB",
  "england": "GB",
  "scotland": "GB",
  "wales": "GB",
  india: "IN",
  canada: "CA",
  australia: "AU",
  germany: "DE",
  deutschland: "DE",
  france: "FR",
  japan: "JP",
  brazil: "BR",
  brasil: "BR"
};
function nameToCode(name) {
  if (typeof name !== "string" || !name) return "";
  return COUNTRY_NAME_TO_CODE[name.trim().toLowerCase()] ?? "";
}
function addressConfigFor(countryCode, countryName) {
  const code = (typeof countryCode === "string" && countryCode ? countryCode : nameToCode(countryName)).toUpperCase();
  return COUNTRY_ADDRESS_CONFIG[code] ?? DEFAULT_COUNTRY_CONFIG;
}
function AddressBlockField({
  a11y,
  entity,
  value,
  scope,
  disabled,
  onChange
}) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const setPart = (k, v) => !disabled && onChange({ ...data, [k]: v });
  const fill = (addr) => {
    if (disabled) return;
    const next = { ...data };
    for (const p of ADDRESS_PARTS) {
      const v = addr[p.key];
      if (v != null && v !== "") next[p.key] = String(v);
    }
    if (typeof addr.lat === "number") next.lat = addr.lat;
    if (typeof addr.lng === "number") next.lng = addr.lng;
    onChange(next);
  };
  const provider = entity ? readDataSource3(entity.attributes) : null;
  const cfg = addressConfigFor(data.countryCode, data.country);
  const postal = asText(data.postalCode);
  const postalInvalid = postal !== "" && cfg.postalPattern != null && !cfg.postalPattern.test(postal);
  const labelFor = (key) => key === "region" ? cfg.regionLabel : key === "postalCode" ? cfg.postalLabel : ADDRESS_PARTS.find((p) => p.key === key).label;
  const [manual, setManual] = useState9(false);
  const useAutocomplete = !!provider && !manual;
  const hasStructured = ["steNumber", "city", "region", "postalCode", "country"].some((k) => asText(data[k]) !== "");
  const showRest = !useAutocomplete || hasStructured;
  const blockRequired = a11y["aria-required"] === true;
  const blockInvalid = a11y["aria-invalid"] === true;
  const partInput = (key) => {
    const inputId = `${a11y.id}-${key}`;
    const isPostal = key === "postalCode";
    const partRequired = blockRequired && ADDRESS_REQUIRED.has(key);
    const emptyRequired = partRequired && blockInvalid && asText(data[key]) === "";
    const invalid = emptyRequired || isPostal && postalInvalid;
    const errId = invalid ? `${inputId}-error` : void 0;
    return /* @__PURE__ */ jsxs8("div", { className: `lf-address-part lf-address-${key}`, children: [
      /* @__PURE__ */ jsxs8("label", { htmlFor: inputId, className: "lf-address-label", children: [
        labelFor(key),
        partRequired && /* @__PURE__ */ jsx13("span", { "aria-hidden": "true", children: " *" })
      ] }),
      /* @__PURE__ */ jsx13(
        "input",
        {
          id: inputId,
          type: "text",
          ...noAutofill(inputId),
          placeholder: isPostal ? cfg.postalExample : void 0,
          "aria-required": partRequired || void 0,
          "aria-invalid": invalid || void 0,
          "aria-describedby": errId,
          value: asText(data[key]),
          disabled,
          onChange: (e) => setPart(key, e.target.value)
        }
      ),
      invalid && /* @__PURE__ */ jsx13("p", { id: errId, className: "lf-address-error lf-error", role: "alert", children: emptyRequired ? `${labelFor(key)} is required.` : `Enter a valid ${cfg.postalLabel.toLowerCase()}${cfg.postalExample ? ` (e.g. ${cfg.postalExample})` : ""}.` })
    ] }, key);
  };
  return /* @__PURE__ */ jsxs8("div", { className: "lf-address", role: "group", tabIndex: -1, "aria-labelledby": `${a11y.id}-label`, "aria-describedby": a11y["aria-describedby"], "aria-invalid": a11y["aria-invalid"], id: a11y.id, "data-mode": provider ? manual ? "manual" : showRest ? "filled" : "search" : "manual", children: [
    provider && /* @__PURE__ */ jsxs8("label", { className: "lf-address-toggle", children: [
      /* @__PURE__ */ jsx13(
        "input",
        {
          type: "checkbox",
          role: "switch",
          className: "lf-address-toggle-input",
          checked: manual,
          disabled,
          onChange: (e) => setManual(e.target.checked)
        }
      ),
      /* @__PURE__ */ jsx13("span", { className: "lf-address-toggle-track", "aria-hidden": "true", children: /* @__PURE__ */ jsx13("span", { className: "lf-address-toggle-thumb" }) }),
      /* @__PURE__ */ jsx13("span", { className: "lf-address-toggle-text", children: "Enter address manually" })
    ] }),
    useAutocomplete && entity ? /* @__PURE__ */ jsx13(
      AddressLine1Autocomplete,
      {
        a11y,
        entity,
        scope: scope ?? {},
        disabled,
        value: asText(data.streetAddress),
        required: blockRequired,
        invalid: blockRequired && blockInvalid && asText(data.streetAddress) === "",
        onType: (v) => setPart("streetAddress", v),
        onPick: fill
      }
    ) : partInput("streetAddress"),
    showRest && ["steNumber", "city", "region", "postalCode", "country"].map(partInput)
  ] });
}
function AddressSpinner() {
  return /* @__PURE__ */ jsxs8("svg", { className: "lf-spinner", width: "15", height: "15", viewBox: "0 0 24 24", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx13("circle", { cx: "12", cy: "12", r: "9", fill: "none", stroke: "currentColor", strokeOpacity: "0.25", strokeWidth: "3" }),
    /* @__PURE__ */ jsx13("path", { d: "M21 12a9 9 0 0 0-9-9", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", children: /* @__PURE__ */ jsx13("animateTransform", { attributeName: "transform", type: "rotate", from: "0 12 12", to: "360 12 12", dur: "0.7s", repeatCount: "indefinite" }) })
  ] });
}
function AddressPin() {
  return /* @__PURE__ */ jsxs8("svg", { className: "lf-address-pin", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx13("path", { d: "M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10z" }),
    /* @__PURE__ */ jsx13("circle", { cx: "12", cy: "11", r: "2" })
  ] });
}
function AddressLine1Autocomplete({
  a11y,
  entity,
  scope,
  disabled,
  value,
  required,
  invalid,
  onType,
  onPick
}) {
  const client = useMinionClient();
  const ds = readDataSource3(entity.attributes);
  const dsRaw = entity.attributes?.dataSource;
  const searchParam = typeof dsRaw?.searchParam === "string" ? dsRaw.searchParam : "q";
  const [open, setOpen] = useState9(false);
  const [suggestions, setSuggestions] = useState9([]);
  const [loading, setLoading] = useState9(false);
  const [searched, setSearched] = useState9(false);
  const [active, setActive] = useState9(-1);
  const timer = useRef7(null);
  const blurTimer = useRef7(null);
  const clearBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };
  useEffect7(() => () => clearBlur(), []);
  const inputId = `${a11y.id}-streetAddress`;
  const listId = `${a11y.id}-addr-listbox`;
  const optionId = (i) => `${a11y.id}-addr-opt-${i}`;
  useEffect7(() => {
    if (open && active >= 0) scrollOptionIntoView(optionId(active));
  }, [active, open]);
  useEffect7(() => {
    if (!client || !ds || !open || value.trim() === "") {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController();
    timer.current = setTimeout(() => {
      setLoading(true);
      client.request(ds.minion, { ...resolveMinionParams3(ds, scope), [searchParam]: value }, controller.signal).then((res) => {
        if (!controller.signal.aborted) {
          setSuggestions(toAddressSuggestions(res, ds));
          setSearched(true);
        }
      }).catch(() => {
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 200);
    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, open, client]);
  const choose = (s) => {
    clearBlur();
    onPick(s.address);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && suggestions[active]) {
        e.preventDefault();
        choose(suggestions[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };
  const wrapRef = useRef7(null);
  const dropdownOpen = !!client && open && value.trim() !== "" && (loading || suggestions.length > 0 || searched);
  const popStyle = useAnchoredPosition(wrapRef, dropdownOpen);
  const { dataTheme, themeStyle } = usePopoverTheme();
  return /* @__PURE__ */ jsxs8("div", { className: "lf-address-part lf-address-streetAddress", ref: wrapRef, children: [
    /* @__PURE__ */ jsxs8("label", { htmlFor: inputId, className: "lf-address-label", children: [
      "Street address",
      required && /* @__PURE__ */ jsx13("span", { "aria-hidden": "true", children: " *" })
    ] }),
    /* @__PURE__ */ jsx13(
      "input",
      {
        id: inputId,
        role: client ? "combobox" : void 0,
        "aria-expanded": client ? open : void 0,
        "aria-controls": client ? listId : void 0,
        "aria-autocomplete": client ? "list" : void 0,
        "aria-activedescendant": open && active >= 0 ? optionId(active) : void 0,
        "aria-required": required || void 0,
        "aria-invalid": invalid || void 0,
        "aria-describedby": invalid ? `${inputId}-error` : void 0,
        ...noAutofill(inputId),
        type: "text",
        disabled,
        value,
        placeholder: client ? "Start typing an address\u2026" : void 0,
        onFocus: () => {
          clearBlur();
          setOpen(true);
        },
        onChange: (e) => {
          onType(e.target.value);
          setOpen(true);
          setActive(-1);
          setSearched(false);
        },
        onKeyDown,
        onBlur: () => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }
      }
    ),
    invalid && /* @__PURE__ */ jsx13("p", { id: `${inputId}-error`, className: "lf-address-error lf-error", role: "alert", children: "Street address is required." }),
    dropdownOpen && popoverTarget(wrapRef) && createPortal4(
      /* @__PURE__ */ jsx13("ul", { id: listId, role: "listbox", className: "lf-pop lf-search-list lf-address-list", "data-theme": dataTheme, style: { ...themeStyle, ...popStyle ?? {} }, children: loading ? /* @__PURE__ */ jsxs8("li", { className: "lf-search-loading", "aria-live": "polite", children: [
        /* @__PURE__ */ jsx13(AddressSpinner, {}),
        /* @__PURE__ */ jsx13("span", { children: "Searching addresses\u2026" })
      ] }) : suggestions.length > 0 ? suggestions.map((s, i) => /* @__PURE__ */ jsxs8(
        "li",
        {
          id: optionId(i),
          role: "option",
          "aria-selected": i === active,
          className: `lf-address-option${i === active ? " is-active" : ""}`,
          onMouseDown: (e) => {
            e.preventDefault();
            choose(s);
          },
          children: [
            /* @__PURE__ */ jsx13(AddressPin, {}),
            /* @__PURE__ */ jsx13("span", { className: "lf-address-option-label", children: s.label })
          ]
        },
        s.id ?? s.label
      )) : /* @__PURE__ */ jsx13("li", { className: "lf-search-empty", children: "No matching addresses" }) }),
      popoverTarget(wrapRef)
    )
  ] });
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
  const ref = useRef7(null);
  const initial = useRef7(sanitizeHtml(asText(value)));
  const emit = () => {
    if (ref.current) onChange(sanitizeHtml(ref.current.innerHTML));
  };
  useEffect7(() => {
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
  return /* @__PURE__ */ jsxs8("div", { className: "lf-richtext", children: [
    /* @__PURE__ */ jsx13("div", { className: "lf-rt-toolbar", role: "toolbar", "aria-label": "Text formatting", "aria-controls": a11y.id, children: RT_COMMANDS.map((c) => /* @__PURE__ */ jsx13("button", { type: "button", className: "lf-rt-btn", "aria-label": c.label, title: c.label, disabled, onMouseDown: (e) => e.preventDefault(), onClick: () => exec(c.cmd), children: /* @__PURE__ */ jsx13("span", { "aria-hidden": "true", children: c.icon }) }, c.cmd)) }),
    /* @__PURE__ */ jsx13(
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
import { useRef as useRef8, useState as useState10 } from "react";
import {
  evaluateVisibility,
  evaluateRequired
} from "@lukeflow/form-core";
import { jsx as jsx14, jsxs as jsxs9 } from "react/jsx-runtime";
function Group({
  entity,
  fs,
  ctx,
  children
}) {
  const a = entity.attributes ?? {};
  const error = ctx.showErrors || ctx.revealed?.has(fs.key) ? fs.error : null;
  const asyncMsg = !error ? ctx.asyncErrors[fs.key] : void 0;
  const hideLabel = Boolean(a.hideLabel);
  const desc = labelText(a, "description");
  const descId = desc ? `${entity.id}-desc` : void 0;
  const cls = ["lf-field", "lf-group", typeof a.customClass === "string" ? a.customClass : ""].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsxs9(
    "fieldset",
    {
      className: cls,
      "data-type": entity.type,
      "data-inline": a.inline ? "true" : void 0,
      "data-hide-label": hideLabel || void 0,
      "aria-invalid": error || asyncMsg ? true : void 0,
      "aria-describedby": descId,
      children: [
        /* @__PURE__ */ jsxs9("legend", { className: `lf-label${hideLabel ? " lf-sr-only" : ""}`, children: [
          ctx.t(labelText(a) ?? fs.key),
          fs.isRequired && /* @__PURE__ */ jsx14("span", { "aria-hidden": "true", children: " *" }),
          /* @__PURE__ */ jsx14(Tooltip, { text: tooltipText(a) })
        ] }),
        children,
        desc && /* @__PURE__ */ jsx14("p", { id: descId, className: "lf-desc", children: ctx.t(desc) }),
        error && /* @__PURE__ */ jsx14("p", { role: "alert", className: "lf-error", children: ctx.t(error.message ?? "") }),
        !error && asyncMsg && /* @__PURE__ */ jsx14("p", { role: "alert", className: "lf-error lf-error-async", children: ctx.t(asyncMsg) })
      ]
    }
  );
}
function GridField({
  entity,
  fs,
  ctx,
  schema
}) {
  const [page, setPage] = useState10(0);
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
  return /* @__PURE__ */ jsxs9("div", { className: "lf-grid", "data-type": entity.type, children: [
    /* @__PURE__ */ jsx14("div", { className: "lf-container-label", children: labelText(entity.attributes) ?? key }),
    /* @__PURE__ */ jsxs9("table", { children: [
      /* @__PURE__ */ jsx14("thead", { children: /* @__PURE__ */ jsxs9("tr", { children: [
        cells.map((c) => /* @__PURE__ */ jsx14("th", { scope: "col", children: labelText(c.attributes) ?? cellKey(c) }, c.id)),
        !disabled && /* @__PURE__ */ jsx14("th", {})
      ] }) }),
      /* @__PURE__ */ jsx14("tbody", { children: visibleRows.map((row, j) => {
        const i = start + j;
        return /* @__PURE__ */ jsxs9("tr", { children: [
          cells.map((c) => {
            const ck = cellKey(c);
            const path = `${key}[${i}].${ck}`;
            const value = row?.[ck];
            const visible = evaluateVisibility(c.attributes, { ...top, ...row }, { allowJs: ctx.allowJs, jsEvaluator: ctx.jsEvaluator });
            const required = evaluateRequired(c.attributes, { ...top, ...row });
            return /* @__PURE__ */ jsx14("td", { children: visible && /* @__PURE__ */ jsx14(
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
          !disabled && /* @__PURE__ */ jsx14("td", { children: /* @__PURE__ */ jsx14("button", { type: "button", className: "lf-row-remove", onClick: () => replace(rows.filter((_, k) => k !== i)), children: "Remove" }) })
        ] }, i);
      }) }),
      hasAggregates && /* @__PURE__ */ jsx14("tfoot", { children: /* @__PURE__ */ jsxs9("tr", { className: "lf-grid-aggregates", children: [
        cells.map((c) => {
          const kind = c.attributes?.aggregate;
          return /* @__PURE__ */ jsx14("td", { children: typeof kind === "string" ? aggregate(rows, cellKey(c), kind) : "" }, c.id);
        }),
        !disabled && /* @__PURE__ */ jsx14("td", {})
      ] }) })
    ] }),
    paged && /* @__PURE__ */ jsxs9("div", { className: "lf-grid-pager", children: [
      /* @__PURE__ */ jsx14("button", { type: "button", disabled: safePage === 0, onClick: () => setPage(safePage - 1), children: "Prev" }),
      /* @__PURE__ */ jsxs9("span", { className: "lf-grid-page", children: [
        "Rows ",
        start + 1,
        "\u2013",
        Math.min(start + pageSize, rows.length),
        " of ",
        rows.length
      ] }),
      /* @__PURE__ */ jsx14("button", { type: "button", disabled: safePage >= pageCount - 1, onClick: () => setPage(safePage + 1), children: "Next" })
    ] }),
    !disabled && /* @__PURE__ */ jsx14("button", { type: "button", className: "lf-row-add", onClick: () => replace([...rows, {}]), children: "Add row" }),
    error && /* @__PURE__ */ jsx14("p", { role: "alert", className: "lf-error", children: error.message })
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
  const a11y = { id: id ?? "", name: id ?? "", disabled, "aria-label": rest["aria-label"], "aria-required": ariaRequired, ...noAutofill(id ?? "") };
  if (type === "checkbox") {
    return /* @__PURE__ */ jsx14("input", { type: "checkbox", ...rest, "aria-required": ariaRequired, checked: Boolean(value), disabled, onChange: (e) => onChange(e.target.checked) });
  }
  if (type === "selectBoxes") {
    const selected = new Set((Array.isArray(value) ? value : []).map(String));
    const toggle = (v, on) => {
      const next = new Set(selected);
      if (on) next.add(v);
      else next.delete(v);
      onChange([...next]);
    };
    return /* @__PURE__ */ jsx14("div", { className: "lf-cell-choices", role: "group", "aria-label": rest["aria-label"], "aria-required": ariaRequired, children: opts.map((o) => /* @__PURE__ */ jsxs9("label", { className: "lf-cell-check", children: [
      /* @__PURE__ */ jsx14("input", { type: "checkbox", checked: selected.has(o.value), disabled, onChange: (e) => toggle(o.value, e.target.checked) }),
      " ",
      o.label
    ] }, o.value)) });
  }
  if (type === "select" || type === "radio") {
    return /* @__PURE__ */ jsxs9("select", { ...rest, "aria-required": ariaRequired, value: asText(value), disabled, onChange: (e) => onChange(e.target.value), children: [
      /* @__PURE__ */ jsx14("option", { value: "" }),
      opts.map((o) => /* @__PURE__ */ jsx14("option", { value: o.value, children: o.label }, o.value))
    ] });
  }
  if (type === "file") {
    const fileEntity = entity ?? { id: id ?? "", type: "file", attributes: a };
    return /* @__PURE__ */ jsx14(FileField, { a11y, multiple: Boolean(a.multiple), value, disabled, onChange, entity: fileEntity, scope: scope ?? {} });
  }
  if (type === "signature") {
    return /* @__PURE__ */ jsx14(SignatureField, { a11y, value, disabled, onChange, penColor: typeof a.penColor === "string" ? a.penColor : void 0, allowType: Boolean(a.allowType) });
  }
  if (type === "textarea") {
    return /* @__PURE__ */ jsx14("textarea", { ...rest, ...noAutofill(id ?? ""), "aria-required": ariaRequired, rows: 2, value: asText(value), disabled, onChange: (e) => onChange(e.target.value) });
  }
  const mask = typeof a.inputMask === "string" ? a.inputMask : "";
  const numeric = type === "number" || type === "currency";
  return /* @__PURE__ */ jsx14(
    "input",
    {
      type: mask || numeric ? "text" : inputType(type),
      inputMode: numeric ? "decimal" : void 0,
      ...rest,
      ...noAutofill(id ?? ""),
      "aria-required": ariaRequired,
      value: mask ? applyMask(asText(value), mask) : asText(value),
      disabled,
      onChange: (e) => onChange(mask ? applyMask(e.target.value, mask) : e.target.value)
    }
  );
}
function Static({
  entity,
  sanitizeHtml = defaultSanitizeHtml,
  submitting = false
}) {
  const a = entity.attributes ?? {};
  if (entity.type === "heading") {
    const text2 = labelText(a) ?? labelText(a, "content");
    if (!text2) return null;
    const size = typeof a.headingSize === "string" && /^h[1-6]$/.test(a.headingSize) ? a.headingSize : "h3";
    const Tag = size;
    return /* @__PURE__ */ jsx14(Tag, { className: `lf-heading lf-heading--${size}`, children: text2 });
  }
  if (entity.type === "divider" || entity.type === "hr") return /* @__PURE__ */ jsx14("hr", { className: "lf-divider" });
  if (entity.type === "button") {
    const action = a.buttonAction === "reset" ? "reset" : a.buttonAction === "button" ? "button" : "submit";
    return /* @__PURE__ */ jsx14(
      "button",
      {
        type: action,
        className: "lf-button",
        "data-action": action,
        disabled: action === "submit" && submitting ? true : void 0,
        "aria-busy": action === "submit" && submitting ? true : void 0,
        children: labelText(a) ?? "Submit"
      }
    );
  }
  if (entity.type === "content" || entity.type === "html" || entity.type === "htmlElement") {
    const html = typeof a.content === "string" ? a.content : "";
    return /* @__PURE__ */ jsx14("div", { className: "lf-content", "data-type": entity.type, dangerouslySetInnerHTML: { __html: sanitizeHtml(html) } });
  }
  const text = labelText(a) ?? labelText(a, "content") ?? "";
  if (!text) return null;
  return /* @__PURE__ */ jsx14("div", { className: "lf-static", "data-type": entity.type, children: text });
}
var PANEL_THEMES = /* @__PURE__ */ new Set(["default", "primary", "secondary", "info", "success", "warning", "danger"]);
function PanelBox({ entity, schema, ctx, Render }) {
  const a = entity.attributes ?? {};
  const collapsible = Boolean(a.collapsible);
  const [open, setOpen] = useState10(!(collapsible && a.collapsed));
  const raw = typeof a.theme === "string" ? a.theme : "";
  const theme = PANEL_THEMES.has(raw) ? raw : "default";
  const title = labelText(a);
  const bodyId = `${entity.id}-panel-body`;
  const Wrapper = entity.type === "fieldset" ? "fieldset" : "section";
  return /* @__PURE__ */ jsxs9(Wrapper, { className: `lf-container lf-panel lf-panel--${theme}`, "data-type": entity.type, "data-collapsed": collapsible && !open ? "" : void 0, children: [
    collapsible ? /* @__PURE__ */ jsxs9("button", { type: "button", className: "lf-panel-head", "aria-expanded": open, "aria-controls": bodyId, onClick: () => setOpen((o) => !o), children: [
      /* @__PURE__ */ jsx14("span", { className: "lf-panel-caret", "aria-hidden": "true", children: open ? "\u25BE" : "\u25B8" }),
      /* @__PURE__ */ jsx14("span", { className: "lf-panel-title", children: title ? ctx.t(title) : ctx.t("Panel") })
    ] }) : title && /* @__PURE__ */ jsx14("div", { className: "lf-panel-head", children: /* @__PURE__ */ jsx14("span", { className: "lf-panel-title", children: ctx.t(title) }) }),
    /* @__PURE__ */ jsx14("div", { id: bodyId, className: "lf-container-children lf-panel-body", hidden: !open, children: (entity.children ?? []).map((cid) => /* @__PURE__ */ jsx14(Render, { id: cid, schema, ctx }, cid)) })
  ] });
}
function TabsContainer({ entity, schema, ctx, Render }) {
  const a = entity.attributes ?? {};
  const children = entity.children ?? [];
  const [active, setActive] = useState10(0);
  const [focusIdx, setFocusIdx] = useState10(0);
  const [revealErrors, setRevealErrors] = useState10(false);
  const navRef = useRef8(null);
  const idx = Math.min(active, Math.max(0, children.length - 1));
  const vertical = Boolean(a.verticalTabs);
  const navigation = Boolean(a.navigation);
  const validateBeforeNext = Boolean(a.validateBeforeNext);
  const rootClass = `lf-container lf-tabs${vertical ? " lf-tabs--vertical" : ""}`;
  if (children.length === 0)
    return /* @__PURE__ */ jsx14("div", { className: `${rootClass} lf-tabs--empty`, "data-type": "tabs", children: /* @__PURE__ */ jsx14("p", { className: "lf-tabs-empty", children: "No tabs yet \u2014 add fields to create tabs." }) });
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
    return isContainer ? (child.children ?? []).map((gid) => /* @__PURE__ */ jsx14(Render, { id: gid, schema, ctx: tabCtx }, gid)) : /* @__PURE__ */ jsx14(Render, { id: cid, schema, ctx: tabCtx });
  };
  return /* @__PURE__ */ jsxs9("div", { className: rootClass, "data-type": "tabs", children: [
    /* @__PURE__ */ jsx14("div", { className: "lf-tabs-nav", role: "tablist", "aria-orientation": vertical ? "vertical" : void 0, ref: navRef, children: children.map((cid, i) => /* @__PURE__ */ jsx14(
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
    children.map((cid, i) => /* @__PURE__ */ jsx14("div", { role: "tabpanel", id: panelId(i), "aria-labelledby": tabId(i), hidden: i !== idx, className: "lf-tabpanel", children: renderTab(cid) }, cid)),
    navigation && /* @__PURE__ */ jsxs9("div", { className: "lf-tabs-foot", children: [
      /* @__PURE__ */ jsx14("button", { type: "button", className: "lf-tabs-prev", disabled: idx === 0, onClick: () => go(idx - 1), children: ctx.t("Previous") }),
      /* @__PURE__ */ jsxs9("span", { className: "lf-tabs-progress", "aria-live": "polite", children: [
        idx + 1,
        " / ",
        children.length
      ] }),
      /* @__PURE__ */ jsx14("button", { type: "button", className: "lf-tabs-next", disabled: idx >= children.length - 1, onClick: () => go(idx + 1), children: ctx.t("Next") })
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
  return /* @__PURE__ */ jsxs9("table", { className: "lf-table", "data-type": "table", children: [
    title && /* @__PURE__ */ jsx14("caption", { className: "lf-container-label", children: ctx.t(title) }),
    /* @__PURE__ */ jsx14("tbody", { children: Array.from({ length: rows }).map((_, r) => /* @__PURE__ */ jsx14("tr", { children: Array.from({ length: cols }).map((_2, c) => {
      const cid = children[r * cols + c];
      return /* @__PURE__ */ jsx14("td", { children: cid ? /* @__PURE__ */ jsx14(Render, { id: cid, schema, ctx }) : null }, c);
    }) }, r)) })
  ] });
}
function EditGridField({
  entity,
  fs,
  ctx,
  schema
}) {
  const [editing, setEditing] = useState10(null);
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
  return /* @__PURE__ */ jsxs9("div", { className: "lf-edit-grid", "data-type": "editGrid", children: [
    /* @__PURE__ */ jsx14("div", { className: "lf-container-label", children: labelText(entity.attributes) ?? key }),
    rows.length > 0 && /* @__PURE__ */ jsx14("ul", { className: "lf-eg-rows", children: rows.map((row, i) => /* @__PURE__ */ jsxs9("li", { className: "lf-eg-row", children: [
      /* @__PURE__ */ jsx14("span", { className: "lf-eg-summary", children: summary(row) || /* @__PURE__ */ jsx14("em", { className: "lf-eg-empty", children: "Empty row" }) }),
      !disabled && !editing && /* @__PURE__ */ jsxs9("span", { className: "lf-eg-row-actions", children: [
        /* @__PURE__ */ jsx14("button", { type: "button", className: "lf-eg-edit", onClick: () => startEdit(i), children: ctx.t("Edit") }),
        /* @__PURE__ */ jsx14("button", { type: "button", className: "lf-eg-remove", onClick: () => removeRow(i), children: ctx.t("Remove") })
      ] })
    ] }, i)) }),
    editing && /* @__PURE__ */ jsxs9("div", { className: "lf-eg-editor", role: "group", "aria-label": editing.index >= rows.length ? "New row" : `Edit row ${editing.index + 1}`, children: [
      cells.map((c) => {
        const ck = cellKey(c);
        const rowScope = { ...top, ...editing.draft };
        if (!evaluateVisibility(c.attributes, rowScope, { allowJs: ctx.allowJs, jsEvaluator: ctx.jsEvaluator })) return null;
        const label = labelText(c.attributes) ?? ck;
        const required = evaluateRequired(c.attributes, rowScope);
        return /* @__PURE__ */ jsxs9("label", { className: "lf-eg-cell", children: [
          /* @__PURE__ */ jsxs9("span", { className: "lf-eg-cell-label", children: [
            ctx.t(label),
            required && /* @__PURE__ */ jsx14("span", { "aria-hidden": "true", children: " *" })
          ] }),
          /* @__PURE__ */ jsx14(
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
      /* @__PURE__ */ jsxs9("div", { className: "lf-eg-editor-actions", children: [
        /* @__PURE__ */ jsx14("button", { type: "button", className: "lf-eg-cancel", onClick: () => setEditing(null), children: ctx.t("Cancel") }),
        /* @__PURE__ */ jsx14("button", { type: "button", className: "lf-eg-save", onClick: commitDraft, children: ctx.t("Save") })
      ] })
    ] }),
    !disabled && !editing && /* @__PURE__ */ jsx14("button", { type: "button", className: "lf-row-add", onClick: startAdd, children: ctx.t("Add another") }),
    error && /* @__PURE__ */ jsx14("p", { role: "alert", className: "lf-error", children: error.message })
  ] });
}

// src/FormRenderer.tsx
import { Fragment as Fragment2, jsx as jsx15, jsxs as jsxs10 } from "react/jsx-runtime";
function FormRenderer(props) {
  const { schema, initialValues, onSubmit, onChange, readOnly = false, submitting = false, registry, components, restore, onAutosave, autosaveDelay = 800, beforeSubmit, theme, colorScheme, virtualize, sanitizeHtml, allowJs, jsEvaluator, onEvent, errorFallback, onResult, autoSubmitSignal, playback, className } = props;
  const authorSubmitId = useMemo4(() => submitButtonId(schema), [schema]);
  const submitLabel = props.submitLabel !== void 0 ? props.submitLabel : authorSubmitId ? null : "Submit";
  const formClass = ["lf-form", virtualize && "lf-virtualized", className].filter(Boolean).join(" ");
  const engineOptions = { initialValues, registry, restore, allowJs, jsEvaluator };
  const form = useFormEngine(schema, engineOptions);
  const [submitted, setSubmitted] = useState11(false);
  const client = useMinionClient();
  const [asyncErrors, setAsyncErrors] = useState11({});
  const validatingRef = useRef9(false);
  const [revealed, setRevealed] = useState11(() => /* @__PURE__ */ new Set());
  const validateField = form.validate;
  const reveal = useCallback2(
    (key) => {
      validateField([key]);
      setRevealed((prev) => prev.has(key) ? prev : new Set(prev).add(key));
    },
    [validateField]
  );
  const onAutosaveRef = useRef9(onAutosave);
  onAutosaveRef.current = onAutosave;
  const autosaveTimer = useRef9(null);
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
  useEffect8(() => () => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      onAutosaveRef.current?.(form.engine.serialize());
    }
  }, [form.engine]);
  const focusFirstError = useCallback2(
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
  const submitProgrammatic = useCallback2(() => {
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
  useEffect8(() => {
    if (autoSubmitSignal) submitProgrammatic();
  }, [autoSubmitSignal]);
  const playbackSignal = playback?.signal;
  useEffect8(() => {
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
  const reg = registry ?? createDefaultFieldTypeRegistry();
  const comps = components ?? {};
  const { t, dir } = useLocale();
  const themeCtx = useFormTheme();
  const mergedTokens = { ...themeCtx.theme, ...theme };
  const resolvedScheme = colorScheme ?? themeCtx.colorScheme;
  const mergedTheme = mergedTokens;
  const dataTheme = dataThemeAttr(resolvedScheme);
  const sanitize = sanitizeHtml ?? defaultSanitizeHtml;
  const slotOnAuthorButton = authorSubmitId && !readOnly ? beforeSubmit : void 0;
  const ctx = { form, schema, submitting, reg, readOnly, showErrors: submitted, revealed, reveal, asyncErrors, components: comps, t, sanitizeHtml: sanitize, allowJs: allowJs !== false, jsEvaluator, scope: form.getScope(), beforeSubmit: slotOnAuthorButton, beforeSubmitAnchorId: authorSubmitId ?? void 0 };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || validatingRef.current) return;
    setSubmitted(true);
    const sync = form.validate();
    onResult?.({ ok: sync.ok, errorCount: sync.errorKeys.length, errorKeys: sync.errorKeys });
    if (!sync.ok) {
      onEvent?.({ type: "invalid", errorKeys: sync.errorKeys });
      focusFirstError(sync.errorKeys);
      return;
    }
    validatingRef.current = true;
    let errs;
    try {
      errs = await runAsyncValidations(schema, form, client);
    } finally {
      validatingRef.current = false;
    }
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
  const content = pages ? /* @__PURE__ */ jsx15(
    FormWizardView,
    {
      pages,
      schema,
      form: ctxWithChange.form,
      reg,
      components: comps,
      readOnly,
      submitting,
      submitLabel,
      beforeSubmit,
      authorSubmitId,
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
  ) : /* @__PURE__ */ jsxs10("form", { noValidate: true, dir, "data-theme": dataTheme, className: formClass, style: mergedTheme, onSubmit: handleSubmit, children: [
    schema.root.map((id) => /* @__PURE__ */ jsx15(RenderEntity, { id, schema, ctx: ctxWithChange }, id)),
    submitLabel !== null && !readOnly && /* @__PURE__ */ jsxs10(Fragment2, { children: [
      !authorSubmitId && beforeSubmit,
      /* @__PURE__ */ jsx15("button", { type: "submit", className: "lf-submit", disabled: submitting, "aria-busy": submitting || void 0, children: t(submitLabel) })
    ] })
  ] });
  return /* @__PURE__ */ jsx15(FormErrorBoundary, { fallback: errorFallback, onError: (error) => onEvent?.({ type: "error", error }), children: /* @__PURE__ */ jsx15(FormThemeProvider, { theme: mergedTokens, colorScheme: resolvedScheme, children: content }) });
}
function FormWizardView({
  pages,
  schema,
  form,
  reg,
  components,
  readOnly,
  submitting,
  submitLabel,
  beforeSubmit,
  authorSubmitId,
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
  const [index, setIndex] = useState11(0);
  const [showErrors, setShowErrors] = useState11(false);
  const [revealed, setRevealed] = useState11(() => /* @__PURE__ */ new Set());
  const validateField = form.validate;
  const reveal = useCallback2(
    (key) => {
      validateField([key]);
      setRevealed((prev) => prev.has(key) ? prev : new Set(prev).add(key));
    },
    [validateField]
  );
  const { t, dir } = useLocale();
  const pageRef = useRef9(null);
  const firstRender = useRef9(true);
  const visible = pages.filter((id) => form.state.fields[id]?.isVisible !== false);
  const safeIndex = Math.min(index, Math.max(0, visible.length - 1));
  const currentId = visible[safeIndex];
  const isLast = safeIndex >= visible.length - 1;
  useEffect8(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    pageRef.current?.focus();
  }, [safeIndex]);
  const ctx = { form, schema, submitting, reg, readOnly, showErrors, revealed, reveal, asyncErrors: {}, components, t, sanitizeHtml: sanitizeHtml ?? defaultSanitizeHtml, allowJs: allowJs !== false, jsEvaluator, scope: form.getScope(), beforeSubmit: authorSubmitId && !readOnly ? beforeSubmit : void 0, beforeSubmitAnchorId: authorSubmitId ?? void 0 };
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
    if (submitting) return;
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
  return /* @__PURE__ */ jsxs10("form", { noValidate: true, dir, "data-theme": dataTheme, className, style: theme, onSubmit: submit, children: [
    /* @__PURE__ */ jsx15("ol", { className: "lf-wizard-steps", "aria-label": "Steps", children: visible.map((id, i) => /* @__PURE__ */ jsx15("li", { className: i === safeIndex ? "is-active" : "", "aria-current": i === safeIndex ? "step" : void 0, children: t(pageLabel(schema, id, i)) }, id)) }),
    /* @__PURE__ */ jsx15("div", { ref: pageRef, tabIndex: -1, className: "lf-wizard-page", role: "group", "aria-label": currentId ? pageLabel(schema, currentId, safeIndex) : "Page", children: currentId && /* @__PURE__ */ jsx15(RenderEntity, { id: currentId, schema, ctx }) }),
    isLast && submitLabel !== null && !readOnly && !authorSubmitId ? beforeSubmit : null,
    /* @__PURE__ */ jsxs10("div", { className: "lf-wizard-nav", children: [
      /* @__PURE__ */ jsx15("button", { type: "button", className: "lf-wizard-back", onClick: back, disabled: safeIndex === 0, children: t("Back") }),
      !isLast && /* @__PURE__ */ jsx15("button", { type: "button", className: "lf-wizard-next", onClick: next, children: t("Next") }),
      isLast && submitLabel !== null && !readOnly && /* @__PURE__ */ jsx15("button", { type: "submit", className: "lf-submit", disabled: submitting, "aria-busy": submitting || void 0, children: t(submitLabel) }),
      /* @__PURE__ */ jsxs10("span", { className: "lf-wizard-progress", children: [
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
function RenderEntity(props) {
  const node = RenderEntityNode(props);
  const { id, ctx } = props;
  if (node !== null && ctx.beforeSubmit && ctx.beforeSubmitAnchorId === id) {
    return /* @__PURE__ */ jsxs10(Fragment2, { children: [
      ctx.beforeSubmit,
      node
    ] });
  }
  return node;
}
function RenderEntityNode({ id, schema, ctx }) {
  const entity = schema.entities[id];
  if (!entity) return null;
  const fs = ctx.form.state.fields[id];
  if (fs && !fs.isVisible) return null;
  if (entity.type === "array" || entity.type === "map") return null;
  const ft = ctx.reg.get(entity.type);
  if (ft?.isGrid)
    return entity.type === "editGrid" ? /* @__PURE__ */ jsx15(EditGridField, { entity, fs, ctx, schema }) : /* @__PURE__ */ jsx15(GridField, { entity, fs, ctx, schema });
  if (ft?.isStatic) return /* @__PURE__ */ jsx15(Static, { entity, sanitizeHtml: ctx.sanitizeHtml, submitting: ctx.submitting });
  if (ft?.isContainer) {
    if (entity.type === "tabs") return /* @__PURE__ */ jsx15(TabsContainer, { entity, schema, ctx, Render: RenderEntity });
    if (entity.type === "panel" || entity.type === "well" || entity.type === "fieldset")
      return /* @__PURE__ */ jsx15(PanelBox, { entity, schema, ctx, Render: RenderEntity });
    if (entity.type === "table") return /* @__PURE__ */ jsx15(TableGrid, { entity, schema, ctx, Render: RenderEntity });
    let cols;
    if (entity.type === "columns") {
      const raw = Number(entity.attributes?.numColumns);
      const declared = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 2;
      const childCount = entity.children?.length ?? 0;
      cols = childCount <= 1 ? 1 : Math.min(6, Math.max(1, declared));
    }
    const childStyle = cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : void 0;
    const bordered = Boolean(entity.attributes?.borders);
    return /* @__PURE__ */ jsxs10("div", { className: `lf-container${bordered ? " lf-container--bordered" : ""}`, "data-type": entity.type, children: [
      labelText(entity.attributes) && /* @__PURE__ */ jsx15("div", { className: "lf-container-label", children: labelText(entity.attributes) }),
      /* @__PURE__ */ jsx15("div", { className: "lf-container-children", style: childStyle, children: (entity.children ?? []).map((cid) => /* @__PURE__ */ jsx15(RenderEntity, { id: cid, schema, ctx }, cid)) })
    ] });
  }
  if (!fs) return null;
  return /* @__PURE__ */ jsx15(Field, { entity, fs, ctx });
}
function numAttr(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : void 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : void 0;
  }
  return void 0;
}
function Field({ entity, fs, ctx }) {
  const a = entity.attributes ?? {};
  const id = entity.id;
  const key = fs.key;
  const live = useMinionData(entity, ctx.scope);
  const fieldOptions = live.options.length ? live.options : options(a);
  const disabled = fs.isDisabled || ctx.readOnly;
  const validateOn = a.validateOn === "blur" || a.validateOn === "change" ? a.validateOn : null;
  const error = ctx.showErrors || ctx.revealed?.has(key) ? fs.error : null;
  const errId = error ? `${id}-error` : void 0;
  const asyncErrId = !error && ctx.asyncErrors[key] ? `${id}-async-error` : void 0;
  const descId = labelText(a, "description") ? `${id}-desc` : void 0;
  const set = (value) => {
    ctx.form.update(key, value);
    if (validateOn === "change" || ctx.revealed?.has(key)) ctx.reveal?.(key);
  };
  const a11y = {
    id,
    name: key,
    disabled,
    "aria-invalid": error || asyncErrId ? true : void 0,
    "aria-required": fs.isRequired ? true : void 0,
    "aria-describedby": [descId, errId, asyncErrId].filter(Boolean).join(" ") || void 0,
    // Every control spreads this bag, so one handler covers the whole field set.
    ...validateOn === "blur" ? { onBlur: () => ctx.reveal?.(key) } : {},
    // Autofill is suppressed on every input, platform-wide (no escape hatch).
    ...noAutofill(id)
  };
  const ph = typeof a.placeholder === "string" ? a.placeholder : void 0;
  const inputProps = {};
  if (ph) inputProps.placeholder = ph;
  const maxLen = numAttr(a.maxLength);
  if (maxLen !== void 0) inputProps.maxLength = maxLen;
  const minLen = numAttr(a.minLength);
  if (minLen !== void 0) inputProps.minLength = minLen;
  if (typeof a.pattern === "string" && a.pattern) inputProps.pattern = a.pattern;
  const tabIdx = numAttr(a.tabIndex);
  if (tabIdx !== void 0) inputProps.tabIndex = tabIdx;
  if (a.spellcheck !== void 0) inputProps.spellCheck = Boolean(a.spellcheck);
  if (a.autofocus) inputProps.autoFocus = true;
  const numProps = {};
  const numMin = numAttr(a.min);
  if (numMin !== void 0) numProps.min = numMin;
  const numMax = numAttr(a.max);
  if (numMax !== void 0) numProps.max = numMax;
  const Custom = ctx.components[entity.type];
  if (!Custom && entity.type === "radio") {
    return /* @__PURE__ */ jsx15(Group, { entity, fs, ctx, children: fieldOptions.map((o) => /* @__PURE__ */ jsxs10("label", { className: "lf-option", children: [
      /* @__PURE__ */ jsx15(
        "input",
        {
          type: "radio",
          name: key,
          value: o.value,
          checked: String(fs.value ?? "") === o.value,
          disabled,
          onChange: () => set(o.value),
          onBlur: a11y.onBlur
        }
      ),
      ctx.t(o.label)
    ] }, o.value)) });
  }
  if (!Custom && entity.type === "selectBoxes") {
    const selected = new Set((Array.isArray(fs.value) ? fs.value : []).map(String));
    return /* @__PURE__ */ jsx15(Group, { entity, fs, ctx, children: fieldOptions.map((o) => /* @__PURE__ */ jsxs10("label", { className: "lf-option", children: [
      /* @__PURE__ */ jsx15(
        "input",
        {
          type: "checkbox",
          value: o.value,
          checked: selected.has(o.value),
          disabled,
          onBlur: a11y.onBlur,
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
    control = /* @__PURE__ */ jsx15(Custom, { entity, field: fs, value: fs.value, setValue: set, disabled, error: error?.message ?? null, id });
  } else
    switch (entity.type) {
      case "checkbox":
        control = /* @__PURE__ */ jsx15("input", { type: "checkbox", ...a11y, checked: Boolean(fs.value), onChange: (e) => set(e.target.checked) });
        break;
      case "textarea":
        control = /* @__PURE__ */ jsx15(
          "textarea",
          {
            ...a11y,
            ...inputProps,
            className: a.autoExpand ? "lf-autoexpand" : void 0,
            rows: numAttr(a.rows),
            value: asText(fs.value),
            onChange: (e) => set(e.target.value)
          }
        );
        break;
      case "select":
        control = a.searchable && readDataSource4(a) ? (
          // Searchable + Minion-backed → server-side type-ahead (re-queries as you type),
          // so a value beyond the first page is still findable (unlike a static filter).
          /* @__PURE__ */ jsx15(SearchSelect, { a11y, entity, value: fs.value, setValue: set, scope: ctx.scope, disabled, placeholder: ph })
        ) : a.searchable ? /* @__PURE__ */ jsx15(SearchableSelect, { a11y, options: fieldOptions, value: fs.value, setValue: set, placeholder: ph, required: fs.isRequired, disabled, t: ctx.t }) : /* @__PURE__ */ jsxs10("select", { ...a11y, value: asText(fs.value), onChange: (e) => set(e.target.value), children: [
          fs.isRequired ? /* @__PURE__ */ jsx15("option", { value: "", disabled: true, hidden: true, children: ph ?? "Select\u2026" }) : /* @__PURE__ */ jsx15("option", { value: "", children: ph ?? "" }),
          fieldOptions.map((o) => /* @__PURE__ */ jsx15("option", { value: o.value, children: ctx.t(o.label) }, o.value))
        ] });
        break;
      case "number":
      case "currency":
        control = /* @__PURE__ */ jsx15(
          NumberInput,
          {
            a11y,
            extra: { ...inputProps, ...numProps },
            value: fs.value,
            currency: entity.type === "currency" ? typeof a.currency === "string" ? a.currency : typeof a.currencyCode === "string" ? a.currencyCode : "USD" : void 0,
            prefix: typeof a.prefix === "string" ? a.prefix : void 0,
            suffix: typeof a.suffix === "string" ? a.suffix : void 0,
            decimalLimit: numAttr(a.decimalLimit),
            delimiter: Boolean(a.delimiter),
            onChange: set
          }
        );
        break;
      case "searchSelect":
        control = /* @__PURE__ */ jsx15(SearchSelect, { a11y, entity, value: fs.value, setValue: set, scope: ctx.scope, disabled, placeholder: ph });
        break;
      case "tags":
      case "tagsField":
        control = /* @__PURE__ */ jsx15(TagsInput, { a11y, value: asArray(fs.value), disabled, onChange: set, placeholder: ph });
        break;
      case "file":
        control = /* @__PURE__ */ jsx15(FileField, { a11y, multiple: Boolean(a.multiple), value: fs.value, disabled, onChange: set, entity, scope: ctx.scope });
        break;
      case "signature":
        control = /* @__PURE__ */ jsx15(SignatureField, { a11y, value: fs.value, disabled, onChange: set, penColor: typeof a.penColor === "string" ? a.penColor : void 0, allowType: Boolean(a.allowType) });
        break;
      case "rating":
        control = /* @__PURE__ */ jsx15(RatingField, { a11y, value: fs.value, max: numAttr(a.max) ?? 5, disabled, onChange: set });
        break;
      case "stepper":
        control = /* @__PURE__ */ jsx15(
          StepperField,
          {
            a11y,
            value: fs.value,
            min: numAttr(a.min),
            max: numAttr(a.max),
            step: numAttr(a.step) ?? 1,
            disabled,
            onChange: set
          }
        );
        break;
      case "ranking":
        control = /* @__PURE__ */ jsx15(RankingField, { a11y, entity, value: fs.value, disabled, onChange: set });
        break;
      case "matrix":
        control = /* @__PURE__ */ jsx15(MatrixField, { a11y, entity, value: fs.value, disabled, onChange: set });
        break;
      case "addressBlock":
        control = /* @__PURE__ */ jsx15(AddressBlockField, { a11y, entity, value: fs.value, scope: ctx.scope, disabled, onChange: set });
        break;
      case "payment":
        control = /* @__PURE__ */ jsx15(PaymentField, { a11y, entity, schema: ctx.schema, scope: ctx.scope, value: fs.value, readOnly: ctx.readOnly, t: ctx.t });
        break;
      case "richText":
        control = /* @__PURE__ */ jsx15(RichTextField, { a11y, value: fs.value, disabled, onChange: set, sanitizeHtml: ctx.sanitizeHtml });
        break;
      case "day":
      case "datetime":
      case "time":
        control = a.nativeInput ? /* @__PURE__ */ jsx15(TextControl, { type: inputType(entity.type), a11y, extra: inputProps, mask: typeof a.inputMask === "string" ? a.inputMask : "", clearable: Boolean(a.clearable) && !disabled, value: fs.value, onChange: set }) : /* @__PURE__ */ jsx15(
          DateField,
          {
            a11y,
            kind: entity.type,
            value: fs.value,
            disabled,
            onChange: set,
            clearable: Boolean(a.clearable) && !disabled,
            minuteStep: numAttr(a.minuteStep) ?? 1
          }
        );
        break;
      default:
        control = /* @__PURE__ */ jsx15(
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
  return /* @__PURE__ */ jsxs10("div", { className: fieldClass, "data-type": entity.type, "data-label-position": labelPos, "data-hide-label": hideLabel || void 0, children: [
    /* @__PURE__ */ jsxs10("label", { htmlFor: id, id: `${id}-label`, className: `lf-label${hideLabel ? " lf-sr-only" : ""}`, children: [
      ctx.t(labelText(a) ?? key),
      fs.isRequired && /* @__PURE__ */ jsx15("span", { "aria-hidden": "true", children: " *" }),
      /* @__PURE__ */ jsx15(Tooltip, { text: tooltipText(a) })
    ] }),
    control,
    (Boolean(a.showCharCount) || Boolean(a.showWordCount)) && /* @__PURE__ */ jsxs10("p", { className: "lf-count", "aria-live": "off", children: [
      a.showCharCount ? `${asText(fs.value).length} characters` : "",
      a.showCharCount && a.showWordCount ? " \xB7 " : "",
      a.showWordCount ? `${wordCount(asText(fs.value))} words` : ""
    ] }),
    descId && /* @__PURE__ */ jsx15("p", { id: descId, className: "lf-desc", children: ctx.t(labelText(a, "description")) }),
    error && /* @__PURE__ */ jsx15("p", { id: errId, role: "alert", className: "lf-error", children: ctx.t(error.message ?? "") }),
    !error && ctx.asyncErrors[key] && /* @__PURE__ */ jsx15("p", { id: asyncErrId, role: "alert", className: "lf-error lf-error-async", children: ctx.t(ctx.asyncErrors[key]) })
  ] });
}
async function runAsyncValidations(schema, form, client) {
  if (!client) return {};
  const scope = form.getScope();
  const checks = [];
  for (const [id, fs] of Object.entries(form.state.fields)) {
    if (!fs.isVisible) continue;
    const av = readAsyncValidation(schema.entities[id]?.attributes);
    if (!av) continue;
    checks.push(
      runAsyncValidation(av, scope, fs.value, client).then((r) => [fs.key, r.valid ? null : r.message ?? "Invalid"]).catch(() => [fs.key, null])
    );
  }
  const errs = {};
  for (const [key, msg] of await Promise.all(checks)) if (msg) errs[key] = msg;
  return errs;
}

// src/print.ts
import { toPrintableHtml } from "@lukeflow/form-core";
function printSubmission(schema, data, options2) {
  const html = toPrintableHtml(schema, data, options2);
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
export {
  FormErrorBoundary,
  FormRenderer,
  FormThemeProvider,
  LocaleProvider,
  MinionProvider,
  PaymentsProvider,
  VERSION,
  createPaymentSession,
  dataThemeAttr,
  defaultSanitizeHtml,
  getLocaleDirection,
  isAutofillSuppressed,
  printSubmission,
  setAutofillSuppression,
  useFormEngine,
  useFormTheme,
  useLocale,
  useMinionClient,
  useMinionData,
  usePaymentSession,
  usePaymentState,
  usePopoverTheme,
  useTranslate
};
//# sourceMappingURL=index.js.map