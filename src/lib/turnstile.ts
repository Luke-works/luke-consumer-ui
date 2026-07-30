/**
 * Cloudflare Turnstile script loader — one script tag per page, however many widgets ask for it.
 *
 * The embed page is a standalone bundle served inside someone else's iframe, so this is deliberately
 * dependency-free (no npm wrapper) and idempotent: React StrictMode double-invokes effects in dev, and
 * a form that re-renders must not append a second copy of Cloudflare's script.
 *
 * The URL is pinned to the EXPLICIT-render build. The implicit build scans the DOM for
 * `.cf-turnstile` on load and races React's rendering; explicit means we call `render()` ourselves,
 * when our container actually exists.
 */

/** The Turnstile options we use. Cloudflare's API is larger; this is the slice we depend on. */
export type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: (code?: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  /** `interaction-only` keeps the widget invisible unless Cloudflare decides a human check is needed. */
  appearance?: "always" | "execute" | "interaction-only";
  size?: "normal" | "flexible" | "compact";
  theme?: "auto" | "light" | "dark";
};

export type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** In-flight/settled load, shared by every caller — this is what makes the loader idempotent. */
let pending: Promise<TurnstileApi> | null = null;

/**
 * Resolve with the Turnstile API, loading the script if it isn't there yet.
 *
 * Rejects if the script fails to load — the caller must surface that rather than leaving a form that
 * silently can never be submitted. A failed load is NOT cached: a filler on a flaky connection should
 * get another attempt on the next render rather than being locked out for the life of the page.
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (pending) return pending;

  pending = new Promise<TurnstileApi>((resolve, reject) => {
    const done = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile loaded but did not register"));
    };
    // Reuse a tag another mount already added, rather than adding a second one.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile script failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile script failed to load")), { once: true });
    document.head.appendChild(script);
  }).catch((e) => {
    pending = null; // don't cache a failure — let the next attempt retry
    throw e;
  });

  return pending;
}

/** Test seam: forget any cached load so a suite can start from a clean slate. */
export function resetTurnstileLoaderForTests(): void {
  pending = null;
}
