import { WorkflowNode, WorkflowTrigger, WorkflowDoc, StepTypeDescriptor, NodeId } from '@lukeflow/workflow-core';
import * as react from 'react';

/**
 * The doc ↔ visual-graph mapping — the pure, React-free core of the builder.
 *
 * {@link docToFlow} lays a {@link WorkflowDoc} out as a left-to-right node graph (a
 * synthetic start node for the trigger, one node per step, a shared end node); every
 * outgoing reference — `next`, branch conditions + `else`, `onError.fallback`, parallel
 * branches + `join` — becomes a role-tagged edge. {@link flowToDoc} reads an edited graph
 * back into a document, rewiring those references from the edges.
 *
 * Kept dependency-light (only the core model) so it is trivially unit-testable and the
 * React canvas is a thin projection of these shapes.
 *
 * @packageDocumentation
 */

/** The synthetic trigger node's id (not a real workflow node). */
declare const START_ID = "__start";
/** The shared terminal node's id — equals the model's {@link END_NODE} sentinel. */
declare const END_ID = "end";
/** A positioned node in the visual graph. `data.node` is absent for start/end. */
interface WfFlowNode {
    id: string;
    /** `action | task | branch | parallel | wait | start | end`. */
    kind: string;
    label: string;
    position: {
        x: number;
        y: number;
    };
    data: {
        node?: WorkflowNode;
        trigger?: WorkflowTrigger;
    };
}
/** A role-tagged edge; `label` carries a branch condition expression when present. */
interface WfFlowEdge {
    id: string;
    source: string;
    target: string;
    /** `next | fallback | branch | else | parallel-branch | join`. */
    role: string;
    label?: string;
}
/** The visual graph: positioned nodes + role-tagged edges. */
interface WfFlow {
    nodes: WfFlowNode[];
    edges: WfFlowEdge[];
}
/** Project a document onto a positioned, edge-wired visual graph. */
declare function docToFlow(doc: WorkflowDoc): WfFlow;
/** Read an edited visual graph back into a document, rewiring references from the edges. */
declare function flowToDoc(flow: WfFlow, base: WorkflowDoc): WorkflowDoc;

/**
 * The builder palette — the step types a tenant can drop onto the canvas, grouped for
 * display. Built from the catalog the host fetches from `GET /api/workflow/catalog`
 * (filtered to the tenant's subscribed capabilities), so the palette is data-driven:
 * a new capability appears simply by publishing descriptors.
 *
 * @packageDocumentation
 */

/** A named group of step types for the palette sidebar. */
interface PaletteGroup {
    group: string;
    items: StepTypeDescriptor[];
}
/** Group descriptors by {@link StepTypeDescriptor.paletteGroup} (falling back to capability). */
declare function buildPalette(steps: readonly StepTypeDescriptor[]): PaletteGroup[];

/**
 * Pure editing operations on a {@link WorkflowDoc} — the testable core behind the
 * builder's interactions (mirrors `@lukeflow/form-core`'s builder operations). Every
 * function returns a NEW document and never mutates its input, so the React canvas is a
 * thin controlled projection: an interaction computes `next = op(value, …)` and calls
 * `onChange(next)`.
 *
 * @packageDocumentation
 */

/** Mint a fresh `n<N>` id not already used in the document. */
declare function newNodeId(doc: WorkflowDoc): NodeId;
/** Append a node built from a catalog descriptor (a palette drop). Starts disconnected (`next: end`). */
declare function addStep(doc: WorkflowDoc, descriptor: StepTypeDescriptor): WorkflowDoc;
/** Append a structural (control-flow) node — branch / parallel / wait — with sane defaults. */
declare function addStructural(doc: WorkflowDoc, kind: "branch" | "parallel" | "wait"): WorkflowDoc;
/** Shallow-merge a patch into the node with {@link id}. */
declare function updateNode(doc: WorkflowDoc, id: NodeId, patch: Record<string, unknown>): WorkflowDoc;
/** Remove a node and repair any references that pointed at it (dangling → `end`). */
declare function removeNode(doc: WorkflowDoc, id: NodeId): WorkflowDoc;
/**
 * Wire {@link sourceId} to {@link targetId}. For linear nodes this sets `next`; for a
 * branch it appends a condition (or sets `else` when `role === "else"`); for a parallel it
 * adds a branch (or sets `join`).
 */
declare function connectNodes(doc: WorkflowDoc, sourceId: NodeId, targetId: NodeId, role?: "next" | "else" | "branch" | "join" | "parallel-branch"): WorkflowDoc;

/**
 * A tenant integration connection the host injects for the connection picker (a
 * projection of the engine's IntegrationConnection — the builder stays free of any
 * consumer types).
 */
interface ConnectionOption {
    id: string;
    providerKey: string;
    status?: string;
    externalAccount?: string | null;
}

/** Props for {@link WorkflowBuilder}. */
interface WorkflowBuilderProps {
    /** The workflow document to render/edit. */
    value: WorkflowDoc;
    /** The step-type catalog (from `GET /api/workflow/catalog`), for the palette + trigger picker. */
    stepTypes: readonly StepTypeDescriptor[];
    /** Tenant integration connections (from `GET /api/workflow/integrations/connections`), for the
     *  integration-action connection picker. Optional — the picker shows an empty-state hint without them. */
    connections?: readonly ConnectionOption[];
    /** Notified with the next document on every edit. Omit for a read-only canvas. */
    onChange?: (doc: WorkflowDoc) => void;
    /** Optional class for the outer container. */
    className?: string;
}
/** The visual workflow designer. */
declare function WorkflowBuilder({ value, stepTypes, connections, onChange, className }: WorkflowBuilderProps): react.JSX.Element;

export { type ConnectionOption, END_ID, type PaletteGroup, START_ID, type WfFlow, type WfFlowEdge, type WfFlowNode, WorkflowBuilder, type WorkflowBuilderProps, addStep, addStructural, buildPalette, connectNodes, docToFlow, flowToDoc, newNodeId, removeNode, updateNode };
