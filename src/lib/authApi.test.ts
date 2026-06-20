import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authed, tenantInit, setAccessToken } from "./authApi";

function res(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}

describe("authApi (#25)", () => {
  beforeEach(() => setAccessToken(null));
  afterEach(() => vi.unstubAllGlobals());

  it("tenantInit injects X-Tenant-Id and preserves the rest of init", () => {
    const init = tenantInit("acme", { method: "POST" });
    expect(new Headers(init.headers).get("X-Tenant-Id")).toBe("acme");
    expect(init.method).toBe("POST");
  });

  it("attaches the Bearer token + tenant header + credentials to authed requests", async () => {
    setAccessToken("tok");
    const fetchMock = vi.fn().mockResolvedValue(res(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await authed("/x", tenantInit("acme"));

    const init = fetchMock.mock.calls[0][1];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer tok");
    expect(headers.get("X-Tenant-Id")).toBe("acme");
    expect(init.credentials).toBe("include");
  });

  it("on 401 it refreshes the token and retries once with the fresh token", async () => {
    setAccessToken("stale");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(401)) // initial request → expired
      .mockResolvedValueOnce(res(200, { accessToken: "fresh", user: {}, session: {} })) // /auth/refresh
      .mockResolvedValueOnce(res(200, { data: "ok" })); // retried request
    vi.stubGlobal("fetch", fetchMock);

    const out = await authed<{ data: string }>("/x");

    expect(out).toEqual({ data: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[2][1].headers as Headers).get("Authorization")).toBe("Bearer fresh");
  });

  it("does NOT retry forever — a 401 that survives refresh rejects", async () => {
    setAccessToken("stale");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(401)) // initial
      .mockResolvedValueOnce(res(401)); // refresh also 401 → give up
    vi.stubGlobal("fetch", fetchMock);

    await expect(authed("/x")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
