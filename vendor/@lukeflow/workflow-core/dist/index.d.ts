/**
 * The Lukeflow workflow schema — the portable JSON contract the builder authors,
 * the backend compiles to BPMN, and every tool targets.
 *
 * This file OWNS the TypeScript model for the stored workflow JSON. It is a
 * React-free, DOM-free, engine-free description of a **graph of nodes**. The JSON
 * is a friendly DSL: `luke-core-engine` re-validates it and compiles it to BPMN
 * for execution on Camunda/CIBSeven — this model is never itself executed here.
 *
 * The on-disk SHAPE is intentionally frozen:
 *
 * ```jsonc
 * {
 *   "id": "wf_onboard",
 *   "version": 3,
 *   "trigger": { "capability": "forms", "type": "form.submitted", "config": { "formId": "…" } },
 *   "nodes": [
 *     { "id": "n1", "kind": "action", "capability": "email", "action": "send", "next": "n2" },
 *     { "id": "n2", "kind": "task",   "capability": "forms", "task": "review", "next": "n3" },
 *     { "id": "n3", "kind": "branch", "conditions": [{ "expr": "amount > 10000", "next": "n4" }], "else": "end" }
 *   ]
 * }
 * ```
 *
 * The unifying idea (see WORKFLOW_V1_BACKLOG.md): every capability is dual — an
 * inbound **Trigger** and an outbound **Action**, plus an optional human **Task**.
 * A node therefore always carries a `kind` and (for action/task) a `capability`.
 *
 * @packageDocumentation
 */
/** A node identifier, unique within a workflow. Referenced by `next`, branch targets, etc. */
type NodeId = string;
/**
 * The reserved terminal target. A `next` / `else` / `fallback` / `join` of
 * `"end"` (or `null`/absent) means "this path terminates" — see {@link isTerminal}.
 */
declare const END_NODE = "end";
/**
 * A capability id — the building block a node draws from (`"forms"`, `"email"`,
 * `"phone"`, `"sign"`, `"documents"`, `"integrations"`). Kept an open `string`
 * (not a closed union) so new capabilities register step types without a model
 * bump; unknown capabilities surface as a registry diagnostic, not a type error.
 */
type CapabilityId = string;
/**
 * A safe expression string, evaluated by the engine's sandbox (an arithmetic /
 * boolean grammar — NOT JavaScript `eval`), referencing process variables by
 * name, e.g. `amount > 10000`, `status == "approved"`. Static analysis of these
 * is a later milestone; V1 only checks non-emptiness.
 */
type ExpressionString = string;
/** The closed set of executable node kinds a workflow graph may contain. */
type NodeKind = "action" | "task" | "branch" | "parallel" | "wait";
/**
 * How a workflow starts: a capability's inbound Trigger. Compiles to a BPMN
 * message start event. `config` carries trigger-specific data (e.g. the `formId`
 * for `forms/form.submitted`).
 */
interface WorkflowTrigger {
    capability: CapabilityId;
    /** The event type this trigger listens for, e.g. `"form.submitted"`. */
    type: string;
    config?: Record<string, unknown>;
}
/** Retry backoff shape for a failed Action/Task step. */
type BackoffStrategy = "fixed" | "exponential";
/** A per-node retry policy — compiles to Camunda async job retries. */
interface RetryPolicy {
    /** Total attempts including the first; must be >= 1. */
    maxAttempts: number;
    backoff: BackoffStrategy;
    /** Initial delay, human form (e.g. `"30s"`, `"5m"`). Parsed server-side. */
    initialDelay: string;
}
/**
 * Error handling for an Action/Task node — compiles to Camunda retries plus a
 * BPMN boundary error event.
 */
interface ErrorPolicy {
    retry?: RetryPolicy;
    /** Node to route to when retries are exhausted (or `"end"`). */
    fallback?: NodeId | null;
    /** Park the token for manual handling (dead-letter) instead of failing. */
    deadLetter?: boolean;
}
/** Fields shared by every node. */
interface NodeBase {
    id: NodeId;
    kind: NodeKind;
    /** Optional human label shown in the builder. */
    name?: string;
}
/**
 * An outbound effect — the workflow does something via a capability. Compiles to
 * a BPMN service task dispatched on the outbound rail (job worker → executor).
 */
