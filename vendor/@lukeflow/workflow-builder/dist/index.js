// src/graph.ts
import { END_NODE, isTerminal, nodeRefs, startNodeId } from "@lukeflow/workflow-core";
var START_ID = "__start";
var END_ID = END_NODE;
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
  const start = startNodeId(doc);
  if (start) {
    const queue = [[start, 1]];
    while (queue.length > 0) {
      const [id, d] = queue.shift();
      if (depth.has(id)) continue;
      depth.set(id, d);
      const n = byId.get(id);
      if (n) {
        for (const ref of nodeRefs(n)) if (!depth.has(ref.target)) queue.push([ref.target, d + 1]);
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
    const t = isTerminal(target2) ? END_ID : target2;
    edges.push({ id: `e${seq++}_${source}_${role}`, source, target: t, role, label: label2 });
  };
  if (start) push(START_ID, start, "next");
  for (const n of doc.nodes ?? []) {
    if (!n || typeof n.id !== "string") continue;
    switch (n.kind) {
      case "action":
      case "task":
        push(n.id, n.next, "next");
        if (n.onError && !isTerminal(n.onError.fallback)) push(n.id, n.onError.fallback, "fallback");
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
  const mapTarget = (t) => t === END_ID ? END_NODE : t;
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
        n.next = next ? mapTarget(next.target) : END_NODE;
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
        n.else = elseEdge ? mapTarget(elseEdge.target) : END_NODE;
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
import { END_NODE as END_NODE2, repairWorkflow } from "@lukeflow/workflow-core";
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
  const node = descriptor.kind === "task" ? { id, kind: "task", capability, task: op, next: END_NODE2 } : { id, kind: "action", capability, action: op, next: END_NODE2 };
  return { ...doc, nodes: [...doc.nodes ?? [], node] };
}
function addStructural(doc, kind) {
  const id = newNodeId(doc);
  let node;
  switch (kind) {
    case "branch":
      node = { id, kind: "branch", conditions: [], else: END_NODE2 };
      break;
    case "parallel":
      node = { id, kind: "parallel", branches: [], join: END_NODE2 };
      break;
    case "wait":
      node = { id, kind: "wait", mode: "timer", duration: "PT1H", next: END_NODE2 };
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
  return repairWorkflow({ ...doc, nodes }).doc;
}
function target(id) {
  return id === END_ID ? END_NODE2 : id;
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
import { Background, Controls, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState as useState2 } from "react";

// src/config.tsx
import { END_NODE as END_NODE3 } from "@lukeflow/workflow-core";
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsxs("label", { style: label, children: [
    title,
    children
  ] });
}
function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: sectionHead, onClick: () => setOpen((o) => !o), children: [
      /* @__PURE__ */ jsx("span", { children: title }),
      /* @__PURE__ */ jsx("span", { children: open ? "\u25BE" : "\u25B8" })
    ] }),
    open ? children : null
  ] });
}
function nodeOptions(doc, excludeId) {
  const opts = (doc.nodes ?? []).filter((n) => n.id !== excludeId).map((n) => ({ value: n.id, label: nodeLabel2(n) }));
  opts.push({ value: END_NODE3, label: "\u25AA End" });
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
  const v = value == null || value === "" ? END_NODE3 : value;
  return /* @__PURE__ */ jsxs("select", { style: control, value: v, onChange: (e) => onChange(e.target.value), children: [
    options.some((o) => o.value === v) ? null : /* @__PURE__ */ jsx("option", { value: v, children: v }),
    options.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value))
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
  return /* @__PURE__ */ jsxs("div", { children: [
    entries.map(([k, val], i) => /* @__PURE__ */ jsxs("div", { style: rowStyle, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          style: { ...control, marginTop: 0, flex: "0 0 40%" },
          placeholder: "key",
          value: k,
          onChange: (e) => setEntry(i, e.target.value, String(val ?? ""))
        }
      ),
      /* @__PURE__ */ jsx(
        "input",
        {
          style: { ...control, marginTop: 0, flex: 1 },
          placeholder: "value or {{expr}}",
          value: String(val ?? ""),
          onChange: (e) => setEntry(i, k, e.target.value)
        }
      ),
      /* @__PURE__ */ jsx("button", { type: "button", style: smallBtn, onClick: () => removeEntry(i), "aria-label": "Remove", children: "\xD7" })
    ] }, i)),
    /* @__PURE__ */ jsx("button", { type: "button", style: linkBtn, onClick: addEntry, children: "+ Add field" })
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
    return /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#9ca3af", marginTop: 4 }, children: "No connections yet \u2014 add one on the Connections page." });
  }
  return /* @__PURE__ */ jsxs("select", { style: control, value: value ?? "", onChange: (e) => onChange(e.target.value), children: [
    /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 Select a connection \u2014" }),
    matches.map((c) => /* @__PURE__ */ jsx("option", { value: c.id, children: (c.externalAccount || c.id) + (c.status && c.status !== "ACTIVE" ? ` (${c.status})` : "") }, c.id))
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
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Field, { title: "Retry attempts", children: /* @__PURE__ */ jsx(
      "input",
      {
        style: control,
        type: "number",
        min: 1,
        value: attempts,
        onChange: (e) => setAttempts(Number(e.target.value))
      }
    ) }),
    retry ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Field, { title: "Backoff", children: /* @__PURE__ */ jsxs("select", { style: control, value: retry.backoff, onChange: (e) => patchRetry({ backoff: e.target.value }), children: [
        /* @__PURE__ */ jsx("option", { value: "fixed", children: "Fixed" }),
        /* @__PURE__ */ jsx("option", { value: "exponential", children: "Exponential" })
      ] }) }),
      /* @__PURE__ */ jsx(Field, { title: "Initial delay", children: /* @__PURE__ */ jsx("input", { style: control, value: retry.initialDelay, placeholder: "e.g. 30s, 5m", onChange: (e) => patchRetry({ initialDelay: e.target.value }) }) })
    ] }) : null,
    /* @__PURE__ */ jsx(Field, { title: "On failure go to", children: /* @__PURE__ */ jsx(TargetSelect, { value: p.fallback, options, onChange: setFallback }) })
  ] });
}
function NodeConfig({ doc, node, connections = [], onPatch, onDelete }) {
  const opts = nodeOptions(doc, node.id);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { style: { fontWeight: 700, marginBottom: 4, fontSize: 13 }, children: "Step" }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#6b7280", marginBottom: 12, textTransform: "capitalize" }, children: node.kind }),
    /* @__PURE__ */ jsx(Field, { title: "Name", children: /* @__PURE__ */ jsx("input", { style: control, value: node.name ?? "", placeholder: nodeLabel2(node), onChange: (e) => onPatch({ name: e.target.value }) }) }),
    node.kind === "action" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Field, { title: "Action", children: /* @__PURE__ */ jsx("input", { style: control, value: node.action ?? "", placeholder: "e.g. send", onChange: (e) => onPatch({ action: e.target.value }) }) }),
      node.capability === "integrations" ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Field, { title: "Provider", children: /* @__PURE__ */ jsx("input", { style: control, value: node.provider ?? "", placeholder: "e.g. salesforce", onChange: (e) => onPatch({ provider: e.target.value }) }) }),
        /* @__PURE__ */ jsx(Field, { title: "Connection", children: /* @__PURE__ */ jsx(ConnectionSelect, { provider: node.provider, value: node.connection, connections, onChange: (v) => onPatch({ connection: v }) }) })
      ] }) : null,
      /* @__PURE__ */ jsx(Field, { title: "Then go to", children: /* @__PURE__ */ jsx(TargetSelect, { value: node.next, options: opts, onChange: (v) => onPatch({ next: v }) }) }),
      /* @__PURE__ */ jsx(Section, { title: "Inputs", children: /* @__PURE__ */ jsx(KvEditor, { value: node.input, onChange: (input) => onPatch({ input }) }) }),
      /* @__PURE__ */ jsxs(Section, { title: "Advanced", children: [
        /* @__PURE__ */ jsx(Field, { title: "Store result in variable", children: /* @__PURE__ */ jsx("input", { style: control, value: node.output ?? "", placeholder: "e.g. emailResult", onChange: (e) => onPatch({ output: e.target.value }) }) }),
        /* @__PURE__ */ jsx(ErrorPolicyEditor, { policy: node.onError, options: opts, onChange: (onError) => onPatch({ onError }) })
      ] })
    ] }) : null,
    node.kind === "task" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Field, { title: "Task", children: /* @__PURE__ */ jsx("input", { style: control, value: node.task ?? "", placeholder: "e.g. review", onChange: (e) => onPatch({ task: e.target.value }) }) }),
      /* @__PURE__ */ jsx(Field, { title: "Assignee", children: /* @__PURE__ */ jsx("input", { style: control, value: node.assignee ?? "", placeholder: "e.g. queue:ops", onChange: (e) => onPatch({ assignee: e.target.value }) }) }),
      /* @__PURE__ */ jsx(Field, { title: "Then go to", children: /* @__PURE__ */ jsx(TargetSelect, { value: node.next, options: opts, onChange: (v) => onPatch({ next: v }) }) }),
      /* @__PURE__ */ jsx(Section, { title: "Inputs", children: /* @__PURE__ */ jsx(KvEditor, { value: node.input, onChange: (input) => onPatch({ input }) }) }),
      /* @__PURE__ */ jsx(Section, { title: "Advanced", children: /* @__PURE__ */ jsx(ErrorPolicyEditor, { policy: node.onError, options: opts, onChange: (onError) => onPatch({ onError }) }) })
    ] }) : null,
    node.kind === "branch" ? /* @__PURE__ */ jsx(BranchConfig, { node, options: opts, onPatch }) : null,
    node.kind === "parallel" ? /* @__PURE__ */ jsx(ParallelConfig, { node, options: opts, onPatch }) : null,
    node.kind === "wait" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Field, { title: "Wait until", children: /* @__PURE__ */ jsxs("select", { style: control, value: node.mode ?? "timer", onChange: (e) => onPatch({ mode: e.target.value }), children: [
        /* @__PURE__ */ jsx("option", { value: "timer", children: "A duration passes (timer)" }),
        /* @__PURE__ */ jsx("option", { value: "event", children: "An event arrives (event)" })
      ] }) }),
      (node.mode ?? "timer") === "timer" ? /* @__PURE__ */ jsx(Field, { title: "Duration (ISO-8601)", children: /* @__PURE__ */ jsx("input", { style: control, value: node.duration ?? "", placeholder: "e.g. P1D, PT2H", onChange: (e) => onPatch({ duration: e.target.value }) }) }) : /* @__PURE__ */ jsx(Field, { title: "Event type", children: /* @__PURE__ */ jsx(
        "input",
        {
          style: control,
          value: node.event?.type ?? "",
          placeholder: "e.g. signatures.signed",
          onChange: (e) => onPatch({ event: { ...node.event ?? {}, type: e.target.value } })
        }
      ) }),
      /* @__PURE__ */ jsx(Field, { title: "Then go to", children: /* @__PURE__ */ jsx(TargetSelect, { value: node.next, options: opts, onChange: (v) => onPatch({ next: v }) }) })
    ] }) : null,
    /* @__PURE__ */ jsx("button", { type: "button", style: { ...smallBtn, marginTop: 14, color: "#b91c1c", borderColor: "#fecaca" }, onClick: onDelete, children: "Delete step" })
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
  const addCond = () => onPatch({ conditions: [...conditions, { expr: "", next: END_NODE3 }] });
  const removeCond = (i) => onPatch({ conditions: conditions.filter((_, j) => j !== i) });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#374151", marginBottom: 6 }, children: "Conditions (first match wins)" }),
    conditions.map((c, i) => /* @__PURE__ */ jsxs("div", { style: { border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          style: { ...control, marginTop: 0 },
          placeholder: "expression, e.g. amount > 10000",
          value: c.expr ?? "",
          onChange: (e) => setCond(i, { expr: e.target.value })
        }
      ),
      /* @__PURE__ */ jsx("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ jsx(TargetSelect, { value: c.next, options, onChange: (v) => setCond(i, { next: v }) }) }),
      /* @__PURE__ */ jsx("button", { type: "button", style: { ...linkBtn, color: "#b91c1c", marginTop: 6 }, onClick: () => removeCond(i), children: "Remove condition" })
    ] }, i)),
    /* @__PURE__ */ jsx("button", { type: "button", style: linkBtn, onClick: addCond, children: "+ Add condition" }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ jsx(Field, { title: "Otherwise (else)", children: /* @__PURE__ */ jsx(TargetSelect, { value: node.else, options, onChange: (v) => onPatch({ else: v }) }) }) })
  ] });
}
function ParallelConfig({
  node,
  options,
  onPatch
}) {
  const branches = node.branches ?? [];
  const setBranch = (i, v) => onPatch({ branches: branches.map((b, j) => j === i ? v : b) });
  const addBranch = () => onPatch({ branches: [...branches, END_NODE3] });
  const removeBranch = (i) => onPatch({ branches: branches.filter((_, j) => j !== i) });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#374151", marginBottom: 6 }, children: "Run in parallel" }),
    branches.map((b, i) => /* @__PURE__ */ jsxs("div", { style: rowStyle, children: [
      /* @__PURE__ */ jsx("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsx(TargetSelect, { value: b, options, onChange: (v) => setBranch(i, v) }) }),
      /* @__PURE__ */ jsx("button", { type: "button", style: smallBtn, onClick: () => removeBranch(i), "aria-label": "Remove", children: "\xD7" })
    ] }, i)),
    /* @__PURE__ */ jsx("button", { type: "button", style: linkBtn, onClick: addBranch, children: "+ Add branch" }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ jsx(Field, { title: "Continue at (join)", children: /* @__PURE__ */ jsx(TargetSelect, { value: node.join, options, onChange: (v) => onPatch({ join: v }) }) }) })
  ] });
}
function TriggerConfig({
  trigger,
  triggers,
  onChange
}) {
  const current = `${trigger.capability}.${trigger.type}`;
  const config = trigger.config ?? {};
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { style: { fontWeight: 700, marginBottom: 4, fontSize: 13 }, children: "Trigger" }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#6b7280", marginBottom: 12 }, children: "How this workflow starts" }),
    /* @__PURE__ */ jsx(Field, { title: "When", children: /* @__PURE__ */ jsxs(
      "select",
      {
        style: control,
        value: current,
        onChange: (e) => {
          const d = triggers.find((t) => t.id === e.target.value);
          if (d) onChange({ ...trigger, capability: d.capability.toLowerCase(), type: operationOf2(d.id) });
        },
        children: [
          triggers.some((t) => t.id === current) ? null : /* @__PURE__ */ jsx("option", { value: current, children: current }),
          triggers.map((t) => /* @__PURE__ */ jsx("option", { value: t.id, children: t.label }, t.id))
        ]
      }
    ) }),
    /* @__PURE__ */ jsx(Section, { title: "Trigger settings", defaultOpen: true, children: /* @__PURE__ */ jsx(KvEditor, { value: config, onChange: (next) => onChange({ ...trigger, config: next }) }) })
  ] });
}
function operationOf2(descriptorId) {
  const i = descriptorId.indexOf(".");
  return i >= 0 ? descriptorId.slice(i + 1) : descriptorId;
}

