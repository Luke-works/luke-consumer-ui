// src/useEmailBuilder.ts
import { useCallback, useMemo, useRef, useState } from "react";
import {
  emptyEmailDoc,
  reconcileVariables,
  validateEmailDoc,
  validateVariables
} from "@lukeflow/email-core";
var DEFAULT_BLOCKS = {
  heading: () => ({ type: "heading", text: "Heading", level: 1 }),
  text: () => ({ type: "text", text: "Add your text here." }),
  button: () => ({ type: "button", label: "Click here", href: "https://example.com" }),
  image: () => ({ type: "image", src: "", alt: "" }),
  divider: () => ({ type: "divider" }),
  spacer: () => ({ type: "spacer", size: 24 }),
  footer: () => ({ type: "footer", text: "\xA9 Your Company" })
};
function createBlock(type) {
  return DEFAULT_BLOCKS[type]();
}
function arrayMove(arr, from, to) {
  const next = arr.slice();
  if (from < 0 || from >= next.length) return next;
  const clampedTo = Math.max(0, Math.min(to, next.length - 1));
  const [item] = next.splice(from, 1);
  next.splice(clampedTo, 0, item);
  return next;
}
var HISTORY_LIMIT = 100;
function pushBounded(stack, snap) {
  stack.push(snap);
  if (stack.length > HISTORY_LIMIT) stack.shift();
}
function useEmailBuilder(initialDoc = emptyEmailDoc()) {
  const [doc, setDocState] = useState(initialDoc);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const past = useRef([]);
  const future = useRef([]);
  const [, forceRender] = useState(0);
  const commit = useCallback((next) => {
    setDocState((prev) => {
      if (next === prev) return prev;
      pushBounded(past.current, prev);
      future.current = [];
      return next;
    });
  }, []);
  const select = useCallback((index) => setSelectedIndex(index), []);
  const addBlock = useCallback((type, at) => {
    setDocState((prev) => {
      pushBounded(past.current, prev);
      future.current = [];
      const blocks = prev.blocks.slice();
      const idx = at === void 0 ? blocks.length : Math.max(0, Math.min(at, blocks.length));
      blocks.splice(idx, 0, createBlock(type));
      setSelectedIndex(idx);
      return { ...prev, blocks };
    });
  }, []);
  const removeBlock = useCallback((index) => {
    setDocState((prev) => {
      if (index < 0 || index >= prev.blocks.length) return prev;
      pushBounded(past.current, prev);
      future.current = [];
      const blocks = prev.blocks.slice();
      blocks.splice(index, 1);
      setSelectedIndex((sel) => sel === null ? null : sel === index ? null : sel > index ? sel - 1 : sel);
      return { ...prev, blocks };
    });
  }, []);
  const moveBlock = useCallback((from, to) => {
    setDocState((prev) => {
      if (from < 0 || from >= prev.blocks.length || from === to) return prev;
      pushBounded(past.current, prev);
      future.current = [];
      const blocks = arrayMove(prev.blocks, from, to);
      const clampedTo = Math.max(0, Math.min(to, blocks.length - 1));
      setSelectedIndex((sel) => sel === from ? clampedTo : sel);
      return { ...prev, blocks };
    });
  }, []);
  const duplicateBlock = useCallback((index) => {
    setDocState((prev) => {
      if (index < 0 || index >= prev.blocks.length) return prev;
      pushBounded(past.current, prev);
      future.current = [];
      const blocks = prev.blocks.slice();
      blocks.splice(index + 1, 0, { ...prev.blocks[index] });
      setSelectedIndex(index + 1);
      return { ...prev, blocks };
    });
  }, []);
  const updateBlock = useCallback((index, patch) => {
    setDocState((prev) => {
      const block = prev.blocks[index];
      if (!block) return prev;
      pushBounded(past.current, prev);
      future.current = [];
      const blocks = prev.blocks.slice();
      blocks[index] = { ...block, ...patch, type: block.type };
      return { ...prev, blocks };
    });
  }, []);
  const setTheme = useCallback((patch) => commit0((prev) => ({ ...prev, theme: { ...prev.theme, ...patch } })), []);
  const setSubject = useCallback((subject) => commit0((prev) => ({ ...prev, subject })), []);
  const setPreheader = useCallback((preheader) => commit0((prev) => ({ ...prev, preheader })), []);
  const setVariables = useCallback((variables2) => commit0((prev) => ({ ...prev, variables: variables2 })), []);
  function commit0(fn) {
    setDocState((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      pushBounded(past.current, prev);
      future.current = [];
      return next;
    });
  }
  const setDoc = useCallback((next) => {
    commit(next);
    setSelectedIndex(null);
  }, [commit]);
  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    setDocState((prev) => {
      const snap = past.current.pop();
      future.current.push(prev);
      return snap;
    });
    setSelectedIndex(null);
    forceRender((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    setDocState((prev) => {
      const snap = future.current.pop();
      pushBounded(past.current, prev);
      return snap;
    });
    setSelectedIndex(null);
    forceRender((n) => n + 1);
  }, []);
  const problems = useMemo(() => {
    const variables2 = reconcileVariables(doc);
    return [...validateEmailDoc(doc), ...validateVariables({ doc, variables: variables2 })];
  }, [doc]);
  const hasErrors = useMemo(() => problems.some((p) => p.severity === "error"), [problems]);
  const variables = useMemo(() => reconcileVariables(doc), [doc]);
  const selectedBlock = selectedIndex !== null ? doc.blocks[selectedIndex] ?? null : null;
  return {
    doc,
    selectedIndex,
    selectedBlock,
    problems,
    hasErrors,
    variables,
    select,
    addBlock,
    removeBlock,
    moveBlock,
    duplicateBlock,
    updateBlock,
    setTheme,
    setSubject,
    setPreheader,
    setVariables,
    setDoc,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0
  };
}