interface ActionNode extends NodeBase {
    kind: "action";
    capability: CapabilityId;
    /** The capability operation, e.g. `"send"`, `"upsertOpportunity"`. */
    action: string;
    /** For `integrations`: the connector, e.g. `"salesforce"`. */
    provider?: string;
    /** Connection selector/id for integration actions. */
    connection?: string;
    /** Input map (values / expressions bound to the action's inputs). */
    input?: Record<string, unknown>;
    /** Process variable to store the action result under. */
    output?: string;
    onError?: ErrorPolicy;
    /** Successor node, or `"end"`/absent to terminate the path. */
    next?: NodeId | null;
}
/**
 * A human/async task — assign work, then wait for its completion event. Compiles
 * to a BPMN user/receive task; it rides BOTH rails (outbound assignment, inbound
 * completion).
 */
interface TaskNode extends NodeBase {
    kind: "task";
    capability: CapabilityId;
    /** The task type, e.g. `"review"`, `"sign"`. */
    task: string;
    /** Assignee expression, e.g. `"queue:ops"`, `"user:123"`. */
    assignee?: string;
    input?: Record<string, unknown>;
    onError?: ErrorPolicy;
    next?: NodeId | null;
}
/** One arm of a branch: take `next` when `expr` is truthy. */
interface BranchCondition {
    expr: ExpressionString;
    next: NodeId;
}
/**
 * Exclusive choice — the first condition whose expression is truthy wins;
 * otherwise `else`. Compiles to a BPMN exclusive gateway.
 */
interface BranchNode extends NodeBase {
    kind: "branch";
    conditions: BranchCondition[];
    /** Default target when no condition matches (or `"end"`). */
    else?: NodeId | null;
}
/**
 * Fork/join — run `branches` concurrently, then continue at `join` once all
 * complete. Compiles to a BPMN parallel gateway pair.
 */
interface ParallelNode extends NodeBase {
    kind: "parallel";
    branches: NodeId[];
    /** Node to continue at after all branches complete (or `"end"`). */
    join?: NodeId | null;
}
/** Whether a wait resumes on a timer or on an inbound event. */
type WaitMode = "timer" | "event";
/**
 * Pause the process — either for a duration (timer) or until a correlated inbound
 * event arrives. Compiles to a BPMN timer or message-catch event.
 */
interface WaitNode extends NodeBase {
    kind: "wait";
    mode: WaitMode;
    /** For `mode: "timer"` — e.g. `"P1D"`, `"2h"`. */
    duration?: string;
    /** For `mode: "event"` — the inbound event to correlate on. */
    event?: {
        capability: CapabilityId;
        type: string;
        correlationKey?: ExpressionString;
    };
    next?: NodeId | null;
}
/** The discriminated union of every node the graph may contain. */
type WorkflowNode = ActionNode | TaskNode | BranchNode | ParallelNode | WaitNode;
/** Workflow-level settings (extensible; empty in V1). */
interface WorkflowSettings {
    /** Default error policy applied to action/task nodes that omit their own. */
    defaultErrorPolicy?: ErrorPolicy;
}
/**
 * The stored workflow document — the root JSON object.
 *
 * `start` is optional; when absent the first entry of `nodes` is the start.
 */
interface WorkflowDoc {
    id: string;
    /** Monotonic version of this workflow definition. */
    version: number;
    name?: string;
    trigger: WorkflowTrigger;
    nodes: WorkflowNode[];
    /** Explicit start node id; defaults to `nodes[0]`. */
    start?: NodeId;
    settings?: WorkflowSettings;
    /**
     * Optional persisted canvas positions, keyed by node id (plus the synthetic
     * `"__start"` / `"end"` ids). Pure view-state for the builder — the compiler
     * ignores it. Absent ids fall back to auto-layout; clearing the map re-tidies.
     */
    layout?: Record<string, {
        x: number;
        y: number;
    }>;
}

