// Form payments on the PUBLIC fill surfaces (embed + respond). The card form is Stripe's Payment
// Element, mounted by the payment field through a PaymentSession; this module builds that session from
// the server's public config and runs the one flow both doors share: confirm the server-created charge,
// then ask the server to check it with Stripe.
//
// The browser never decides what is charged or whether it was paid: the server prices the submission,
// creates the charge, and only releases the submission once Stripe says the charge succeeded.
import { currencyOf, hasPayment, resolvePaymentAmount, toMajorString, type FormSchema } from "@lukeflow/form-core";
import { createPaymentSession, type PaymentProcessor, type PaymentSession } from "@lukeflow/form-react";
import { createStripeProcessor } from "@lukeflow/form-react/stripe";

/** What the render payload carries for a form that takes a payment. Public keys only. */
export type PublicPaymentConfig = {
  /** Whether the form can take a payment right now (platform configured, plan, connected account). */
  available: boolean;
  provider: "stripe";
  /** The platform's publishable key (pk_…), or null when unavailable. */
  publishableKey: string | null;
  /** The tenant's connected Stripe account (acct_…), or null when unavailable. */
  accountId: string | null;
  scriptUrl: string;
  /**
   * This submission's charge already succeeded (a paid form reopened for correction): no card is asked
   * for, and resubmitting it charges nothing. Respond surface only.
   */
  alreadyPaid?: boolean;
  paidAmountMinor?: number;
  paidCurrency?: string;
};

export type PaymentStatus = "requires_payment" | "processing" | "succeeded" | "canceled" | "failed";

/** The charge the server created for a submission. */
export type PaymentStart = {
  status: PaymentStatus;
  /** Only while the charge is payable; never persisted. */
  clientSecret: string | null;
  amountMinor: number;
  currency: string;
};

/** The server's reading of a charge after asking Stripe. */
export type PaymentSync = {
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  message?: string;
};

/**
 * How a payment attempt ended, from the payer's point of view:
 *  - `succeeded` / `processing` — done; the server releases the submission once Stripe settles it.
 *  - `retry`   — the SAME charge can be paid again (a decline, an incomplete card).
 *  - `confirm` — nothing was charged: the server's amount isn't the one the payer was shown, so they
 *                must approve it explicitly (the pay step names the amount) before it is charged.
 *  - `restart` — the charge can't be paid any more (cancelled); the form has to be submitted again.
 */
export type PaymentOutcome = "succeeded" | "processing" | "retry" | "confirm" | "restart";

/** An amount in minor units with its currency code. */
export type Money = { amountMinor: number; currency: string };

export const RESTART_MESSAGE = "This payment can no longer be completed. Please submit the form again.";

const UNAVAILABLE: PaymentProcessor = {
  mount: () => Promise.reject(new Error("Payments are not available for this form right now.")),
};

/** Whether a served schema (JSON string) takes a payment. Tolerant of junk. */
export function schemaTakesPayment(rawSchema: string | null | undefined): boolean {
  if (!rawSchema) return false;
  try {
    return hasPayment(JSON.parse(rawSchema) as FormSchema);
  } catch {
    return false;
  }
}

/**
 * The payment session for a form, or null when the form takes no payment. When payments aren't
 * available the session still exists — its processor refuses to mount, so the payment field tells the
 * payer why and submitting stops at validation instead of failing at the server.
 */