// src/EmailBuilder.tsx
import { forwardRef, useEffect as useEffect4, useImperativeHandle, useMemo as useMemo3, useRef as useRef3, useState as useState5 } from "react";
import { extractVariables } from "@lukeflow/email-core";

// src/blocks.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var svg = (children) => /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children });
var BLOCK_ICONS = {
  heading: svg(/* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M6 4v16" }),
    /* @__PURE__ */ jsx("path", { d: "M18 4v16" }),
    /* @__PURE__ */ jsx("path", { d: "M6 12h12" })
  ] })),
  text: svg(/* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M4 6h16" }),
    /* @__PURE__ */ jsx("path", { d: "M4 12h16" }),
    /* @__PURE__ */ jsx("path", { d: "M4 18h10" })
  ] })),
  button: svg(/* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("rect", { x: "3", y: "8", width: "18", height: "8", rx: "4" }),
    /* @__PURE__ */ jsx("path", { d: "M8 12h8" })
  ] })),
  image: svg(/* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }),
    /* @__PURE__ */ jsx("circle", { cx: "8.5", cy: "9.5", r: "1.5" }),
    /* @__PURE__ */ jsx("path", { d: "m21 16-5-5L5 20" })
  ] })),
  divider: svg(/* @__PURE__ */ jsx("path", { d: "M4 12h16" })),
  spacer: svg(/* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M12 4v16" }),
    /* @__PURE__ */ jsx("path", { d: "m8 8 4-4 4 4" }),
    /* @__PURE__ */ jsx("path", { d: "m8 16 4 4 4-4" })
  ] })),
  footer: svg(/* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M4 18h16" }),
    /* @__PURE__ */ jsx("path", { d: "M4 14h16" }),
    /* @__PURE__ */ jsx("path", { d: "M8 10h8" })
  ] }))
};
var BLOCK_META = [
  { type: "heading", label: "Heading", hint: "Section title" },
  { type: "text", label: "Text", hint: "Paragraph (supports **bold**, *italic*, links)" },
  { type: "button", label: "Button", hint: "Call-to-action link" },
  { type: "image", label: "Image", hint: "Picture (https only)" },
  { type: "divider", label: "Divider", hint: "Horizontal rule" },
  { type: "spacer", label: "Spacer", hint: "Vertical gap" },
  { type: "footer", label: "Footer", hint: "Fine print + unsubscribe" }
];
function blockSummary(block) {
  switch (block.type) {
    case "heading":
      return block.text || "Heading";
    case "text":
      return block.text || "Empty text";
    case "button":
      return block.label || "Button";
    case "image":
      return block.alt || block.src || "Image";
    case "divider":
      return "Divider";
    case "spacer":
      return `Spacer \xB7 ${block.size ?? 24}px`;
    case "footer":
      return block.text || "Footer";
  }
}

// src/Palette.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Palette({
  onAdd,
  disabled = false
}) {
  return /* @__PURE__ */ jsx2("div", { className: "eb-palette", role: "group", "aria-label": "Block palette", children: BLOCK_META.map((m) => /* @__PURE__ */ jsxs2(
    "button",
    {
      type: "button",
      className: "eb-palette-item",
      disabled,
      draggable: !disabled,
      onDragStart: (e) => {
        e.dataTransfer.setData("text/plain", `new:${m.type}`);
        e.dataTransfer.effectAllowed = "copy";
      },
      onClick: () => onAdd(m.type),
      title: m.hint,
      "aria-label": `Add ${m.label} block`,
      children: [
        /* @__PURE__ */ jsx2("span", { className: "eb-palette-icon", children: BLOCK_ICONS[m.type] }),
        /* @__PURE__ */ jsx2("span", { className: "eb-palette-label", children: m.label })
      ]
    },
    m.type
  )) });
}

