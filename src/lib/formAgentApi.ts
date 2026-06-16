// Client for the luke-agents form agent (the AI form builder).
//
// The agent is a stateless schema generator: given the CURRENT coltorapps
// schema ({entities, root}) plus a natural-language instruction, it returns the
// COMPLETE updated schema, which we then saveDraft + reload into the builder.
//
// luke-agents runs as its own service (hosting the agent fleet under
// /agents/<slug>), so its base URL is configured separately from the main API.
// VITE_FORM_AGENT_URL is the luke-agents service base; we hit the form agent's
// canonical endpoint at /agents/form/chat. Falls back to the known deployment.

const AGENT_URL = (
  import.meta.env.VITE_FORM_AGENT_URL || "https://luke-agents.onrender.com"
).replace(/\/$/, "");

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
  brain: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask the agent to build/edit a form. Retries a couple of times on a free-tier
 * cold start (the service returns an HTML wake-up page / 502 while spinning up).
 */
export async function generateSchema(
  message: string,
  schema: BuilderSchemaLike,
  title?: string,
  userId?: string,
  attempt = 1,
): Promise<AgentResult> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}/agents/form/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, schema, title, user_id: userId }),
    });
  } catch (e) {
    throw new Error(
      `Couldn't reach the form assistant. ${(e as Error).message ?? ""}`.trim(),
    );
  }

  // Read as text so a non-JSON cold-start page can't throw "Unexpected token <".
  const raw = await res.text();
  let data: (AgentResult & { detail?: string }) | null = null;
  try {
    data = JSON.parse(raw);
  } catch {
    /* HTML / empty — treated as cold start below */
  }

  if (!res.ok || data === null) {
    const coldStart = res.status === 502 || res.status === 503 || data === null;
    if (coldStart && attempt < 3) {
      await sleep(4000);
      return generateSchema(message, schema, title, userId, attempt + 1);
    }
    const detail =
      (data && data.detail) || `The form assistant is unavailable (HTTP ${res.status}).`;
    throw new Error(typeof detail === "string" ? detail : "Form assistant error");
  }

  return data as AgentResult;
}

export type TestData = {
  /** Map of field key -> a value to enter into the form. */
  values: Record<string, unknown>;
  /** Short note, e.g. which rules the invalid values break. */
  notes?: string;
  brain: string;
};

/**
 * Ask LukeTalks to generate test data for a form: `valid` data that should pass
 * validation, or `invalid` data that should be rejected. Used to drive the
 * builder's Test runs with realistic values instead of dumb auto-fill.
 */
export async function generateTestData(
  schema: BuilderSchemaLike,
  mode: "valid" | "invalid",
  title?: string,
  userId?: string,
): Promise<TestData> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}/agents/form/testdata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema, mode, title, user_id: userId }),
    });
  } catch (e) {
    throw new Error(`Couldn't reach the form assistant. ${(e as Error).message ?? ""}`.trim());
  }
  const raw = await res.text();
  let data: (TestData & { detail?: string }) | null = null;
  try {
    data = JSON.parse(raw);
  } catch {
    /* non-JSON */
  }
  if (!res.ok || data === null) {
    const detail =
      (data && data.detail) || `The form assistant is unavailable (HTTP ${res.status}).`;
    throw new Error(typeof detail === "string" ? detail : "Form assistant error");
  }
  return data as TestData;
}

/** Was a cold start likely (so callers can show a "waking up" hint)? */
export const AGENT_BASE_URL = AGENT_URL;
