'use strict';

// src/schema/types.ts
var END_NODE = "end";

// src/schema/graph.ts
function isTerminal(next) {
  return next == null || next === END_NODE;
}
function nodeRefs(node) {
  const refs = [];
  const push = (t, role) => {
    if (!isTerminal(t)) refs.push({ target: t, role });
  };
  switch (node.kind) {
    case "action":
    case "task":
      push(node.next, "next");
      if (node.onError) push(node.onError.fallback, "fallback");
      break;
    case "wait":
      push(node.next, "next");
      break;
    case "branch":
      for (const c of node.conditions ?? []) push(c?.next, "branch");
      push(node.else, "else");
      break;
    case "parallel":
      for (const b of node.branches ?? []) push(b, "parallel-branch");
      push(node.join, "join");
      break;
  }
  return refs;
}
function reachableFrom(doc, startId) {
  const byId = /* @__PURE__ */ new Map();
  for (const n of doc.nodes) {
    if (n && typeof n.id === "string" && !byId.has(n.id)) byId.set(n.id, n);
  }
  const seen = /* @__PURE__ */ new Set();
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    for (const ref of nodeRefs(node)) {
      if (!seen.has(ref.target)) stack.push(ref.target);
    }
  }
  return seen;
}
function startNodeId(doc) {
  if (doc.start != null) return doc.start;
  const first = doc.nodes[0];
  return first && typeof first.id === "string" ? first.id : void 0;
}

// src/diagnostics.ts
function diag(code, severity, message, context = {}, nodeId) {
  return nodeId === void 0 ? { code, severity, context, message } : { code, severity, nodeId, context, message };
}
function toReport(diagnostics) {
  let hasErrors = false;
  let hasWarnings = false;
  for (const d of diagnostics) {
    if (d.severity === "error") hasErrors = true;
    else if (d.severity === "warning") hasWarnings = true;
  }
  return { diagnostics, hasErrors, hasWarnings };
}

// src/schema/validate.ts
var KNOWN_KINDS = /* @__PURE__ */ new Set([
  "action",
  "task",
  "branch",
  "parallel",
  "wait"
]);
function checkRetry(node, out) {
  const retry = node.onError?.retry;
  if (retry && (typeof retry.maxAttempts !== "number" || retry.maxAttempts < 1)) {
    out.push(
      diag(
        "invalid-retry",
        "warning",
        `Node "${node.id}" has a retry policy with maxAttempts < 1; it will never retry.`,
        { maxAttempts: retry.maxAttempts },
        node.id
      )
    );
  }
}
function validateWorkflow(doc) {
  const out = [];
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.nodes)) {
    out.push(diag("malformed-workflow", "error", "Workflow is missing its nodes array."));
    return out;
  }
  const t = doc.trigger;
  if (!t || typeof t !== "object" || typeof t.capability !== "string" || typeof t.type !== "string") {
    out.push(
      diag("missing-trigger", "error", "Workflow has no valid trigger (capability + type required).")
    );
  }
  if (doc.nodes.length === 0) {
    out.push(diag("empty-workflow", "error", "Workflow has no nodes."));
  }
  const ids = /* @__PURE__ */ new Set();
  const dupes = /* @__PURE__ */ new Set();
  for (const n of doc.nodes) {
    if (!n || typeof n !== "object" || typeof n.id !== "string") {
      out.push(diag("malformed-node", "error", "A node is missing its string id."));
      continue;
    }
    if (ids.has(n.id)) dupes.add(n.id);
    else ids.add(n.id);
  }
  for (const id of dupes) {
    out.push(diag("duplicate-node-id", "error", `Duplicate node id "${id}".`, { id }, id));
  }
  for (const n of doc.nodes) {
    if (!n || typeof n.id !== "string") continue;
    if (!KNOWN_KINDS.has(n.kind)) {
      out.push(
        diag("invalid-node-kind", "error", `Node "${n.id}" has unknown kind "${String(n.kind)}".`, { kind: n.kind }, n.id)
      );
      continue;
    }
    switch (n.kind) {
      case "action":
        if (!n.capability) out.push(diag("missing-capability", "error", `Action node "${n.id}" is missing a capability.`, {}, n.id));
        if (!n.action) out.push(diag("missing-action", "error", `Action node "${n.id}" is missing an action.`, {}, n.id));
        checkRetry(n, out);
        break;
      case "task":
        if (!n.capability) out.push(diag("missing-capability", "error", `Task node "${n.id}" is missing a capability.`, {}, n.id));
        if (!n.task) out.push(diag("missing-task", "error", `Task node "${n.id}" is missing a task.`, {}, n.id));
        checkRetry(n, out);
        break;
      case "branch":
        if (!Array.isArray(n.conditions) || n.conditions.length === 0) {
          out.push(diag("branch-no-conditions", "warning", `Branch node "${n.id}" has no conditions; it always takes the else path.`, {}, n.id));
        } else {
          for (const c of n.conditions) {
            if (!c || typeof c.expr !== "string" || c.expr.trim() === "") {
              out.push(diag("expr-empty", "error", `Branch node "${n.id}" has a condition with an empty expression.`, {}, n.id));
            }
          }
        }
        break;
    }
    for (const ref of nodeRefs(n)) {
      if (!ids.has(ref.target)) {
        out.push(
          diag("dangling-ref", "error", `Node "${n.id}" ${ref.role} references unknown node "${ref.target}".`, { role: ref.role, target: ref.target }, n.id)
        );
      }
    }
  }
  const start = startNodeId(doc);
  if (start && ids.has(start)) {
    const reachable = reachableFrom(doc, start);
    for (const n of doc.nodes) {
      if (n && typeof n.id === "string" && ids.has(n.id) && !reachable.has(n.id)) {
        out.push(diag("unreachable-node", "warning", `Node "${n.id}" is not reachable from the start.`, {}, n.id));
      }
    }
  }
  return out;
}
function validateWorkflowReport(doc) {
  return toReport(validateWorkflow(doc));
}

