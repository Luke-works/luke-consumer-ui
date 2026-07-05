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
  BLOCK_ICONS: () => BLOCK_ICONS,
  BLOCK_META: () => BLOCK_META,
  BlockEditor: () => BlockEditor,
  EmailBuilder: () => EmailBuilder,
  Modal: () => Modal,
  PreviewModal: () => PreviewModal,
  Problems: () => Problems,
  SettingsPanel: () => SettingsPanel,
  ThemeEditor: () => ThemeEditor,
  VERSION: () => VERSION,
  VariablesEditor: () => VariablesEditor,
  blockSummary: () => blockSummary,
  createBlock: () => createBlock,
  useEmailBuilder: () => useEmailBuilder
});
module.exports = __toCommonJS(index_exports);

// src/useEmailBuilder.ts
var import_react = require("react");
var import_email_core = require("@lukeflow/email-core");
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
function useEmailBuilder(initialDoc = (0, import_email_core.emptyEmailDoc)()) {
  const [doc, setDocState] = (0, import_react.useState)(initialDoc);
  const [selectedIndex, setSelectedIndex] = (0, import_react.useState)(null);
  const past = (0, import_react.useRef)([]);
  const future = (0, import_react.useRef)([]);
  const [, forceRender] = (0, import_react.useState)(0);
  const commit = (0, import_react.useCallback)((next) => {
    setDocState((prev) => {
      if (next === prev) return prev;
      pushBounded(past.current, prev);
      future.current = [];
      return next;
    });
  }, []);
  const select = (0, import_react.useCallback)((index) => setSelectedIndex(index), []);
  const addBlock = (0, import_react.useCallback)((type, at) => {
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
  const removeBlock = (0, import_react.useCallback)((index) => {
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
  const moveBlock = (0, import_react.useCallback)((from, to) => {
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
  const duplicateBlock = (0, import_react.useCallback)((index) => {
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
  const updateBlock = (0, import_react.useCallback)((index, patch) => {
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
  const setTheme = (0, import_react.useCallback)((patch) => commit0((prev) => ({ ...prev, theme: { ...prev.theme, ...patch } })), []);
  const setSubject = (0, import_react.useCallback)((subject) => commit0((prev) => ({ ...prev, subject })), []);
  const setPreheader = (0, import_react.useCallback)((preheader) => commit0((prev) => ({ ...prev, preheader })), []);
  const setVariables = (0, import_react.useCallback)((variables2) => commit0((prev) => ({ ...prev, variables: variables2 })), []);
  function commit0(fn) {
    setDocState((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      pushBounded(past.current, prev);
      future.current = [];
      return next;
    });
  }
  const setDoc = (0, import_react.useCallback)((next) => {
    commit(next);
    setSelectedIndex(null);
  }, [commit]);
  const undo = (0, import_react.useCallback)(() => {
    if (past.current.length === 0) return;
    setDocState((prev) => {
      const snap = past.current.pop();
      future.current.push(prev);
      return snap;
    });
    setSelectedIndex(null);
    forceRender((n) => n + 1);
  }, []);
  const redo = (0, import_react.useCallback)(() => {
    if (future.current.length === 0) return;
    setDocState((prev) => {
      const snap = future.current.pop();
      pushBounded(past.current, prev);
      return snap;
    });
    setSelectedIndex(null);
    forceRender((n) => n + 1);
  }, []);
  const problems = (0, import_react.useMemo)(() => {
    const variables2 = (0, import_email_core.reconcileVariables)(doc);
    return [...(0, import_email_core.validateEmailDoc)(doc), ...(0, import_email_core.validateVariables)({ doc, variables: variables2 })];
  }, [doc]);
  const hasErrors = (0, import_react.useMemo)(() => problems.some((p) => p.severity === "error"), [problems]);
  const variables = (0, import_react.useMemo)(() => (0, import_email_core.reconcileVariables)(doc), [doc]);
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
var import_react6 = require("react");
var import_email_core5 = require("@lukeflow/email-core");

// src/blocks.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var svg = (children) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children });
var BLOCK_ICONS = {
  heading: svg(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 4v16" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M18 4v16" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 12h12" })
  ] })),
  text: svg(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 6h16" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 12h16" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 18h10" })
  ] })),
  button: svg(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3", y: "8", width: "18", height: "8", rx: "4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 12h8" })
  ] })),
  image: svg(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "8.5", cy: "9.5", r: "1.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m21 16-5-5L5 20" })
  ] })),
  divider: svg(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 12h16" })),
  spacer: svg(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 4v16" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m8 8 4-4 4 4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m8 16 4 4 4-4" })
  ] })),
  footer: svg(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 18h16" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 14h16" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 10h8" })
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
var import_jsx_runtime2 = require("react/jsx-runtime");
function Palette({
  onAdd,
  disabled = false
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "eb-palette", role: "group", "aria-label": "Block palette", children: BLOCK_META.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
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
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "eb-palette-icon", children: BLOCK_ICONS[m.type] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "eb-palette-label", children: m.label })
      ]
    },
    m.type
  )) });
}

