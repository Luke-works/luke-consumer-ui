"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target2, all) => {
  for (var name in all)
    __defProp(target2, name, { get: all[name], enumerable: true });
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
  END_ID: () => END_ID,
  START_ID: () => START_ID,
  WorkflowBuilder: () => WorkflowBuilder,
  addStep: () => addStep,
  addStructural: () => addStructural,
  buildPalette: () => buildPalette,
  connectNodes: () => connectNodes,
  docToFlow: () => docToFlow,
  flowToDoc: () => flowToDoc,
  newNodeId: () => newNodeId,
  removeNode: () => removeNode,
  updateNode: () => updateNode
});
module.exports = __toCommonJS(index_exports);

// src/graph.ts
var import_workflow_core3 = require("@lukeflow/workflow-core");

// src/layout.ts
var import_workflow_core2 = require("@lukeflow/workflow-core");

// src/ids.ts
var import_workflow_core = require("@lukeflow/workflow-core");
var START_ID = "__start";
var END_ID = import_workflow_core.END_NODE;

// src/layout.ts
var X_GAP = 220;
var Y_GAP = 100;
var X0 = 40;
var Y0 = 40;
function computeAutoLayout(doc) {
  const real = (doc.nodes ?? []).filter((n) => !!n && typeof n.id === "string");
  const byId = new Map(real.map((n) => [n.id, n]));
  const succ = /* @__PURE__ */ new Map();
  const pred = /* @__PURE__ */ new Map();
  const link = (u, v) => {
    (succ.get(u) ?? succ.set(u, []).get(u)).push(v);
    (pred.get(v) ?? pred.set(v, []).get(v)).push(u);
  };
  const start = (0, import_workflow_core2.startNodeId)(doc);
  if (start) link(START_ID, start);
  for (const n of real) {
    for (const ref of (0, import_workflow_core2.nodeRefs)(n)) {
      const t = (0, import_workflow_core2.isTerminal)(ref.target) ? END_ID : ref.target;
      if (t === END_ID || byId.has(t)) link(n.id, t);
    }
  }
  const allIds = [START_ID, ...real.map((n) => n.id), END_ID];
  const layer = /* @__PURE__ */ new Map();
  layer.set(START_ID, 0);
  const queue = [START_ID];
  while (queue.length > 0) {
    const u = queue.shift();
    for (const v of succ.get(u) ?? []) {
      if (!layer.has(v)) {
        layer.set(v, (layer.get(u) ?? 0) + 1);
        queue.push(v);
      }
    }
  }
  let maxReal = 0;
  for (const id of allIds) {
    if (id === END_ID) continue;
    if (!layer.has(id)) layer.set(id, 1);
    maxReal = Math.max(maxReal, layer.get(id) ?? 0);
  }
  layer.set(END_ID, Math.max(layer.get(END_ID) ?? 0, maxReal + 1));
  const maxLayer = Math.max(...allIds.map((id) => layer.get(id) ?? 0));
  const layers = Array.from({ length: maxLayer + 1 }, () => []);
  for (const id of allIds) (layers[layer.get(id) ?? 0] ??= []).push(id);
  for (let pass = 0; pass < 2; pass++) {
    for (let d = 1; d <= maxLayer; d++) {
      const prevIndex = new Map((layers[d - 1] ?? []).map((id, i) => [id, i]));
      const cur = layers[d] ?? [];
      const bary = /* @__PURE__ */ new Map();
      cur.forEach((id, i) => {
        const ps = (pred.get(id) ?? []).map((p) => prevIndex.get(p)).filter((x) => x !== void 0);
        bary.set(id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : i);
      });
      layers[d] = cur.map((id, i) => ({ id, i })).sort((a, b) => (bary.get(a.id) ?? 0) - (bary.get(b.id) ?? 0) || a.i - b.i).map((e) => e.id);
    }
  }
  const maxCount = Math.max(1, ...layers.map((l) => l.length));
  const out = {};
  layers.forEach((ids, d) => {
    const offset = (maxCount - ids.length) * Y_GAP / 2;
    ids.forEach((id, i) => {
      out[id] = { x: X0 + d * X_GAP, y: Y0 + offset + i * Y_GAP };
    });
  });
  return out;
}

