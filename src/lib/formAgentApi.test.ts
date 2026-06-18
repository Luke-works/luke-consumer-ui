import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateSchema, AgentCancelledError, type BuilderSchemaLike } from "./formAgentApi";

const EMPTY: BuilderSchemaLike = { entities: {}, root: [] };

function jsonRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}
function htmlRes(status: number) {
  return { ok: status >= 200 && status < 300, status, text: async () => "<html>waking up…</html>" };
}

describe("formAgentApi (#40)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

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
});