// src/Canvas.tsx
var import_react2 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var IconDup = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { viewBox: "0 0 24 24", width: "15", height: "15", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: "9", y: "9", width: "11", height: "11", rx: "2" }),
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M5 15V5a2 2 0 0 1 2-2h10" })
] });
var IconTrash = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { viewBox: "0 0 24 24", width: "15", height: "15", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M4 7h16" }),
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M10 11v6M14 11v6" }),
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" }),
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M9 7V4h6v3" })
] });
var IconGrip = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { viewBox: "0 0 24 24", width: "15", height: "15", fill: "currentColor", "aria-hidden": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "9", cy: "6", r: "1.4" }),
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "15", cy: "6", r: "1.4" }),
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "9", cy: "12", r: "1.4" }),
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "15", cy: "12", r: "1.4" }),
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "9", cy: "18", r: "1.4" }),
  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "15", cy: "18", r: "1.4" })
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
  const [overIndex, setOverIndex] = (0, import_react2.useState)(null);
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
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
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
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "eb-empty-title", children: "Your email is empty" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "eb-empty-hint", children: "Add a block from the palette, or drag one here." })
        ]
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "eb-canvas", role: "list", "aria-label": "Email blocks", onDragLeave: (e) => {
    if (e.currentTarget === e.target) setOverIndex(null);
  }, children: [
    overIndex === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "eb-drop-line", "aria-hidden": "true" }),
    blocks.map((block, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "div",
        {
          role: "listitem",
          className: `eb-row${selectedIndex === i ? " eb-row-selected" : ""}`,
          tabIndex: disabled ? -1 : 0,
          "aria-selected": selectedIndex === i,
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
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "eb-grip", "aria-hidden": "true", children: IconGrip }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "eb-row-icon", "aria-hidden": "true", children: BLOCK_ICONS[block.type] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "eb-row-body", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "eb-row-type", children: block.type }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "eb-row-summary", children: blockSummary(block) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "eb-row-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "eb-icon-btn", disabled, title: "Duplicate", "aria-label": "Duplicate block", onClick: (e) => {
                e.stopPropagation();
                onDuplicate(i);
              }, children: IconDup }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "eb-icon-btn eb-danger", disabled, title: "Delete", "aria-label": "Delete block", onClick: (e) => {
                e.stopPropagation();
                onRemove(i);
              }, children: IconTrash })
            ] })
          ]
        }
      ),
      overIndex === i + 1 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "eb-drop-line", "aria-hidden": "true" })
    ] }, i))
  ] });
}

// src/SettingsPanel.tsx
var import_react4 = require("react");