// src/graph.ts
function triggerLabel(doc) {
  const t = doc.trigger;
  return t ? `${t.capability}.${t.type}` : "Trigger";
}
function nodeLabel(n) {
  if (n.name) return n.name;
  switch (n.kind) {
    case "action":
      return `${n.capability ?? "?"}.${n.action ?? "action"}`;
    case "task":
      return `${n.capability ?? "?"}: ${n.task ?? "task"}`;
    case "branch":
      return "Branch";
    case "parallel":
      return "Parallel";
    case "wait":
      return `Wait (${n.mode ?? "timer"})`;
    default:
      return "Step";
  }
}
function docToFlow(doc) {
  const nodes = [];
  const edges = [];
  const byId = /* @__PURE__ */ new Map();
  for (const n of doc.nodes ?? []) {
    if (n && typeof n.id === "string" && !byId.has(n.id)) byId.set(n.id, n);
  }
  const depth = /* @__PURE__ */ new Map();
  const start = (0, import_workflow_core3.startNodeId)(doc);
  if (start) {
    const queue = [[start, 1]];
    while (queue.length > 0) {
      const [id, d] = queue.shift();
      if (depth.has(id)) continue;
      depth.set(id, d);
      const n = byId.get(id);
      if (n) {
        for (const ref of (0, import_workflow_core3.nodeRefs)(n)) if (!depth.has(ref.target)) queue.push([ref.target, d + 1]);
      }
    }
  }
  const maxDepth = depth.size > 0 ? Math.max(...depth.values()) : 0;
  const layout = doc.layout ?? {};
  const auto = computeAutoLayout(doc);
  const place = (id, d) => {
    const saved = layout[id];
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") return saved;
    return auto[id] ?? { x: d * 220 + 40, y: 40 };
  };
  nodes.push({ id: START_ID, kind: "start", label: triggerLabel(doc), position: place(START_ID, 0), data: { trigger: doc.trigger } });
  for (const n of doc.nodes ?? []) {
    if (!n || typeof n.id !== "string") continue;
    nodes.push({ id: n.id, kind: n.kind, label: nodeLabel(n), position: place(n.id, depth.get(n.id) ?? 1), data: { node: n } });
  }
  nodes.push({ id: END_ID, kind: "end", label: "End", position: place(END_ID, maxDepth + 1), data: {} });
  let seq = 0;
  const push = (source, target2, role, label2) => {
    const t = (0, import_workflow_core3.isTerminal)(target2) ? END_ID : target2;
    edges.push({ id: `e${seq++}_${source}_${role}`, source, target: t, role, label: label2 });
  };
  if (start) push(START_ID, start, "next");
  for (const n of doc.nodes ?? []) {
    if (!n || typeof n.id !== "string") continue;
    switch (n.kind) {
      case "action":
      case "task":
        push(n.id, n.next, "next");
        if (n.onError && !(0, import_workflow_core3.isTerminal)(n.onError.fallback)) push(n.id, n.onError.fallback, "fallback");
        break;
      case "wait":
        push(n.id, n.next, "next");
        break;
      case "branch":
        for (const c of n.conditions ?? []) push(n.id, c?.next, "branch", c?.expr);
        push(n.id, n.else, "else");
        break;
      case "parallel":
        for (const b of n.branches ?? []) push(n.id, b, "parallel-branch");
        if (n.join !== void 0) push(n.id, n.join, "join");
        break;
    }
  }
  return { nodes, edges };
}
function flowToDoc(flow, base) {
  const outgoing = /* @__PURE__ */ new Map();
  for (const e of flow.edges) {
    const list = outgoing.get(e.source);
    if (list) list.push(e);
    else outgoing.set(e.source, [e]);
  }
  const mapTarget = (t) => t === END_ID ? import_workflow_core3.END_NODE : t;
  const nodes = [];
  for (const fn of flow.nodes) {
    if (!fn.data.node) continue;
    const n = { ...fn.data.node };
    const outs = outgoing.get(fn.id) ?? [];
    switch (n.kind) {
      case "action":
      case "task":
      case "wait": {
        const next = outs.find((e) => e.role === "next");
        n.next = next ? mapTarget(next.target) : import_workflow_core3.END_NODE;
        if (n.kind !== "wait" && n.onError) {
          const fb = outs.find((e) => e.role === "fallback");
          n.onError = { ...n.onError, fallback: fb ? mapTarget(fb.target) : n.onError.fallback ?? null };
        }
        break;
      }
      case "branch": {
        const conditions = outs.filter((e) => e.role === "branch").map((e) => ({ expr: e.label ?? "", next: mapTarget(e.target) }));
        n.conditions = conditions;
        const elseEdge = outs.find((e) => e.role === "else");
        n.else = elseEdge ? mapTarget(elseEdge.target) : import_workflow_core3.END_NODE;
        break;
      }
      case "parallel": {
        n.branches = outs.filter((e) => e.role === "parallel-branch").map((e) => mapTarget(e.target));
        const join = outs.find((e) => e.role === "join");
        n.join = join ? mapTarget(join.target) : void 0;
        break;
      }
    }
    nodes.push(n);
  }
  return { ...base, nodes };
}

