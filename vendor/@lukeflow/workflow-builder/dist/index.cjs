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
var import_workflow_core = require("@lukeflow/workflow-core");
var START_ID = "__start";
var END_ID = import_workflow_core.END_NODE;
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
  const start = (0, import_workflow_core.startNodeId)(doc);
  if (start) {
    const queue = [[start, 1]];
    while (queue.length > 0) {
      const [id, d] = queue.shift();
      if (depth.has(id)) continue;
      depth.set(id, d);
      const n = byId.get(id);
      if (n) {
        for (const ref of (0, import_workflow_core.nodeRefs)(n)) if (!depth.has(ref.target)) queue.push([ref.target, d + 1]);
      }
    }
  }
  const maxDepth = depth.size > 0 ? Math.max(...depth.values()) : 0;
  const perDepth = /* @__PURE__ */ new Map();
  const place = (d) => {
    const i = perDepth.get(d) ?? 0;
    perDepth.set(d, i + 1);
    return { x: d * 220 + 40, y: i * 110 + 40 };
  };
  nodes.push({ id: START_ID, kind: "start", label: triggerLabel(doc), position: place(0), data: { trigger: doc.trigger } });
  for (const n of doc.nodes ?? []) {
    if (!n || typeof n.id !== "string") continue;
    nodes.push({ id: n.id, kind: n.kind, label: nodeLabel(n), position: place(depth.get(n.id) ?? 1), data: { node: n } });
  }
  nodes.push({ id: END_ID, kind: "end", label: "End", position: place(maxDepth + 1), data: {} });
  let seq = 0;
  const push = (source, target2, role, label2) => {
    const t = (0, import_workflow_core.isTerminal)(target2) ? END_ID : target2;
    edges.push({ id: `e${seq++}_${source}_${role}`, source, target: t, role, label: label2 });
  };
  if (start) push(START_ID, start, "next");
  for (const n of doc.nodes ?? []) {
    if (!n || typeof n.id !== "string") continue;
    switch (n.kind) {
      case "action":
      case "task":
        push(n.id, n.next, "next");
        if (n.onError && !(0, import_workflow_core.isTerminal)(n.onError.fallback)) push(n.id, n.onError.fallback, "fallback");
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
  const mapTarget = (t) => t === END_ID ? import_workflow_core.END_NODE : t;
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
        n.next = next ? mapTarget(next.target) : import_workflow_core.END_NODE;
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
        n.else = elseEdge ? mapTarget(elseEdge.target) : import_workflow_core.END_NODE;
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
var import_workflow_core2 = require("@lukeflow/workflow-core");
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
  const node = descriptor.kind === "task" ? { id, kind: "task", capability, task: op, next: import_workflow_core2.END_NODE } : { id, kind: "action", capability, action: op, next: import_workflow_core2.END_NODE };
  return { ...doc, nodes: [...doc.nodes ?? [], node] };
}
function addStructural(doc, kind) {
  const id = newNodeId(doc);
  let node;
  switch (kind) {
    case "branch":
      node = { id, kind: "branch", conditions: [], else: import_workflow_core2.END_NODE };
      break;
    case "parallel":
      node = { id, kind: "parallel", branches: [], join: import_workflow_core2.END_NODE };
      break;
    case "wait":
      node = { id, kind: "wait", mode: "timer", duration: "PT1H", next: import_workflow_core2.END_NODE };
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
  return (0, import_workflow_core2.repairWorkflow)({ ...doc, nodes }).doc;
}
function target(id) {
  return id === END_ID ? import_workflow_core2.END_NODE : id;
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
var import_react2 = require("@xyflow/react");
var import_react3 = require("react");

// src/config.tsx
var import_workflow_core3 = require("@lukeflow/workflow-core");
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var label = { display: "block", marginBottom: 10, fontSize: 12, color: "#374151" };
var control = {
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
  background: "#fff",
  color: "#111827"
};
var rowStyle = { display: "flex", gap: 6, alignItems: "center", marginBottom: 6 };
var smallBtn = {
  padding: "4px 8px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  fontSize: 12,
  cursor: "pointer",
  color: "#374151"
};
var linkBtn = {
  background: "none",
  border: "none",
  color: "#4f46e5",
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
  color: "#6b7280",
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
  opts.push({ value: import_workflow_core3.END_NODE, label: "\u25AA End" });
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
  const v = value == null || value === "" ? import_workflow_core3.END_NODE : value;
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
function NodeConfig({ doc, node, onPatch, onDelete }) {
  const opts = nodeOptions(doc, node.id);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 700, marginBottom: 4, fontSize: 13 }, children: "Step" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "#6b7280", marginBottom: 12, textTransform: "capitalize" }, children: node.kind }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Name", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.name ?? "", placeholder: nodeLabel2(node), onChange: (e) => onPatch({ name: e.target.value }) }) }),
    node.kind === "action" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Action", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.action ?? "", placeholder: "e.g. send", onChange: (e) => onPatch({ action: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Then go to", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: node.next, options: opts, onChange: (v) => onPatch({ next: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { title: "Inputs", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KvEditor, { value: node.input, onChange: (input) => onPatch({ input }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { title: "Advanced", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Store result in variable", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.output ?? "", placeholder: "e.g. emailResult", onChange: (e) => onPatch({ output: e.target.value }) }) }) })
    ] }) : null,
    node.kind === "task" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Task", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.task ?? "", placeholder: "e.g. review", onChange: (e) => onPatch({ task: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Assignee", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: control, value: node.assignee ?? "", placeholder: "e.g. queue:ops", onChange: (e) => onPatch({ assignee: e.target.value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { title: "Then go to", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TargetSelect, { value: node.next, options: opts, onChange: (v) => onPatch({ next: v }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { title: "Inputs", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KvEditor, { value: node.input, onChange: (input) => onPatch({ input }) }) })
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: { ...smallBtn, marginTop: 14, color: "#b91c1c", borderColor: "#fecaca" }, onClick: onDelete, children: "Delete step" })
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
  const addCond = () => onPatch({ conditions: [...conditions, { expr: "", next: import_workflow_core3.END_NODE }] });
  const removeCond = (i) => onPatch({ conditions: conditions.filter((_, j) => j !== i) });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: "#374151", marginBottom: 6 }, children: "Conditions (first match wins)" }),
    conditions.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 8 }, children: [
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: { ...linkBtn, color: "#b91c1c", marginTop: 6 }, onClick: () => removeCond(i), children: "Remove condition" })
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
  const addBranch = () => onPatch({ branches: [...branches, import_workflow_core3.END_NODE] });
  const removeBranch = (i) => onPatch({ branches: branches.filter((_, j) => j !== i) });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: "#374151", marginBottom: 6 }, children: "Run in parallel" }),
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, color: "#6b7280", marginBottom: 12 }, children: "How this workflow starts" }),
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