// src/Canvas.tsx
import { useState as useState2 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var IconDup = /* @__PURE__ */ jsxs3("svg", { viewBox: "0 0 24 24", width: "15", height: "15", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsx3("rect", { x: "9", y: "9", width: "11", height: "11", rx: "2" }),
  /* @__PURE__ */ jsx3("path", { d: "M5 15V5a2 2 0 0 1 2-2h10" })
] });
var IconTrash = /* @__PURE__ */ jsxs3("svg", { viewBox: "0 0 24 24", width: "15", height: "15", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsx3("path", { d: "M4 7h16" }),
  /* @__PURE__ */ jsx3("path", { d: "M10 11v6M14 11v6" }),
  /* @__PURE__ */ jsx3("path", { d: "M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" }),
  /* @__PURE__ */ jsx3("path", { d: "M9 7V4h6v3" })
] });
var IconGrip = /* @__PURE__ */ jsxs3("svg", { viewBox: "0 0 24 24", width: "15", height: "15", fill: "currentColor", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsx3("circle", { cx: "9", cy: "6", r: "1.4" }),
  /* @__PURE__ */ jsx3("circle", { cx: "15", cy: "6", r: "1.4" }),
  /* @__PURE__ */ jsx3("circle", { cx: "9", cy: "12", r: "1.4" }),
  /* @__PURE__ */ jsx3("circle", { cx: "15", cy: "12", r: "1.4" }),
  /* @__PURE__ */ jsx3("circle", { cx: "9", cy: "18", r: "1.4" }),
  /* @__PURE__ */ jsx3("circle", { cx: "15", cy: "18", r: "1.4" })
] });
function parsePayload(e) {
  const raw = e.dataTransfer.getData("text/plain");
  if (raw.startsWith("new:")) return { kind: "new", type: raw.slice(4) };
  if (raw.startsWith("move:")) return { kind: "move", from: Number(raw.slice(5)) };
  return null;
}
function Canvas({
  blocks,
  selectedIndex,
  onSelect,
  onAdd,
  onMove,
  onRemove,
  onDuplicate,
  disabled = false
}) {
  const [overIndex, setOverIndex] = useState2(null);
  const insertionFor = (e, index) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY - rect.top > rect.height / 2 ? index + 1 : index;
  };
  const commitDrop = (e, ins) => {
    e.preventDefault();
    setOverIndex(null);
    const payload = parsePayload(e);
    if (!payload) return;
    if (payload.kind === "new") {
      onAdd(payload.type, ins);
    } else {
      const from = payload.from;
      if (Number.isNaN(from)) return;
      const to = from < ins ? ins - 1 : ins;
      if (to !== from) onMove(from, Math.max(0, to));
    }
  };
  if (blocks.length === 0) {
    return /* @__PURE__ */ jsxs3(
      "div",
      {
        className: `eb-canvas eb-canvas-empty${overIndex !== null ? " eb-drop-active" : ""}`,
        onDragOver: (e) => {
          if (parsePayload(e) || e.dataTransfer.types.includes("text/plain")) {
            e.preventDefault();
            setOverIndex(0);
          }
        },
        onDragLeave: () => setOverIndex(null),
        onDrop: (e) => commitDrop(e, 0),
        children: [
          /* @__PURE__ */ jsx3("p", { className: "eb-empty-title", children: "Your email is empty" }),
          /* @__PURE__ */ jsx3("p", { className: "eb-empty-hint", children: "Add a block from the palette, or drag one here." })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs3("div", { className: "eb-canvas", role: "list", "aria-label": "Email blocks", onDragLeave: (e) => {
    if (e.currentTarget === e.target) setOverIndex(null);
  }, children: [
    overIndex === 0 && /* @__PURE__ */ jsx3("div", { className: "eb-drop-line", "aria-hidden": "true" }),
    blocks.map((block, i) => /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsxs3(
        "div",
        {
          role: "listitem",
          className: `eb-row${selectedIndex === i ? " eb-row-selected" : ""}`,
          tabIndex: disabled ? -1 : 0,
          "aria-current": selectedIndex === i ? "true" : void 0,
          "aria-label": `${block.type}: ${blockSummary(block)}`,
          draggable: !disabled,
          onDragStart: (e) => {
            e.dataTransfer.setData("text/plain", `move:${i}`);
            e.dataTransfer.effectAllowed = "move";
          },
          onDragOver: (e) => {
            if (e.dataTransfer.types.includes("text/plain")) {
              e.preventDefault();
              setOverIndex(insertionFor(e, i));
            }
          },
          onDrop: (e) => commitDrop(e, insertionFor(e, i)),
          onClick: () => onSelect(i),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(i);
            }
          },
          children: [
            /* @__PURE__ */ jsx3("span", { className: "eb-grip", "aria-hidden": "true", children: IconGrip }),
            /* @__PURE__ */ jsx3("span", { className: "eb-row-icon", "aria-hidden": "true", children: BLOCK_ICONS[block.type] }),
            /* @__PURE__ */ jsxs3("span", { className: "eb-row-body", children: [
              /* @__PURE__ */ jsx3("span", { className: "eb-row-type", children: block.type }),
              /* @__PURE__ */ jsx3("span", { className: "eb-row-summary", children: blockSummary(block) })
            ] }),
            /* @__PURE__ */ jsxs3("span", { className: "eb-row-actions", children: [
              /* @__PURE__ */ jsx3("button", { type: "button", className: "eb-icon-btn", disabled, title: "Duplicate", "aria-label": "Duplicate block", onClick: (e) => {
                e.stopPropagation();
                onDuplicate(i);
              }, children: IconDup }),
              /* @__PURE__ */ jsx3("button", { type: "button", className: "eb-icon-btn eb-danger", disabled, title: "Delete", "aria-label": "Delete block", onClick: (e) => {
                e.stopPropagation();
                onRemove(i);
              }, children: IconTrash })
            ] })
          ]
        }
      ),
      overIndex === i + 1 && /* @__PURE__ */ jsx3("div", { className: "eb-drop-line", "aria-hidden": "true" })
    ] }, i))
  ] });
}

// src/SettingsPanel.tsx
import { useEffect, useState as useState3 } from "react";