// src/palette.ts
function buildPalette(steps) {
  const groups = /* @__PURE__ */ new Map();
  for (const s of steps) {
    const key = s.paletteGroup ?? s.capability;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}

// src/operations.ts
var import_workflow_core4 = require("@lukeflow/workflow-core");
function newNodeId(doc) {
  let max = 0;
  for (const n of doc.nodes ?? []) {
    const m = /^n(\d+)$/.exec(n.id ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `n${max + 1}`;
}
function operationOf(descriptorId) {
  const i = descriptorId.indexOf(".");
  return i >= 0 ? descriptorId.slice(i + 1) : descriptorId;
}
function addStep(doc, descriptor) {
  const id = newNodeId(doc);
  const capability = descriptor.capability.toLowerCase();
  const op = operationOf(descriptor.id);
  const node = descriptor.kind === "task" ? { id, kind: "task", capability, task: op, next: import_workflow_core4.END_NODE } : { id, kind: "action", capability, action: op, next: import_workflow_core4.END_NODE };
  return { ...doc, nodes: [...doc.nodes ?? [], node] };
}
function addStructural(doc, kind) {
  const id = newNodeId(doc);
  let node;
  switch (kind) {
    case "branch":
      node = { id, kind: "branch", conditions: [], else: import_workflow_core4.END_NODE };
      break;
    case "parallel":
      node = { id, kind: "parallel", branches: [], join: import_workflow_core4.END_NODE };
      break;
    case "wait":
      node = { id, kind: "wait", mode: "timer", duration: "PT1H", next: import_workflow_core4.END_NODE };
      break;
  }
  return { ...doc, nodes: [...doc.nodes ?? [], node] };
}
function updateNode(doc, id, patch) {
  return {
    ...doc,
    nodes: (doc.nodes ?? []).map((n) => n.id === id ? { ...n, ...patch } : n)
  };
}
function removeNode(doc, id) {
  const nodes = (doc.nodes ?? []).filter((n) => n.id !== id);
  return (0, import_workflow_core4.repairWorkflow)({ ...doc, nodes }).doc;
}
function target(id) {
  return id === END_ID ? import_workflow_core4.END_NODE : id;
}
function connectNodes(doc, sourceId, targetId, role = "next") {
  const to = target(targetId);
  return {
    ...doc,
    nodes: (doc.nodes ?? []).map((n) => {
      if (n.id !== sourceId) return n;
      switch (n.kind) {
        case "action":
        case "task":
        case "wait":
          return { ...n, next: to };
        case "branch":
          return role === "else" ? { ...n, else: to } : { ...n, conditions: [...n.conditions ?? [], { expr: "", next: to }] };
        case "parallel":
          return role === "join" ? { ...n, join: to } : { ...n, branches: [...n.branches ?? [], to] };
        default:
          return n;
      }
    })
  };
}

// src/WorkflowBuilder.tsx
var import_workflow_core6 = require("@lukeflow/workflow-core");
var import_react3 = require("@xyflow/react");
var import_react4 = require("react");

// src/config.tsx
var import_workflow_core5 = require("@lukeflow/workflow-core");
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var label = { display: "block", marginBottom: 10, fontSize: 12, color: "var(--wf-fg)" };
var control = {
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  border: "1px solid var(--wf-border-2)",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
  background: "var(--wf-input)",
  color: "var(--wf-fg)"
};
var rowStyle = { display: "flex", gap: 6, alignItems: "center", marginBottom: 6 };
var smallBtn = {
  padding: "4px 8px",
  border: "1px solid var(--wf-border-2)",
  borderRadius: 6,
  background: "var(--wf-card)",
  fontSize: 12,
  cursor: "pointer",
  color: "var(--wf-fg)"
};
var linkBtn = {
  background: "none",
  border: "none",
  color: "var(--wf-accent)",
  fontSize: 12,
  cursor: "pointer",
  padding: 0
};
var sectionHead = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  color: "var(--wf-muted)",
  margin: "14px 0 8px",
  userSelect: "none"
};
function Field({ title, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: label, children: [
    title,
    children
  ] });
}
function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = (0, import_react.useState)(defaultOpen);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: sectionHead, onClick: () => setOpen((o) => !o), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: open ? "\u25BE" : "\u25B8" })
    ] }),
    open ? children : null
  ] });
}
function nodeOptions(doc, excludeId) {
  const opts = (doc.nodes ?? []).filter((n) => n.id !== excludeId).map((n) => ({ value: n.id, label: nodeLabel2(n) }));
  opts.push({ value: import_workflow_core5.END_NODE, label: "\u25AA End" });
  return opts;
}
function nodeLabel2(n) {
  if (n.name) return n.name;
  switch (n.kind) {
    case "action":
      return `${n.capability ?? "?"}.${n.action ?? "action"}`;
    case "task":
      return `${n.capability ?? "?"}: ${n.task ?? "task"}`;
    case "branch":
      return "Branch";
    case "parallel":
      return "Parallel";
    case "wait":
      return `Wait (${n.mode ?? "timer"})`;
    default:
      return n.id;
  }
}
function TargetSelect({
  value,
  options,
  onChange
}) {
  const v = value == null || value === "" ? import_workflow_core5.END_NODE : value;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { style: control, value: v, onChange: (e) => onChange(e.target.value), children: [
    options.some((o) => o.value === v) ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: v, children: v }),
    options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: o.value, children: o.label }, o.value))
  ] });
}
function KvEditor({ value, onChange }) {
  const entries = Object.entries(value ?? {});
  const setEntry = (i, key, val) => {
    const next = entries.map((e) => [...e]);
    next[i] = [key, val];
    onChange(Object.fromEntries(next.filter(([k]) => k !== "")));
  };
  const removeEntry = (i) => onChange(Object.fromEntries(entries.filter((_, j) => j !== i)));
  const addEntry = () => onChange({ ...value ?? {}, "": "" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    entries.map(([k, val], i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rowStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: { ...control, marginTop: 0, flex: "0 0 40%" },
          placeholder: "key",
          value: k,
          onChange: (e) => setEntry(i, e.target.value, String(val ?? ""))
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: { ...control, marginTop: 0, flex: 1 },
          placeholder: "value or {{expr}}",
          value: String(val ?? ""),
          onChange: (e) => setEntry(i, k, e.target.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: smallBtn, onClick: () => removeEntry(i), "aria-label": "Remove", children: "\xD7" })
    ] }, i)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: linkBtn, onClick: addEntry, children: "+ Add field" })
  ] });
}
function descriptorFor(stepTypes, node) {
  if (node.kind !== "action" && node.kind !== "task") return void 0;
  const op = node.kind === "action" ? node.action : node.task;
  if (!node.capability || !op) return void 0;
  const cap = node.capability.toLowerCase();
  return stepTypes.find(
    (s) => s.kind === node.kind && s.capability.toLowerCase() === cap && operationOf2(s.id) === op
  );
}
function InputField({ field, value, onChange }) {
  const type = field.type ?? "text";
  const title = `${field.label}${field.required ? " *" : ""}`;
  const common = { style: control, placeholder: field.placeholder };
  let node;
  if (type === "textarea") {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { ...common, rows: 3, value: String(value ?? ""), onChange: (e) => onChange(e.target.value) });
  } else if (type === "number") {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { ...common, type: "number", value: value == null ? "" : String(value), onChange: (e) => onChange(e.target.value === "" ? void 0 : Number(e.target.value)) });
  } else if (type === "boolean") {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: !!value, onChange: (e) => onChange(e.target.checked) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 12, color: "var(--wf-muted)" }, children: field.placeholder ?? "Enabled" })
    ] });
  } else if (type === "select") {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { style: control, value: String(value ?? ""), onChange: (e) => onChange(e.target.value), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\u2014 Select \u2014" }),
      (field.options ?? []).map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: o.value, children: o.label }, o.value))
    ] });
  } else {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { ...common, value: String(value ?? ""), onChange: (e) => onChange(e.target.value) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: label, children: [
    title,
    node,
    field.help ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--wf-faint)", marginTop: 3 }, children: field.help }) : null
  ] });
}
function TypedInputForm({ fields, value, onChange }) {
  const v = value ?? {};
  const declared = new Set(fields.map((f) => f.key));
  const extra = Object.fromEntries(Object.entries(v).filter(([k]) => !declared.has(k)));
  const setField = (key, val) => {
    const next = { ...v };
    if (val === void 0 || val === "") delete next[key];
    else next[key] = val;
    onChange(next);
  };
  const setExtra = (nextExtra) => {
    const kept = {};
    for (const f of fields) if (f.key in v) kept[f.key] = v[f.key];
    onChange({ ...kept, ...nextExtra });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    fields.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InputField, { field: f, value: v[f.key], onChange: (val) => setField(f.key, val) }, f.key)),
    Object.keys(extra).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--wf-faint)", marginBottom: 4 }, children: "Other inputs" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KvEditor, { value: extra, onChange: setExtra })
    ] }) : null
  ] });
}
function ConnectionSelect({
  provider,
  value,
  connections,
  onChange
}) {
  const matches = connections.filter((c) => !provider || c.providerKey.toLowerCase() === provider.toLowerCase());
  if (connections.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: "var(--wf-faint)", marginTop: 4 }, children: "No connections yet \u2014 add one on the Connections page." });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { style: control, value: value ?? "", onChange: (e) => onChange(e.target.value), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\u2014 Select a connection \u2014" }),
    matches.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: c.id, children: (c.externalAccount || c.id) + (c.status && c.status !== "ACTIVE" ? ` (${c.status})` : "") }, c.id))
  ] });
}
function ErrorPolicyEditor({
  policy,
  options,
  onChange
}) {
  const p = policy ?? {};
  const retry = p.retry;
  const attempts = retry?.maxAttempts ?? 1;
  const setAttempts = (n) => {
    if (!n || n <= 1) {
      const next = { ...p };
      delete next.retry;
      onChange(Object.keys(next).length ? next : void 0);
    } else {
      const nextRetry = {
        maxAttempts: n,
        backoff: retry?.backoff ?? "exponential",
        initialDelay: retry?.initialDelay ?? "30s"
      };
      onChange({ ...p, retry: nextRetry });
    }
  };
  const patchRetry = (patch) => {
    if (!retry) return;
    onChange({ ...p, retry: { ...retry, ...patch } });
  };
  const setFallback = (v) => onChange({ ...p, fallback: v });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Retry attempts", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        style: control,
        type: "number",
        min: 1,
        value: attempts,
        onChange: (e) => setAttempts(Number(e.target.value))
      }
    ) }),
    retry ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Backoff", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { style: control, value: retry.backoff, onChange: (e) => patchRetry({ backoff: e.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "fixed", children: "Fixed" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "exponential", children: "Exponential" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Initial delay", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: retry.initialDelay, placeholder: "e.g. 30s, 5m", onChange: (e) => patchRetry({ initialDelay: e.target.value }) }) })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "On failure go to", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: p.fallback, options, onChange: setFallback }) })
  ] });
}
function NodeConfig({ doc, node, stepTypes = [], connections = [], onPatch, onDelete }) {
  const opts = nodeOptions(doc, node.id);
  const inputFields = descriptorFor(stepTypes, node)?.inputs ?? [];
  const nodeInput = node.input;
  const inputsEditor = inputFields.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TypedInputForm, { fields: inputFields, value: nodeInput, onChange: (input) => onPatch({ input }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KvEditor, { value: nodeInput, onChange: (input) => onPatch({ input }) });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 700, marginBottom: 4, fontSize: 13 }, children: "Step" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--wf-muted)", marginBottom: 12, textTransform: "capitalize" }, children: node.kind }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Name", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.name ?? "", placeholder: nodeLabel2(node), onChange: (e) => onPatch({ name: e.target.value }) }) }),
    node.kind === "action" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Action", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.action ?? "", placeholder: "e.g. send", onChange: (e) => onPatch({ action: e.target.value }) }) }),
      node.capability === "integrations" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Provider", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.provider ?? "", placeholder: "e.g. salesforce", onChange: (e) => onPatch({ provider: e.target.value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Connection", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConnectionSelect, { provider: node.provider, value: node.connection, connections, onChange: (v) => onPatch({ connection: v }) }) })
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Then go to", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: node.next, options: opts, onChange: (v) => onPatch({ next: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { title: "Inputs", children: inputsEditor }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: "Advanced", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Store result in variable", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.output ?? "", placeholder: "e.g. emailResult", onChange: (e) => onPatch({ output: e.target.value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorPolicyEditor, { policy: node.onError, options: opts, onChange: (onError) => onPatch({ onError }) })
      ] })
    ] }) : null,
    node.kind === "task" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Task", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.task ?? "", placeholder: "e.g. review", onChange: (e) => onPatch({ task: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Assignee", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.assignee ?? "", placeholder: "e.g. queue:ops", onChange: (e) => onPatch({ assignee: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Then go to", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: node.next, options: opts, onChange: (v) => onPatch({ next: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { title: "Inputs", children: inputsEditor }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { title: "Advanced", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorPolicyEditor, { policy: node.onError, options: opts, onChange: (onError) => onPatch({ onError }) }) })
    ] }) : null,
    node.kind === "branch" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BranchConfig, { node, options: opts, onPatch }) : null,
    node.kind === "parallel" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParallelConfig, { node, options: opts, onPatch }) : null,
    node.kind === "wait" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Wait until", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { style: control, value: node.mode ?? "timer", onChange: (e) => onPatch({ mode: e.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "timer", children: "A duration passes (timer)" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "event", children: "An event arrives (event)" })
      ] }) }),
      (node.mode ?? "timer") === "timer" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Duration (ISO-8601)", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.duration ?? "", placeholder: "e.g. P1D, PT2H", onChange: (e) => onPatch({ duration: e.target.value }) }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Event type", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: control,
          value: node.event?.type ?? "",
          placeholder: "e.g. signatures.signed",
          onChange: (e) => onPatch({ event: { ...node.event ?? {}, type: e.target.value } })
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Then go to", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: node.next, options: opts, onChange: (v) => onPatch({ next: v }) }) })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: { ...smallBtn, marginTop: 14, color: "var(--wf-danger)", borderColor: "#fecaca" }, onClick: onDelete, children: "Delete step" })
  ] });
}
function BranchConfig({
  node,
  options,
  onPatch
}) {
  const conditions = node.conditions ?? [];
  const setCond = (i, patch) => {
    const next = conditions.map((c, j) => j === i ? { ...c, ...patch } : c);
    onPatch({ conditions: next });
  };
  const addCond = () => onPatch({ conditions: [...conditions, { expr: "", next: import_workflow_core5.END_NODE }] });
  const removeCond = (i) => onPatch({ conditions: conditions.filter((_, j) => j !== i) });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: "var(--wf-fg)", marginBottom: 6 }, children: "Conditions (first match wins)" }),
    conditions.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { border: "1px solid var(--wf-border)", borderRadius: 6, padding: 8, marginBottom: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: { ...control, marginTop: 0 },
          placeholder: "expression, e.g. amount > 10000",
          value: c.expr ?? "",
          onChange: (e) => setCond(i, { expr: e.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: c.next, options, onChange: (v) => setCond(i, { next: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: { ...linkBtn, color: "var(--wf-danger)", marginTop: 6 }, onClick: () => removeCond(i), children: "Remove condition" })
    ] }, i)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: linkBtn, onClick: addCond, children: "+ Add condition" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Otherwise (else)", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: node.else, options, onChange: (v) => onPatch({ else: v }) }) }) })
  ] });
}
function ParallelConfig({
  node,
  options,
  onPatch
}) {
  const branches = node.branches ?? [];
  const setBranch = (i, v) => onPatch({ branches: branches.map((b, j) => j === i ? v : b) });
  const addBranch = () => onPatch({ branches: [...branches, import_workflow_core5.END_NODE] });
  const removeBranch = (i) => onPatch({ branches: branches.filter((_, j) => j !== i) });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: "var(--wf-fg)", marginBottom: 6 }, children: "Run in parallel" }),
    branches.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rowStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: b, options, onChange: (v) => setBranch(i, v) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: smallBtn, onClick: () => removeBranch(i), "aria-label": "Remove", children: "\xD7" })
    ] }, i)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: linkBtn, onClick: addBranch, children: "+ Add branch" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Continue at (join)", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: node.join, options, onChange: (v) => onPatch({ join: v }) }) }) })
  ] });
}
function TriggerConfig({
  trigger,
  triggers,
  onChange
}) {
  const current = `${trigger.capability}.${trigger.type}`;
  const config = trigger.config ?? {};
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 700, marginBottom: 4, fontSize: 13 }, children: "Trigger" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "var(--wf-muted)", marginBottom: 12 }, children: "How this workflow starts" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "When", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "select",
      {
        style: control,
        value: current,
        onChange: (e) => {
          const d = triggers.find((t) => t.id === e.target.value);
          if (d) onChange({ ...trigger, capability: d.capability.toLowerCase(), type: operationOf2(d.id) });
        },
        children: [
          triggers.some((t) => t.id === current) ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: current, children: current }),
          triggers.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: t.id, children: t.label }, t.id))
        ]
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { title: "Trigger settings", defaultOpen: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KvEditor, { value: config, onChange: (next) => onChange({ ...trigger, config: next }) }) })
  ] });
}
function operationOf2(descriptorId) {
  const i = descriptorId.indexOf(".");
  return i >= 0 ? descriptorId.slice(i + 1) : descriptorId;
}

