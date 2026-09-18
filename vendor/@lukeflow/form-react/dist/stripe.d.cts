/** An amount in integer minor units with its uppercase ISO-4217 code. */
interface PaymentAmount {
    amountMinor: number;
    currency: string;
}
/** What a processor needs to mount its payment UI. */
interface PaymentMountOptions extends PaymentAmount {
    /** The element the processor renders into. Owned by the field; do not remove it. */
    container: HTMLElement;
    /** BCP-47 locale for the processor's own strings. */
    locale?: string;
    /** Called as the payer types, with whether the details are complete. */
    onChange?: (state: {
        complete: boolean;
    }) => void;
    /**
     * Called if the processor's UI fails to load AFTER `mount` resolved (a blocked iframe, a network
     * drop). The session then reports `unavailable`, so the host doesn't submit into a dead card form.
     */
    onLoadError?: (message: string) => void;
    /**
     * Aborted when the field no longer wants this mount (it unmounted before the mount resolved). The
     * processor should remove whatever it already put in the container and reject.
     */
    signal?: AbortSignal;
}
/** How a confirmation ended. `processing` means the processor will settle it later. */
type PaymentConfirmResult = {
    status: "succeeded" | "processing";
} | {
    status: "failed";
    message: string;
};
/** A mounted processor UI. */
interface PaymentMount {
    /** Keep the processor's displayed amount in step with the form. */
    update(amount: PaymentAmount): void | Promise<void>;
    /** Check the collected details WITHOUT charging. Resolves to a payer-facing message, or `null`. */
    validate(): Promise<string | null>;
    /** Confirm the server-created charge. `amount` is the SERVER's figure. */
    confirm(clientSecret: string, amount: PaymentAmount): Promise<PaymentConfirmResult>;
    /** Tear the UI down. Called when the field unmounts. */
    destroy(): void;
}
/** A payment processor adapter. */
interface PaymentProcessor {
    mount(options: PaymentMountOptions): Promise<PaymentMount>;
}

/**
 * `@lukeflow/form-react/stripe` — a {@link PaymentProcessor} backed by Stripe's Payment Element.
 *
 * Opt-in subpath: importing `@lukeflow/form-react` never pulls this in, and this module imports no
 * React and no Stripe npm package. Stripe.js itself is loaded at runtime from `js.stripe.com`, and
 * ONLY from there — PCI DSS (SAQ A) requires the card fields to come straight from Stripe, so a
 * bundled or self-hosted copy is refused at construction.
 *
 * Integration shape (deferred intent, Connect direct charge):
 *  - Elements is created WITHOUT an intent (`mode: "payment"`, amount, currency), so the card form
 *    renders before the server has priced anything.
 *  - `validate()` is `elements.submit()`; the host then submits the form and the server creates
 *    the PaymentIntent ON THE CONNECTED ACCOUNT (hence `stripeAccount`).
 *  - `confirm()` is `stripe.confirmPayment({ redirect: "if_required" })`.
 *
 * Card only, wallets off. Forms are commonly embedded in an iframe, where redirect-based payment
 * methods break and Apple Pay / Google Pay need per-domain registration on every connected
 * account. Cards (including 3-D Secure, which Stripe runs in a modal) work everywhere. The
 * server creates the intent with `payment_method_types=["card"]` to match — Stripe requires the
 * two to agree.
 *
 * Content-Security-Policy for a page using this: `script-src https://js.stripe.com
 * https://*.js.stripe.com; frame-src https://js.stripe.com https://*.js.stripe.com
 * https://hooks.stripe.com; connect-src https://api.stripe.com`.
 *
 * @packageDocumentation
 */

/** A Stripe.js error object (the fields we read). */
interface StripeJsError {
    type?: string;
    code?: string;
    message?: string;
}
/** The Payment Element (the calls we make). */
interface StripeJsPaymentElement {
    mount(target: HTMLElement): void;
    on(event: "change", handler: (e: {
        complete?: boolean;
    }) => void): void;
    on(event: "loaderror", handler: (e: {
        error?: StripeJsError;
    }) => void): void;
    on(event: "ready", handler: () => void): void;
    destroy(): void;
}
/** A Stripe.js Elements group. */
interface StripeJsElements {
    create(type: "payment", options?: Record<string, unknown>): StripeJsPaymentElement;
    update(options: Record<string, unknown>): void | Promise<void>;
    submit(): Promise<{
        error?: StripeJsError;
    }>;
}
/** A Stripe.js instance. */
interface StripeJs {
    elements(options: Record<string, unknown>): StripeJsElements;
    confirmPayment(options: Record<string, unknown>): Promise<{
        error?: StripeJsError;
        paymentIntent?: {
            id?: string;
            status?: string;
        };
    }>;
}
/** The global `Stripe(...)` factory Stripe.js installs. */
type StripeJsFactory = (publishableKey: string, options?: Record<string, unknown>) => StripeJs;
/** The default Stripe.js URL. `/v3/` matches the API version the server-side SDK pins. */
declare const DEFAULT_STRIPE_JS_URL = "https://js.stripe.com/v3/";
interface StripeProcessorOptions {
    /** The PLATFORM's publishable key (`pk_…`). */
    publishableKey: string;
    /** The connected account the charge is created on (`acct_…`). Required for direct charges. */
    stripeAccount?: string;
    /** Stripe.js URL. Must be served from `https://js.stripe.com/`. */
    scriptUrl?: string;
    /** Where a redirect-based step returns to. Defaults to the current page. */
    returnUrl?: string;
    /** Stripe Appearance API object. Defaults to colours read from the form's `--lf-*` tokens. */
    appearance?: Record<string, unknown>;
    /** Test seam: supply the factory instead of loading the script. */
    loadStripe?: () => Promise<StripeJsFactory>;
    /** How long to wait for Stripe.js, and then for the card form to be ready, in ms. Default 20 000. */
    loadTimeoutMs?: number;
}
/** Map a BCP-47 tag to a Stripe Elements locale. */
declare function toStripeLocale(locale: string | undefined): string;
/** @internal Test helper: forget cached loads. */
declare function _resetStripeLoader(): void;
/**
 * Build a Stripe Appearance from the form's design tokens. The card fields live in Stripe's
 * iframe, which cannot see the page's CSS variables, so the resolved values are passed across.
 */
declare function appearanceFromTokens(el: HTMLElement): Record<string, unknown>;
/** Create a {@link PaymentProcessor} for Stripe's Payment Element. */
declare function createStripeProcessor(options: StripeProcessorOptions): PaymentProcessor;

export { DEFAULT_STRIPE_JS_URL, type StripeJs, type StripeJsElements, type StripeJsError, type StripeJsFactory, type StripeJsPaymentElement, type StripeProcessorOptions, _resetStripeLoader, appearanceFromTokens, createStripeProcessor, toStripeLocale };
