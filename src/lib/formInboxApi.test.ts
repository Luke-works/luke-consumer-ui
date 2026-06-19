import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the transport so we can drive the raw response shape.
vi.mock("./authApi", () => ({
  authed: vi.fn(),
  tenantInit: vi.fn(() => ({})),
}));

import { authed } from "./authApi";
import { getInbox } from "./formInboxApi";

const mockAuthed = authed as unknown as ReturnType<typeof vi.fn>;

describe("getInbox response-shape tolerance (#26 deploy-window hotfix)", () => {
  beforeEach(() => mockAuthed.mockReset());

  it("passes through the paged {items,total} shape", async () => {
    mockAuthed.mockResolvedValue({ items: [{ taskId: "a" }], total: 5, firstResult: 0, maxResults: 50 });
    const page = await getInbox("tenant");
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(5);
  });

  it("wraps a bare array (pre-#26 backend) instead of crashing", async () => {
    mockAuthed.mockResolvedValue([{ taskId: "a" }, { taskId: "b" }]);
    const page = await getInbox("tenant");
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(2);
  });

  it("never yields undefined items on a malformed body", async () => {
    mockAuthed.mockResolvedValue({});
    const page = await getInbox("tenant");
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});