// src/fields.tsx
var import_react3 = require("react");
var import_email_core2 = require("@lukeflow/email-core");
var import_jsx_runtime4 = require("react/jsx-runtime");
function Labeled({ label, children }) {
  const id = (0, import_react3.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "eb-field", htmlFor: id, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "eb-field-label", children: label }),
    children(id)
  ] });
}
function TextField({ label, value, onChange, placeholder, disabled, mono }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Labeled, { label, children: (id) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { id, className: `eb-input${mono ? " eb-mono" : ""}`, value, placeholder, disabled, onChange: (e) => onChange(e.target.value) }) });
}
function TextAreaField({ label, value, onChange, placeholder, disabled }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Labeled, { label, children: (id) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("textarea", { id, className: "eb-textarea", value, placeholder, disabled, onChange: (e) => onChange(e.target.value) }) });
}
function NumberField({ label, value, onChange, min, max, disabled, placeholder }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Labeled, { label, children: (id) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Labeled, { label, children: (id) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("select", { id, className: "eb-select", value, disabled, onChange: (e) => onChange(e.target.value), children: options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: o.value, children: o.label }, o.value)) }) });
}
function ColorField({ label, value, onChange, disabled }) {
  const swatch = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#000000";
  const bad = value.trim() !== "" && !(0, import_email_core2.isValidColor)(value);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Labeled, { label, children: (id) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "eb-color", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { "aria-label": `${label} swatch`, type: "color", className: "eb-color-swatch", value: swatch, disabled, onChange: (e) => onChange(e.target.value) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { id, className: `eb-input eb-mono${bad ? " eb-invalid" : ""}`, value, placeholder: "#2563eb", disabled, onChange: (e) => onChange(e.target.value), "aria-invalid": bad })
  ] }) });
}
var ALIGNS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" }
];
function AlignField({ value, onChange, disabled }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "eb-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "eb-field-label", children: "Align" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "eb-segmented", role: "group", "aria-label": "Align", children: ALIGNS.map((a) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
var import_jsx_runtime5 = require("react/jsx-runtime");
function BlockEditor({ block, onUpdate, disabled = false }) {
  const align = "align" in block && block.align ? block.align : "left";
  switch (block.type) {
    case "heading":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "eb-editor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TextAreaField, { label: "Text", value: block.text, disabled, onChange: (text) => onUpdate({ text }), placeholder: "Heading text \u2014 {{vars}} allowed" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          SelectField,
          {
            label: "Level",
            value: String(block.level ?? 1),
            options: [{ value: "1", label: "H1 (largest)" }, { value: "2", label: "H2" }, { value: "3", label: "H3" }],
            disabled,
            onChange: (v) => onUpdate({ level: Number(v) })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(AlignField, { value: align, disabled, onChange: (a) => onUpdate({ align: a }) })
      ] });
    case "text":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "eb-editor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TextAreaField, { label: "Text", value: block.text, disabled, onChange: (text) => onUpdate({ text }), placeholder: "Supports **bold**, *italic*, [links](https://\u2026), and {{vars}}" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(AlignField, { value: align, disabled, onChange: (a) => onUpdate({ align: a }) })
      ] });
    case "button":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "eb-editor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TextField, { label: "Label", value: block.label, disabled, onChange: (label) => onUpdate({ label }), placeholder: "Click here" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TextField, { label: "Link (href)", value: block.href, disabled, onChange: (href) => onUpdate({ href }), placeholder: "https://\u2026 or {{ctaUrl}}", mono: true }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(AlignField, { value: align, disabled, onChange: (a) => onUpdate({ align: a }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ColorField, { label: "Background", value: block.bgColor ?? "", disabled, onChange: (bgColor) => onUpdate({ bgColor }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ColorField, { label: "Text color", value: block.textColor ?? "", disabled, onChange: (textColor) => onUpdate({ textColor }) })
      ] });
    case "image":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "eb-editor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TextField, { label: "Source (https)", value: block.src, disabled, onChange: (src) => onUpdate({ src }), placeholder: "https://\u2026/image.png or {{logoUrl}}", mono: true }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TextField, { label: "Alt text", value: block.alt, disabled, onChange: (alt) => onUpdate({ alt }), placeholder: "Describe the image (accessibility)" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NumberField, { label: "Width (px)", value: block.width, min: 1, max: 700, disabled, onChange: (width) => onUpdate({ width }), placeholder: "auto" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TextField, { label: "Link (optional)", value: block.href ?? "", disabled, onChange: (href) => onUpdate({ href: href || void 0 }), placeholder: "https://\u2026", mono: true }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(AlignField, { value: align, disabled, onChange: (a) => onUpdate({ align: a }) })
      ] });
    case "spacer":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "eb-editor", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NumberField, { label: "Height (px)", value: block.size ?? 24, min: 1, max: 200, disabled, onChange: (size) => onUpdate({ size: size ?? 24 }) }) });
    case "footer":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "eb-editor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TextAreaField, { label: "Text", value: block.text, disabled, onChange: (text) => onUpdate({ text }), placeholder: "\xA9 Your Company \xB7 123 St \xB7 {{city}}" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TextField, { label: "Unsubscribe URL", value: block.unsubscribeUrl ?? "", disabled, onChange: (unsubscribeUrl) => onUpdate({ unsubscribeUrl: unsubscribeUrl || void 0 }), placeholder: "https://\u2026 or {{unsubscribeUrl}}", mono: true })
      ] });
    case "divider":
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "eb-settings-hint", children: "A divider has no settings. Use a Spacer to control the gap around it." });
  }
}

