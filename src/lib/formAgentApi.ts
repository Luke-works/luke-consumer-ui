// Client for the luke-agents form agent (the AI form builder).
//
// The agent is a stateless schema generator: given the CURRENT coltorapps
// schema ({entities, root}) plus a natural-language instruction, it returns the
// COMPLETE updated schema, which we then saveDraft + reload into the builder.
//
// luke-agents (an approved AI sub-processor) hosts the agent fleet under
// /agents/<slug>, but the browser no longer talks to it: every call goes through
// core-engine at /api/ai, which authenticates the caller and attaches the WORKSPACE'S
// OWN provider key (bring-your-own-key). See lib/agentTransport.ts for why.

import { camelCaseKeys, repairSchema, type FormSchema } from "@lukeflow/form-core";
import { agentPost } from "./agentTransport";


/** coltorapps builder schema — kept loose here; the builder owns the real type. */
export type BuilderSchemaLike = { entities: Record<string, unknown>; root: string[] };

export type AgentResult = {
  schema: BuilderSchemaLike;
  title: string;
  /** Natural-language message describing what the assistant did. */
  reply?: string;
  /** Short, clickable next-step ideas tailored to the form. */
  suggestions?: string[];
  /** False when the form was left untouched (e.g. the user asked a question). */
  changed?: boolean;
  /** A lifecycle action the user asked for conversationally, for the app to run (gated). */
  action?: "checkin" | "publish" | "undo_checkout" | null;
  brain: string;
};

// Cancellation is the shared transport's; re-exported so the `instanceof` checks in the
// AI panels keep working against the one class.
export { AgentCancelledError, AgentProviderRequiredError } from "./agentTransport";

const LABEL = "form assistant";

const postWithRetry = <T,>(path: string, body: unknown, tenant?: string, signal?: AbortSignal) =>
  agentPost<T>(path, body, tenant, signal, LABEL);

/**
 * Ask the agent to build/edit a form. Retries on a free-tier cold start with
 * backoff; pass `signal` to cancel a slow request.
 */
export function generateSchema(
  message: string,
  schema: BuilderSchemaLike,
  title?: string,
  tenant?: string,
  signal?: AbortSignal,
  kind?: string,
): Promise<AgentResult> {
  return postWithRetry<AgentResult>(
    "/agents/form/chat",
    { message, schema, title, kind }, // no client user id — the tenant scopes the call
    tenant,
    signal,
  );
}

/** One generated dataset: field key -> value, plus a short note. */
export type TestDataset = {
  values: Record<string, unknown>;
  notes?: string;
};
export type TestDataResult = {
  datasets: TestDataset[];
  brain: string;
};

/**
 * Ask LukeTests to generate `count` distinct test datasets for a form: `valid`
 * data that should pass validation, or `invalid` data that should be rejected.
 * Drives the builder's Test runs with realistic/varied values. Retries a couple
 * of times on a free-tier cold start (like generateSchema).
 */
export function generateTestData(
  schema: BuilderSchemaLike,
  mode: "valid" | "invalid",
  count = 3,
  title?: string,
  tenant?: string,
  signal?: AbortSignal,
): Promise<TestDataResult> {
  return postWithRetry<TestDataResult>(
    "/agents/form/testdata",
    { schema, mode, count, title }, // no client user id — the tenant scopes the call
    tenant,
    signal,
  );
}

/**
 * Bridge an agent-produced schema into the form-core shape the builder/renderer consume.
 *
 * The agent emits coltorapps-format schemas: each entity's id lives ONLY as its map key
 * (there's no inner `id` field) and field keys are snake_case. The @lukeflow/form-builder
 * canvas and @lukeflow/form-react renderer read `entity.id` (for the control id, error id,
 * aria wiring, React keys…) and expect camelCase keys — so an un-normalized agent schema
 * renders every field with `id === undefined` and breaks. Stamp each entity's id from its
 * map key, camelCase the keys, then repair tree integrity. Idempotent, so it's safe to run
 * at every boundary the agent's output enters (persist + apply).
 */
export function normalizeAgentSchema(schema: BuilderSchemaLike): BuilderSchemaLike {
  const entities = (schema?.entities ?? {}) as Record<string, Record<string, unknown>>;
  const withIds = {
    ...schema,
    entities: Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, { ...e, id }])),
  } as unknown as FormSchema;
  return repairSchema(camelCaseKeys(withIds)).schema as unknown as BuilderSchemaLike;
}