export function createFormPaymentSession(takesPayment: boolean, config: PublicPaymentConfig | null | undefined): PaymentSession | null {
  // Already paid: the payment field shows the recorded charge, and no card is asked for.
  if (!takesPayment || config?.alreadyPaid) return null;
  if (!config?.available || !config.publishableKey || !config.accountId) return createPaymentSession(UNAVAILABLE);
  try {
    return createPaymentSession(
      createStripeProcessor({
        publishableKey: config.publishableKey,
        stripeAccount: config.accountId,
        scriptUrl: config.scriptUrl || undefined,
        returnUrl: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    );
  } catch {
    // A malformed key or a non-Stripe script URL: refuse rather than load anything else.
    return createPaymentSession(UNAVAILABLE);
  }
}

/**
 * What the payment field showed for these answers — the same `resolvePaymentAmount` the server runs,
 * against the schema the SERVER prices with. Null when it couldn't show a total.
 */
export function previewCharge(rawSchema: string | null | undefined, data: Record<string, unknown>): Money | null {
  if (!rawSchema) return null;
  try {
    const r = resolvePaymentAmount(JSON.parse(rawSchema) as FormSchema, data);
    return r.ok ? { amountMinor: r.amountMinor, currency: r.currency } : null;
  } catch {
    return null;
  }
}

const sameMoney = (a: Money, b: Money) => a.amountMinor === b.amountMinor && a.currency.toUpperCase() === b.currency.toUpperCase();

export type CompletePaymentOptions = {
  /**
   * The amount the payer was shown before submitting (`null`: no total could be shown). When given and
   * it isn't the server's figure, nothing is charged: the outcome is `confirm`, so the payer approves
   * the real amount first. Omit it when the payer is already looking at the server's amount.
   */
  expected?: Money | null;
  /** Re-read the charge from the server before confirming (a stored charge may have moved on). */
  recheck?: boolean;
};

/**
 * Pay the charge the server just created, then have the server confirm it with Stripe.
 *
 * On `retry` / `confirm` / `restart` the reason is already shown on the payment field. After ANY
 * confirmation attempt the server is asked what really happened: a charge Stripe took whose response
 * never reached the browser still counts, and one that was cancelled is never offered again. If Stripe.js
 * reported success but the check can't reach the server, the payment still counts — the server settles
 * it from Stripe's webhook.
 */
export async function completePayment(
  session: PaymentSession,
  start: PaymentStart,
  sync: () => Promise<PaymentSync>,
  options: CompletePaymentOptions = {},
): Promise<PaymentOutcome> {
  if (start.status === "succeeded" || start.status === "processing") return start.status;
  if (start.status !== "requires_payment" || !start.clientSecret) {
    session.setError(RESTART_MESSAGE);
    return "restart";
  }
  if (options.expected !== undefined && (options.expected === null || !sameMoney(options.expected, start))) {
    const actual = formatMoney(start.amountMinor, start.currency);
    session.setError(
      options.expected
        ? `The amount to pay is ${actual}, not the ${formatMoney(options.expected.amountMinor, options.expected.currency)} shown before. Check it, then pay to finish.`
        : `The amount to pay is ${actual}. Check it, then pay to finish.`,
    );
    return "confirm";
  }
  if (options.recheck) {
    try {
      const now = await sync();
      if (now.status === "succeeded" || now.status === "processing") return now.status;
      if (now.status !== "requires_payment") {
        session.setError(RESTART_MESSAGE);
        return "restart";
      }
    } catch {
      /* can't tell — confirming is still safe: Stripe refuses a charge that can't be paid */
    }
  }
  const confirmed = await session.confirm(start.clientSecret, { amountMinor: start.amountMinor, currency: start.currency });
  try {
    const checked = await sync();
    if (checked.status === "succeeded" || checked.status === "processing") {
      if (confirmed.status === "failed") session.setError(null); // it went through after all
      return checked.status;
    }
    if (checked.status === "requires_payment") {
      // A failed confirm has already put its own reason on the field.
      if (confirmed.status !== "failed") session.setError(checked.message ?? "The payment didn't go through. Please try again.");
      return "retry";
    }
    session.setError(RESTART_MESSAGE);
    return "restart";
  } catch {
    return confirmed.status === "failed" ? "retry" : confirmed.status;
  }
}

/** Format minor units for a sentence ("$45.00"), using the currency's own number of decimals. */
export function formatMoney(amountMinor: number, currency: string): string {
  const info = currencyOf(currency);
  if (!info) return `${amountMinor} ${currency}`;
  const major = toMajorString(amountMinor, info);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: info.code,
      minimumFractionDigits: info.exponent,
      maximumFractionDigits: info.exponent,
    }).format(Number(major));
  } catch {
    return `${major} ${info.code}`;
  }
}

/**
 * A one-field schema that shows a saved charge and collects the card for it — the "pay" step a payer
 * sees after a decline or when coming back to an unpaid submission. A FIXED amount on purpose: the
 * charge already exists at this amount, and the answers that priced it can no longer change.
 */
export function paymentOnlySchema(label: string, start: Pick<PaymentStart, "amountMinor" | "currency">): string {
  return JSON.stringify({
    root: ["payment"],
    entities: {
      payment: {
        id: "payment",
        type: "payment",
        attributes: { key: "payment", label, amountMode: "fixed", amountMinor: start.amountMinor, currency: start.currency },
      },
    },
  });
}
