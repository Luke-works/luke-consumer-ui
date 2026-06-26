'use strict';

// src/index.ts
var PROTOCOL_VERSION = 1;
var FRAME_SRC = "lukeform";
var HOST_SRC = "lukeform-host";
function randomNonce() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const a = new Uint32Array(4);
    c.getRandomValues(a);
    return Array.from(a, (n) => n.toString(16)).join("");
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
var SCRIPT_ORIGIN = (() => {
  try {
    const cur = globalThis.document?.currentScript;
    return cur?.src ? originOf(cur.src) : "";
  } catch {
    return "";
  }
})();
function scriptOrigin() {
  return SCRIPT_ORIGIN || (globalThis.location?.origin ?? "");
}
function createEmbed(options) {
  const doc = document;
  const mount = typeof options.target === "string" ? doc.querySelector(options.target) : options.target;
  if (!mount) throw new Error(`@lukeflow/form-embed: target not found: ${String(options.target)}`);
  const hostOrigin = originOf(options.host ?? "") || scriptOrigin();
  if (!hostOrigin) throw new Error("@lukeflow/form-embed: could not resolve the form host origin; pass `host`.");
  const nonce = randomNonce();
  const autoResize = options.autoResize !== false;
  const iframe = doc.createElement("iframe");
  iframe.src = `${hostOrigin}/embed/${encodeURIComponent(options.token)}`;
  iframe.title = options.title ?? "Form";
  iframe.loading = "lazy";
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.height = "240px";
  if (options.sandbox) iframe.setAttribute("sandbox", options.sandbox);
  const sendInit = () => {
    const msg = { src: HOST_SRC, v: PROTOCOL_VERSION, nonce, type: "init" };
    iframe.contentWindow?.postMessage(msg, hostOrigin);
  };
  const onMessage = (e) => {
    if (e.source !== iframe.contentWindow) return;
    if (e.origin !== hostOrigin) return;
    const m = e.data;
    if (!m || m.src !== FRAME_SRC || m.v !== PROTOCOL_VERSION) return;
    if (m.type === "hello") {
      sendInit();
      return;
    }
    if (m.nonce !== nonce) return;
    switch (m.type) {
      case "ready":
        options.onReady?.();
        break;
      case "resize":
        if (autoResize && typeof m.height === "number" && m.height > 0) iframe.style.height = `${Math.ceil(m.height)}px`;
        options.onResize?.(m.height);
        break;
      case "submitted":
        options.onSubmit?.({ instanceId: String(m.instanceId) });
        break;
      case "error":
        options.onError?.(String(m.message));
        break;
    }
  };
  window.addEventListener("message", onMessage);
  const onLoad = () => sendInit();
  iframe.addEventListener("load", onLoad);
  mount.appendChild(iframe);
  return {
    iframe,
    destroy() {
      window.removeEventListener("message", onMessage);
      iframe.removeEventListener("load", onLoad);
      iframe.remove();
    }
  };
}
function autoEmbed() {
  const doc = globalThis.document;
  if (!doc) return [];
  const host = scriptOrigin();
  return Array.from(doc.querySelectorAll("[data-lukeform-token]")).map(
    (el) => createEmbed({
      token: el.dataset.lukeformToken,
      target: el,
      host: el.dataset.lukeformHost || host,
      title: el.dataset.lukeformTitle
    })
  );
}
function connectEmbedFrame(opts = {}) {
  const win = globalThis.window;
  if (!win || win.parent === win) {
    return { ready() {
    }, submitted() {
    }, error() {
    }, destroy() {
    } };
  }
  let parentOrigin = "";
  let nonce = "";
  let ro;
  const autoResize = opts.autoResize !== false;
  const el = opts.element ?? win.document.documentElement;
  const post = (m) => {
    if (!parentOrigin) return;
    win.parent.postMessage({ src: FRAME_SRC, v: PROTOCOL_VERSION, nonce, ...m }, parentOrigin);
  };
  const sendHeight = () => {
    const h = Math.max(el.scrollHeight, el.offsetHeight);
    if (h > 0) post({ type: "resize", height: h });
  };
  const onMessage = (e) => {
    const m = e.data;
    if (!m || m.src !== HOST_SRC || m.v !== PROTOCOL_VERSION || m.type !== "init" || typeof m.nonce !== "string") return;
    if (parentOrigin) return;
    parentOrigin = e.origin;
    nonce = m.nonce;
    sendHeight();
    if (autoResize && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => sendHeight());
      ro.observe(el);
    }
  };
  win.addEventListener("message", onMessage);
  win.parent.postMessage({ src: FRAME_SRC, v: PROTOCOL_VERSION, type: "hello" }, "*");
  return {
    ready() {
      post({ type: "ready" });
      sendHeight();
    },
    submitted(instanceId) {
      post({ type: "submitted", instanceId });
    },
    error(message) {
      post({ type: "error", message });
    },
    destroy() {
      win.removeEventListener("message", onMessage);
      ro?.disconnect();
    }
  };
}

exports.autoEmbed = autoEmbed;
exports.connectEmbedFrame = connectEmbedFrame;
exports.createEmbed = createEmbed;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map