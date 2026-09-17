import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormRespondView from "./FormRespondView";
import * as api from "../../lib/publicInstanceApi";

vi.mock("../../lib/publicInstanceApi", () => ({
  RespondApiError: class RespondApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getRespondForm: vi.fn(),
  submitRespond: vi.fn(),
  startRespondPayment: vi.fn(),
  syncRespondPayment: vi.fn(),
}));

const confirms = vi.hoisted(() => [] as string[]);
/** What "Stripe" did with the last confirmation — the server's check reports the same. */
const lastConfirm = vi.hoisted(() => ({ value: "none" }));
vi.mock("@lukeflow/form-react/stripe", () => ({
  createStripeProcessor: () => ({
    async mount({ container }: { container: HTMLElement }) {
      const input = document.createElement("input");
      input.setAttribute("aria-label", "Card number");
      container.appendChild(input);
      return {
        update: () => {},
        validate: async () => (input.value.length >= 16 ? null : "Your card number is incomplete."),
        confirm: async (secret: string) => {
          confirms.push(secret);
          const declined = input.value === "4000000000000002";
          lastConfirm.value = declined ? "failed" : "succeeded";
          return declined ? { status: "failed", message: "Your card was declined." } : { status: "succeeded" };
        },
        destroy: () => input.remove(),
      };
    },
  }),
}));

const m = vi.mocked(api);

const SCHEMA = JSON.stringify({
  root: ["qty", "pay"],
  entities: {
    qty: { id: "qty", type: "number", attributes: { key: "qty", label: "Seats", required: true } },
    pay: { id: "pay", type: "payment", attributes: { key: "pay", label: "Invoice", amountMode: "perUnit", amountMinor: 1500, quantityFrom: "qty", currency: "USD" } },
  },
});

const respondForm = (state = "OPENED"): api.RespondForm => ({
  code: "INV", name: "Invoice", version: 1, schema: SCHEMA, prefill: {}, data: { qty: 2 }, outboundRoles: {},
  recipient: {}, state,
  payment: { available: true, provider: "stripe", publishableKey: "pk_test_x", accountId: "acct_x", scriptUrl: "https://js.stripe.com/v3/" },
});

const START = { status: "requires_payment", clientSecret: "pi_9_secret", amountMinor: 3000, currency: "USD" } as const;

async function verify(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /email me a code/i }));
  await user.type(await screen.findByPlaceholderText("123456"), "123456");
  await user.click(screen.getByRole("button", { name: /verify/i }));
}