// src/schema/repair.ts
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function repairWorkflow(input) {
  const removed = [];
  const rewired = /* @__PURE__ */ new Set();
  if (!input || typeof input !== "object" || !Array.isArray(input.nodes)) {
    const trigger = input?.trigger ?? { capability: "", type: "" };
    return {
      doc: { id: input?.id ?? "", version: input?.version ?? 0, trigger, nodes: [] },
      removed,
      rewired: []
    };
  }
  const doc = clone(input);
  const ids = /* @__PURE__ */ new Set();
  const nodes = [];
  for (const n of doc.nodes) {
    if (!n || typeof n.id !== "string") {
      removed.push("<malformed>");
      continue;
    }
    if (ids.has(n.id)) {
      removed.push(n.id);
      continue;
    }
    ids.add(n.id);
    nodes.push(n);
  }
  for (const n of nodes) {
    const fix = (t) => {
      if (isTerminal(t) || ids.has(t)) return t;
      rewired.add(n.id);
      return END_NODE;
    };
    switch (n.kind) {
      case "action":
      case "task":
        n.next = fix(n.next);
        if (n.onError && n.onError.fallback !== void 0) {
          n.onError.fallback = fix(n.onError.fallback);
        }
        break;
      case "wait":
        n.next = fix(n.next);
        break;
      case "branch":
        n.conditions = (n.conditions ?? []).filter((c) => {
          if (!c) return false;
          if (isTerminal(c.next) || ids.has(c.next)) return true;
          rewired.add(n.id);
          return false;
        });
        n.else = fix(n.else);
        break;
      case "parallel":
        n.branches = (n.branches ?? []).filter((b) => {
          if (ids.has(b)) return true;
          rewired.add(n.id);
          return false;
        });
        n.join = fix(n.join);
        break;
    }
  }
  doc.nodes = nodes;
  return { doc, removed, rewired: [...rewired] };
}