/**
 * Graph primitives shared by validation, repair, and the traversal engine — the
 * ONE definition of "what does a node point at" and "where can we go from here",
 * so those three modules never drift.
 *
 * Everything here is PURE and TOLERANT: it never mutates input and never throws
 * on a malformed node.
 *
 * @packageDocumentation
 */

/**
 * `true` when a target terminates the path: absent, `null`, or the reserved
 * {@link END_NODE} sentinel. A terminal target is never a dangling reference.
 */
declare function isTerminal(next: NodeId | null | undefined): boolean;
/** An outgoing edge from a node, tagged with the structural role that produced it. */
interface NodeRef {
    target: NodeId;
    /** `"next" | "fallback" | "branch" | "else" | "parallel-branch" | "join"`. */
    role: string;
}
/**
 * Every NON-terminal outgoing reference of a node, in a stable order. Terminal
 * targets (`end`/null/absent) are omitted — callers checking for dangling refs or
 * building the reachable set only care about edges that must resolve.
 */
declare function nodeRefs(node: WorkflowNode): NodeRef[];
/** The set of node ids reachable from `startId` following {@link nodeRefs} edges. */
declare function reachableFrom(doc: WorkflowDoc, startId: NodeId): Set<NodeId>;
/** The effective start node id: explicit `doc.start`, else the first node. */
declare function startNodeId(doc: WorkflowDoc): NodeId | undefined;

/**
 * Diagnostics — the structured, machine-readable problems the engine reports
 * about a {@link import("./schema/types").WorkflowDoc}.
 *
 * Diagnostics are NEVER thrown. The engine is tolerant by contract: a malformed
 * workflow yields a {@link Diagnostic}, not an exception, so a corrupted draft
 * still loads and renders best-effort. Severity decides whether a problem should
 * block publish (`error`) or is merely advisory (`warning` / `info`).
 *
 * Codes are stable strings — treat them as an API surface (UIs and tests match
 * on them).
 *
 * @packageDocumentation
 */
/**
 * Every diagnostic code the workflow engine can emit.
 *
 * - `malformed-workflow` — not an object, or missing its `nodes` array.
 * - `missing-trigger`    — no valid trigger (`capability` + `type` required).
 * - `empty-workflow`     — the `nodes` array is empty.
 * - `malformed-node`     — a node is not an object or has no string `id`.
 * - `duplicate-node-id`  — two nodes share an id (references become ambiguous).
 * - `invalid-node-kind`  — a node's `kind` isn't one of action/task/branch/parallel/wait.
 * - `missing-capability` — an action/task node has no `capability`.
 * - `missing-action`     — an action node has no `action`.
 * - `missing-task`       — a task node has no `task`.
 * - `branch-no-conditions`— a branch has no conditions; it always takes `else` (warning).
 * - `expr-empty`         — a branch condition has an empty expression.
 * - `dangling-ref`       — a `next`/`else`/`fallback`/`join`/branch target points at an unknown node.
 * - `unreachable-node`   — a node is not reachable from the start (warning).
 * - `invalid-retry`      — a retry policy has `maxAttempts` < 1 (warning).
 * - `unknown-step-type`  — a node's (capability, kind) has no registered step type (registry check).
 */
type WorkflowDiagnosticCode = "malformed-workflow" | "missing-trigger" | "empty-workflow" | "malformed-node" | "duplicate-node-id" | "invalid-node-kind" | "missing-capability" | "missing-action" | "missing-task" | "branch-no-conditions" | "expr-empty" | "dangling-ref" | "unreachable-node" | "invalid-retry" | "unknown-step-type";
/** Alias kept parallel to sibling packages' naming. */
type DiagnosticCode = WorkflowDiagnosticCode;
/**
 * Diagnostic severity.
 *
 * - `error`   — blocks publish/check-in; the workflow is unsound.
 * - `warning` — advisory; the workflow still compiles but something is suspect.
 * - `info`    — purely informational.
 */
type DiagnosticSeverity = "error" | "warning" | "info";
/**
 * A single structured problem. `code` is the stable machine key; `message` is a
 * human-readable rendering; `nodeId` scopes node-level problems; `context`
 * carries code-specific data for richer UIs and assertions without parsing
 * `message`. Always present (possibly empty).
 */