describe("paying on the recipient (respond) page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirms.length = 0;
    lastConfirm.value = "none";
    m.requestOtp.mockResolvedValue({ ok: true, emailStatus: "SENT", sentTo: "p***@example.com" });
    m.verifyOtp.mockResolvedValue({ accessToken: "acc" });
    m.syncRespondPayment.mockImplementation(async () =>
      lastConfirm.value === "succeeded"
        ? { status: "succeeded", amountMinor: 3000, currency: "USD", state: "SUBMITTED" }
        : { status: "requires_payment", amountMinor: 3000, currency: "USD", state: "AWAITING_PAYMENT" },
    );
  });

  it("submits, pays the server's charge and confirms it", async () => {
    m.getRespondForm.mockResolvedValue(respondForm());
    m.submitRespond.mockResolvedValue({ ok: true, instanceId: "i1", state: "AWAITING_PAYMENT", payment: { ...START } });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Payment of $30.00 received.")).toBeTruthy();
    expect(confirms).toEqual(["pi_9_secret"]);
    expect(m.syncRespondPayment).toHaveBeenCalledWith("tok", "acc");
  });

  it("a decline moves to the pay step, which resumes the same charge", async () => {
    m.getRespondForm.mockResolvedValue(respondForm());
    m.submitRespond.mockResolvedValue({ ok: true, instanceId: "i1", state: "AWAITING_PAYMENT", payment: { ...START } });
    m.startRespondPayment.mockResolvedValue({ ...START });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    await user.type(await screen.findByLabelText("Card number"), "4000000000000002");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Your card was declined.")).toBeTruthy();
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: "Pay $30.00" }));
    expect(await screen.findByText("Payment of $30.00 received.")).toBeTruthy();
    expect(m.submitRespond).toHaveBeenCalledTimes(1);
    expect(m.startRespondPayment).toHaveBeenCalledTimes(1);
  });

  it("a recipient returning to an unpaid submission goes straight to paying", async () => {
    m.getRespondForm.mockResolvedValue(respondForm("AWAITING_PAYMENT"));
    m.startRespondPayment.mockResolvedValue({ ...START });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    expect(await screen.findByText(/Your answers are saved\. Pay \$30\.00 to finish\./)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Seats" })).toBeNull();
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: "Pay $30.00" }));
    expect(await screen.findByText("Payment of $30.00 received.")).toBeTruthy();
    expect(m.submitRespond).not.toHaveBeenCalled();
  });

  it("a returning recipient whose payment already went through sees the confirmation", async () => {
    m.getRespondForm.mockResolvedValue(respondForm("AWAITING_PAYMENT"));
    m.startRespondPayment.mockResolvedValue({ ...START, status: "processing", clientSecret: null });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    expect(await screen.findByText("Your payment of $30.00 is being processed.")).toBeTruthy();
  });

  it("a returning recipient whose charge was cancelled meanwhile goes back to the form, not a dead pay step", async () => {
    m.getRespondForm.mockResolvedValueOnce(respondForm("AWAITING_PAYMENT")).mockResolvedValue(respondForm("IN_PROGRESS"));
    m.startRespondPayment.mockResolvedValue({ ...START, status: "canceled", clientSecret: null });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    expect(await screen.findByText("Your payment wasn't completed. Please submit the form again.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Seats" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pay / })).toBeNull();
  });

  it("if the charge can't be read after the code is used, the recipient gets a retry — not the code screen", async () => {
    m.getRespondForm.mockResolvedValue(respondForm("AWAITING_PAYMENT"));
    m.startRespondPayment.mockRejectedValueOnce(new Error("Couldn't check the payment right now.")).mockResolvedValue({ ...START });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    expect(await screen.findByText("Couldn't check the payment right now.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("123456")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: "Pay $30.00" }));
    expect(await screen.findByText("Payment of $30.00 received.")).toBeTruthy();
  });

  it("a submit that failed after the server saved it carries on to the payment", async () => {
    m.getRespondForm.mockResolvedValueOnce(respondForm()).mockResolvedValue(respondForm("AWAITING_PAYMENT"));
    m.submitRespond.mockRejectedValue(new Error("Couldn’t reach the server. Check your connection and try again."));
    m.startRespondPayment.mockResolvedValue({ ...START });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText(/Your answers are saved\. Pay \$30\.00 to finish\./)).toBeTruthy();
    expect(confirms).toEqual([]);
  });

  it("a paid form reopened for correction asks for no card and resubmits", async () => {
    m.getRespondForm.mockResolvedValue({
      ...respondForm("IN_PROGRESS"),
      data: { qty: 2, pay: { status: "paid", amountMinor: 3000, currency: "USD", intentId: "pi_9" } },
      payment: {
        available: true, provider: "stripe", publishableKey: "pk_test_x", accountId: "acct_x",
        scriptUrl: "https://js.stripe.com/v3/", alreadyPaid: true, paidAmountMinor: 3000, paidCurrency: "USD",
      },
    });
    m.submitRespond.mockResolvedValue({ ok: true, instanceId: "i1", state: "SUBMITTED" });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    expect(await screen.findByText("Paid $30.00")).toBeTruthy();
    expect(screen.queryByLabelText("Card number")).toBeNull();
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText(/submitted|thank/i)).toBeTruthy();
    expect(m.submitRespond).toHaveBeenCalledTimes(1);
    expect(confirms).toEqual([]);
  });

  it("previews a preparer-set quantity from the served schema, so the matching charge goes straight through", async () => {
    m.getRespondForm.mockResolvedValue({ ...respondForm(), outboundRoles: { qty: "PREPARER" } });
    m.submitRespond.mockResolvedValue({ ok: true, instanceId: "i1", state: "AWAITING_PAYMENT", payment: { ...START } });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    expect(await screen.findByText("Total: $30.00")).toBeTruthy();
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Payment of $30.00 received.")).toBeTruthy();
    expect(confirms).toEqual(["pi_9_secret"]);
  });

  it("a charge that differs from what the page showed needs the recipient's OK", async () => {
    m.getRespondForm.mockResolvedValue(respondForm());
    m.submitRespond.mockResolvedValue({ ok: true, instanceId: "i1", state: "AWAITING_PAYMENT", payment: { ...START, amountMinor: 9000 } });
    m.startRespondPayment.mockResolvedValue({ ...START, amountMinor: 9000 });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText(/The amount to pay is \$90\.00, not the \$30\.00 shown before/)).toBeTruthy();
    expect(confirms).toEqual([]);
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: "Pay $90.00" }));
    expect(await screen.findByText("Payment of $90.00 received.")).toBeTruthy();
  });

  it("a charge paid elsewhere is shown as paid, not as 'not completed', when the server refuses to resume it", async () => {
    m.getRespondForm.mockResolvedValue(respondForm());
    m.submitRespond.mockResolvedValue({ ok: true, instanceId: "i1", state: "AWAITING_PAYMENT", payment: { ...START } });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    await user.type(await screen.findByLabelText("Card number"), "4000000000000002");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await screen.findByText("Your card was declined.");
    // Another tab paid it: the instance is SUBMITTED, so resuming is refused.
    m.startRespondPayment.mockRejectedValue(new api.RespondApiError("This form is no longer open.", 409));
    m.syncRespondPayment.mockResolvedValue({ status: "succeeded", amountMinor: 3000, currency: "USD", state: "SUBMITTED" });
    await user.click(screen.getByRole("button", { name: "Pay $30.00" }));
    expect(await screen.findByText("Payment of $30.00 received.")).toBeTruthy();
    expect(screen.queryByText(/wasn't completed/)).toBeNull();
    expect(confirms).toEqual(["pi_9_secret"]);
  });

  it("a charge being checked can't be paid yet, and says so", async () => {
    m.getRespondForm.mockResolvedValue(respondForm("AWAITING_PAYMENT"));
    m.startRespondPayment.mockResolvedValue({ ...START, clientSecret: null });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    expect(await screen.findByText("This payment can't be completed right now. Please try again later.")).toBeTruthy();
    expect(screen.queryByLabelText("Card number")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("the pay step re-reads the charge before asking for a card again", async () => {
    m.getRespondForm.mockResolvedValue(respondForm("AWAITING_PAYMENT"));
    m.startRespondPayment
      .mockResolvedValueOnce({ ...START })
      .mockResolvedValueOnce({ ...START, status: "succeeded", clientSecret: null });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    await screen.findByText(/Pay \$30\.00 to finish/);
    // No card typed: the charge is already paid, so no card check is needed.
    await user.click(screen.getByRole("button", { name: "Pay $30.00" }));
    expect(await screen.findByText("Payment of $30.00 received.")).toBeTruthy();
    expect(confirms).toEqual([]);
  });

  it("a cancelled charge sends the recipient back to the form to submit again", async () => {
    m.getRespondForm.mockResolvedValue(respondForm());
    m.submitRespond.mockResolvedValue({ ok: true, instanceId: "i1", state: "AWAITING_PAYMENT", payment: { ...START } });
    m.syncRespondPayment.mockResolvedValue({ status: "canceled", amountMinor: 3000, currency: "USD", state: "IN_PROGRESS" });
    const user = userEvent.setup();
    render(<FormRespondView token="tok" />);
    await verify(user);
    await user.type(await screen.findByLabelText("Card number"), "4242424242424242");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Your payment wasn't completed. Please submit the form again.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Seats" })).toBeTruthy();
  });
});
