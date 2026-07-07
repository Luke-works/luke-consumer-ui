// src/EmailRenderer.tsx
import { Fragment, useEffect, useMemo, useState } from "react";
import { render } from "@react-email/render";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text
} from "@react-email/components";
import {
  DEFAULT_THEME,
  isHttpUrl,
  isVarOnly,
  mergePreview,
  parseEmailDoc,
  reconcileVariables,
  repairEmailDoc
} from "@lukeflow/email-core";
import { jsx, jsxs } from "react/jsx-runtime";
function safeUrl(value) {
  if (typeof value !== "string") return void 0;
  return isHttpUrl(value) || isVarOnly(value) ? value : void 0;
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
    if (idx > last) out.push(/* @__PURE__ */ jsx(Fragment, { children: text.slice(last, idx) }, key++));
    if (m[2] !== void 0) {
      out.push(/* @__PURE__ */ jsx("strong", { children: m[2] }, key++));
    } else if (m[3] !== void 0) {
      out.push(/* @__PURE__ */ jsx("em", { children: m[3] }, key++));
    } else if (m[4] !== void 0) {
      const href = safeUrl(m[5]);
      out.push(
        href ? /* @__PURE__ */ jsx(Link, { href, className: "text-inherit underline", children: m[4] }, key++) : /* @__PURE__ */ jsx(Fragment, { children: m[4] }, key++)
      );
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(/* @__PURE__ */ jsx(Fragment, { children: text.slice(last) }, key++));
  return out;
}
function renderBlock(block, brand, i) {
  const align = "align" in block && block.align || "left";
  switch (block.type) {
    case "heading":
      return /* @__PURE__ */ jsx(
        Heading,
        {
          as: `h${block.level ?? 1}`,
          className: `m-0 mb-[12px] font-bold text-gray-900 ${HEADING_SIZE[block.level ?? 1]} ${ALIGN_CLASS[align]}`,
          children: block.text
        },
        i
      );
    case "text":
      return /* @__PURE__ */ jsx(Text, { className: `m-0 mb-[12px] text-[14px] leading-[24px] text-gray-700 ${ALIGN_CLASS[align]}`, children: renderMarkdownLite(block.text) }, i);
    case "button":
      return /* @__PURE__ */ jsx(Section, { className: `mb-[16px] ${ALIGN_CLASS[align]}`, children: /* @__PURE__ */ jsx(
        Button,
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
      const img = /* @__PURE__ */ jsx(
        Img,
        {
          src,
          alt: block.alt,
          ...block.width ? { width: block.width } : {},
          className: "inline-block h-auto max-w-full"
        }
      );
      return /* @__PURE__ */ jsx(Section, { className: `mb-[16px] ${ALIGN_CLASS[align]}`, children: href ? /* @__PURE__ */ jsx(Link, { href, className: "inline-block", children: img }) : img }, i);
    }
    case "divider":
      return /* @__PURE__ */ jsx(Hr, { className: "my-[20px] border-gray-200" }, i);
    case "spacer":
      return /* @__PURE__ */ jsx(Section, { style: { height: block.size ?? 24, lineHeight: `${block.size ?? 24}px` } }, i);
    case "footer": {
      const unsubscribeUrl = safeUrl(block.unsubscribeUrl);
      return /* @__PURE__ */ jsxs(Section, { className: "mt-[24px]", children: [
        /* @__PURE__ */ jsx(Hr, { className: "mb-[12px] border-gray-200" }),
        /* @__PURE__ */ jsx(Text, { className: "m-0 text-[12px] leading-[20px] text-gray-500", children: renderMarkdownLite(block.text) }),
        unsubscribeUrl ? /* @__PURE__ */ jsx(Text, { className: "m-0 mt-[6px] text-[12px] text-gray-500", children: /* @__PURE__ */ jsx(Link, { href: unsubscribeUrl, className: "text-gray-500 underline", children: "Unsubscribe" }) }) : null
      ] }, i);
    }
    default:
      return null;
  }
}
function Email({ doc: input }) {
  const { doc } = repairEmailDoc(input);
  const theme = doc.theme ?? DEFAULT_THEME;
  const brand = theme.brandColor || DEFAULT_THEME.brandColor;
  const fontFamily = FONT_STACK[theme.fontFamily] ?? FONT_STACK.sans;
  return /* @__PURE__ */ jsxs(Html, { children: [
    /* @__PURE__ */ jsx(Head, {}),
    doc.preheader ? /* @__PURE__ */ jsx(Preview, { children: doc.preheader }) : null,
    /* @__PURE__ */ jsx(Tailwind, { children: /* @__PURE__ */ jsx(Body, { style: { backgroundColor: theme.backgroundColor || DEFAULT_THEME.backgroundColor, fontFamily, margin: 0 }, children: /* @__PURE__ */ jsx(
      Container,
      {
        className: "mx-auto my-[40px] rounded-lg p-[32px]",
        style: { maxWidth: theme.contentWidth, backgroundColor: theme.contentBackground || DEFAULT_THEME.contentBackground },
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
  const { doc } = repairEmailDoc(tpl.doc);
  const [html, text] = await Promise.all([
    render(/* @__PURE__ */ jsx(Email, { doc })),
    // html-to-text uppercases headings by default, which would mangle {{Var}} casing
    // in the text channel and break Postmark's case-sensitive merge. Keep headings
    // as-authored so every {{var}} survives identically in html AND text.
    render(/* @__PURE__ */ jsx(Email, { doc }), {
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
  return { subject: doc.subject, html, text, variables: reconcileVariables(doc, tpl.variables) };
}
function EmailRenderer({
  doc,
  values,
  className = "",
  height = 640
}) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState(null);
  const json = typeof doc === "string" ? doc : JSON.stringify(doc);
  useEffect(() => {
    let active = true;
    setError(null);
    let out;
    try {
      const parsed = typeof doc === "string" ? parseEmailDoc(doc) : doc;
      out = render(/* @__PURE__ */ jsx(Email, { doc: parsed }));
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
  const srcDoc = useMemo(
    () => values ? mergePreview(html, values) : html,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [html, valuesKey]
  );
  if (error) {
    return /* @__PURE__ */ jsxs(
      "div",
      {
        role: "alert",
        className: `flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10 ${className}`,
        style: { height },
        children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-amber-700 dark:text-amber-400", children: "Preview couldn\u2019t be rendered" }),
          /* @__PURE__ */ jsx("p", { className: "max-w-md text-xs text-amber-600/80 dark:text-amber-400/70", children: error }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-amber-600/60 dark:text-amber-400/50", children: "Your template is safe \u2014 this only affects the on-screen preview. Try reloading the page." })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsx(
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
export * from "@lukeflow/email-core";
export {
  Email,
  EmailRenderer,
  compileEmail
};
//# sourceMappingURL=index.js.map