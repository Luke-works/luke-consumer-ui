import { useMemo } from "react";
import type { PaymentSession } from "@lukeflow/form-react";
import FormRenderer from "./LukeFormRenderer";
import { formatMoney, paymentOnlySchema, type PaymentStart } from "../../lib/formPayments";

/**
 * The "complete your payment" step shared by the public doors: the submission is saved and priced, and
 * the payer only has to pay. Shown after a declined card, when the amount needs the payer's explicit OK,
 * and when a recipient comes back to an unpaid submission. The card form is the same Stripe Payment
 * Element, through the same session.
 *
 * With no `start`, the submission is saved but its charge couldn't be started yet: the step says so and
 * offers `onRetry` instead of a card form.
 */
export default function PaymentStep({
  start,
  session,
  busy,
  onPay,
  onChangeAnswers,
  error,
  onRetry,
}: {
  start: PaymentStart | null;
  session: PaymentSession;
  busy: boolean;
  onPay: () => void;
  /** Offered where answers may still change (the embed: submitting again starts a new charge). */
  onChangeAnswers?: () => void;
  /** Why the charge couldn't be started (only without `start`). */
  error?: string | null;
  onRetry?: () => void;
}) {
  const schema = useMemo(() => (start ? paymentOnlySchema("Payment", start) : ""), [start]);
  const changeAnswers = onChangeAnswers ? (
    <button
      type="button"
      onClick={onChangeAnswers}
      disabled={busy}
      className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60 dark:text-brand-400"
    >
      Change my answers
    </button>
  ) : null;

  if (!start) {
    return (
      <div>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
          Your answers are saved, but the payment couldn't be started.
        </p>
        {error ? (
          <p role="alert" className="mb-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-500 dark:bg-error-500/10">
            {error}
          </p>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? "Trying again…" : "Try again"}
          </button>
        ) : null}
        <div>{changeAnswers}</div>
      </div>
    );
  }

  const amount = formatMoney(start.amountMinor, start.currency);
  return (
    <div>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Your answers are saved. Pay {amount} to finish.
      </p>
      <FormRenderer schema={schema} payments={session} submitting={busy} submitLabel={`Pay ${amount}`} onSubmit={() => onPay()} />
      {changeAnswers}
    </div>
  );
}
