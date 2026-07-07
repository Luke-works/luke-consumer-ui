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
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Email: () => Email,
  EmailRenderer: () => EmailRenderer,
  compileEmail: () => compileEmail
});
module.exports = __toCommonJS(index_exports);

// src/EmailRenderer.tsx
var import_react = require("react");
var import_render = require("@react-email/render");
var import_components = require("@react-email/components");
var import_email_core = require("@lukeflow/email-core");
var import_jsx_runtime = require("react/jsx-runtime");
function safeUrl(value) {
  if (typeof value !== "string") return void 0;
  return (0, import_email_core.isHttpUrl)(value) || (0, import_email_core.isVarOnly)(value) ? value : void 0;
}
var FONT_STACK = {
  sans: "Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', Courier, monospace"
};
var ALIGN_CLASS = {
  left: "text-left",
  center: "text-center",
  right: "text-right"
};
var HEADING_SIZE = {
  1: "text-[24px]",
  2: "text-[20px]",
  3: "text-[16px]"
};
var MD_RE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/g;
function renderMarkdownLite(text) {
  const out = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(MD_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: text.slice(last, idx) }, key++));
    if (m[2] !== void 0) {
      out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: m[2] }, key++));
    } else if (m[3] !== void 0) {
      out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: m[3] }, key++));
    } else if (m[4] !== void 0) {
      const href = safeUrl(m[5]);
      out.push(
        href ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Link, { href, className: "text-inherit underline", children: m[4] }, key++) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: m[4] }, key++)
      );
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: text.slice(last) }, key++));
  return out;
}
function renderBlock(block, brand, i) {
  const align = "align" in block && block.align || "left";
  switch (block.type) {
    case "heading":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_components.Heading,
        {
          as: `h${block.level ?? 1}`,
          className: `m-0 mb-[12px] font-bold text-gray-900 ${HEADING_SIZE[block.level ?? 1]} ${ALIGN_CLASS[align]}`,
          children: block.text
        },
        i
      );
    case "text":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Text, { className: `m-0 mb-[12px] text-[14px] leading-[24px] text-gray-700 ${ALIGN_CLASS[align]}`, children: renderMarkdownLite(block.text) }, i);
    case "button":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Section, { className: `mb-[16px] ${ALIGN_CLASS[align]}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_components.Button,
        {
          href: safeUrl(block.href),
          className: "inline-block rounded px-[20px] py-[12px] text-[14px] font-semibold no-underline",
          style: { backgroundColor: block.bgColor || brand, color: block.textColor || "#ffffff" },
          children: block.label
        }
      ) }, i);
    case "image": {
      const src = safeUrl(block.src);
      const href = safeUrl(block.href);
      const img = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_components.Img,
        {
          src,
          alt: block.alt,
          ...block.width ? { width: block.width } : {},
          className: "inline-block h-auto max-w-full"
        }
      );
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Section, { className: `mb-[16px] ${ALIGN_CLASS[align]}`, children: href ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Link, { href, className: "inline-block", children: img }) : img }, i);
    }
    case "divider":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Hr, { className: "my-[20px] border-gray-200" }, i);
    case "spacer":
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Section, { style: { height: block.size ?? 24, lineHeight: `${block.size ?? 24}px` } }, i);
    case "footer": {
      const unsubscribeUrl = safeUrl(block.unsubscribeUrl);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_components.Section, { className: "mt-[24px]", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Hr, { className: "mb-[12px] border-gray-200" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Text, { className: "m-0 text-[12px] leading-[20px] text-gray-500", children: renderMarkdownLite(block.text) }),
        unsubscribeUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Text, { className: "m-0 mt-[6px] text-[12px] text-gray-500", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Link, { href: unsubscribeUrl, className: "text-gray-500 underline", children: "Unsubscribe" }) }) : null
      ] }, i);
    }
    default:
      return null;
  }
}
function Email({ doc: input }) {
  const { doc } = (0, import_email_core.repairEmailDoc)(input);
  const theme = doc.theme ?? import_email_core.DEFAULT_THEME;
  const brand = theme.brandColor || import_email_core.DEFAULT_THEME.brandColor;
  const fontFamily = FONT_STACK[theme.fontFamily] ?? FONT_STACK.sans;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_components.Html, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Head, {}),
    doc.preheader ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Preview, { children: doc.preheader }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Tailwind, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Body, { style: { backgroundColor: theme.backgroundColor || import_email_core.DEFAULT_THEME.backgroundColor, fontFamily, margin: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_components.Container,
      {
        className: "mx-auto my-[40px] rounded-lg p-[32px]",
        style: { maxWidth: theme.contentWidth, backgroundColor: theme.contentBackground || import_email_core.DEFAULT_THEME.contentBackground },
        children: doc.blocks.map((b, i) => renderBlock(b, brand, i))
      }
    ) }) })
  ] });
}
function asTemplate(input) {
  return input && typeof input === "object" && "doc" in input && input.doc ? input : { doc: input, variables: input?.variables ?? [] };
}
async function compileEmail(input) {
  const tpl = asTemplate(input);
  const { doc } = (0, import_email_core.repairEmailDoc)(tpl.doc);
  const [html, text] = await Promise.all([
    (0, import_render.render)(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Email, { doc })),
    // html-to-text uppercases headings by default, which would mangle {{Var}} casing
    // in the text channel and break Postmark's case-sensitive merge. Keep headings
    // as-authored so every {{var}} survives identically in html AND text.
    (0, import_render.render)(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Email, { doc }), {
      plainText: true,
      htmlToTextOptions: {
        selectors: [
          { selector: "h1", options: { uppercase: false } },
          { selector: "h2", options: { uppercase: false } },
          { selector: "h3", options: { uppercase: false } }
        ]
      }
    })
  ]);
  return { subject: doc.subject, html, text, variables: (0, import_email_core.reconcileVariables)(doc, tpl.variables) };
}
function EmailRenderer({
  doc,
  values,
  className = "",
  height = 640
}) {
  const [html, setHtml] = (0, import_react.useState)("");
  const [error, setError] = (0, import_react.useState)(null);
  const json = typeof doc === "string" ? doc : JSON.stringify(doc);
  (0, import_react.useEffect)(() => {
    let active = true;
    setError(null);
    let out;
    try {
      const parsed = typeof doc === "string" ? (0, import_email_core.parseEmailDoc)(doc) : doc;
      out = (0, import_render.render)(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Email, { doc: parsed }));
    } catch (e) {
      out = Promise.reject(e);
    }
    out.then((rendered) => {
      if (active) setHtml(rendered);
    }).catch((e) => {
      if (!active) return;
      const msg = e instanceof Error ? e.message : String(e);
      console.error("EmailRenderer: failed to render the email preview.", e);
      setHtml("");
      setError(msg || "The preview failed to render.");
    });
    return () => {
      active = false;
    };
  }, [json]);
  const valuesKey = values ? JSON.stringify(values) : "";
  const srcDoc = (0, import_react.useMemo)(
    () => values ? (0, import_email_core.mergePreview)(html, values) : html,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [html, valuesKey]
  );
  if (error) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        role: "alert",
        className: `flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10 ${className}`,
        style: { height },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-sm font-medium text-amber-700 dark:text-amber-400", children: "Preview couldn\u2019t be rendered" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "max-w-md text-xs text-amber-600/80 dark:text-amber-400/70", children: error }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mt-1 text-[11px] text-amber-600/60 dark:text-amber-400/50", children: "Your template is safe \u2014 this only affects the on-screen preview. Try reloading the page." })
        ]
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "iframe",
    {
      title: "Email preview",
      srcDoc,
      className: `w-full rounded-lg border border-gray-200 bg-white dark:border-gray-800 ${className}`,
      style: { height },
      sandbox: ""
    }
  );
}

// src/index.ts
__reExport(index_exports, require("@lukeflow/email-core"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Email,
  EmailRenderer,
  compileEmail,
  ...require("@lukeflow/email-core")
});
//# sourceMappingURL=index.cjs.map