interface Diagnostic {
    code: DiagnosticCode;
    severity: DiagnosticSeverity;
    /** The offending node, when the problem is node-scoped. */
    nodeId?: string;
    context: Readonly<Record<string, unknown>>;
    message: string;
}
/**
 * A batch of diagnostics with cheap derived flags, so callers can gate on
 * `hasErrors` without re-scanning.
 */
interface DiagnosticReport {
    diagnostics: readonly Diagnostic[];
    hasErrors: boolean;
    hasWarnings: boolean;
}
/** Build one {@link Diagnostic} with its required (possibly empty) context. */
declare function diag(code: DiagnosticCode, severity: DiagnosticSeverity, message: string, context?: Record<string, unknown>, nodeId?: string): Diagnostic;
/** Wrap a flat diagnostic list into a {@link DiagnosticReport} with derived flags. */
declare function toReport(diagnostics: readonly Diagnostic[]): DiagnosticReport;

/**
 * Static workflow validation — structural + referential soundness of the node
 * graph, emitting the engine's {@link Diagnostic} envelope.
 *
 * TOLERANT by contract: a malformed document yields a `malformed-workflow`
 * diagnostic, never an exception. Output is deterministic (document-level checks,
 * then nodes in array order, then reachability) so tests can assert on it.
 *
 * Errors should block check-in/publish; warnings are advisory. Expression *content*
 * analysis (parse/unknown-ident) is a later milestone — V1 only flags empty
 * branch expressions.
 *
 * @packageDocumentation
 */

/**
 * Full integrity check. Returns a flat, deterministically-ordered
 * {@link Diagnostic} list. Never throws.
 */
declare function validateWorkflow(doc: WorkflowDoc | null | undefined): Diagnostic[];
/** {@link validateWorkflow} wrapped as a {@link DiagnosticReport}. */
declare function validateWorkflowReport(doc: WorkflowDoc | null | undefined): DiagnosticReport;

/**
 * Workflow repair — the tolerant normalizer that turns a possibly-broken draft
 * into a structurally sound document the builder and compiler can work with.
 *
 * PURE (never mutates input; operates on a deep clone) and TOLERANT (never throws
 * on malformed input). Repairs are conservative and information-preserving where
 * possible:
 *
 *   1. Drop duplicate-id nodes (keep the first occurrence).
 *   2. Rewrite dangling `next`/`else`/`fallback`/`join` targets to `"end"` (the
 *      path terminates rather than dangling).
 *   3. Drop branch conditions and parallel branches whose target no longer exists.
 *
 * The trigger is never fabricated — repair can't invent intent. Callers still run
 * {@link import("./validate").validateWorkflow} afterwards to surface anything
 * repair could only flag, not fix (e.g. a missing trigger).
 *
 * @packageDocumentation
 */

/** The outcome of a repair pass. */
interface RepairResult {
    /** The repaired (deep-cloned) document. */
    doc: WorkflowDoc;
    /** Node ids dropped (duplicates or malformed). */
    removed: string[];
    /** Ids of nodes whose dangling references were rewritten/pruned. */
    rewired: string[];
}
/**
 * Normalize a workflow document. Always returns a `WorkflowDoc` (a minimal empty
 * one for input that isn't even shaped like a document).
 */
declare function repairWorkflow(input: WorkflowDoc | null | undefined): RepairResult;

/**
 * The JSON Schema (draft-07) for a {@link WorkflowDoc} — a portable artifact for
 * server-side validation (the `luke-core-engine` compiler), editor tooling, and
 * cross-language consumers that can't import the TypeScript types.
 *
 * This is a STRUCTURAL contract only. The authoritative semantic checks
 * (dangling refs, reachability, retry sanity) live in
 * {@link import("./validate").validateWorkflow}; keep the two in sync when the
 * model changes.
 *
 * @packageDocumentation
 */
