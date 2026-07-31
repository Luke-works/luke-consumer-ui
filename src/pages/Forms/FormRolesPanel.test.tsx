import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormRolesPanel from "./FormRolesPanel";
import type { StoredForm } from "../../lib/formsApi";

vi.mock("../../lib/formsApi", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  setOutboundConfig: vi.fn().mockResolvedValue({}),
}));

// Four fields so a template can be meaningfully scoped: two the preparer owns, two the recipient's.
const SCHEMA = JSON.stringify({
  root: ["a", "b", "c", "d"],
  entities: {
    a: { id: "a", type: "textField", attributes: { key: "orderRef", label: "Order ref" } },
    b: { id: "b", type: "textField", attributes: { key: "quotedPrice", label: "Quoted price" } },
    c: { id: "c", type: "textField", attributes: { key: "signature", label: "Signature" } },
    d: { id: "d", type: "textField", attributes: { key: "notes", label: "Notes" } },
  },
});

const form = (roles?: Record<string, string>): StoredForm =>
  ({ id: "f1", code: "C1", name: "Order form", kind: "OUTBOUND", outboundRoles: roles } as StoredForm);

/** Capture the CSV the download would have contained, without touching the filesystem. */
function captureDownload() {
  const captured: { text: string | null } = { text: null };
  const realCreate = URL.createObjectURL;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: (blob: Blob) => {
      void blob.text().then((t) => { captured.text = t; });
      return "blob:stub";
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
  return { captured, restore: () => Object.defineProperty(URL, "createObjectURL", { configurable: true, value: realCreate }) };
}

describe("FormRolesPanel — Generate template", () => {
  let dl: ReturnType<typeof captureDownload>;

  beforeEach(() => {
    vi.clearAllMocks();
    dl = captureDownload();
    // jsdom has no navigation; the anchor click must not try to follow the blob URL.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => dl.restore());

  const open = (roles?: Record<string, string>) =>
    render(<FormRolesPanel open onClose={() => {}} tenant="t1" form={form(roles)} schema={SCHEMA} onSaved={() => {}} />);

  const csv = async () => {
    await waitFor(() => expect(dl.captured.text).not.toBeNull());
    return dl.captured.text!.replace(/^\ufeff/, "");
  };

  it("includes ONLY the fields the preparer owns, never the recipient's", async () => {
    // A column for a field only the recipient can answer reads as an instruction to answer on their
    // behalf — and the engine strips exactly those values on submit, so the column is a lie.
    const user = userEvent.setup();
    open({ orderRef: "PREPARER", quotedPrice: "EITHER", signature: "RECIPIENT", notes: "RECIPIENT" });
    await user.click(await screen.findByRole("button", { name: /generate template/i }));

    const header = (await csv()).split("\r\n")[0]!;
    expect(header).toContain("orderRef");
    expect(header).toContain("quotedPrice"); // EITHER is preparer-supplied too — they may seed it
    expect(header).not.toContain("signature");
    expect(header).not.toContain("notes");
  });

  it("leads with the recipient's details — a prefill row is useless without one", async () => {
    const user = userEvent.setup();
    open({ orderRef: "PREPARER" });
    await user.click(await screen.findByRole("button", { name: /generate template/i }));

    const header = (await csv()).split("\r\n")[0]!;
    expect(header.startsWith("recipient.firstName,recipient.lastName,recipient.email,recipient.phone")).toBe(true);
  });

  it("states the email-or-phone rule in the file itself", async () => {
    // There is no CSV import to enforce it, so the only place the rule can live is where the
    // preparer is looking while they fill the sheet.
    const user = userEvent.setup();
    open({ orderRef: "PREPARER" });
    await user.click(await screen.findByRole("button", { name: /generate template/i }));
    expect(await csv()).toMatch(/one of recipient\.email or recipient\.phone/i);
  });

  it("is disabled when the preparer owns nothing — an empty template helps no one", async () => {
    open({ orderRef: "RECIPIENT", quotedPrice: "RECIPIENT", signature: "RECIPIENT", notes: "RECIPIENT" });
    expect(await screen.findByRole("button", { name: /generate template/i })).toBeDisabled();
  });
});
