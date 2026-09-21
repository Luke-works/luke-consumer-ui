import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSchema,
  normalizeAgentSchema,
  AgentCancelledError,
  AgentProviderRequiredError,
  type BuilderSchemaLike,
} from "./formAgentApi";
import { setCurrentTier } from "./planTier";

const EMPTY: BuilderSchemaLike = { entities: {}, root: [] };

function jsonRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}
function htmlRes(status: number) {
  return { ok: status >= 200 && status < 300, status, text: async () => "<html>waking up…</html>" };
}

describe("formAgentApi (#40)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Deliberately still set: nothing should read it any more (calls go to core-engine).
    vi.stubEnv("VITE_FORM_AGENT_URL", "https://agents.test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    setCurrentTier(null); // reset the module-level tier cache between tests
  });

  it("retries a 502 cold start (with backoff) then returns the parsed result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(502, { detail: "cold" }))
      .mockResolvedValueOnce(jsonRes(200, { schema: EMPTY, title: "T", brain: "b" }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateSchema("hi", EMPTY);
    expect(r.title).toBe("T");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15000);

  it("treats a non-JSON wake-up page as transient and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlRes(200))
      .mockResolvedValueOnce(jsonRes(200, { schema: EMPTY, title: "OK", brain: "b" }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateSchema("hi", EMPTY);
    expect(r.title).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15000);

  it("does NOT retry a deterministic 4xx and surfaces the detail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(400, { detail: "bad input" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateSchema("hi", EMPTY)).rejects.toThrow(/bad input/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes an AbortSignal to fetch (per-attempt timeout / cancel)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { schema: EMPTY, title: "x", brain: "b" }));
    vi.stubGlobal("fetch", fetchMock);

    await generateSchema("hi", EMPTY);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects with AgentCancelledError when the caller signal is already aborted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ac = new AbortController();
    ac.abort();

    await expect(generateSchema("hi", EMPTY, undefined, undefined, ac.signal)).rejects.toBeInstanceOf(
      AgentCancelledError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("goes through core-engine, not straight to the agents service (BYO-key)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { schema: EMPTY, title: "x", brain: "b" }));
    vi.stubGlobal("fetch", fetchMock);

    await generateSchema("hi", EMPTY, "T", "tenant-acme");

    const [url, init] = fetchMock.mock.calls[0];
    // The browser must NOT reach luke-agents: core-engine is what holds the workspace's
    // provider key, and what proves the caller may act for that workspace.
    expect(url).toBe("/api/ai/agents/form/chat");
    expect(url).not.toContain("agents.test");
    expect(init.headers["X-Tenant-Id"]).toBe("tenant-acme");
    expect(JSON.parse(init.body)).not.toHaveProperty("user_id");
  });

  it("surfaces a 402 as 'connect a provider' and never retries it", async () => {
    // No key, or a key the provider refused. Retrying cannot make one appear, and the UI
    // needs to tell these apart from a failure so it can offer the connect page.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonRes(402, { detail: "Connect an AI provider to use the assistant." }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateSchema("hi", EMPTY, "T", "tenant-acme")).rejects.toBeInstanceOf(
      AgentProviderRequiredError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends only headers the gateway's CORS allow-list accepts", async () => {
    // The allow-list is Authorization / Content-Type / Accept / X-Tenant-Id. Anything else
    // makes the preflight fail and blocks EVERY AI call — invisible to a mocked fetch, which
    // is exactly how X-Tenant-Tier survived here once.
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { schema: EMPTY, title: "x", brain: "b" }));
    vi.stubGlobal("fetch", fetchMock);
    setCurrentTier("PRO");

    await generateSchema("hi", EMPTY, "T", "tenant-acme");

    const allowed = new Set(["Authorization", "Content-Type", "Accept", "X-Tenant-Id"]);
    const sent = Object.keys(fetchMock.mock.calls[0][1].headers);
    expect(sent.filter((h) => !allowed.has(h))).toEqual([]);
    // The tier is decided server-side now: it sizes a spend cap, so the browser doesn't pick it.
    expect(sent).not.toContain("X-Tenant-Tier");
  });

  it("surfaces core-engine's own error message, not just the fleet's", async () => {
    // Two envelopes reach us: the engine's {error, message, status} for anything it decides
    // itself, and FastAPI's {detail} for a passed-through fleet body. Reading only `detail`
    // reduced every engine-side refusal to a bare HTTP code.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonRes(403, { error: "Forbidden", message: "You don't have access to use the assistant here.", status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateSchema("hi", EMPTY, "T", "tenant-acme")).rejects.toThrow(
      /don't have access to use the assistant/,
    );
  });

  it("still reads the fleet's FastAPI-shaped detail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(402, { detail: "Your AI provider rejected this key." }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateSchema("hi", EMPTY, "T", "tenant-acme")).rejects.toThrow(/rejected this key/);
  });

});

// The agent emits coltorapps schemas (entity id only as map key, snake_case keys); the form-core
// builder/renderer read entity.id + expect camelCase. normalizeAgentSchema bridges the gap — this
// is what was missing when LukeBuilds "broke" after the builder cutover.
describe("normalizeAgentSchema", () => {
  it("stamps each entity's inner id from its map key (form-core reads entity.id)", () => {
    const agent: BuilderSchemaLike = {
      entities: {
        "ent-1": { type: "textField", attributes: { key: "first_name", label: "First Name", required: true } },
        "ent-2": { type: "textField", attributes: { key: "last_name", label: "Last Name" } },
      },
      root: ["ent-1", "ent-2"],
    };
    const out = normalizeAgentSchema(agent) as { entities: Record<string, { id?: string }>; root: string[] };
    expect(out.entities["ent-1"].id).toBe("ent-1");
    expect(out.entities["ent-2"].id).toBe("ent-2");
    expect(out.root).toEqual(["ent-1", "ent-2"]);
  });

  it("camelCases snake_case field keys", () => {
    const out = normalizeAgentSchema({
      entities: { a: { type: "textField", attributes: { key: "first_name" } } },
      root: ["a"],
    }) as { entities: Record<string, { attributes: { key: string } }> };
    expect(out.entities["a"].attributes.key).not.toContain("_");
  });

  it("is idempotent (safe to run at both the persist and apply boundaries)", () => {
    const input: BuilderSchemaLike = {
      entities: { a: { type: "textField", attributes: { key: "full_name" } } },
      root: ["a"],
    };
    const once = normalizeAgentSchema(input);
    expect(normalizeAgentSchema(once)).toEqual(once);
  });
});