/** Draft-07 JSON Schema describing the stored workflow document. */
declare const workflowJsonSchema: {
    readonly $schema: "http://json-schema.org/draft-07/schema#";
    readonly $id: "https://lukeflow.com/schemas/workflow.json";
    readonly title: "LukeflowWorkflow";
    readonly type: "object";
    readonly required: readonly ["id", "version", "trigger", "nodes"];
    readonly additionalProperties: false;
    readonly properties: {
        readonly id: {
            readonly type: "string";
        };
        readonly version: {
            readonly type: "integer";
            readonly minimum: 0;
        };
        readonly name: {
            readonly type: "string";
        };
        readonly start: {
            readonly type: "string";
        };
        readonly trigger: {
            readonly type: "object";
            readonly required: readonly ["capability", "type"];
            readonly properties: {
                readonly capability: {
                    readonly type: "string";
                };
                readonly type: {
                    readonly type: "string";
                };
                readonly config: {
                    readonly type: "object";
                };
            };
        };
        readonly settings: {
            readonly type: "object";
            readonly properties: {
                readonly defaultErrorPolicy: {
                    readonly $ref: "#/definitions/errorPolicy";
                };
            };
        };
        readonly nodes: {
            readonly type: "array";
            readonly items: {
                readonly oneOf: readonly [{
                    readonly $ref: "#/definitions/actionNode";
                }, {
                    readonly $ref: "#/definitions/taskNode";
                }, {
                    readonly $ref: "#/definitions/branchNode";
                }, {
                    readonly $ref: "#/definitions/parallelNode";
                }, {
                    readonly $ref: "#/definitions/waitNode";
                }];
            };
        };
    };
    readonly definitions: {
        readonly nodeId: {
            readonly type: readonly ["string", "null"];
        };
        readonly retryPolicy: {
            readonly type: "object";
            readonly required: readonly ["maxAttempts", "backoff", "initialDelay"];
            readonly properties: {
                readonly maxAttempts: {
                    readonly type: "integer";
                    readonly minimum: 1;
                };
                readonly backoff: {
                    readonly enum: readonly ["fixed", "exponential"];
                };
                readonly initialDelay: {
                    readonly type: "string";
                };
            };
        };
        readonly errorPolicy: {
            readonly type: "object";
            readonly properties: {
                readonly retry: {
                    readonly $ref: "#/definitions/retryPolicy";
                };
                readonly fallback: {
                    readonly $ref: "#/definitions/nodeId";
                };
                readonly deadLetter: {
                    readonly type: "boolean";
                };
            };
        };
        readonly actionNode: {
            readonly type: "object";
            readonly required: readonly ["id", "kind", "capability", "action"];
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                };
                readonly kind: {
                    readonly const: "action";
                };
                readonly name: {
                    readonly type: "string";
                };
                readonly capability: {
                    readonly type: "string";
                };
                readonly action: {
                    readonly type: "string";
                };
                readonly provider: {
                    readonly type: "string";
                };
                readonly connection: {
                    readonly type: "string";
                };
                readonly input: {
                    readonly type: "object";
                };
                readonly output: {
                    readonly type: "string";
                };
                readonly onError: {
                    readonly $ref: "#/definitions/errorPolicy";
                };
                readonly next: {
                    readonly $ref: "#/definitions/nodeId";
                };
            };
        };
        readonly taskNode: {
            readonly type: "object";
            readonly required: readonly ["id", "kind", "capability", "task"];
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                };
                readonly kind: {
                    readonly const: "task";
                };
                readonly name: {
                    readonly type: "string";
                };
                readonly capability: {
                    readonly type: "string";
                };
                readonly task: {
                    readonly type: "string";
                };
                readonly assignee: {
                    readonly type: "string";
                };
                readonly input: {
                    readonly type: "object";
                };
                readonly onError: {
                    readonly $ref: "#/definitions/errorPolicy";
                };
                readonly next: {
                    readonly $ref: "#/definitions/nodeId";
                };
            };
        };
        readonly branchNode: {
            readonly type: "object";
            readonly required: readonly ["id", "kind", "conditions"];
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                };
                readonly kind: {
                    readonly const: "branch";
                };
                readonly name: {
                    readonly type: "string";
                };
                readonly conditions: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly required: readonly ["expr", "next"];
                        readonly properties: {
                            readonly expr: {
                                readonly type: "string";
                            };
                            readonly next: {
                                readonly type: "string";
                            };
                        };
                    };
                };
                readonly else: {
                    readonly $ref: "#/definitions/nodeId";
                };
            };
        };
        readonly parallelNode: {
            readonly type: "object";
            readonly required: readonly ["id", "kind", "branches"];
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                };
                readonly kind: {
                    readonly const: "parallel";
                };
                readonly name: {
                    readonly type: "string";
                };
                readonly branches: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly join: {
                    readonly $ref: "#/definitions/nodeId";
                };
            };
        };
        readonly waitNode: {
            readonly type: "object";
            readonly required: readonly ["id", "kind", "mode"];
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                };
                readonly kind: {
                    readonly const: "wait";
                };
                readonly name: {
                    readonly type: "string";
                };
                readonly mode: {
                    readonly enum: readonly ["timer", "event"];
                };
                readonly duration: {
                    readonly type: "string";
                };
                readonly event: {
                    readonly type: "object";
                    readonly required: readonly ["capability", "type"];
                    readonly properties: {
                        readonly capability: {
                            readonly type: "string";
                        };
                        readonly type: {
                            readonly type: "string";
                        };
                        readonly correlationKey: {
                            readonly type: "string";
                        };
                    };
                };
                readonly next: {
                    readonly $ref: "#/definitions/nodeId";
                };
            };
        };
    };
};

