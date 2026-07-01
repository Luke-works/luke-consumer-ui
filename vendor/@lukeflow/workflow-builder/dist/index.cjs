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
  const push = (source, target2, role, label) => {
    const t = (0, import_workflow_core.isTerminal)(target2) ? END_ID : target2;
    edges.push({ id: `e${seq++}_${source}_${role}`, source, target: t, role, label });
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
var import_react = require("@xyflow/react");
var import_react2 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var STEP_MIME = "application/x-luke-step";
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
function WorkflowBuilder({ value, stepTypes, onChange, className }) {
  const palette = (0, import_react2.useMemo)(() => buildPalette(stepTypes), [stepTypes]);
  const [selectedId, setSelectedId] = (0, import_react2.useState)(null);
  const [nodes, setNodes, onNodesChange] = (0, import_react.useNodesState)([]);
  const [edges, setEdges, onEdgesChange] = (0, import_react.useEdgesState)([]);
  (0, import_react2.useEffect)(() => {
    const flow = toReactFlow(value);
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [value, setNodes, setEdges]);
  const selected = value.nodes.find((n) => n.id === selectedId);
  const onConnect = (0, import_react2.useCallback)(
    (c) => {
      if (onChange && c.source && c.target) onChange(connectNodes(value, c.source, c.target));
    },
    [onChange, value]
  );
  const onNodesDelete = (0, import_react2.useCallback)(
    (deleted) => {
      if (!onChange) return;
      let next = value;
      for (const d of deleted) next = removeNode(next, d.id);
      onChange(next);
      setSelectedId(null);
    },
    [onChange, value]
  );
  const onDrop = (0, import_react2.useCallback)(
    (event) => {
      event.preventDefault();
      const id = event.dataTransfer.getData(STEP_MIME);
      const descriptor = stepTypes.find((s) => s.id === id);
      if (descriptor && onChange) onChange(addStep(value, descriptor));
    },
    [onChange, stepTypes, value]
  );
  const patchSelected = (patch) => {
    if (onChange && selectedId) onChange(updateNode(value, selectedId, patch));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className, style: { display: "flex", width: "100%", height: "100%" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", { style: { width: 200, overflowY: "auto", borderRight: "1px solid #e5e7eb", padding: 8 }, children: palette.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginBottom: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#6b7280" }, children: group.group }),
      group.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          draggable: true,
          "data-step-type": item.id,
          onDragStart: (e) => {
            e.dataTransfer.setData(STEP_MIME, item.id);
            e.dataTransfer.effectAllowed = "move";
          },
          style: { padding: "6px 8px", margin: "4px 0", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, cursor: "grab" },
          children: item.label
        },
        item.id
      ))
    ] }, group.group)) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        style: { flex: 1, minWidth: 0 },
        onDrop,
        onDragOver: (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          import_react.ReactFlow,
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
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Background, {}),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Controls, {})
            ]
          }
        )
      }
    ),
    selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", { style: { width: 240, borderLeft: "1px solid #e5e7eb", padding: 12, fontSize: 13 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontWeight: 600, marginBottom: 8 }, children: [
        "Step \xB7 ",
        selected.kind
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "block", marginBottom: 8 }, children: [
        "Name",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            value: selected.name ?? "",
            onChange: (e) => patchSelected({ name: e.target.value }),
            style: { width: "100%", marginTop: 4, padding: 4 }
          }
        )
      ] }),
      selected.kind === "action" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "block", marginBottom: 8 }, children: [
        "Action",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            value: selected.action ?? "",
            onChange: (e) => patchSelected({ action: e.target.value }),
            style: { width: "100%", marginTop: 4, padding: 4 }
          }
        )
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => onNodesDelete([{ id: selected.id }]), style: { marginTop: 8 }, children: "Delete step" })
    ] }) : null
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