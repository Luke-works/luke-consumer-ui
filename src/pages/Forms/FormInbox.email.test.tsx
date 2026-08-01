import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormInbox from "./FormInbox";
import * as inboxApi from "../../lib/formInboxApi";
import * as intakeApi from "../../lib/emailIntakeApi";
import * as instancesApi from "../../lib/formInstancesApi";
import * as formsApi from "../../lib/formsApi";

/**
 * The inbox holds BOTH kinds of work, and opening one must not use the other's API.
 *
 * This is a regression suite around a real defect: /api/form-inbox has always returned every open
 * user task for the tenant, so the "Review inbound email" tasks that EMAIL intake creates already
 * appeared here — but the UI fetched every row as a form submission. For an email task that meant
 * asking the form-instance API for "email-inbox-<id>", getting nothing, and opening a blank pane.
 */

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1" } }),
}));
vi.mock("../../components/common/PageMeta", () => ({ default: () => null }));
vi.mock("../../components/formBuilder/LukeFormRenderer", () => ({
  default: () => <div data-testid="form-renderer">submission</div>,
}));
vi.mock("../../components/documents/TaskAttachments", () => ({ default: () => null }));

// Keep the real taskKind — it is part of what is under test.
vi.mock("../../lib/formInboxApi", async (importOriginal) => ({
  ...(await importOriginal<typeof inboxApi>()),
  getInbox: vi.fn(),
  completeTask: vi.fn(),
}));
vi.mock("../../lib/emailIntakeApi", async (importOriginal) => ({
  ...(await importOriginal<typeof intakeApi>()),
  getInboundEmail: vi.fn(),
}));
vi.mock("../../lib/formInstancesApi", () => ({ getInstance: vi.fn() }));
vi.mock("../../lib/formsApi", () => ({ listForms: vi.fn() }));

const inbox = vi.mocked(inboxApi);
const intake = vi.mocked(intakeApi);
const instances = vi.mocked(instancesApi);
const forms = vi.mocked(formsApi);

const EMAIL_TASK: inboxApi.InboxTask = {
  taskId: "task-email",
  name: "Review: Refund request",
  created: 1_700_000_000_000,
  assignee: null,
  kind: "email",
  emailMessageId: "msg-1",
  emailFrom: "jo@example.com",
  emailBox: "support@acme.com",
  instanceId: null,
  definitionCode: null,
};

const FORM_TASK: inboxApi.InboxTask = {
  taskId: "task-form",
  name: "Review Submission",
  created: 1_700_000_001_000,
  assignee: null,
  kind: "form",
  instanceId: "inst-77",
  definitionCode: "contact",
};

const INBOUND: intakeApi.InboundEmail = {
  id: "msg-1",
  tenantId: "t1",
  boxId: "b1",
  boxAddress: "support@acme.com",
  mailboxHash: "support",
  fromName: "Jo Bloggs",
  toFull: "support@acme.com",
  ccAddresses: null,
  replyTo: null,
  textBody: "I was charged twice and would like a refund.",
  htmlBody: null,
  strippedTextReply: null,
  messageIdHeader: "<a@b>",
  inReplyTo: null,
  attachments: null,
  headers: null,
  attachmentCount: 0,
};

function page(tasks: inboxApi.InboxTask[]): inboxApi.InboxPage {
  return { items: tasks, total: tasks.length, firstResult: 0, maxResults: 25 };
}

