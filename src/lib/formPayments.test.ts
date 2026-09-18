import { describe, it, expect, vi } from "vitest";
import type { PaymentConfirmResult, PaymentSession } from "@lukeflow/form-react";
import {
  completePayment,
  createFormPaymentSession,
  formatMoney,
  paymentOnlySchema,
  previewCharge,
  schemaTakesPayment,
  type PaymentStart,
} from "./formPayments";

const PAID_SCHEMA = JSON.stringify({
  root: ["pay"],
  entities: { pay: { id: "pay", type: "payment", attributes: { key: "pay", amountMode: "fixed", amountMinor: 500, currency: "USD" } } },
});

const START: PaymentStart = { status: "requires_payment", clientSecret: "pi_1_secret_2", amountMinor: 4500, currency: "USD" };

function fakeSession(confirm: PaymentConfirmResult = { status: "succeeded" }) {
  const setError = vi.fn();
  const session = {
    confirm: vi.fn().mockResolvedValue(confirm),
    setError,
  } as unknown as PaymentSession;
  return { session, setError, confirm: session.confirm as ReturnType<typeof vi.fn> };
}

describe("schemaTakesPayment", () => {
  it("detects a payment field and tolerates junk", () => {
    expect(schemaTakesPayment(PAID_SCHEMA)).toBe(true);
    expect(schemaTakesPayment(JSON.stringify({ root: [], entities: {} }))).toBe(false);
    expect(schemaTakesPayment("not json")).toBe(false);
    expect(schemaTakesPayment(undefined)).toBe(false);
  });
});

describe("createFormPaymentSession", () => {
  it("is null for a form that takes no payment, or whose charge is already paid", () => {
    expect(createFormPaymentSession(false, undefined)).toBeNull();
    expect(
      createFormPaymentSession(true, {
        available: true, provider: "stripe", publishableKey: "pk_test_1", accountId: "acct_1",
        scriptUrl: "https://js.stripe.com/v3/", alreadyPaid: true,
      }),
    ).toBeNull();
  });

  it("refuses to mount when payments aren't available, so the field explains and submit stops", async () => {
    for (const config of [
      undefined,
      { available: false, provider: "stripe", publishableKey: null, accountId: null, scriptUrl: "https://js.stripe.com/v3/" },
      // Never load a card form from anywhere but Stripe, whatever the payload says.
      { available: true, provider: "stripe", publishableKey: "pk_test_1", accountId: "acct_1", scriptUrl: "https://evil.example/stripe.js" },
      { available: true, provider: "stripe", publishableKey: "sk_live_oops", accountId: "acct_1", scriptUrl: "https://js.stripe.com/v3/" },
    ] as const) {
      const session = createFormPaymentSession(true, config)!;
      await expect(session.processor.mount({ container: document.createElement("div"), amountMinor: 1, currency: "USD" })).rejects.toThrow();
    }
  });
});