// src/schema/jsonSchema.ts
var workflowJsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://lukeflow.com/schemas/workflow.json",
  title: "LukeflowWorkflow",
  type: "object",
  required: ["id", "version", "trigger", "nodes"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    version: { type: "integer", minimum: 0 },
    name: { type: "string" },
    start: { type: "string" },
    trigger: {
      type: "object",
      required: ["capability", "type"],
      properties: {
        capability: { type: "string" },
        type: { type: "string" },
        config: { type: "object" }
      }
    },
    settings: {
      type: "object",
      properties: { defaultErrorPolicy: { $ref: "#/definitions/errorPolicy" } }
    },
    nodes: {
      type: "array",
      items: {
        oneOf: [
          { $ref: "#/definitions/actionNode" },
          { $ref: "#/definitions/taskNode" },
          { $ref: "#/definitions/branchNode" },
          { $ref: "#/definitions/parallelNode" },
          { $ref: "#/definitions/waitNode" }
        ]
      }
    }
  },
  definitions: {
    nodeId: { type: ["string", "null"] },
    retryPolicy: {
      type: "object",
      required: ["maxAttempts", "backoff", "initialDelay"],
      properties: {
        maxAttempts: { type: "integer", minimum: 1 },
        backoff: { enum: ["fixed", "exponential"] },
        initialDelay: { type: "string" }
      }
    },
    errorPolicy: {
      type: "object",
      properties: {
        retry: { $ref: "#/definitions/retryPolicy" },
        fallback: { $ref: "#/definitions/nodeId" },
        deadLetter: { type: "boolean" }
      }
    },
    actionNode: {
      type: "object",
      required: ["id", "kind", "capability", "action"],
      properties: {
        id: { type: "string" },
        kind: { const: "action" },
        name: { type: "string" },
        capability: { type: "string" },
        action: { type: "string" },
        provider: { type: "string" },
        connection: { type: "string" },
        input: { type: "object" },
        output: { type: "string" },
        onError: { $ref: "#/definitions/errorPolicy" },
        next: { $ref: "#/definitions/nodeId" }
      }
    },
    taskNode: {
      type: "object",
      required: ["id", "kind", "capability", "task"],
      properties: {
        id: { type: "string" },
        kind: { const: "task" },
        name: { type: "string" },
        capability: { type: "string" },
        task: { type: "string" },
        assignee: { type: "string" },
        input: { type: "object" },
        onError: { $ref: "#/definitions/errorPolicy" },
        next: { $ref: "#/definitions/nodeId" }
      }
    },
    branchNode: {
      type: "object",
      required: ["id", "kind", "conditions"],
      properties: {
        id: { type: "string" },
        kind: { const: "branch" },
        name: { type: "string" },
        conditions: {
          type: "array",
          items: {
            type: "object",
            required: ["expr", "next"],
            properties: { expr: { type: "string" }, next: { type: "string" } }
          }
        },
        else: { $ref: "#/definitions/nodeId" }
      }
    },
    parallelNode: {
      type: "object",
      required: ["id", "kind", "branches"],
      properties: {
        id: { type: "string" },
        kind: { const: "parallel" },
        name: { type: "string" },
        branches: { type: "array", items: { type: "string" } },
        join: { $ref: "#/definitions/nodeId" }
      }
    },
    waitNode: {
      type: "object",
      required: ["id", "kind", "mode"],
      properties: {
        id: { type: "string" },
        kind: { const: "wait" },
        name: { type: "string" },
        mode: { enum: ["timer", "event"] },
        duration: { type: "string" },
        event: {
          type: "object",
          required: ["capability", "type"],
          properties: {
            capability: { type: "string" },
            type: { type: "string" },
            correlationKey: { type: "string" }
          }
        },
        next: { $ref: "#/definitions/nodeId" }
      }
    }
  }
};

// src/registry/registry.ts
function createStepTypeRegistry(seed = []) {
  const byId = /* @__PURE__ */ new Map();
  const order = [];
  const register = (descriptor) => {
    if (!byId.has(descriptor.id)) order.push(descriptor.id);
    byId.set(descriptor.id, descriptor);
  };
  for (const d of seed) register(d);
  const all = () => order.map((id) => byId.get(id)).filter((d) => d !== void 0);
  return {
    register,
    all,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    byCapability: (capability) => all().filter((d) => d.capability === capability),
    byKind: (kind) => all().filter((d) => d.kind === kind),
    resolve: (capability, kind) => all().find((d) => d.capability === capability && d.kind === kind)
  };
}
var BACKED_KINDS = {
  action: "action",
  task: "task"
};
function missingStepTypes(doc, registry) {
  const out = [];
  if (!doc || !Array.isArray(doc.nodes)) return out;
  for (const n of doc.nodes) {
    if (!n || typeof n.id !== "string") continue;
    const stepKind = BACKED_KINDS[n.kind];
    if (!stepKind) continue;
    if (n.kind !== "action" && n.kind !== "task") continue;
    const capability = n.capability;
    if (!capability) continue;
    if (!registry.resolve(capability, stepKind)) {
      out.push(
        diag(
          "unknown-step-type",
          "error",
          `Node "${n.id}" uses capability "${capability}" (${stepKind}), which has no registered step type.`,
          { capability, kind: stepKind },
          n.id
        )
      );
    }
  }
  return out;
}

