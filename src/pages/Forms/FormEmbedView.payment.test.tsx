import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormEmbedView from "./FormEmbedView";
import * as embedApi from "../../lib/publicEmbedApi";

vi.mock("@lukeflow/form-embed", () => ({
  connectEmbedFrame: () => ({ destroy: () => {}, ready: () => {}, error: () => {}, submitted: () => {} }),
}));
vi.mock("../../lib/minionsApi", () => ({ createPublicMinionClient: () => null }));
vi.mock("../../lib/publicEmbedApi", () => ({
  getEmbedForm: vi.fn(),
  submitEmbed: vi.fn(),
  syncEmbedPayment: vi.fn(),
  startEmbedPayment: vi.fn(),
}));
vi.mock("../../lib/publicDocumentsApi", () => ({
  uploadEmbedDocument: vi.fn(),
  listEmbedDocuments: vi.fn(),
  deleteEmbedDocument: vi.fn(),
  linkEmbedDocuments: vi.fn(),
}));

/**
 * Stripe stand-in. The real adapter loads Stripe.js from js.stripe.com, which jsdom never will; this
 * mounts a plain "Card number" input into the payment field's box and answers validate/confirm from it.
 * 4000 0000 0000 0002 is declined, like Stripe's test card.
 */
const stripeCalls = vi.hoisted(() => ({
  created: [] as unknown[],
  confirms: [] as Array<{ secret: string; amount: unknown }>,
  /** What "Stripe" did with the last confirmation — the server's check reports the same. */
  last: "none" as "none" | "succeeded" | "failed",
}));
vi.mock("@lukeflow/form-react/stripe", () => ({
  createStripeProcessor: (opts: unknown) => {
    stripeCalls.created.push(opts);
    return {
      async mount({ container }: { container: HTMLElement }) {
        const input = document.createElement("input");
        input.setAttribute("aria-label", "Card number");
        container.appendChild(input);
        return {
          update: () => {},
          validate: async () => (input.value.length >= 16 ? null : "Your card number is incomplete."),
          confirm: async (secret: string, amount: unknown) => {
            stripeCalls.confirms.push({ secret, amount });
            const declined = input.value === "4000000000000002";
            stripeCalls.last = declined ? "failed" : "succeeded";
            return declined ? { status: "failed", message: "Your card was declined." } : { status: "succeeded" };
          },
          destroy: () => input.remove(),
        };
      },
    };
  },
}));

const embed = vi.mocked(embedApi);

const SCHEMA = JSON.stringify({
  root: ["name", "qty", "pay"],
  entities: {
    name: { id: "name", type: "textField", attributes: { key: "name", label: "Full name" } },
    qty: { id: "qty", type: "number", attributes: { key: "qty", label: "Tickets", required: true } },
    pay: {
      id: "pay",
      type: "payment",
      attributes: { key: "pay", label: "Ticket payment", amountMode: "perUnit", amountMinor: 1500, quantityFrom: "qty", currency: "USD" },
    },
  },
});

const PAYMENT = { available: true, provider: "stripe", publishableKey: "pk_test_x", accountId: "acct_x", scriptUrl: "https://js.stripe.com/v3/" } as const;

const form = (over: Partial<embedApi.EmbedForm> = {}): embedApi.EmbedForm => ({
  code: "F1", title: "Tickets", version: 1, schema: SCHEMA, payment: { ...PAYMENT }, ...over,
});

const START = { status: "requires_payment", clientSecret: "pi_1_secret_x", amountMinor: 4500, currency: "USD" } as const;

async function fill(user: ReturnType<typeof userEvent.setup>, card: string) {
  await user.type(await screen.findByLabelText(/full name/i), "Ada");
  await user.type(screen.getByRole("textbox", { name: "Tickets" }), "3");
  await user.type(await screen.findByLabelText("Card number"), card);
}