describe("completePayment", () => {
  it("confirms the server's charge, then trusts the server's check", async () => {
    const { session, confirm } = fakeSession();
    const sync = vi.fn().mockResolvedValue({ status: "succeeded", amountMinor: 4500, currency: "USD" });
    await expect(completePayment(session, START, sync)).resolves.toBe("succeeded");
    expect(confirm).toHaveBeenCalledWith("pi_1_secret_2", { amountMinor: 4500, currency: "USD" });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("after a decline, asks the server and keeps the decline on the field", async () => {
    const { session, setError } = fakeSession({ status: "failed", message: "declined" });
    const sync = vi.fn().mockResolvedValue({ status: "requires_payment", amountMinor: 4500, currency: "USD", message: "generic" });
    await expect(completePayment(session, START, sync)).resolves.toBe("retry");
    expect(sync).toHaveBeenCalledTimes(1);
    expect(setError).not.toHaveBeenCalled();
    // Server unreachable: still a retry.
    await expect(completePayment(session, START, () => Promise.reject(new Error("offline")))).resolves.toBe("retry");
  });

  it("a failed confirmation that Stripe actually took counts as paid; a cancelled one restarts", async () => {
    const { session, setError } = fakeSession({ status: "failed", message: "network" });
    const paid = vi.fn().mockResolvedValue({ status: "succeeded", amountMinor: 4500, currency: "USD" });
    await expect(completePayment(session, START, paid)).resolves.toBe("succeeded");
    expect(setError).toHaveBeenCalledWith(null);
    const gone = vi.fn().mockResolvedValue({ status: "canceled", amountMinor: 4500, currency: "USD" });
    await expect(completePayment(fakeSession({ status: "failed", message: "x" }).session, START, gone)).resolves.toBe("restart");
  });

  it("never confirms an amount the payer wasn't shown", async () => {
    const { session, confirm, setError } = fakeSession();
    const sync = vi.fn();
    await expect(completePayment(session, START, sync, { expected: { amountMinor: 4000, currency: "USD" } })).resolves.toBe("confirm");
    expect(confirm).not.toHaveBeenCalled();
    expect(setError.mock.calls[0]![0]).toMatch(/\$45\.00, not the \$40\.00 shown/);
    // No total was shown at all: approve first too.
    await expect(completePayment(session, START, sync, { expected: null })).resolves.toBe("confirm");
    expect(setError.mock.calls[1]![0]).toMatch(/The amount to pay is \$45\.00\. Check it/);
    // The same amount (currency case aside) goes straight through.
    const ok = vi.fn().mockResolvedValue({ status: "succeeded", amountMinor: 4500, currency: "USD" });
    await expect(completePayment(session, START, ok, { expected: { amountMinor: 4500, currency: "usd" } })).resolves.toBe("succeeded");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled();
  });

  it("with recheck, a charge that moved on is never confirmed again", async () => {
    const paidMeanwhile = fakeSession();
    const sync = vi.fn().mockResolvedValue({ status: "succeeded", amountMinor: 4500, currency: "USD" });
    await expect(completePayment(paidMeanwhile.session, START, sync, { recheck: true })).resolves.toBe("succeeded");
    expect(paidMeanwhile.confirm).not.toHaveBeenCalled();

    const cancelled = fakeSession();
    const gone = vi.fn().mockResolvedValue({ status: "canceled", amountMinor: 4500, currency: "USD" });
    await expect(completePayment(cancelled.session, START, gone, { recheck: true })).resolves.toBe("restart");
    expect(cancelled.confirm).not.toHaveBeenCalled();

    const payable = fakeSession();
    const still = vi.fn()
      .mockResolvedValueOnce({ status: "requires_payment", amountMinor: 4500, currency: "USD" })
      .mockResolvedValueOnce({ status: "succeeded", amountMinor: 4500, currency: "USD" });
    await expect(completePayment(payable.session, START, still, { recheck: true })).resolves.toBe("succeeded");
    expect(payable.confirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the charge payable when the server says it still needs a payment", async () => {
    const { session, setError } = fakeSession({ status: "processing" });
    const sync = vi.fn().mockResolvedValue({ status: "requires_payment", amountMinor: 1, currency: "USD", message: "Try again" });
    await expect(completePayment(session, START, sync)).resolves.toBe("retry");
    expect(setError).toHaveBeenCalledWith("Try again");
  });

  it("restarts when the charge is gone", async () => {
    const { session, confirm, setError } = fakeSession();
    await expect(completePayment(session, { ...START, status: "canceled", clientSecret: null }, vi.fn())).resolves.toBe("restart");
    expect(confirm).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalled();
    const sync = vi.fn().mockResolvedValue({ status: "canceled", amountMinor: 1, currency: "USD" });
    await expect(completePayment(fakeSession().session, START, sync)).resolves.toBe("restart");
  });

  it("counts Stripe's success when the server check can't be reached (the webhook settles it)", async () => {
    const { session } = fakeSession({ status: "succeeded" });
    await expect(completePayment(session, START, () => Promise.reject(new Error("offline")))).resolves.toBe("succeeded");
  });

  it("returns an already-settled charge as is", async () => {
    const { session, confirm } = fakeSession();
    await expect(completePayment(session, { ...START, status: "succeeded", clientSecret: null }, vi.fn())).resolves.toBe("succeeded");
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("previewCharge", () => {
  it("prices the answers as the payment field does, or says it couldn't", () => {
    const perUnit = JSON.stringify({
      root: ["qty", "pay"],
      entities: {
        qty: { id: "qty", type: "number", attributes: { key: "qty", required: true } },
        pay: { id: "pay", type: "payment", attributes: { key: "pay", amountMode: "perUnit", amountMinor: 1500, quantityFrom: "qty", currency: "usd" } },
      },
    });
    expect(previewCharge(perUnit, { qty: 3 })).toEqual({ amountMinor: 4500, currency: "USD" });
    expect(previewCharge(perUnit, {})).toBeNull();
    expect(previewCharge("junk", {})).toBeNull();
    expect(previewCharge(undefined, {})).toBeNull();
  });
});

describe("helpers", () => {
  it("builds a fixed-amount pay-only schema", () => {
    const s = JSON.parse(paymentOnlySchema("Payment", START));
    expect(s.entities.payment.attributes).toMatchObject({ amountMode: "fixed", amountMinor: 4500, currency: "USD" });
    expect(schemaTakesPayment(paymentOnlySchema("Payment", START))).toBe(true);
  });

  it("formats money with the currency's own decimals", () => {
    expect(formatMoney(4500, "USD")).toMatch(/45\.00/);
    expect(formatMoney(500, "JPY")).toMatch(/500/);
    expect(formatMoney(500, "JPY")).not.toMatch(/5\.00/);
    expect(formatMoney(1250, "KWD")).toMatch(/1\.250/);
    expect(formatMoney(5, "XYZ")).toBe("5 XYZ");
  });
});