// src/fields.tsx
import { useId } from "react";
import { isValidColor } from "@lukeflow/email-core";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function Labeled({ label, children }) {
  const id = useId();
  return /* @__PURE__ */ jsxs4("label", { className: "eb-field", htmlFor: id, children: [
    /* @__PURE__ */ jsx4("span", { className: "eb-field-label", children: label }),
    children(id)
  ] });
}
function TextField({ label, value, onChange, placeholder, disabled, mono }) {
  return /* @__PURE__ */ jsx4(Labeled, { label, children: (id) => /* @__PURE__ */ jsx4("input", { id, className: `eb-input${mono ? " eb-mono" : ""}`, value, placeholder, disabled, onChange: (e) => onChange(e.target.value) }) });
}
function TextAreaField({ label, value, onChange, placeholder, disabled }) {
  return /* @__PURE__ */ jsx4(Labeled, { label, children: (id) => /* @__PURE__ */ jsx4("textarea", { id, className: "eb-textarea", value, placeholder, disabled, onChange: (e) => onChange(e.target.value) }) });
}
function NumberField({ label, value, onChange, min, max, disabled, placeholder }) {
  return /* @__PURE__ */ jsx4(Labeled, { label, children: (id) => /* @__PURE__ */ jsx4(
    "input",
    {
      id,
      type: "number",
      className: "eb-input",
      value: value ?? "",
      min,
      max,
      placeholder,
      disabled,
      onChange: (e) => {
        const raw = e.target.value;
        onChange(raw === "" ? void 0 : Number(raw));
      }
    }
  ) });
}
function SelectField({ label, value, options, onChange, disabled }) {
  return /* @__PURE__ */ jsx4(Labeled, { label, children: (id) => /* @__PURE__ */ jsx4("select", { id, className: "eb-select", value, disabled, onChange: (e) => onChange(e.target.value), children: options.map((o) => /* @__PURE__ */ jsx4("option", { value: o.value, children: o.label }, o.value)) }) });
}
function ColorField({ label, value, onChange, disabled }) {
  const captionId = useId();
  const swatch = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#000000";
  const bad = value.trim() !== "" && !isValidColor(value);
  return /* @__PURE__ */ jsxs4("div", { className: "eb-field", children: [
    /* @__PURE__ */ jsx4("span", { className: "eb-field-label", id: captionId, children: label }),
    /* @__PURE__ */ jsxs4("span", { className: "eb-color", children: [
      /* @__PURE__ */ jsx4("input", { "aria-label": `${label} swatch`, type: "color", className: "eb-color-swatch", value: swatch, disabled, onChange: (e) => onChange(e.target.value) }),
      /* @__PURE__ */ jsx4("input", { "aria-labelledby": captionId, className: `eb-input eb-mono${bad ? " eb-invalid" : ""}`, value, placeholder: "#2563eb", disabled, onChange: (e) => onChange(e.target.value), "aria-invalid": bad })
    ] })
  ] });
}
var ALIGNS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" }
];
function AlignField({ value, onChange, disabled }) {
  return /* @__PURE__ */ jsxs4("div", { className: "eb-field", children: [
    /* @__PURE__ */ jsx4("span", { className: "eb-field-label", children: "Align" }),
    /* @__PURE__ */ jsx4("div", { className: "eb-segmented", role: "group", "aria-label": "Align", children: ALIGNS.map((a) => /* @__PURE__ */ jsx4(
      "button",
      {
        type: "button",
        className: `eb-segment${value === a.value ? " eb-segment-on" : ""}`,
        "aria-pressed": value === a.value,
        disabled,
        onClick: () => onChange(a.value),
        children: a.label
      },
      a.value
    )) })
  ] });
}

// src/BlockEditor.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function BlockEditor({ block, onUpdate, disabled = false }) {
  const align = "align" in block && block.align ? block.align : "left";
  switch (block.type) {
    case "heading":
      return /* @__PURE__ */ jsxs5("div", { className: "eb-editor", children: [
        /* @__PURE__ */ jsx5(TextAreaField, { label: "Text", value: block.text, disabled, onChange: (text) => onUpdate({ text }), placeholder: "Heading text \u2014 {{vars}} allowed" }),
        /* @__PURE__ */ jsx5(
          SelectField,
          {
            label: "Level",
            value: String(block.level ?? 1),
            options: [{ value: "1", label: "H1 (largest)" }, { value: "2", label: "H2" }, { value: "3", label: "H3" }],
            disabled,
            onChange: (v) => onUpdate({ level: Number(v) })
          }
        ),
        /* @__PURE__ */ jsx5(AlignField, { value: align, disabled, onChange: (a) => onUpdate({ align: a }) })
      ] });
    case "text":
      return /* @__PURE__ */ jsxs5("div", { className: "eb-editor", children: [
        /* @__PURE__ */ jsx5(TextAreaField, { label: "Text", value: block.text, disabled, onChange: (text) => onUpdate({ text }), placeholder: "Supports **bold**, *italic*, [links](https://\u2026), and {{vars}}" }),
        /* @__PURE__ */ jsx5(AlignField, { value: align, disabled, onChange: (a) => onUpdate({ align: a }) })
      ] });
    case "button":
      return /* @__PURE__ */ jsxs5("div", { className: "eb-editor", children: [
        /* @__PURE__ */ jsx5(TextField, { label: "Label", value: block.label, disabled, onChange: (label) => onUpdate({ label }), placeholder: "Click here" }),
        /* @__PURE__ */ jsx5(TextField, { label: "Link (href)", value: block.href, disabled, onChange: (href) => onUpdate({ href }), placeholder: "https://\u2026 or {{ctaUrl}}", mono: true }),
        /* @__PURE__ */ jsx5(AlignField, { value: align, disabled, onChange: (a) => onUpdate({ align: a }) }),
        /* @__PURE__ */ jsx5(ColorField, { label: "Background", value: block.bgColor ?? "", disabled, onChange: (bgColor) => onUpdate({ bgColor }) }),
        /* @__PURE__ */ jsx5(ColorField, { label: "Text color", value: block.textColor ?? "", disabled, onChange: (textColor) => onUpdate({ textColor }) })
      ] });
    case "image":
      return /* @__PURE__ */ jsxs5("div", { className: "eb-editor", children: [
        /* @__PURE__ */ jsx5(TextField, { label: "Source (https)", value: block.src, disabled, onChange: (src) => onUpdate({ src }), placeholder: "https://\u2026/image.png or {{logoUrl}}", mono: true }),
        /* @__PURE__ */ jsx5(TextField, { label: "Alt text", value: block.alt, disabled, onChange: (alt) => onUpdate({ alt }), placeholder: "Describe the image (accessibility)" }),
        /* @__PURE__ */ jsx5(NumberField, { label: "Width (px)", value: block.width, min: 1, max: 700, disabled, onChange: (width) => onUpdate({ width }), placeholder: "auto" }),
        /* @__PURE__ */ jsx5(TextField, { label: "Link (optional)", value: block.href ?? "", disabled, onChange: (href) => onUpdate({ href: href || void 0 }), placeholder: "https://\u2026", mono: true }),
        /* @__PURE__ */ jsx5(AlignField, { value: align, disabled, onChange: (a) => onUpdate({ align: a }) })
      ] });
    case "spacer":
      return /* @__PURE__ */ jsx5("div", { className: "eb-editor", children: /* @__PURE__ */ jsx5(NumberField, { label: "Height (px)", value: block.size ?? 24, min: 1, max: 200, disabled, onChange: (size) => onUpdate({ size: size ?? 24 }) }) });
    case "footer":
      return /* @__PURE__ */ jsxs5("div", { className: "eb-editor", children: [
        /* @__PURE__ */ jsx5(TextAreaField, { label: "Text", value: block.text, disabled, onChange: (text) => onUpdate({ text }), placeholder: "\xA9 Your Company \xB7 123 St \xB7 {{city}}" }),
        /* @__PURE__ */ jsx5(TextField, { label: "Unsubscribe URL", value: block.unsubscribeUrl ?? "", disabled, onChange: (unsubscribeUrl) => onUpdate({ unsubscribeUrl: unsubscribeUrl || void 0 }), placeholder: "https://\u2026 or {{unsubscribeUrl}}", mono: true })
      ] });
    case "divider":
      return /* @__PURE__ */ jsx5("p", { className: "eb-settings-hint", children: "A divider has no settings. Use a Spacer to control the gap around it." });
  }
}