// src/WorkflowBuilder.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
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
function WorkflowBuilder({ value, stepTypes, connections, onChange, className }) {
  const palette = useMemo(() => buildPalette(stepTypes), [stepTypes]);
  const triggerTypes = useMemo(() => stepTypes.filter((s) => s.kind === "trigger"), [stepTypes]);
  const [selectedId, setSelectedId] = useState2(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  useEffect(() => {
    const flow = toReactFlow(value);
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [value, setNodes, setEdges]);
  const selected = value.nodes.find((n) => n.id === selectedId);
  const triggerSelected = selectedId === START_ID;
  const onConnect = useCallback(
    (c) => {
      if (onChange && c.source && c.target) onChange(connectNodes(value, c.source, c.target));
    },
    [onChange, value]
  );
  const onNodesDelete = useCallback(
    (deleted) => {
      if (!onChange) return;
      let next = value;
      for (const d of deleted) next = removeNode(next, d.id);
      onChange(next);
      setSelectedId(null);
    },
    [onChange, value]
  );
  const onDrop = useCallback(
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
  const draggable = (mime, labelText, key) => /* @__PURE__ */ jsx2(
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
  return /* @__PURE__ */ jsxs2("div", { className, style: { display: "flex", width: "100%", height: "100%" }, children: [
    onChange ? /* @__PURE__ */ jsxs2("aside", { style: { width: 190, overflowY: "auto", borderRight: "1px solid #e5e7eb", padding: 8 }, children: [
      palette.map((group) => /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 12 }, children: [
        /* @__PURE__ */ jsx2("div", { style: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#6b7280" }, children: group.group }),
        group.items.map((item) => draggable(item.id, item.label, item.id))
      ] }, group.group)),
      /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 12 }, children: [
        /* @__PURE__ */ jsx2("div", { style: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#6b7280" }, children: "Flow" }),
        STRUCTURAL.map((s) => draggable(`${STRUCTURAL_PREFIX}${s.kind}`, s.label, s.kind))
      ] })
    ] }) : null,
    /* @__PURE__ */ jsx2(
      "div",
      {
        style: { flex: 1, minWidth: 0 },
        onDrop,
        onDragOver: (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        },
        children: /* @__PURE__ */ jsxs2(
          ReactFlow,
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
              /* @__PURE__ */ jsx2(Background, {}),
              /* @__PURE__ */ jsx2(Controls, {})
            ]
          }
        )
      }
    ),
    onChange && (triggerSelected || selected) ? /* @__PURE__ */ jsx2("aside", { style: { width: 288, overflowY: "auto", borderLeft: "1px solid #e5e7eb", padding: 14, fontSize: 13 }, children: triggerSelected ? /* @__PURE__ */ jsx2(TriggerConfig, { trigger: value.trigger, triggers: triggerTypes, onChange: setTrigger }) : selected ? /* @__PURE__ */ jsx2(
      NodeConfig,
      {
        doc: value,
        node: selected,
        connections,
        onPatch: patchSelected,
        onDelete: () => onNodesDelete([{ id: selected.id }])
      }
    ) : null }) : null
  ] });
}
export {
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
};
//# sourceMappingURL=index.js.map