// src/nodes.tsx
var import_react2 = require("@xyflow/react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var CAP = {
  email: { color: "#2563eb", glyph: "\u2709" },
  phone: { color: "#7c3aed", glyph: "\u260E" },
  signatures: { color: "#0891b2", glyph: "\u270D" },
  integrations: { color: "#ea580c", glyph: "\u{1F50C}" },
  forms: { color: "#16a34a", glyph: "\u25A4" },
  documents: { color: "#0d9488", glyph: "\u{1F5CE}" }
};
var capMeta = (c) => (c ? CAP[c] : void 0) ?? { color: "var(--wf-muted)", glyph: "\u25CF" };
var chip = (color) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: 6,
  background: color,
  color: "#fff",
  fontSize: 13,
  flex: "0 0 auto"
});
function borderColor(d, selected) {
  if (d.incidentLive || d.severity === "error") return "#ef4444";
  if (d.running) return "#4f46e5";
  if (d.severity === "warning") return "#f59e0b";
  return selected ? "var(--wf-accent)" : "var(--wf-border-2)";
}
function Card({
  data,
  selected,
  accent,
  children,
  source = true,
  target: target2 = true,
  style
}) {
  const pulse = data.incidentLive ? " wf-node-incident" : data.running ? " wf-node-running" : "";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      className: `wf-node${pulse}`,
      style: {
        position: "relative",
        background: "var(--wf-card)",
        color: "var(--wf-fg)",
        border: `2px solid ${borderColor(data, selected)}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 9,
        padding: "8px 12px",
        minWidth: 132,
        fontSize: 12,
        boxShadow: selected ? "0 0 0 3px rgba(79,70,229,0.15)" : "0 1px 2px rgba(0,0,0,0.06)",
        ...style
      },
      children: [
        target2 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_react2.Handle, { type: "target", position: import_react2.Position.Left }) : null,
        children,
        source ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_react2.Handle, { type: "source", position: import_react2.Position.Right }) : null
      ]
    }
  );
}
function titled(glyphColor, glyph, title, subtitle) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 9, alignItems: "center" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: chip(glyphColor), children: glyph }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { minWidth: 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontWeight: 600, color: "var(--wf-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }, children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 9, color: "var(--wf-faint)", textTransform: "uppercase", letterSpacing: 0.4 }, children: subtitle })
    ] })
  ] });
}
function ActionNode({ data, selected }) {
  const d = data;
  const m = capMeta(d.capability);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { data: d, selected, accent: m.color, children: titled(m.color, m.glyph, d.label, d.capability ?? "action") });
}
function TaskNode({ data, selected }) {
  const d = data;
  const m = capMeta(d.capability);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { data: d, selected, accent: "var(--wf-accent)", children: titled("var(--wf-accent)", "\u{1F464}", d.label, `${d.capability ?? ""} task`.trim()) });
}
function TriggerNode({ data, selected }) {
  const d = data;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { data: d, selected, accent: "#16a34a", target: false, style: { borderRadius: 999, background: "rgba(22,163,74,0.12)" }, children: titled("#16a34a", "\u26A1", d.label, "trigger") });
}
function WaitNode({ data, selected }) {
  const d = data;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { data: d, selected, accent: "var(--wf-muted)", children: titled("var(--wf-muted)", "\u23F1", d.label, "wait") });
}
function GatewayNode({ data, selected, glyph, kind }) {
  const d = data;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { data: d, selected, accent: "#d97706", style: { background: "rgba(217,119,6,0.14)" }, children: titled("#d97706", glyph, d.label, kind) });
}
var BranchNode = (p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(GatewayNode, { ...p, glyph: "\u22D4", kind: "branch" });
var ParallelNode = (p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(GatewayNode, { ...p, glyph: "\u29C9", kind: "parallel" });
function TerminalNode({ data, selected, source, target: target2, label: label2 }) {
  const d = data;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { position: "relative" }, children: [
    target2 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_react2.Handle, { type: "target", position: import_react2.Position.Left }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: {
      width: 54,
      textAlign: "center",
      padding: "6px 0",
      borderRadius: 999,
      border: `2px solid ${selected ? "var(--wf-accent)" : "var(--wf-faint)"}`,
      background: "var(--wf-surface-2)",
      color: "var(--wf-fg)",
      fontSize: 11,
      fontWeight: 600
    }, children: d.label ?? label2 }),
    source ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_react2.Handle, { type: "source", position: import_react2.Position.Right }) : null
  ] });
}
var EndNode = (p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TerminalNode, { ...p, source: false, target: true, label: "End" });
var nodeTypes = {
  wfTrigger: TriggerNode,
  wfAction: ActionNode,
  wfTask: TaskNode,
  wfBranch: BranchNode,
  wfParallel: ParallelNode,
  wfWait: WaitNode,
  wfEnd: EndNode
};
function nodeTypeFor(kind) {
  switch (kind) {
    case "start":
      return "wfTrigger";
    case "end":
      return "wfEnd";
    case "action":
      return "wfAction";
    case "task":
      return "wfTask";
    case "branch":
      return "wfBranch";
    case "parallel":
      return "wfParallel";
    case "wait":
      return "wfWait";
    default:
      return "wfAction";
  }
}

// src/WorkflowBuilder.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var STEP_MIME = "application/x-luke-step";
var STRUCTURAL_PREFIX = "__structural:";
var WF_THEME_CSS = `
.wf-root{--wf-surface:#fff;--wf-surface-2:#f9fafb;--wf-card:#fff;--wf-fg:#111827;--wf-muted:#6b7280;--wf-faint:#9ca3af;--wf-border:#e5e7eb;--wf-border-2:#d1d5db;--wf-input:#fff;--wf-accent:#4f46e5;--wf-danger:#b91c1c;--wf-warn:#b45309;}
.wf-root[data-wf-theme="dark"]{--wf-surface:#1f2937;--wf-surface-2:#111827;--wf-card:#1f2937;--wf-fg:#e5e7eb;--wf-muted:#9ca3af;--wf-faint:#6b7280;--wf-border:#374151;--wf-border-2:#4b5563;--wf-input:#111827;--wf-accent:#818cf8;--wf-danger:#f87171;--wf-warn:#fbbf24;}
@keyframes wf-pulse{0%,100%{box-shadow:0 0 0 0 rgba(79,70,229,.45)}50%{box-shadow:0 0 0 6px rgba(79,70,229,0)}}
@keyframes wf-pulse-err{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 0 0 7px rgba(239,68,68,0)}}
.wf-node-running{animation:wf-pulse 1.4s ease-in-out infinite}
.wf-node-incident{animation:wf-pulse-err 1.1s ease-in-out infinite}
`;
var STRUCTURAL = [
  { kind: "branch", label: "Branch (if / else)" },
  { kind: "parallel", label: "Parallel" },
  { kind: "wait", label: "Wait / delay" }
];
function toReactFlow(value) {
  const flow = docToFlow(value);
  const nodes = flow.nodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: { label: n.label, kind: n.kind, capability: n.data.node?.capability },
    type: nodeTypeFor(n.kind)
  }));
  const edges = flow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.role === "fallback",
    markerEnd: { type: import_react3.MarkerType.ArrowClosed, color: e.role === "fallback" ? "#ef4444" : "var(--wf-faint)" },
    style: { stroke: e.role === "fallback" ? "#ef4444" : "var(--wf-faint)" },
    labelStyle: { fontSize: 10, fill: "var(--wf-muted)" },
    labelBgStyle: { fill: "var(--wf-surface)" },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4
  }));
  return { nodes, edges };
}
var paletteItemStyle = {
  padding: "6px 8px",
  margin: "4px 0",
  border: "1px solid var(--wf-border)",
  borderRadius: 6,
  fontSize: 13,
  cursor: "grab",
  background: "var(--wf-card)",
  color: "var(--wf-fg)"
};
function WorkflowBuilder({ value, stepTypes, connections, theme = "light", highlight, onChange, className }) {
  const palette = (0, import_react4.useMemo)(() => buildPalette(stepTypes), [stepTypes]);
  const triggerTypes = (0, import_react4.useMemo)(() => stepTypes.filter((s) => s.kind === "trigger"), [stepTypes]);
  const [selectedId, setSelectedId] = (0, import_react4.useState)(null);
  const [showProblems, setShowProblems] = (0, import_react4.useState)(true);
  const diagnostics = (0, import_react4.useMemo)(() => (0, import_workflow_core6.validateWorkflow)(value), [value]);
  const severityByNode = (0, import_react4.useMemo)(() => {
    const rank = { info: 0, warning: 1, error: 2 };
    const m = /* @__PURE__ */ new Map();
    for (const d of diagnostics) {
      if (!d.nodeId) continue;
      const cur = m.get(d.nodeId);
      if (!cur || rank[d.severity] > rank[cur]) m.set(d.nodeId, d.severity);
    }
    return m;
  }, [diagnostics]);
  const problems = (0, import_react4.useMemo)(() => diagnostics.filter((d) => d.severity !== "info"), [diagnostics]);
  const activeSet = (0, import_react4.useMemo)(() => {
    const s = new Set(highlight?.active ?? []);
    if (s.has("start")) s.add(START_ID);
    return s;
  }, [highlight]);
  const incidentSet = (0, import_react4.useMemo)(() => {
    const s = new Set(highlight?.incident ?? []);
    if (s.has("start")) s.add(START_ID);
    return s;
  }, [highlight]);
  const [nodes, setNodes, onNodesChange] = (0, import_react3.useNodesState)([]);
  const [edges, setEdges, onEdgesChange] = (0, import_react3.useEdgesState)([]);
  (0, import_react4.useEffect)(() => {
    const flow = toReactFlow(value);
    setNodes(
      flow.nodes.map((n) => {
        const sev = severityByNode.get(n.id);
        const s = sev === "error" || sev === "warning" ? sev : void 0;
        return {
          ...n,
          data: {
            ...n.data,
            severity: s,
            running: activeSet.has(n.id) || void 0,
            incidentLive: incidentSet.has(n.id) || void 0
          }
        };
      })
    );
    setEdges(flow.edges);
  }, [value, severityByNode, activeSet, incidentSet, setNodes, setEdges]);
  const selected = value.nodes.find((n) => n.id === selectedId);
  const triggerSelected = selectedId === START_ID;
  const onConnect = (0, import_react4.useCallback)(
    (c) => {
      if (onChange && c.source && c.target) onChange(connectNodes(value, c.source, c.target));
    },
    [onChange, value]
  );
  const onNodesDelete = (0, import_react4.useCallback)(
    (deleted) => {
      if (!onChange) return;
      let next = value;
      for (const d of deleted) next = removeNode(next, d.id);
      onChange(next);
      setSelectedId(null);
    },
    [onChange, value]
  );
  const onDrop = (0, import_react4.useCallback)(
    (event) => {
      event.preventDefault();
      if (!onChange) return;
      const data = event.dataTransfer.getData(STEP_MIME);
      if (data.startsWith(STRUCTURAL_PREFIX)) {
        const kind = data.slice(STRUCTURAL_PREFIX.length);
        onChange(addStructural(value, kind));
        return;
      }
      const descriptor = stepTypes.find((s) => s.id === data);
      if (descriptor) onChange(addStep(value, descriptor));
    },
    [onChange, stepTypes, value]
  );
  const patchSelected = (patch) => {
    if (onChange && selectedId) onChange(updateNode(value, selectedId, patch));
  };
  const setTrigger = (t) => {
    if (onChange) onChange({ ...value, trigger: t });
  };
  const onNodeDragStop = (0, import_react4.useCallback)(
    (_, dragged) => {
      if (!onChange) return;
      const layout = Object.fromEntries(nodes.map((n) => [n.id, n.id === dragged.id ? dragged.position : n.position]));
      onChange({ ...value, layout });
    },
    [onChange, nodes, value]
  );
  const tidy = () => {
    if (!onChange) return;
    const next = { ...value };
    delete next.layout;
    onChange(next);
  };
  const draggable = (mime, labelText, key) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "div",
    {
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.setData(STEP_MIME, mime);
        e.dataTransfer.effectAllowed = "move";
      },
      style: paletteItemStyle,
      children: labelText
    },
    key
  );
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "div",
    {
      className: `wf-root${className ? ` ${className}` : ""}`,
      "data-wf-theme": theme,
      style: { display: "flex", width: "100%", height: "100%", background: "var(--wf-surface)", color: "var(--wf-fg)" },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("style", { children: WF_THEME_CSS }),
        onChange ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("aside", { style: { width: 190, overflowY: "auto", borderRight: "1px solid var(--wf-border)", padding: 8, background: "var(--wf-surface)" }, children: [
          palette.map((group) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { marginBottom: 12 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--wf-muted)" }, children: group.group }),
            group.items.map((item) => draggable(item.id, item.label, item.id))
          ] }, group.group)),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { marginBottom: 12 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--wf-muted)" }, children: "Flow" }),
            STRUCTURAL.map((s) => draggable(`${STRUCTURAL_PREFIX}${s.kind}`, s.label, s.kind))
          ] })
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "div",
          {
            style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
            onDrop,
            onDragOver: (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { flex: 1, minHeight: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                import_react3.ReactFlow,
                {
                  colorMode: theme,
                  nodes,
                  edges,
                  nodeTypes,
                  onNodesChange,
                  onEdgesChange,
                  onConnect,
                  onNodesDelete,
                  onNodeDragStop,
                  onNodeClick: (_, node) => setSelectedId(node.id),
                  fitView: true,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_react3.Background, {}),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_react3.Controls, {}),
                    onChange ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_react3.Panel, { position: "top-right", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                      "button",
                      {
                        type: "button",
                        onClick: tidy,
                        title: "Auto-arrange the layout",
                        style: {
                          padding: "5px 10px",
                          fontSize: 12,
                          borderRadius: 6,
                          cursor: "pointer",
                          border: "1px solid var(--wf-border-2)",
                          background: "var(--wf-card)",
                          color: "var(--wf-fg)"
                        },
                        children: "\u21B9 Tidy"
                      }
                    ) }) : null
                  ]
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                ProblemsStrip,
                {
                  problems,
                  open: showProblems,
                  onToggle: () => setShowProblems((o) => !o),
                  onSelect: (nodeId) => nodeId && setSelectedId(nodeId)
                }
              )
            ]
          }
        ),
        onChange && (triggerSelected || selected) ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("aside", { style: { width: 288, overflowY: "auto", borderLeft: "1px solid var(--wf-border)", padding: 14, background: "var(--wf-surface)", fontSize: 13 }, children: triggerSelected ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(TriggerConfig, { trigger: value.trigger, triggers: triggerTypes, onChange: setTrigger }) : selected ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          NodeConfig,
          {
            doc: value,
            node: selected,
            stepTypes,
            connections,
            onPatch: patchSelected,
            onDelete: () => onNodesDelete([{ id: selected.id }])
          }
        ) : null }) : null
      ]
    }
  );
}
function ProblemsStrip({
  problems,
  open,
  onToggle,
  onSelect
}) {
  if (problems.length === 0) return null;
  const errors = problems.filter((d) => d.severity === "error").length;
  const warnings = problems.length - errors;
  const summaryColor = errors > 0 ? "var(--wf-danger)" : "var(--wf-warn)";
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { borderTop: "1px solid var(--wf-border)", background: "var(--wf-surface)", display: "flex", flexDirection: "column", maxHeight: open ? 168 : 34, flex: "0 0 auto" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { onClick: onToggle, style: { cursor: "pointer", padding: "7px 12px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: summaryColor, userSelect: "none" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
        "\u26A0 ",
        errors,
        " error",
        errors === 1 ? "" : "s",
        ", ",
        warnings,
        " warning",
        warnings === 1 ? "" : "s"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { marginLeft: "auto", color: "var(--wf-faint)" }, children: open ? "\u25BE" : "\u25B8" })
    ] }),
    open ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { overflowY: "auto" }, children: problems.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        onClick: () => onSelect(d.nodeId),
        style: {
          padding: "5px 12px",
          fontSize: 12,
          borderTop: "1px solid var(--wf-border)",
          cursor: d.nodeId ? "pointer" : "default",
          color: d.severity === "error" ? "var(--wf-danger)" : "var(--wf-warn)"
        },
        children: [
          d.severity === "error" ? "\u2715" : "\u26A0",
          " ",
          d.message
        ]
      },
      i
    )) }) : null
  ] });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  END_ID,
  START_ID,
  WorkflowBuilder,
  addStep,
  addStructural,
  buildPalette,
  connectNodes,
  docToFlow,
  flowToDoc,
  newNodeId,
  removeNode,
  updateNode
});
//# sourceMappingURL=index.cjs.map