// src/ThemeEditor.tsx
import { MAX_CONTENT_WIDTH, MIN_CONTENT_WIDTH } from "@lukeflow/email-core";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function ThemeEditor({ theme, onChange, disabled = false }) {
  return /* @__PURE__ */ jsxs6("div", { className: "eb-editor", children: [
    /* @__PURE__ */ jsx6(ColorField, { label: "Brand color", value: theme.brandColor, disabled, onChange: (brandColor) => onChange({ brandColor }) }),
    /* @__PURE__ */ jsx6(
      SelectField,
      {
        label: "Font",
        value: theme.fontFamily,
        options: [{ value: "sans", label: "Sans-serif" }, { value: "serif", label: "Serif" }, { value: "mono", label: "Monospace" }],
        disabled,
        onChange: (fontFamily) => onChange({ fontFamily })
      }
    ),
    /* @__PURE__ */ jsx6(NumberField, { label: "Content width (px)", value: theme.contentWidth, min: MIN_CONTENT_WIDTH, max: MAX_CONTENT_WIDTH, disabled, onChange: (w) => onChange({ contentWidth: w ?? theme.contentWidth }) }),
    /* @__PURE__ */ jsx6(ColorField, { label: "Page background", value: theme.backgroundColor, disabled, onChange: (backgroundColor) => onChange({ backgroundColor }) }),
    /* @__PURE__ */ jsx6(ColorField, { label: "Card background", value: theme.contentBackground, disabled, onChange: (contentBackground) => onChange({ contentBackground }) })
  ] });
}

// src/VariablesEditor.tsx
import { EMAIL_VAR_TYPES } from "@lukeflow/email-core";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function coerceDefault(raw, type) {
  if (raw === "") return void 0;
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (type === "boolean") return raw === "true";
  return raw;
}
function VariablesEditor({ contract, usedNames, onChange, disabled = false }) {
  if (contract.length === 0) {
    return /* @__PURE__ */ jsxs7("p", { className: "eb-settings-hint", children: [
      "No variables yet. Add ",
      /* @__PURE__ */ jsx7("span", { className: "eb-mono", children: "{{name}}" }),
      " to the subject or any block and it appears here."
    ] });
  }
  const patch = (name, changes) => onChange(contract.map((v) => v.name === name ? { ...v, ...changes } : v));
  return /* @__PURE__ */ jsxs7("div", { className: "eb-vars", children: [
    /* @__PURE__ */ jsx7("p", { className: "eb-settings-hint", children: "Declared types are validated before the email is sent. Values are supplied at send time." }),
    contract.map((v) => {
      const unused = !usedNames.has(v.name);
      return /* @__PURE__ */ jsxs7("div", { className: "eb-var-row", children: [
        /* @__PURE__ */ jsxs7("div", { className: "eb-var-name", children: [
          /* @__PURE__ */ jsx7("span", { className: "eb-mono", children: `{{${v.name}}}` }),
          unused && /* @__PURE__ */ jsx7("span", { className: "eb-badge", title: "Declared but not used", children: "unused" })
        ] }),
        /* @__PURE__ */ jsx7("select", { "aria-label": `Type for ${v.name}`, className: "eb-select", value: v.type, disabled, onChange: (e) => patch(v.name, { type: e.target.value }), children: EMAIL_VAR_TYPES.map((t) => /* @__PURE__ */ jsx7("option", { value: t, children: t }, t)) }),
        /* @__PURE__ */ jsxs7("label", { className: "eb-check", children: [
          /* @__PURE__ */ jsx7("input", { type: "checkbox", checked: v.required, disabled, onChange: (e) => patch(v.name, { required: e.target.checked }) }),
          "required"
        ] }),
        /* @__PURE__ */ jsx7(
          "input",
          {
            "aria-label": `Default for ${v.name}`,
            className: "eb-input",
            value: v.default === void 0 ? "" : String(v.default),
            placeholder: v.type === "boolean" ? "true / false" : `default (${v.type})`,
            disabled,
            onChange: (e) => patch(v.name, { default: coerceDefault(e.target.value, v.type) })
          }
        )
      ] }, v.name);
    })
  ] });
}

