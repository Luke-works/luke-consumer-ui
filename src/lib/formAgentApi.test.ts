import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateSchema, normalizeAgentSchema, AgentCancelledError, type BuilderSchemaLike } from "./formAgentApi";
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
    vi.stubEnv("VITE_FORM_AGENT_URL", "https://agents.test"); // configured base (#32)
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

  it("sends the tenant header and no client user id (#32)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { schema: EMPTY, title: "x", brain: "b" }));
    vi.stubGlobal("fetch", fetchMock);

    await generateSchema("hi", EMPTY, "T", "tenant-acme");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://agents.test/agents/form/chat");
    expect(init.headers["X-Tenant-Id"]).toBe("tenant-acme");
    expect(JSON.parse(init.body)).not.toHaveProperty("user_id");
  });

  it("attaches X-Tenant-Tier when a plan tier is cached (sizes the AI token budget)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { schema: EMPTY, title: "x", brain: "b" }));
    vi.stubGlobal("fetch", fetchMock);
    setCurrentTier("PRO");

    await generateSchema("hi", EMPTY, "T", "tenant-acme");

    expect(fetchMock.mock.calls[0][1].headers["X-Tenant-Tier"]).toBe("PRO");
  });

  it("omits X-Tenant-Tier when the tier is unknown (agents fall back to the flat cap)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { schema: EMPTY, title: "x", brain: "b" }));
    vi.stubGlobal("fetch", fetchMock);
    setCurrentTier(null);

    await generateSchema("hi", EMPTY, "T", "tenant-acme");

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("X-Tenant-Tier");
  });

  it("fails fast (no public fallback) when VITE_FORM_AGENT_URL is unset (#32)", async () => {
    vi.stubEnv("VITE_FORM_AGENT_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateSchema("hi", EMPTY)).rejects.toThrow(/isn.?t configured|VITE_FORM_AGENT_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
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