/**
 * The step-type registry contract (WF-1) — the shared vocabulary that lets
 * WORKFLOW *compose* capabilities instead of integrating each one bespoke.
 *
 * Every capability (FORMS, EMAIL, PHONE, SIGN, DOCUMENTS, INTEGRATIONS) publishes
 * **step-type descriptors** as DATA. `luke-core-engine` aggregates them into a
 * catalog endpoint; the builder fetches it to render the palette and auto-generate
 * config forms; the compiler/executor read the same descriptors. Adding a
 * capability = publishing descriptors, no builder code change.
 *
 * This module owns only the TYPES + the canonical envelopes the two runtime rails
 * speak. The in-memory registry helper lives in `./registry`.
 *
 * @packageDocumentation
 */

/** A JSON-Schema-shaped object (kept loose so descriptors stay plain data). */
type JsonSchemaObject = Record<string, unknown>;
/** The control kinds the builder's auto-generated input form knows how to render. */
type StepFieldType = "text" | "textarea" | "number" | "boolean" | "select" | "expression";
/** One option for a {@link StepFieldDescriptor} of type `"select"`. */
interface StepFieldOption {
    value: string;
    label: string;
}
/**
 * A single typed input a step type declares — a flat, purpose-built field descriptor
 * the builder auto-renders into a labelled control (vs. the raw key/value editor).
 * A capability publishes these on its {@link StepTypeDescriptor.inputs}; unknown/extra
 * keys on a node still fall back to the generic key/value editor, so this is additive.
 */
interface StepFieldDescriptor {
    /** The node-input key this field writes, e.g. `"to"`, `"subject"`. */
    key: string;
    /** Human label for the control. */
    label: string;
    /** Control kind; defaults to `"text"`. */
    type?: StepFieldType;
    required?: boolean;
    placeholder?: string;
    /** Short helper text under the control. */
    help?: string;
    /** Options for `type: "select"`. */
    options?: StepFieldOption[];
}
/**
 * The three step kinds a capability can contribute, mirroring the Trigger / Action
 * / Task duality:
 *
 * - `trigger` — an inbound event that starts/advances a process (inbound rail).
 * - `action`  — an outbound effect (outbound rail).
 * - `task`    — a human/async assignment that waits for completion (both rails).
 */
type StepTypeKind = "trigger" | "action" | "task";
/**
 * A single step type a capability offers. `id` is the stable descriptor key
 * (e.g. `"integration.action"`, `"email.send"`, `"forms.review"`); the concrete
 * operation a node names (`node.action` / `node.task`) is resolved against this
 * descriptor's schemas.
 */