// src/SettingsPanel.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var TABS = [
  { id: "block", label: "Block" },
  { id: "theme", label: "Theme" },
  { id: "variables", label: "Variables" }
];
function SettingsPanel({
  selectedBlock,
  selectedIndex,
  theme,
  contract,
  usedNames,
  onUpdateBlock,
  onUpdateTheme,
  onUpdateVariables,
  disabled = false
}) {
  const [tab, setTab] = useState3("theme");
  useEffect(() => {
    if (selectedIndex !== null) setTab("block");
  }, [selectedIndex]);
  return /* @__PURE__ */ jsxs8("div", { className: "eb-settings", children: [
    /* @__PURE__ */ jsx8("div", { className: "eb-tabs", role: "tablist", "aria-label": "Settings", children: TABS.map((t) => /* @__PURE__ */ jsx8(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": tab === t.id,
        className: `eb-tab${tab === t.id ? " eb-tab-on" : ""}`,
        onClick: () => setTab(t.id),
        children: t.label
      },
      t.id
    )) }),
    /* @__PURE__ */ jsxs8("div", { className: "eb-settings-body", role: "tabpanel", children: [
      tab === "block" && (selectedBlock ? /* @__PURE__ */ jsx8(BlockEditor, { block: selectedBlock, onUpdate: onUpdateBlock, disabled }) : /* @__PURE__ */ jsx8("p", { className: "eb-settings-hint", children: "Select a block in the canvas to edit it." })),
      tab === "theme" && /* @__PURE__ */ jsx8(ThemeEditor, { theme, onChange: onUpdateTheme, disabled }),
      tab === "variables" && /* @__PURE__ */ jsx8(VariablesEditor, { contract, usedNames, onChange: onUpdateVariables, disabled })
    ] })
  ] });
}

// src/Problems.tsx
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
function Problems({ problems, onSelectBlock }) {
  if (problems.length === 0) {
    return /* @__PURE__ */ jsx9("p", { className: "eb-problems-ok", children: "No problems \u2014 the email looks good." });
  }
  return /* @__PURE__ */ jsx9("ul", { className: "eb-problems", "aria-label": "Problems", children: problems.map((p, i) => {
    const clickable = p.blockIndex !== void 0;
    return /* @__PURE__ */ jsxs9("li", { className: `eb-problem eb-problem-${p.severity}`, children: [
      /* @__PURE__ */ jsx9("span", { className: `eb-problem-dot eb-dot-${p.severity}`, "aria-hidden": "true" }),
      clickable ? /* @__PURE__ */ jsxs9("button", { type: "button", className: "eb-problem-link", onClick: () => onSelectBlock(p.blockIndex), children: [
        /* @__PURE__ */ jsxs9("span", { className: "eb-problem-loc", children: [
          "Block ",
          p.blockIndex + 1
        ] }),
        " ",
        p.message
      ] }) : /* @__PURE__ */ jsx9("span", { children: p.message })
    ] }, i);
  }) });
}

// src/PreviewModal.tsx
import { useEffect as useEffect3, useMemo as useMemo2, useState as useState4 } from "react";
import { previewValues, reconcileVariables as reconcileVariables2, VAR_RE } from "@lukeflow/email-core";

// src/Modal.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useRef as useRef2 } from "react";
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
var FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
function Modal({ title, onClose, children, wide = false }) {
  const dialogRef = useRef2(null);
  const restoreRef = useRef2(null);
  useEffect2(() => {
    restoreRef.current = document.activeElement ?? null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector(FOCUSABLE);
    (first ?? dialog)?.focus();
    return () => restoreRef.current?.focus?.();
  }, []);
  const onKeyDown = useCallback2((e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === firstItem) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && active === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  }, [onClose]);
  return (
    // Presentational overlay; click outside the dialog closes it (Escape also works).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    /* @__PURE__ */ jsx10("div", { className: "eb-modal-backdrop", onMouseDown: (e) => {
      if (e.target === e.currentTarget) onClose();
    }, children: /* @__PURE__ */ jsxs10(
      "div",
      {
        ref: dialogRef,
        className: `eb-modal${wide ? " eb-modal-wide" : ""}`,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": title,
        tabIndex: -1,
        onKeyDown,
        children: [
          /* @__PURE__ */ jsxs10("div", { className: "eb-modal-head", children: [
            /* @__PURE__ */ jsx10("span", { className: "eb-modal-title", children: title }),
            /* @__PURE__ */ jsx10("button", { type: "button", className: "eb-icon-btn", "aria-label": "Close", onClick: onClose, children: /* @__PURE__ */ jsx10("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsx10("path", { d: "M6 6l12 12M18 6 6 18" }) }) })
          ] }),
          /* @__PURE__ */ jsx10("div", { className: "eb-modal-body", children })
        ]
      }
    ) })
  );
}