describe("paying on the public embed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeCalls.created.length = 0;
    stripeCalls.confirms.length = 0;
    stripeCalls.last = "none";
    embed.getEmbedForm.mockResolvedValue(form());
    embed.submitEmbed.mockResolvedValue({ ok: true, instanceId: "inst-1", processStatus: "AWAITING_PAYMENT", payment: { ...START } });
    // The server reads the charge from Stripe: paid only if the last confirmation went through.
    embed.syncEmbedPayment.mockImplementation(async () => ({
      status: stripeCalls.last === "succeeded" ? "succeeded" : "requires_payment",
      amountMinor: 4500,
      currency: "USD",
    }));
  });

  it("mounts Stripe on the tenant's connected account and pays the server-priced charge", async () => {
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText("Payment of $45.00 received.")).toBeTruthy();
    expect(stripeCalls.created).toEqual([
      expect.objectContaining({ publishableKey: "pk_test_x", stripeAccount: "acct_x", scriptUrl: "https://js.stripe.com/v3/" }),
    ]);
    // The SERVER's amount and secret are what's confirmed.
    expect(stripeCalls.confirms).toEqual([{ secret: "pi_1_secret_x", amount: { amountMinor: 4500, currency: "USD" } }]);
    expect(embed.syncEmbedPayment).toHaveBeenCalledWith("tok", "inst-1");
    expect(embed.submitEmbed).toHaveBeenCalledTimes(1);
    // The rendered version travels with the submission.
    expect(embed.submitEmbed.mock.calls[0]![6]).toBe(1);
  });

  it("never charges an amount other than the one shown: the payer approves it first", async () => {
    embed.submitEmbed.mockResolvedValue({
      ok: true, instanceId: "inst-1", processStatus: "AWAITING_PAYMENT", payment: { ...START, amountMinor: 50000 },
    });
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText(/The amount to pay is \$500\.00, not the \$45\.00 shown before/)).toBeTruthy();
    expect(stripeCalls.confirms).toEqual([]);
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: "Pay $500.00" }));
    expect(await screen.findByText("Payment of $500.00 received.")).toBeTruthy();
    expect(stripeCalls.confirms).toEqual([{ secret: "pi_1_secret_x", amount: { amountMinor: 50000, currency: "USD" } }]);
  });

  it("a charge that went through despite a failed confirmation counts as paid", async () => {
    embed.syncEmbedPayment.mockResolvedValue({ status: "succeeded", amountMinor: 4500, currency: "USD" });
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4000000000000002");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Payment of $45.00 received.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change my answers" })).toBeNull();
  });

  it("the pay step re-checks the charge first, and a cancelled one sends the payer back to the form", async () => {
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4000000000000002");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await screen.findByText(/Your answers are saved\. Pay \$45\.00 to finish\./);
    embed.syncEmbedPayment.mockResolvedValue({ status: "canceled", amountMinor: 4500, currency: "USD" });
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: "Pay $45.00" }));
    expect(await screen.findByText("This payment can no longer be completed. Please submit the form again.")).toBeTruthy();
    expect(stripeCalls.confirms).toHaveLength(1); // only the first, declined attempt
    expect(await screen.findByLabelText(/full name/i)).toBeTruthy();
  });

  it("when the charge couldn't be started, the saved submission can try again", async () => {
    embed.submitEmbed.mockResolvedValue({
      ok: true, instanceId: "inst-1", processStatus: "AWAITING_PAYMENT", payment: null,
      paymentError: "The payment couldn't be started. Please try again.", paymentRetryable: true,
    });
    embed.startEmbedPayment.mockRejectedValueOnce(new Error("Still down.")).mockResolvedValueOnce({ ...START });
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText("The payment couldn't be started. Please try again.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Still down.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: "Pay $45.00" }));
    expect(await screen.findByText("Payment of $45.00 received.")).toBeTruthy();
    expect(embed.startEmbedPayment).toHaveBeenCalledWith("tok", "inst-1");
    expect(embed.submitEmbed).toHaveBeenCalledTimes(1);
  });

  it("'Change my answers' never walks away from a charge that went through", async () => {
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4000000000000002");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await screen.findByText(/Your answers are saved\. Pay \$45\.00 to finish\./);
    // Meanwhile the charge went through (a response that never reached the page).
    embed.syncEmbedPayment.mockResolvedValue({ status: "succeeded", amountMinor: 4500, currency: "USD" });
    await user.click(screen.getByRole("button", { name: "Change my answers" }));
    expect(await screen.findByText("Payment of $45.00 received.")).toBeTruthy();
    expect(embed.submitEmbed).toHaveBeenCalledTimes(1);
  });

  it("a charge the server can't hand out yet says so, with a way to try again", async () => {
    embed.submitEmbed.mockResolvedValue({
      ok: true, instanceId: "inst-1", processStatus: "AWAITING_PAYMENT", payment: null,
      paymentError: "The payment couldn't be started. Please try again.", paymentRetryable: true,
    });
    embed.startEmbedPayment.mockResolvedValue({ ...START, clientSecret: null });
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("This payment can't be completed right now. Please try again later.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(stripeCalls.confirms).toEqual([]);
  });

  it("a charge the provider refused outright is reported on the form", async () => {
    embed.submitEmbed.mockResolvedValue({
      ok: true, instanceId: "inst-1", processStatus: "AWAITING_PAYMENT", payment: null,
      paymentError: "This payment couldn't be started — the amount may be below what the payment provider accepts.",
      paymentRetryable: false,
    });
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText(/the amount may be below/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /submit/i })).toBeTruthy();
    expect(stripeCalls.confirms).toEqual([]);
  });

  it("an incomplete card never reaches the server", async () => {
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Your card number is incomplete.")).toBeTruthy();
    expect(embed.submitEmbed).not.toHaveBeenCalled();
  });

  it("after a decline, pays the SAME charge from the pay step — no second submission", async () => {
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4000000000000002");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText("Your card was declined.")).toBeTruthy();
    expect(screen.getByText(/Your answers are saved\. Pay \$45\.00 to finish\./)).toBeTruthy();
    // The pay step mounts a fresh card form for the same charge.
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: "Pay $45.00" }));

    expect(await screen.findByText("Payment of $45.00 received.")).toBeTruthy();
    expect(embed.submitEmbed).toHaveBeenCalledTimes(1);
    expect(stripeCalls.confirms.map((c) => c.secret)).toEqual(["pi_1_secret_x", "pi_1_secret_x"]);
  });

  it("'Change my answers' goes back to the form with the answers kept, and submitting again makes a new charge", async () => {
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4000000000000002");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await user.click(await screen.findByRole("button", { name: "Change my answers" }));

    expect(((await screen.findByLabelText(/full name/i)) as HTMLInputElement).value).toBe("Ada");
    embed.submitEmbed.mockResolvedValueOnce({
      ok: true, instanceId: "inst-2", processStatus: "AWAITING_PAYMENT",
      payment: { ...START, clientSecret: "pi_2_secret_y" },
    });
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Payment of $45.00 received.")).toBeTruthy();
    expect(embed.submitEmbed).toHaveBeenCalledTimes(2);
    expect(embed.syncEmbedPayment).toHaveBeenLastCalledWith("tok", "inst-2");
  });

  it("a processing payment is reported as such", async () => {
    embed.syncEmbedPayment.mockResolvedValue({ status: "processing", amountMinor: 4500, currency: "USD" });
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Your payment of $45.00 is being processed.")).toBeTruthy();
  });

  it("when payments aren't available the payer is told, and nothing is submitted", async () => {
    embed.getEmbedForm.mockResolvedValue(form({ payment: { ...PAYMENT, available: false, publishableKey: null, accountId: null } }));
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    expect(await screen.findByText(/aren't available right now/)).toBeTruthy();
    await user.type(await screen.findByLabelText(/full name/i), "Ada");
    await user.type(screen.getByRole("textbox", { name: "Tickets" }), "1");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(screen.getAllByText(/aren't available/).length).toBeGreaterThan(0));
    expect(embed.submitEmbed).not.toHaveBeenCalled();
    expect(stripeCalls.created).toEqual([]);
  });

  it("a server refusal is shown in the server's words", async () => {
    embed.submitEmbed.mockRejectedValue(new Error("That quantity isn't available."));
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await fill(user, "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("That quantity isn't available.")).toBeTruthy();
    expect(stripeCalls.confirms).toEqual([]);
  });

  it("a form without a payment never touches Stripe", async () => {
    embed.getEmbedForm.mockResolvedValue(form({
      schema: JSON.stringify({ root: ["name"], entities: { name: { id: "name", type: "textField", attributes: { key: "name", label: "Full name" } } } }),
      payment: undefined,
    }));
    embed.submitEmbed.mockResolvedValue({ ok: true, instanceId: "i", processStatus: "QUEUED" });
    const user = userEvent.setup();
    render(<FormEmbedView token="tok" />);
    await user.type(await screen.findByLabelText(/full name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(embed.submitEmbed).toHaveBeenCalled());
    expect(stripeCalls.created).toEqual([]);
    expect(screen.queryByText(/Payment of/)).toBeNull();
  });
});
