import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { agentPost, DEFAULT_TIMEOUTS } from "./agentTransport";

/**
 * The budget contract between this client and luke-agents.
 *
 * What went wrong in production: a LukeBuilds research turn is THREE provider calls inside ONE
 * request — the build that asks for a fact it does not have, the web search, then the rebuild
 * with the findings — bounded server-side at LLM_TIMEOUT_SECONDS (30) + RESEARCH_TIMEOUT_SECONDS
 * (25) + LLM_TIMEOUT_SECONDS (30) = 85s. The client aborted every attempt at 25s, so such a turn
 * could NEVER complete. It failed with "signal is aborted without reason", and then retried,
 * starting a fresh round of billable web searches nobody would ever see.
 */
describe("agentTransport budget", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("allows longer than the server's own worst case, so a working turn is never killed", () => {
    // luke-agents: 30 + 25 + 30. If those move, this must move with them.
    const serverWorstCaseMs = (30 + 25 + 30) * 1000;
    expect(DEFAULT_TIMEOUTS.attemptMs).toBeGreaterThan(serverWorstCaseMs);
    // And the overall budget must leave room for at least one retry of a full-length attempt.
    expect(DEFAULT_TIMEOUTS.deadlineMs).toBeGreaterThan(DEFAULT_TIMEOUTS.attemptMs * 2);
  });

  it("does NOT retry after its own per-attempt timeout fires", async () => {
    // A timeout we raised ourselves is not evidence the server failed — it may still be working
    // on that turn. Re-sending bills the workspace a second time for an answer the first attempt
    // might yet produce. A real (tiny) attemptMs so the production timer path actually runs.
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () =>
            reject(Object.assign(new Error("signal is aborted without reason"), { name: "AbortError" })),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      agentPost("/chat", {}, undefined, undefined, "assistant", { attemptMs: 20, deadlineMs: 5_000 }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 15000);

  it("still retries a genuine cold start", async () => {
    // The reason retry exists at all — a free-tier instance waking up — must keep working.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "<html>waking</html>" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ title: "OK" }) });
    vi.stubGlobal("fetch", fetchMock);

    const out = await agentPost<{ title: string }>("/chat", {}, undefined, undefined, "assistant", {
      attemptMs: 5_000,
      deadlineMs: 20_000,
    });

    expect(out.title).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15000);
});