// src/WorkflowBuilder.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var STEP_MIME = "application/x-luke-step";
var STRUCTURAL_PREFIX = "__structural:";
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
    data: { label: n.label },
    type: n.kind === "start" ? "input" : n.kind === "end" ? "output" : "default"
  }));
  const edges = flow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.role === "fallback"
  }));
  return { nodes, edges };
}
var paletteItemStyle = {
  padding: "6px 8px",
  margin: "4px 0",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  fontSize: 13,
  cursor: "grab",
  background: "#fff",
  color: "#111827"
};
function WorkflowBuilder({ value, stepTypes, onChange, className }) {
  const palette = (0, import_react3.useMemo)(() => buildPalette(stepTypes), [stepTypes]);
  const triggerTypes = (0, import_react3.useMemo)(() => stepTypes.filter((s) => s.kind === "trigger"), [stepTypes]);
  const [selectedId, setSelectedId] = (0, import_react3.useState)(null);
  const [nodes, setNodes, onNodesChange] = (0, import_react2.useNodesState)([]);
  const [edges, setEdges, onEdgesChange] = (0, import_react2.useEdgesState)([]);
  (0, import_react3.useEffect)(() => {
    const flow = toReactFlow(value);
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [value, setNodes, setEdges]);
  const selected = value.nodes.find((n) => n.id === selectedId);
  const triggerSelected = selectedId === START_ID;
  const onConnect = (0, import_react3.useCallback)(
    (c) => {
      if (onChange && c.source && c.target) onChange(connectNodes(value, c.source, c.target));
    },
    [onChange, value]
  );
  const onNodesDelete = (0, import_react3.useCallback)(
    (deleted) => {
      if (!onChange) return;
      let next = value;
      for (const d of deleted) next = removeNode(next, d.id);
      onChange(next);
      setSelectedId(null);
    },
    [onChange, value]
  );
  const onDrop = (0, import_react3.useCallback)(
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
  const draggable = (mime, labelText, key) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className, style: { display: "flex", width: "100%", height: "100%" }, children: [
    onChange ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("aside", { style: { width: 190, overflowY: "auto", borderRight: "1px solid #e5e7eb", padding: 8 }, children: [
      palette.map((group) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#6b7280" }, children: group.group }),
        group.items.map((item) => draggable(item.id, item.label, item.id))
      ] }, group.group)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#6b7280" }, children: "Flow" }),
        STRUCTURAL.map((s) => draggable(`${STRUCTURAL_PREFIX}${s.kind}`, s.label, s.kind))
      ] })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        style: { flex: 1, minWidth: 0 },
        onDrop,
        onDragOver: (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          import_react2.ReactFlow,
          {
            nodes,
            edges,
            onNodesChange,
            onEdgesChange,
            onConnect,
            onNodesDelete,
            onNodeClick: (_, node) => setSelectedId(node.id),
            fitView: true,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_react2.Background, {}),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_react2.Controls, {})
            ]
          }
        )
      }
    ),
    onChange && (triggerSelected || selected) ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("aside", { style: { width: 288, overflowY: "auto", borderLeft: "1px solid #e5e7eb", padding: 14, fontSize: 13 }, children: triggerSelected ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TriggerConfig, { trigger: value.trigger, triggers: triggerTypes, onChange: setTrigger }) : selected ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      NodeConfig,
      {
        doc: value,
        node: selected,
        onPatch: patchSelected,
        onDelete: () => onNodesDelete([{ id: selected.id }])
      }
    ) : null }) : null
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