import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, signaturesClient } from "./signaturesApi";

// The wire→view mapping now lives in @lukeflow/sign-core (tested there). These tests assert the
// app's wiring: the vendored client is constructed with this app's auth/tenant headers and
// surfaces the contract correctly through the consumer-ui glue.

type MockRes = { ok: boolean; status: number; text: () => Promise<string> };
const res = (body: unknown, ok = true, status = 200): MockRes => ({
  ok,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => fetchMock.mockReset());

describe("signaturesApi client wiring", () => {
  it("maps the list wire shape to the view model and sends X-Tenant-Id (never X-User-Id)", async () => {
    fetchMock.mockResolvedValueOnce(
      res([
        {
          id: "1",
          code: "SR-AAAA-21JUN26",
          name: "NDA",
          status: "SENT",
          signerEmail: "j@x.com",
          signerName: "Jane",
          verificationMethod: "NONE",
          field: { page: 0, x: 72, y: 72, w: 160, h: 50 },
          createdAt: [2026, 6, 21, 9, 30, 0], // Jackson array form
          retainUntil: "2033-06-21T09:30:00Z", // ISO form
          sentAt: 1750000000000, // epoch millis
        },
      ]),
    );

    const list = await signaturesClient.listSignatures("tenant-1");
    expect(list).toHaveLength(1);
    const s = list[0]!;
    expect(s.field).toEqual({ page: 0, x: 72, y: 72, w: 160, h: 50 });
    expect(s.status).toBe("SENT");
    expect(typeof s.createdAt).toBe("number");
    expect(s.sentAt).toBe(1750000000000);
    expect(typeof s.retainUntil).toBe("number");

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init.headers);
    expect(headers.get("X-Tenant-Id")).toBe("tenant-1");
    expect(headers.has("X-User-Id")).toBe(false);
  });

  it("maps getSignature into { request, audit[] } with ms on audit times", async () => {
    fetchMock.mockResolvedValueOnce(
      res({
        request: {
          id: "1",
          code: "SR-AAAA-21JUN26",
          name: "NDA",
          status: "COMPLETED",
          signerEmail: "j@x.com",
          signerName: "Jane",
          verificationMethod: "NONE",
          field: { page: 0, x: 1, y: 2, w: 3, h: 4 },
        },
        audit: [{ action: "CREATED", actor: "u", ipAddress: "203.0.113.1", at: 1750000000000 }],
      }),
    );
    const d = await signaturesClient.getSignature("t", "1");
    expect(d.request.status).toBe("COMPLETED");
    expect(d.audit[0]!.action).toBe("CREATED");
    expect(d.audit[0]!.at).toBe(1750000000000);
  });

  it("sendSignature returns the signUrl", async () => {
    fetchMock.mockResolvedValueOnce(res({ signUrl: "http://localhost:5173/sign/abc" }));
    expect(await signaturesClient.sendSignature("t", "1")).toBe("http://localhost:5173/sign/abc");
  });

  it("getSigningSession (public) throws ApiError(410) for a consumed link and sends no tenant header", async () => {
    fetchMock.mockResolvedValue(res({ message: "already signed" }, false, 410));
    await expect(signaturesClient.getSigningSession("tok")).rejects.toMatchObject({ status: 410 });
    await expect(signaturesClient.getSigningSession("tok")).rejects.toBeInstanceOf(ApiError);
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.has("X-Tenant-Id")).toBe(false);
  });
});