interface StepTypeDescriptor {
    /** Stable descriptor id, unique within the catalog. */
    id: string;
    /** Human label for the palette. */
    label: string;
    capability: CapabilityId;
    kind: StepTypeKind;
    /** Palette grouping hint for the builder. */
    paletteGroup?: string;
    /** Typed input fields the builder auto-renders for this step (additive to the raw
     *  key/value editor). Absent/empty → the generic editor only. */
    inputs?: StepFieldDescriptor[];
    /** Schema for the node's authoring config (drives the auto-generated panel). */
    configSchema?: JsonSchemaObject;
    /** Schema for the runtime input map. */
    inputSchema?: JsonSchemaObject;
    /** Schema for the produced output (for downstream variable typing). */
    outputSchema?: JsonSchemaObject;
}
/** The aggregated catalog served by core-engine and consumed by the builder. */
interface StepTypeCatalog {
    steps: StepTypeDescriptor[];
}
/**
 * The canonical INBOUND envelope — what every Trigger and Task-completion emits
 * onto the inbound rail (outbox → Camunda message correlation). The dispatcher
 * correlates on `(tenant, correlationKey)`; a message-start trigger needs no
 * correlation key.
 */
interface WorkflowEventEnvelope {
    /** Emitting capability, e.g. `"forms"`. */
    source: CapabilityId;
    tenant: string;
    /** Event type, e.g. `"form.submitted"`. */
    type: string;
    /** Correlation key to advance a waiting instance (omitted for start events). */
    correlationKey?: string;
    /** Stable business key threaded through the process (e.g. submission id). */
    businessKey?: string;
    payload: Record<string, unknown>;
}
/**
 * The canonical OUTBOUND envelope — what the job worker dispatches on the outbound
 * rail to a capability's executor. `idempotencyKey` is the Camunda
 * `elementInstanceKey` so retries are exactly-once.
 */
interface WorkflowCommandEnvelope {
    /** Target capability, e.g. `"integrations"`. */
    target: CapabilityId;
    /** Operation, e.g. `"upsertOpportunity"`. */
    action: string;
    /** Connection selector/id for integration actions. */
    connection?: string;
    input: Record<string, unknown>;
    idempotencyKey: string;
}

/**
 * The in-memory step-type registry + the bridge that ties it to workflow
 * validation.
 *
 * The registry is a thin, pure index over {@link StepTypeDescriptor}s: register
 * descriptors, then resolve a workflow node's `(capability, kind)` to the step
 * type that backs it. `missingStepTypes` turns "this node has no registered step
 * type" into the `unknown-step-type` diagnostic, so the builder can gate on a
 * tenant's actual capability set.
 *
 * Node kinds map to step-type kinds: `action → action`, `task → task`; structural
 * kinds (`branch`/`parallel`/`wait`) are native workflow control flow and are NOT
 * backed by capability step types.
 *
 * @packageDocumentation
 */

/** A pure, in-memory index of step-type descriptors. */
interface StepTypeRegistry {
    /** Register one descriptor (last registration for an id wins). */
    register(descriptor: StepTypeDescriptor): void;
    /** All descriptors, in registration order. */
    all(): StepTypeDescriptor[];
    /** Look up by descriptor id. */
    get(id: string): StepTypeDescriptor | undefined;
    has(id: string): boolean;
    byCapability(capability: CapabilityId): StepTypeDescriptor[];
    byKind(kind: StepTypeKind): StepTypeDescriptor[];
    /** Resolve the descriptor backing a `(capability, kind)` pair, if any. */
    resolve(capability: CapabilityId, kind: StepTypeKind): StepTypeDescriptor | undefined;
}
/** Create a registry, optionally seeded with descriptors. */
declare function createStepTypeRegistry(seed?: readonly StepTypeDescriptor[]): StepTypeRegistry;
/**
 * Diagnostics for nodes whose `(capability, kind)` isn't registered — i.e. the
 * tenant hasn't subscribed to the capability, or a typo. Structural nodes
 * (branch/parallel/wait) are ignored. Never throws.
 */
declare function missingStepTypes(doc: WorkflowDoc, registry: StepTypeRegistry): Diagnostic[];