// src/ThemeEditor.tsx
var import_email_core3 = require("@lukeflow/email-core");
var import_jsx_runtime6 = require("react/jsx-runtime");
function ThemeEditor({ theme, onChange, disabled = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "eb-editor", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ColorField, { label: "Brand color", value: theme.brandColor, disabled, onChange: (brandColor) => onChange({ brandColor }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      SelectField,
      {
        label: "Font",
        value: theme.fontFamily,
        options: [{ value: "sans", label: "Sans-serif" }, { value: "serif", label: "Serif" }, { value: "mono", label: "Monospace" }],
        disabled,
        onChange: (fontFamily) => onChange({ fontFamily })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NumberField, { label: "Content width (px)", value: theme.contentWidth, min: import_email_core3.MIN_CONTENT_WIDTH, max: import_email_core3.MAX_CONTENT_WIDTH, disabled, onChange: (w) => onChange({ contentWidth: w ?? theme.contentWidth }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ColorField, { label: "Page background", value: theme.backgroundColor, disabled, onChange: (backgroundColor) => onChange({ backgroundColor }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ColorField, { label: "Card background", value: theme.contentBackground, disabled, onChange: (contentBackground) => onChange({ contentBackground }) })
  ] });
}

// src/VariablesEditor.tsx
var import_email_core4 = require("@lukeflow/email-core");
var import_jsx_runtime7 = require("react/jsx-runtime");
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
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "eb-settings-hint", children: [
      "No variables yet. Add ",
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "eb-mono", children: "{{name}}" }),
      " to the subject or any block and it appears here."
    ] });
  }
  const patch = (name, changes) => onChange(contract.map((v) => v.name === name ? { ...v, ...changes } : v));
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "eb-vars", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "eb-settings-hint", children: "Declared types are validated before the email is sent. Values are supplied at send time." }),
    contract.map((v) => {
      const unused = !usedNames.has(v.name);
      return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "eb-var-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "eb-var-name", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "eb-mono", children: `{{${v.name}}}` }),
          unused && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "eb-badge", title: "Declared but not used", children: "unused" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("select", { "aria-label": `Type for ${v.name}`, className: "eb-select", value: v.type, disabled, onChange: (e) => patch(v.name, { type: e.target.value }), children: import_email_core4.EMAIL_VAR_TYPES.map((t) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: t, children: t }, t)) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { className: "eb-check", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { type: "checkbox", checked: v.required, disabled, onChange: (e) => patch(v.name, { required: e.target.checked }) }),
          "required"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
var import_jsx_runtime8 = require("react/jsx-runtime");
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
  const [tab, setTab] = (0, import_react4.useState)("theme");
  (0, import_react4.useEffect)(() => {
    if (selectedIndex !== null) setTab("block");
  }, [selectedIndex]);
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "eb-settings", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "eb-tabs", role: "tablist", "aria-label": "Settings", children: TABS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "eb-settings-body", role: "tabpanel", children: [
      tab === "block" && (selectedBlock ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(BlockEditor, { block: selectedBlock, onUpdate: onUpdateBlock, disabled }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "eb-settings-hint", children: "Select a block in the canvas to edit it." })),
      tab === "theme" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ThemeEditor, { theme, onChange: onUpdateTheme, disabled }),
      tab === "variables" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(VariablesEditor, { contract, usedNames, onChange: onUpdateVariables, disabled })
    ] })
  ] });
}