describe("Inbox renders each task by kind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("lk.inbox.view", "table"); // deterministic: rows + modal
    forms.listForms.mockResolvedValue([{ code: "contact", name: "Contact us" }] as never);
    intake.getInboundEmail.mockResolvedValue(INBOUND);
    instances.getInstance.mockResolvedValue({
      schema: { components: [] },
      instance: { id: "inst-77", data: {}, prefill: {} },
    } as never);
  });

  it("opens an email task as a message and never asks the form API for it", async () => {
    inbox.getInbox.mockResolvedValue(page([EMAIL_TASK]));

    render(<FormInbox />);
    await userEvent.click(await screen.findByText("Review: Refund request"));

    expect(await screen.findByTestId("email-message")).toBeInTheDocument();
    expect(screen.getByText(/charged twice/)).toBeInTheDocument();
    expect(screen.getByText("Jo Bloggs <jo@example.com>")).toBeInTheDocument();

    expect(intake.getInboundEmail).toHaveBeenCalledWith("t1", "msg-1");
    // THE regression: the email task must never be fetched as a submission.
    expect(instances.getInstance).not.toHaveBeenCalled();
    expect(screen.queryByTestId("form-renderer")).not.toBeInTheDocument();
  });

  it("still opens a form task as a submission", async () => {
    inbox.getInbox.mockResolvedValue(page([FORM_TASK]));

    render(<FormInbox />);
    await userEvent.click(await screen.findByText("Review Submission"));

    expect(await screen.findByTestId("form-renderer")).toBeInTheDocument();
    expect(instances.getInstance).toHaveBeenCalledWith("t1", "inst-77");
    expect(intake.getInboundEmail).not.toHaveBeenCalled();
  });

  it("treats a task from an older engine (no kind) as email when it carries a message id", async () => {
    // Deploy-window safety: a new UI meeting an old engine must not mislabel email as a form,
    // which is the exact bug `kind` was added to fix.
    const legacy = { ...EMAIL_TASK, kind: undefined };
    inbox.getInbox.mockResolvedValue(page([legacy]));

    render(<FormInbox />);
    await userEvent.click(await screen.findByText("Review: Refund request"));

    expect(await screen.findByTestId("email-message")).toBeInTheDocument();
    expect(instances.getInstance).not.toHaveBeenCalled();
  });

  it("does not leave one task's content showing under another", async () => {
    inbox.getInbox.mockResolvedValue(page([EMAIL_TASK, FORM_TASK]));

    render(<FormInbox />);

    await userEvent.click(await screen.findByText("Review: Refund request"));
    expect(await screen.findByTestId("email-message")).toBeInTheDocument();

    // Close the modal, then open the form task.
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await userEvent.click(screen.getByText("Review Submission"));

    expect(await screen.findByTestId("form-renderer")).toBeInTheDocument();
    expect(screen.queryByTestId("email-message")).not.toBeInTheDocument();
  });

  it("explains an email whose body was never stored instead of showing a blank pane", async () => {
    intake.getInboundEmail.mockResolvedValue(null); // received before intake kept bodies
    inbox.getInbox.mockResolvedValue(page([EMAIL_TASK]));

    render(<FormInbox />);
    await userEvent.click(await screen.findByText("Review: Refund request"));

    await waitFor(() =>
      expect(screen.getByText(/received before its content was stored/i)).toBeInTheDocument(),
    );
  });
});

describe("the split view groups email by box alongside forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("lk.inbox.view", "split");
    forms.listForms.mockResolvedValue([{ code: "contact", name: "Contact us" }] as never);
    intake.getInboundEmail.mockResolvedValue(INBOUND);
    instances.getInstance.mockResolvedValue({
      schema: { components: [] },
      instance: { id: "inst-77", data: {}, prefill: {} },
    } as never);
  });

  it("lists the inbound box as its own source, ahead of the forms", async () => {
    inbox.getInbox.mockResolvedValue(page([EMAIL_TASK, FORM_TASK]));

    render(<FormInbox />);

    const sources = await screen.findAllByRole("button", { pressed: false });
    expect(await screen.findByText("support@acme.com")).toBeInTheDocument();
    expect(screen.getByText("Contact us")).toBeInTheDocument();
    expect(sources.length).toBeGreaterThan(0);

    // Email sources sort first so a unified inbox does not bury them under every form.
    const labels = screen.getAllByText(/support@acme\.com|Contact us/).map((n) => n.textContent);
    expect(labels.indexOf("support@acme.com")).toBeLessThan(labels.indexOf("Contact us"));
  });
});