// src/PreviewModal.tsx
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function mergeText(text, values) {
  return text.replace(
    VAR_RE,
    (whole, name) => Object.prototype.hasOwnProperty.call(values, name) && values[name] !== "" ? values[name] : whole
  );
}
function PreviewModal({
  doc,
  renderPreview,
  onGenerateTestData,
  onClose
}) {
  const contract = useMemo2(() => reconcileVariables2(doc), [doc]);
  const hasVars = contract.length > 0;
  const [merge, setMerge] = useState4(true);
  const [values, setValues] = useState4(
    () => previewValues({ doc, variables: doc.variables ?? [] })
  );
  const [generating, setGenerating] = useState4(false);
  const [genError, setGenError] = useState4(null);
  const namesKey = contract.map((v) => v.name).join("\0");
  useEffect3(() => {
    const seed = previewValues({ doc, variables: doc.variables ?? [] });
    setValues((prev) => {
      const next = {};
      for (const v of contract) next[v.name] = prev[v.name] ?? seed[v.name] ?? "";
      return next;
    });
  }, [namesKey]);
  const generate = async () => {
    if (!onGenerateTestData) return;
    setGenerating(true);
    setGenError(null);
    try {
      const generated = await onGenerateTestData(doc);
      setValues((prev) => {
        const next = { ...prev };
        for (const name of Object.keys(next)) {
          const g = generated?.[name];
          if (g != null && g !== "") next[name] = String(g);
        }
        return next;
      });
      setMerge(true);
    } catch (e) {
      setGenError(e?.message || "Couldn\u2019t generate sample values.");
    } finally {
      setGenerating(false);
    }
  };
  const effectiveValues = merge ? values : void 0;
  const subject = doc.subject ? merge ? mergeText(doc.subject, values) : doc.subject : "";
  return /* @__PURE__ */ jsx11(Modal, { title: "Email preview", onClose, wide: true, children: /* @__PURE__ */ jsxs11("div", { className: `eb-preview${hasVars ? "" : " eb-preview-novars"}`, children: [
    /* @__PURE__ */ jsxs11("div", { className: "eb-preview-canvas", children: [
      subject ? /* @__PURE__ */ jsxs11("div", { className: "eb-preview-subject", children: [
        /* @__PURE__ */ jsx11("span", { className: "eb-preview-subject-label", children: "Subject" }),
        /* @__PURE__ */ jsx11("span", { className: "eb-preview-subject-text", children: subject })
      ] }) : null,
      /* @__PURE__ */ jsx11("div", { className: "eb-preview-frame", children: renderPreview(doc, effectiveValues) })
    ] }),
    hasVars && /* @__PURE__ */ jsxs11("aside", { className: "eb-preview-side", "aria-label": "Sample data", children: [
      /* @__PURE__ */ jsxs11("div", { className: "eb-preview-side-head", children: [
        /* @__PURE__ */ jsx11("span", { className: "eb-preview-side-title", children: "Sample data" }),
        /* @__PURE__ */ jsxs11("label", { className: "eb-preview-toggle", title: "Merge these values into the preview", children: [
          /* @__PURE__ */ jsx11("input", { type: "checkbox", checked: merge, onChange: (e) => setMerge(e.target.checked) }),
          /* @__PURE__ */ jsx11("span", { children: "Merge values" })
        ] })
      ] }),
      /* @__PURE__ */ jsx11("p", { className: "eb-preview-hint", children: "See the actual email a recipient receives. Edit a value, or generate a realistic set." }),
      onGenerateTestData && /* @__PURE__ */ jsx11(
        "button",
        {
          type: "button",
          className: "eb-preview-gen",
          disabled: generating,
          onClick: () => void generate(),
          children: generating ? "Generating\u2026" : "Generate sample values"
        }
      ),
      genError && /* @__PURE__ */ jsx11("p", { className: "eb-preview-error", role: "alert", children: genError }),
      /* @__PURE__ */ jsx11("div", { className: "eb-preview-vars", children: contract.map((v) => /* @__PURE__ */ jsxs11("label", { className: "eb-preview-var", children: [
        /* @__PURE__ */ jsxs11("span", { className: "eb-preview-var-name", children: [
          `{{${v.name}}}`,
          v.required ? /* @__PURE__ */ jsx11("span", { className: "eb-preview-req", title: "required", children: " *" }) : null
        ] }),
        /* @__PURE__ */ jsx11(
          "input",
          {
            className: "eb-input",
            value: values[v.name] ?? "",
            disabled: !merge,
            placeholder: v.type,
            onChange: (e) => setValues((prev) => ({ ...prev, [v.name]: e.target.value }))
          }
        )
      ] }, v.name)) })
    ] })
  ] }) });
}