/**
 * `createWorkflowEngine` — the thin, headless façade over a workflow document
 * (mirrors `createFormEngine` in `@lukeflow/form-core`).
 *
 * It does NOT execute anything (execution is Camunda's job, server-side). It
 * bundles the pure operations a builder/tool needs against a single document:
 * validation, reachability, and graph traversal — with an optional up-front
 * repair pass.
 *
 * @packageDocumentation
 */

/** Options for {@link createWorkflowEngine}. */
interface WorkflowEngineOptions {
    /** Run {@link repairWorkflow} on the input before anything else. Default `false`. */
    repair?: boolean;
}
/** A read-only view over one workflow document with traversal + diagnostics. */
interface WorkflowEngine {
    /** The (possibly repaired) document. */
    readonly doc: WorkflowDoc;
    /** Node ids dropped by the repair pass (empty when `repair` was off). */
    readonly removed: readonly string[];
    /** Static diagnostics for the document. */
    validate(): Diagnostic[];
    /** Diagnostics wrapped with `hasErrors`/`hasWarnings`. */
    report(): DiagnosticReport;
    /** The effective start node id (explicit `start`, else first node). */
    startId(): NodeId | undefined;
    /** Look up a node by id. */
    nodeById(id: NodeId): WorkflowNode | undefined;
    /** Non-terminal successor node ids of a node. */
    successors(id: NodeId): NodeId[];
    /** The set of node ids reachable from the start. */
    reachable(): Set<NodeId>;
    /** Whether a target terminates the path (`end`/null/absent). */
    isTerminal(next: NodeId | null | undefined): boolean;
}
/** Build a {@link WorkflowEngine} over `input`. */
declare function createWorkflowEngine(input: WorkflowDoc, options?: WorkflowEngineOptions): WorkflowEngine;

/**
 * The golden fixture — the worked end-to-end scenario from WORKFLOW_V1_BACKLOG.md,
 * touching all four runtime patterns in one workflow:
 *
 *   form submitted (FORMS Trigger)
 *     → send confirmation (EMAIL Action)
 *     → route to an ops reviewer (FORMS Task: assign + wait)
 *     → if high value, upsert the opportunity in Salesforce (INTEGRATIONS Action)
 *       (on give-up, notify ops — EMAIL Action)
 *
 * Every milestone traces back to this fixture: it must validate clean, be fully
 * reachable, and resolve against the reference step-type registry.
 *
 * @packageDocumentation
 */

/** The canonical valid workflow used across the test suite. */
declare const goldenWorkflow: WorkflowDoc;
/**
 * The reference step-type descriptors the golden fixture resolves against — one
 * per `(capability, kind)` the fixture uses. Stand-in for what each capability
 * will publish into the core-engine catalog.
 */
declare const referenceStepTypes: StepTypeDescriptor[];

/** @lukeflow/workflow-core — the headless Lukeflow workflow engine (authoring model). */
declare const VERSION = "0.1.0-alpha.0";

export { type ActionNode, type BackoffStrategy, type BranchCondition, type BranchNode, type CapabilityId, type Diagnostic, type DiagnosticCode, type DiagnosticReport, type DiagnosticSeverity, END_NODE, type ErrorPolicy, type ExpressionString, type JsonSchemaObject, type NodeId, type NodeKind, type NodeRef, type ParallelNode, type RepairResult, type RetryPolicy, type StepFieldDescriptor, type StepFieldOption, type StepFieldType, type StepTypeCatalog, type StepTypeDescriptor, type StepTypeKind, type StepTypeRegistry, type TaskNode, VERSION, type WaitMode, type WaitNode, type WorkflowCommandEnvelope, type WorkflowDiagnosticCode, type WorkflowDoc, type WorkflowEngine, type WorkflowEngineOptions, type WorkflowEventEnvelope, type WorkflowNode, type WorkflowSettings, type WorkflowTrigger, createStepTypeRegistry, createWorkflowEngine, diag, goldenWorkflow, isTerminal, missingStepTypes, nodeRefs, reachableFrom, referenceStepTypes, repairWorkflow, startNodeId, toReport, validateWorkflow, validateWorkflowReport, workflowJsonSchema };
