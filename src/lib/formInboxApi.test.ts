import { describe, it, expect, vi, beforeEach } from "vitest";
import { taskKind } from "./formInboxApi";

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

describe("taskKind discriminates what a task is about", () => {
  it("trusts an explicit kind from the engine", () => {
    expect(taskKind({ taskId: "t", kind: "email", emailMessageId: "m1" })).toBe("email");
    expect(taskKind({ taskId: "t", kind: "form", instanceId: "i1" })).toBe("form");
  });

  it("falls back to the email message id when the engine predates the field", () => {
    // A new UI can meet an old engine during a deploy. Defaulting everything to "form" would
    // reintroduce the exact bug `kind` exists to fix: an email task fetched as a submission.
    expect(taskKind({ taskId: "t", emailMessageId: "m1" })).toBe("email");
    expect(taskKind({ taskId: "t", instanceId: "i1" })).toBe("form");
    expect(taskKind({ taskId: "t" })).toBe("form");
  });

  it("prefers the explicit kind over the fallback if they ever disagree", () => {
    expect(taskKind({ taskId: "t", kind: "form", emailMessageId: "m1" })).toBe("form");
  });
});