// src/engine/createWorkflowEngine.ts
function createWorkflowEngine(input, options = {}) {
  const { doc, removed } = options.repair ? (() => {
    const r = repairWorkflow(input);
    return { doc: r.doc, removed: r.removed };
  })() : { doc: input, removed: [] };
  const byId = /* @__PURE__ */ new Map();
  for (const n of doc.nodes) {
    if (n && typeof n.id === "string" && !byId.has(n.id)) byId.set(n.id, n);
  }
  return {
    doc,
    removed,
    validate: () => validateWorkflow(doc),
    report: () => toReport(validateWorkflow(doc)),
    startId: () => startNodeId(doc),
    nodeById: (id) => byId.get(id),
    successors: (id) => {
      const node = byId.get(id);
      return node ? nodeRefs(node).map((r) => r.target) : [];
    },
    reachable: () => {
      const start = startNodeId(doc);
      return start ? reachableFrom(doc, start) : /* @__PURE__ */ new Set();
    },
    isTerminal
  };
}

// src/fixtures/golden.ts
var goldenWorkflow = {
  id: "wf_onboard",
  version: 3,
  name: "New client onboarding",
  trigger: { capability: "forms", type: "form.submitted", config: { formId: "frm_intake" } },
  nodes: [
    {
      id: "n1",
      kind: "action",
      capability: "email",
      action: "send",
      input: { template: "intake-received", to: "{{ submission.email }}" },
      next: "n2"
    },
    {
      id: "n2",
      kind: "task",
      capability: "forms",
      task: "review",
      assignee: "queue:ops",
      next: "n3"
    },
    {
      id: "n3",
      kind: "branch",
      conditions: [{ expr: "amount > 10000", next: "n4" }],
      else: "end"
    },
    {
      id: "n4",
      kind: "action",
      capability: "integrations",
      provider: "salesforce",
      action: "upsertOpportunity",
      connection: "conn_sf_primary",
      input: { name: "{{ submission.company }}", amount: "{{ amount }}" },
      output: "sfOpportunity",
      onError: {
        retry: { maxAttempts: 5, backoff: "exponential", initialDelay: "30s" },
        fallback: "n5",
        deadLetter: true
      },
      next: "end"
    },
    {
      id: "n5",
      kind: "action",
      capability: "email",
      action: "send",
      input: { template: "sf-sync-failed", to: "ops@lukeflow.com" },
      next: "end"
    }
  ]
};
var referenceStepTypes = [
  { id: "email.send", label: "Send email", capability: "email", kind: "action", paletteGroup: "Email" },
  { id: "forms.review", label: "Review task", capability: "forms", kind: "task", paletteGroup: "Forms" },
  {
    id: "integration.action",
    label: "Integration action",
    capability: "integrations",
    kind: "action",
    paletteGroup: "Integrations"
  },
  {
    id: "forms.submitted",
    label: "Form submitted",
    capability: "forms",
    kind: "trigger",
    paletteGroup: "Forms"
  }
];

// src/index.ts
var VERSION = "0.1.0-alpha.0";

exports.END_NODE = END_NODE;
exports.VERSION = VERSION;
exports.createStepTypeRegistry = createStepTypeRegistry;
exports.createWorkflowEngine = createWorkflowEngine;
exports.diag = diag;
exports.goldenWorkflow = goldenWorkflow;
exports.isTerminal = isTerminal;
exports.missingStepTypes = missingStepTypes;
exports.nodeRefs = nodeRefs;
exports.reachableFrom = reachableFrom;
exports.referenceStepTypes = referenceStepTypes;
exports.repairWorkflow = repairWorkflow;
exports.startNodeId = startNodeId;
exports.toReport = toReport;
exports.validateWorkflow = validateWorkflow;
exports.validateWorkflowReport = validateWorkflowReport;
exports.workflowJsonSchema = workflowJsonSchema;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map