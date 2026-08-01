import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmailRoutingRules, { summariseActions } from "./EmailRoutingRules";
import * as intakeApi from "../../lib/emailIntakeApi";
import type { EmailBox } from "../../lib/emailBoxesApi";

vi.mock("../../lib/emailIntakeApi", async (importOriginal) => ({
  ...(await importOriginal<typeof intakeApi>()),
  listRules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  reorderRules: vi.fn(),
}));

const api = vi.mocked(intakeApi);

const BOXES = [
  { id: "b1", direction: "INBOUND", address: "support@acme.com" },
  { id: "b2", direction: "OUTBOUND", address: "sales@acme.com" },
] as unknown as EmailBox[];

function rule(over: Partial<intakeApi.EmailRoutingRule> = {}): intakeApi.EmailRoutingRule {
  return {
    id: "r1", tenantId: "t1", boxId: null, name: "Invoices", enabled: true, sortOrder: 0,
    matchField: "SUBJECT", matchOperator: "CONTAINS", matchValue: "invoice", caseSensitive: false,
    actionAssignee: null, actionCandidateGroup: "finance", actionPriority: 75,
    actionProcessKey: null, actionTaskName: null, actionSuppressTask: false, ...over,
  };
}

describe("EmailRoutingRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listRules.mockResolvedValue([]);
  });

  it("states that the first match wins, because actions do not accumulate", async () => {
    render(<EmailRoutingRules tenant="t1" boxes={BOXES} />);
    expect(await screen.findByText(/first match wins/i)).toBeInTheDocument();
  });

  it("explains the empty state in terms of what will happen to mail", async () => {
    render(<EmailRoutingRules tenant="t1" boxes={BOXES} />);
    expect(await screen.findByText(/every inbound message becomes an unassigned review task/i))
      .toBeInTheDocument();
  });

  it("only offers INBOUND boxes to scope a rule to", async () => {
    render(<EmailRoutingRules tenant="t1" boxes={BOXES} />);
    const select = await screen.findByLabelText(/applies to/i);
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["All inbound boxes", "support@acme.com"]);
    expect(options).not.toContain("sales@acme.com"); // outbound cannot receive anything
  });

  it("warns when there is no inbound box to route", async () => {
    render(<EmailRoutingRules tenant="t1" boxes={[BOXES[1]!]} />);
    expect(await screen.findByText(/register an inbound box above/i)).toBeInTheDocument();
  });

  it("adds a rule at the END so it cannot pre-empt one that already works", async () => {
    api.listRules.mockResolvedValue([rule({ id: "a", name: "First" }), rule({ id: "b", name: "Second" })]);
    api.createRule.mockResolvedValue(rule({ id: "c", name: "Third" }));

    render(<EmailRoutingRules tenant="t1" boxes={BOXES} />);
    await screen.findByText("First");

    await userEvent.type(screen.getByLabelText(/rule name/i), "Third");
    await userEvent.type(screen.getByLabelText(/^value$/i), "urgent");
    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await waitFor(() => expect(api.createRule).toHaveBeenCalled());
    expect(api.createRule.mock.calls[0]![1]).toMatchObject({ name: "Third", sortOrder: 2 });
  });

  it("sends the full new order when a rule is moved", async () => {
    api.listRules.mockResolvedValue([rule({ id: "a", name: "First" }), rule({ id: "b", name: "Second" })]);
    api.reorderRules.mockResolvedValue([rule({ id: "b", name: "Second" }), rule({ id: "a", name: "First" })]);

    render(<EmailRoutingRules tenant="t1" boxes={BOXES} />);
    await screen.findByText("First");

    await userEvent.click(screen.getAllByRole("button", { name: /move up/i })[1]!);

    await waitFor(() => expect(api.reorderRules).toHaveBeenCalledWith("t1", ["b", "a"]));
  });

  it("restores the previous order when the server rejects a reorder", async () => {
    api.listRules.mockResolvedValue([rule({ id: "a", name: "First" }), rule({ id: "b", name: "Second" })]);
    api.reorderRules.mockRejectedValue(new Error("nope"));

    render(<EmailRoutingRules tenant="t1" boxes={BOXES} />);
    await screen.findByText("First");

    await userEvent.click(screen.getAllByRole("button", { name: /move up/i })[1]!);

    await waitFor(() => expect(screen.getByText("nope")).toBeInTheDocument());
    const names = screen.getAllByTestId("routing-rule").map((li) => within(li).getByText(/First|Second/).textContent);
    expect(names).toEqual(["First", "Second"]); // rolled back, not left lying about the order
  });

  it("restores a deleted rule when the delete fails", async () => {
    api.listRules.mockResolvedValue([rule({ id: "a", name: "First" })]);
    api.deleteRule.mockRejectedValue(new Error("cannot delete"));

    render(<EmailRoutingRules tenant="t1" boxes={BOXES} />);
    await screen.findByText("First");

    await userEvent.click(screen.getByRole("button", { name: /delete first/i }));

    await waitFor(() => expect(screen.getByText("cannot delete")).toBeInTheDocument());
    expect(screen.getByText("First")).toBeInTheDocument();
  });

  it("surfaces a server validation error rather than silently dropping the rule", async () => {
    api.createRule.mockRejectedValue(new Error("Invalid regular expression: Unclosed group"));

    render(<EmailRoutingRules tenant="t1" boxes={BOXES} />);
    await screen.findByText(/first match wins/i);

    await userEvent.type(screen.getByLabelText(/rule name/i), "Bad");
    // "(unclosed" is itself an invalid regex; avoid "[" because userEvent.type reads it as a
    // key descriptor rather than a character.
    await userEvent.type(screen.getByLabelText(/^value$/i), "(unclosed");
    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    expect(await screen.findByText(/invalid regular expression/i)).toBeInTheDocument();
  });

  it("will not submit without a name and a value", async () => {
    render(<EmailRoutingRules tenant="t1" boxes={BOXES} />);
    await screen.findByText(/first match wins/i);

    const add = screen.getByRole("button", { name: /add rule/i });
    expect(add).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/rule name/i), "Named");
    expect(add).toBeDisabled(); // still no match value

    await userEvent.type(screen.getByLabelText(/^value$/i), "x");
    expect(add).toBeEnabled();
  });
});

describe("summariseActions says what a rule does", () => {
  it("leads with suppression, because it overrides everything else", () => {
    expect(summariseActions(rule({ actionSuppressTask: true, actionCandidateGroup: "finance" })))
      .toBe("No task created");
  });

  it("joins the actions that are set", () => {
    expect(summariseActions(rule({ actionCandidateGroup: "finance", actionPriority: 75 })))
      .toBe("to group finance, priority 75");
    expect(summariseActions(rule({ actionAssignee: "workos:u1", actionCandidateGroup: null, actionPriority: null })))
      .toBe("assign to workos:u1");
  });

  it("describes a rule with no actions as the ordinary outcome", () => {
    expect(summariseActions(rule({ actionCandidateGroup: null, actionPriority: null })))
      .toBe("Standard review task");
  });

  it("treats priority 0 as set, not as absent", () => {
    // `if (r.actionPriority)` would drop a deliberate 0 — the lowest priority is still a choice.
    expect(summariseActions(rule({ actionCandidateGroup: null, actionPriority: 0 })))
      .toBe("priority 0");
  });
});
