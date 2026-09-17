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

// src/stripe.ts
var stripe_exports = {};
__export(stripe_exports, {
  DEFAULT_STRIPE_JS_URL: () => DEFAULT_STRIPE_JS_URL,
  _resetStripeLoader: () => _resetStripeLoader,
  appearanceFromTokens: () => appearanceFromTokens,
  createStripeProcessor: () => createStripeProcessor,
  toStripeLocale: () => toStripeLocale
});
module.exports = __toCommonJS(stripe_exports);
var DEFAULT_STRIPE_JS_URL = "https://js.stripe.com/v3/";
var STRIPE_ORIGIN_PREFIX = "https://js.stripe.com/";
var STRIPE_LOCALES = /* @__PURE__ */ new Set([
  "ar",
  "bg",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "en-GB",
  "es",
  "es-419",
  "et",
  "fi",
  "fil",
  "fr",
  "fr-CA",
  "he",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "lt",
  "lv",
  "ms",
  "mt",
  "nb",
  "nl",
  "pl",
  "pt",
  "pt-BR",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "th",
  "tr",
  "vi",
  "zh",
  "zh-HK",
  "zh-TW"
]);
function toStripeLocale(locale) {
  if (!locale) return "auto";
  if (STRIPE_LOCALES.has(locale)) return locale;
  const primary = locale.split(/[-_]/)[0].toLowerCase();
  return STRIPE_LOCALES.has(primary) ? primary : "auto";
}
var pending = /* @__PURE__ */ new Map();
function loadStripeScript(url, timeoutMs) {
  const w = window;
  if (typeof w.Stripe === "function") return Promise.resolve(w.Stripe);
  const inflight = pending.get(url);
  if (inflight) return inflight;
  const p = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    const timer = setTimeout(() => fail(new Error("Stripe.js took too long to load")), timeoutMs);
    const fail = (err) => {
      clearTimeout(timer);
      pending.delete(url);
      script.remove();
      reject(err);
    };
    script.addEventListener("load", () => {
      clearTimeout(timer);
      if (typeof w.Stripe === "function") resolve(w.Stripe);
      else fail(new Error("Stripe.js loaded but did not initialise"));
    });
    script.addEventListener("error", () => fail(new Error("Stripe.js failed to load")));
    document.head.appendChild(script);
  });
  pending.set(url, p);
  return p;
}
function _resetStripeLoader() {
  pending.clear();
}
function appearanceFromTokens(el) {
  const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
  const read = (name) => cs?.getPropertyValue(name).trim() || void 0;
  const variables = {};
  const put = (key, value) => {
    if (value) variables[key] = value;
  };
  put("colorPrimary", read("--lf-primary"));
  put("colorText", read("--lf-text"));
  put("colorBackground", read("--lf-bg"));
  put("colorDanger", read("--lf-error"));
  put("borderRadius", read("--lf-radius"));
  const font = cs?.fontFamily;
  if (font && font !== "inherit") variables.fontFamily = font;
  return { theme: "stripe", variables };
}
var GENERIC_DECLINE = "The payment didn't go through. Please check your details and try again.";
function createStripeProcessor(options) {
  const { publishableKey, stripeAccount, returnUrl, loadStripe } = options;
  const scriptUrl = options.scriptUrl ?? DEFAULT_STRIPE_JS_URL;
  if (!publishableKey || !publishableKey.startsWith("pk_")) {
    throw new Error("createStripeProcessor: a publishable key (pk_\u2026) is required");
  }
  if (stripeAccount !== void 0 && !/^acct_[A-Za-z0-9]+$/.test(stripeAccount)) {
    throw new Error("createStripeProcessor: stripeAccount must be a connected account id (acct_\u2026)");
  }
  if (!loadStripe && !scriptUrl.startsWith(STRIPE_ORIGIN_PREFIX)) {
    throw new Error(`createStripeProcessor: Stripe.js must be loaded from ${STRIPE_ORIGIN_PREFIX}`);
  }
  const timeoutMs = options.loadTimeoutMs ?? 2e4;
  const load = loadStripe ?? (() => loadStripeScript(scriptUrl, timeoutMs));
  let instance = null;
  const stripe = () => {
    if (!instance) {
      instance = load().then((factory) => factory(publishableKey, stripeAccount ? { stripeAccount } : void 0));
      instance.catch(() => {
        instance = null;
      });
    }
    return instance;
  };
  return {
    async mount(opts) {
      const s = await stripe();
      if (opts.signal?.aborted) throw new Error("The payment form was closed before it loaded");
      const elements = s.elements({
        mode: "payment",
        amount: opts.amountMinor,
        currency: opts.currency.toLowerCase(),
        paymentMethodTypes: ["card"],
        appearance: options.appearance ?? appearanceFromTokens(opts.container),
        locale: toStripeLocale(opts.locale)
      });
      const element = elements.create("payment", {
        layout: "tabs",
        wallets: { applePay: "never", googlePay: "never" }
      });
      element.on("change", (e) => opts.onChange?.({ complete: Boolean(e.complete) }));
      let ready = false;
      let failLoad = () => {
      };
      const loaded = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Stripe's card form took too long to load")), timeoutMs);
        element.on("ready", () => {
          clearTimeout(timer);
          ready = true;
          resolve();
        });
        failLoad = (err) => {
          clearTimeout(timer);
          reject(err);
        };
      });
      element.on("loaderror", (e) => {
        const message = e.error?.message || "The card form failed to load.";
        if (ready) opts.onLoadError?.(message);
        else failLoad(new Error(message));
      });
      opts.signal?.addEventListener("abort", () => {
        if (!ready) failLoad(new Error("The payment form was closed before it loaded"));
      }, { once: true });
      element.mount(opts.container);
      try {
        await loaded;
      } catch (err) {
        try {
          element.destroy();
        } catch {
        }
        throw err;
      }
      let current = { amountMinor: opts.amountMinor, currency: opts.currency };
      const update = async (next) => {
        if (next.amountMinor === current.amountMinor && next.currency === current.currency) return;
        if (!Number.isSafeInteger(next.amountMinor) || next.amountMinor <= 0) return;
        current = next;
        await elements.update({ amount: next.amountMinor, currency: next.currency.toLowerCase() });
      };
      const submit = async () => {
        const { error } = await elements.submit();
        return error ? error.message || "Check your card details and try again." : null;
      };
      return {
        update,
        validate: submit,
        async confirm(clientSecret, amount) {
          if (amount.amountMinor !== current.amountMinor || amount.currency !== current.currency) {
            await update(amount);
            const err = await submit();
            if (err) return { status: "failed", message: err };
          }
          const { error, paymentIntent } = await s.confirmPayment({
            elements,
            clientSecret,
            confirmParams: { return_url: returnUrl ?? window.location.href },
            redirect: "if_required"
          });
          if (error) return { status: "failed", message: error.message || GENERIC_DECLINE };
          switch (paymentIntent?.status) {
            case "succeeded":
              return { status: "succeeded" };
            case "processing":
            case "requires_capture":
              return { status: "processing" };
            default:
              return { status: "failed", message: GENERIC_DECLINE };
          }
        },
        destroy() {
          try {
            element.destroy();
          } catch {
          }
        }
      };
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_STRIPE_JS_URL,
  _resetStripeLoader,
  appearanceFromTokens,
  createStripeProcessor,
  toStripeLocale
});
//# sourceMappingURL=stripe.cjs.map