// src/Problems.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function Problems({ problems, onSelectBlock }) {
  if (problems.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "eb-problems-ok", children: "No problems \u2014 the email looks good." });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "eb-problems", "aria-label": "Problems", children: problems.map((p, i) => {
    const clickable = p.blockIndex !== void 0;
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("li", { className: `eb-problem eb-problem-${p.severity}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: `eb-problem-dot eb-dot-${p.severity}`, "aria-hidden": "true" }),
      clickable ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "eb-problem-link", onClick: () => onSelectBlock(p.blockIndex), children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "eb-problem-loc", children: [
          "Block ",
          p.blockIndex + 1
        ] }),
        " ",
        p.message
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: p.message })
    ] }, i);
  }) });
}

// src/Modal.tsx
var import_react5 = require("react");
var import_jsx_runtime10 = require("react/jsx-runtime");
var FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
function Modal({ title, onClose, children, wide = false }) {
  const dialogRef = (0, import_react5.useRef)(null);
  const restoreRef = (0, import_react5.useRef)(null);
  (0, import_react5.useEffect)(() => {
    restoreRef.current = document.activeElement ?? null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector(FOCUSABLE);
    (first ?? dialog)?.focus();
    return () => restoreRef.current?.focus?.();
  }, []);
  const onKeyDown = (0, import_react5.useCallback)((e) => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "eb-modal-backdrop", onMouseDown: (e) => {
    if (e.target === e.currentTarget) onClose();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
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
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "eb-modal-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "eb-modal-title", children: title }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "eb-icon-btn", "aria-label": "Close", onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("path", { d: "M6 6l12 12M18 6 6 18" }) }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "eb-modal-body", children })
      ]
    }
  ) });
}

// src/PreviewModal.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
function PreviewModal({ onClose, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Modal, { title: "Email preview", onClose, wide: true, children });
}

// src/EmailBuilder.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
var IconUndo = /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M9 7 4 12l5 5" }),
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M4 12h11a5 5 0 0 1 0 10h-1" })
] });
var IconRedo = /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "m15 7 5 5-5 5" }),
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M20 12H9a5 5 0 0 0 0 10h1" })
] });
var IconEye = /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("svg", { viewBox: "0 0 24 24", width: "15", height: "15", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" }),
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("circle", { cx: "12", cy: "12", r: "3" })
] });
function isEditingTarget(t) {
  const el = t;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
var EmailBuilder = (0, import_react6.forwardRef)(function EmailBuilder2({ initialDoc, onChange, disabled = false, className = "", settings = "panel", aside, renderPreview }, ref) {
  const b = useEmailBuilder(initialDoc);
  const [showPreview, setShowPreview] = (0, import_react6.useState)(false);
  const [showProblems, setShowProblems] = (0, import_react6.useState)(false);
  const [settingsModalOpen, setSettingsModalOpen] = (0, import_react6.useState)(false);
  const onChangeRef = (0, import_react6.useRef)(onChange);
  onChangeRef.current = onChange;
  const mounted = (0, import_react6.useRef)(false);
  (0, import_react6.useEffect)(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onChangeRef.current?.(b.doc);
  }, [b.doc]);
  (0, import_react6.useImperativeHandle)(ref, () => ({
    getDoc: () => b.doc,
    setDoc: b.setDoc,
    undo: b.undo,
    redo: b.redo,
    getProblems: () => b.problems
  }), [b.doc, b.setDoc, b.undo, b.redo, b.problems]);
  const usedNames = (0, import_react6.useMemo)(() => new Set((0, import_email_core5.extractVariables)(b.doc)), [b.doc]);
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
    }
  };
  const settingsPanel = /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: `eb-builder${disabled ? " eb-disabled" : ""} ${className}`.trim(), onKeyDown, children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "eb-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "eb-toolbar-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "eb-icon-btn", disabled: disabled || !b.canUndo, onClick: b.undo, title: "Undo (\u2318Z)", "aria-label": "Undo", children: IconUndo }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "eb-icon-btn", disabled: disabled || !b.canRedo, onClick: b.redo, title: "Redo (\u21E7\u2318Z)", "aria-label": "Redo", children: IconRedo })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "eb-toolbar-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "button",
        {
          type: "button",
          className: `eb-chip${errorCount ? " eb-chip-error" : warnCount ? " eb-chip-warn" : ""}`,
          "aria-pressed": showProblems,
          onClick: () => setShowProblems((v) => !v),
          children: errorCount ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : warnCount ? `${warnCount} warning${warnCount === 1 ? "" : "s"}` : "No problems"
        }
      ),
      renderPreview && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("button", { type: "button", className: "eb-chip", onClick: () => setShowPreview(true), children: [
        IconEye,
        " Preview"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "eb-block-count", children: [
        b.doc.blocks.length,
        " block",
        b.doc.blocks.length === 1 ? "" : "s"
      ] })
    ] }),
    showProblems && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "eb-problems-panel", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Problems, { problems: b.problems, onSelectBlock: selectBlock }) }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "eb-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "eb-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "eb-field-label", children: "Subject" }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("input", { className: "eb-input", value: b.doc.subject, disabled, placeholder: "Welcome, {{firstName}}!", onChange: (e) => b.setSubject(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "eb-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "eb-field-label", children: "Preheader" }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("input", { className: "eb-input", value: b.doc.preheader ?? "", disabled, placeholder: "Inbox preview text (optional)", onChange: (e) => b.setPreheader(e.target.value) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: `eb-grid eb-grid-3${aside && settings === "modal" ? " eb-has-aside" : ""}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "eb-col eb-col-palette", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "eb-col-title", children: "Blocks" }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Palette, { onAdd: (type) => b.addBlock(type, b.selectedIndex === null ? void 0 : b.selectedIndex + 1), disabled })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "eb-col eb-col-canvas", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
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
      settings === "panel" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "eb-col eb-col-settings", children: settingsPanel }) : aside && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "eb-col eb-col-aside", children: aside })
    ] }),
    settings === "modal" && settingsModalOpen && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Modal, { title: "Block settings", onClose: () => setSettingsModalOpen(false), children: settingsPanel }),
    showPreview && renderPreview && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(PreviewModal, { onClose: () => setShowPreview(false), children: renderPreview(b.doc) })
  ] });
});

// src/index.ts
var VERSION = "0.1.0-alpha.0";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
});
//# sourceMappingURL=index.cjs.map