// src/EmailBuilder.tsx
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
var IconUndo = /* @__PURE__ */ jsxs12("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsx12("path", { d: "M9 7 4 12l5 5" }),
  /* @__PURE__ */ jsx12("path", { d: "M4 12h11a5 5 0 0 1 0 10h-1" })
] });
var IconRedo = /* @__PURE__ */ jsxs12("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsx12("path", { d: "m15 7 5 5-5 5" }),
  /* @__PURE__ */ jsx12("path", { d: "M20 12H9a5 5 0 0 0 0 10h1" })
] });
var IconEye = /* @__PURE__ */ jsxs12("svg", { viewBox: "0 0 24 24", width: "15", height: "15", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsx12("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" }),
  /* @__PURE__ */ jsx12("circle", { cx: "12", cy: "12", r: "3" })
] });
function isEditingTarget(t) {
  const el = t;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
var EmailBuilder = forwardRef(function EmailBuilder2({ initialDoc, onChange, disabled = false, className = "", settings = "panel", aside, renderPreview, onGenerateTestData }, ref) {
  const b = useEmailBuilder(initialDoc);
  const [showPreview, setShowPreview] = useState5(false);
  const [showProblems, setShowProblems] = useState5(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState5(false);
  const onChangeRef = useRef3(onChange);
  onChangeRef.current = onChange;
  const mounted = useRef3(false);
  useEffect4(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onChangeRef.current?.(b.doc);
  }, [b.doc]);
  useImperativeHandle(ref, () => ({
    getDoc: () => b.doc,
    setDoc: b.setDoc,
    undo: b.undo,
    redo: b.redo,
    getProblems: () => b.problems
  }), [b.doc, b.setDoc, b.undo, b.redo, b.problems]);
  const usedNames = useMemo3(() => new Set(extractVariables(b.doc)), [b.doc]);
  const errorCount = b.problems.filter((p) => p.severity === "error").length;
  const warnCount = b.problems.length - errorCount;
  const selectBlock = (index) => {
    b.select(index);
    if (settings === "modal") setSettingsModalOpen(true);
  };
  const onKeyDown = (e) => {
    if (disabled) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) b.redo();
      else b.undo();
    } else if (mod && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      b.redo();
    } else if ((e.key === "Delete" || e.key === "Backspace") && b.selectedIndex !== null && !isEditingTarget(e.target)) {
      e.preventDefault();
      b.removeBlock(b.selectedIndex);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && b.selectedIndex !== null && !isEditingTarget(e.target)) {
      e.preventDefault();
      const to = b.selectedIndex + (e.key === "ArrowUp" ? -1 : 1);
      if (to >= 0 && to < b.doc.blocks.length) b.moveBlock(b.selectedIndex, to);
    }
  };
  const settingsPanel = /* @__PURE__ */ jsx12(
    SettingsPanel,
    {
      selectedBlock: b.selectedBlock,
      selectedIndex: b.selectedIndex,
      theme: b.doc.theme,
      contract: b.variables,
      usedNames,
      onUpdateBlock: (patch) => b.selectedIndex !== null && b.updateBlock(b.selectedIndex, patch),
      onUpdateTheme: b.setTheme,
      onUpdateVariables: b.setVariables,
      disabled
    }
  );
  return (
    // Root captures keyboard shortcuts (undo/redo, delete, reorder) for its children;
    // it's a container, not itself an interactive control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    /* @__PURE__ */ jsxs12("div", { className: `eb-builder${disabled ? " eb-disabled" : ""} ${className}`.trim(), onKeyDown, children: [
      /* @__PURE__ */ jsxs12("div", { className: "eb-toolbar", children: [
        /* @__PURE__ */ jsxs12("div", { className: "eb-toolbar-group", children: [
          /* @__PURE__ */ jsx12("button", { type: "button", className: "eb-icon-btn", disabled: disabled || !b.canUndo, onClick: b.undo, title: "Undo (\u2318Z)", "aria-label": "Undo", children: IconUndo }),
          /* @__PURE__ */ jsx12("button", { type: "button", className: "eb-icon-btn", disabled: disabled || !b.canRedo, onClick: b.redo, title: "Redo (\u21E7\u2318Z)", "aria-label": "Redo", children: IconRedo })
        ] }),
        /* @__PURE__ */ jsx12("span", { className: "eb-toolbar-spacer" }),
        /* @__PURE__ */ jsx12(
          "button",
          {
            type: "button",
            className: `eb-chip${errorCount ? " eb-chip-error" : warnCount ? " eb-chip-warn" : ""}`,
            "aria-pressed": showProblems,
            onClick: () => setShowProblems((v) => !v),
            children: errorCount ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : warnCount ? `${warnCount} warning${warnCount === 1 ? "" : "s"}` : "No problems"
          }
        ),
        renderPreview && /* @__PURE__ */ jsxs12("button", { type: "button", className: "eb-chip", onClick: () => setShowPreview(true), children: [
          IconEye,
          " Preview"
        ] }),
        /* @__PURE__ */ jsxs12("span", { className: "eb-block-count", children: [
          b.doc.blocks.length,
          " block",
          b.doc.blocks.length === 1 ? "" : "s"
        ] })
      ] }),
      showProblems && /* @__PURE__ */ jsx12("div", { className: "eb-problems-panel", children: /* @__PURE__ */ jsx12(Problems, { problems: b.problems, onSelectBlock: selectBlock }) }),
      /* @__PURE__ */ jsxs12("div", { className: "eb-header", children: [
        /* @__PURE__ */ jsxs12("label", { className: "eb-field", children: [
          /* @__PURE__ */ jsx12("span", { className: "eb-field-label", children: "Subject" }),
          /* @__PURE__ */ jsx12("input", { className: "eb-input", value: b.doc.subject, disabled, placeholder: "Welcome, {{firstName}}!", onChange: (e) => b.setSubject(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs12("label", { className: "eb-field", children: [
          /* @__PURE__ */ jsx12("span", { className: "eb-field-label", children: "Preheader" }),
          /* @__PURE__ */ jsx12("input", { className: "eb-input", value: b.doc.preheader ?? "", disabled, placeholder: "Inbox preview text (optional)", onChange: (e) => b.setPreheader(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs12("div", { className: `eb-grid eb-grid-3${aside && settings === "modal" ? " eb-has-aside" : ""}`, children: [
        /* @__PURE__ */ jsxs12("div", { className: "eb-col eb-col-palette", children: [
          /* @__PURE__ */ jsx12("div", { className: "eb-col-title", children: "Blocks" }),
          /* @__PURE__ */ jsx12(Palette, { onAdd: (type) => b.addBlock(type, b.selectedIndex === null ? void 0 : b.selectedIndex + 1), disabled })
        ] }),
        /* @__PURE__ */ jsx12("div", { className: "eb-col eb-col-canvas", children: /* @__PURE__ */ jsx12(
          Canvas,
          {
            blocks: b.doc.blocks,
            selectedIndex: b.selectedIndex,
            onSelect: (i) => i === null ? b.select(null) : selectBlock(i),
            onAdd: b.addBlock,
            onMove: b.moveBlock,
            onRemove: b.removeBlock,
            onDuplicate: b.duplicateBlock,
            disabled
          }
        ) }),
        settings === "panel" ? /* @__PURE__ */ jsx12("div", { className: "eb-col eb-col-settings", children: settingsPanel }) : aside && /* @__PURE__ */ jsx12("div", { className: "eb-col eb-col-aside", children: aside })
      ] }),
      settings === "modal" && settingsModalOpen && /* @__PURE__ */ jsx12(Modal, { title: "Block settings", onClose: () => setSettingsModalOpen(false), children: settingsPanel }),
      showPreview && renderPreview && /* @__PURE__ */ jsx12(
        PreviewModal,
        {
          doc: b.doc,
          renderPreview,
          onGenerateTestData,
          onClose: () => setShowPreview(false)
        }
      )
    ] })
  );
});

// src/index.ts
var VERSION = "0.1.0-alpha.0";
export {
  BLOCK_ICONS,
  BLOCK_META,
  BlockEditor,
  EmailBuilder,
  Modal,
  PreviewModal,
  Problems,
  SettingsPanel,
  ThemeEditor,
  VERSION,
  VariablesEditor,
  blockSummary,
  createBlock,
  useEmailBuilder
};
//# sourceMappingURL=index.js.map