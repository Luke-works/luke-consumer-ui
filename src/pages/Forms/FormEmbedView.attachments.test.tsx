import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormEmbedView from "./FormEmbedView";
import * as embedApi from "../../lib/publicEmbedApi";
import * as docsApi from "../../lib/publicDocumentsApi";

// The embed's own plumbing is irrelevant here (no iframe host, no minion backend).
vi.mock("@lukeflow/form-embed", () => ({
  connectEmbedFrame: () => ({ destroy: () => {}, ready: () => {}, error: () => {}, submitted: () => {} }),
}));
vi.mock("../../lib/minionsApi", () => ({ createPublicMinionClient: () => null }));
vi.mock("../../lib/publicEmbedApi", () => ({
  getEmbedForm: vi.fn(),
  submitEmbed: vi.fn(),
}));
vi.mock("../../lib/publicDocumentsApi", () => ({
  uploadEmbedDocument: vi.fn(),
  listEmbedDocuments: vi.fn(),
  deleteEmbedDocument: vi.fn(),
  linkEmbedDocuments: vi.fn(),
}));

const embed = vi.mocked(embedApi);
const docs = vi.mocked(docsApi);

// A form with attachments switched ON (settings.attachments) and one required field.
const SCHEMA = JSON.stringify({
  root: ["a"],
  entities: {
    a: { id: "a", type: "textField", attributes: { key: "fullName", label: "Full name", required: true } },
  },
  settings: { attachments: true },
});

describe("embedded form with attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embed.getEmbedForm.mockResolvedValue({ code: "F1", title: "Intake", version: 1, schema: SCHEMA });
    embed.submitEmbed.mockResolvedValue({ instanceId: "i1" } as Awaited<ReturnType<typeof embedApi.submitEmbed>>);
    docs.listEmbedDocuments.mockResolvedValue([]); // per-test override once something is uploaded
    docs.linkEmbedDocuments.mockResolvedValue(undefined);
  });

  it("keeps the filled-in answers across an attachment upload and submits them", async () => {
    // The upload resolves with a doc, which bumps the host's attachment count → host re-render.
    const uploaded: docsApi.EmbedDoc[] = [];
    const doc = { docId: "d1", filename: "scan.pdf", sizeBytes: 1234 } as docsApi.EmbedDoc;
    docs.uploadEmbedDocument.mockImplementation(() => {
      uploaded.push(doc);
      return { done: Promise.resolve(doc), abort: () => {} };
    });
    // The panel re-reads the server list right after an upload — serve what was uploaded.
    docs.listEmbedDocuments.mockImplementation(async () => [...uploaded]);

    const { container } = render(<FormEmbedView token="tok" />);

    // 1. Fill the form.
    await userEvent.type(await screen.findByLabelText(/full name/i), "Ada Lovelace");

    // 2. Go to Attachments and add a file.
    await userEvent.click(screen.getByRole("tab", { name: /attachments/i }));
    const file = new File(["%PDF-1.4"], "scan.pdf", { type: "application/pdf" });
    // The real file input is visually hidden behind an "Add file" button, so grab it directly.
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(fileInput, file);
    await waitFor(() => expect(screen.getByText("scan.pdf")).toBeInTheDocument());

    // 3. Back to the form and submit.
    await userEvent.click(screen.getByRole("tab", { name: /^form$/i }));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(embed.submitEmbed).toHaveBeenCalled());
    expect(embed.submitEmbed.mock.calls[0][1]).toMatchObject({ fullName: "Ada Lovelace" });
  });
});

describe("attachments are a paid feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    docs.listEmbedDocuments.mockResolvedValue([]);
  });

  it("hides the tab when the SERVER says attachments are off, even though the schema asks for them", async () => {
    // The server has already applied the tenant's plan. Re-reading the schema here would re-open a
    // tab whose uploads the upload endpoint is going to refuse with a 402 anyway.
    embed.getEmbedForm.mockResolvedValue({
      code: "F1", title: "Intake", version: 1, schema: SCHEMA, attachmentsEnabled: false,
    });
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);
    expect(screen.queryByRole("tab", { name: /attachments/i })).not.toBeInTheDocument();
  });

  it("shows the tab when the server confirms the tenant is entitled", async () => {
    embed.getEmbedForm.mockResolvedValue({
      code: "F1", title: "Intake", version: 1, schema: SCHEMA, attachmentsEnabled: true,
    });
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);
    expect(await screen.findByRole("tab", { name: /attachments/i })).toBeInTheDocument();
  });

  it("falls back to the schema for an engine that predates the flag", async () => {
    // Older engines sent no flag and meant "whatever the schema says" — that must keep working.
    embed.getEmbedForm.mockResolvedValue({ code: "F1", title: "Intake", version: 1, schema: SCHEMA });
    render(<FormEmbedView token="tok" />);
    expect(await screen.findByRole("tab", { name: /attachments/i })).toBeInTheDocument();
  });
});
