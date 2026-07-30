/**
 * TurnstileGate — the Cloudflare challenge the public embed must pass before it can submit.
 *
 * Mounted only on the ANONYMOUS embed surface. The recipient links are already OTP-gated per person
 * and the in-app fill is authenticated, so neither needs (or gets) a challenge.
 *
 * <p>Dependency-free, like {@link FormConsentGate} — the embed bundle is served standalone inside a
 * third-party iframe and must not pull in app chrome.
 *
 * <p><b>The widget is a courtesy, not the control.</b> core-engine verifies the token against
 * Cloudflare on every submit; a client that skips, fakes or replays this is refused server-side.
 *
 * <p>Rendered with `appearance: "interaction-only"`, so most fillers see nothing at all and completion
 * rates are unaffected — the widget only becomes visible when Cloudflare actually wants a check.
 */
import { useEffect, useRef } from "react";
import { loadTurnstile, type TurnstileApi } from "../../lib/turnstile";

export default function TurnstileGate({
  sitekey,
  onToken,
  onError,
  resetSignal = 0,
}: {
  /** The PUBLIC sitekey, from the server's render payload — never hardcoded per environment. */
  sitekey: string;
  /** A solved challenge, or null when the token is cleared (expired, errored, or reset). */
  onToken: (token: string | null) => void;
  /** The widget could not be loaded or run. The host decides how to say so. */
  onError: (message: string) => void;
  /** Bump to force a fresh challenge. Turnstile tokens are single-use, so a failed submit MUST reset
   *  or the retry sends a token Cloudflare has already burned. */
  resetSignal?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const api = useRef<TurnstileApi | null>(null);
  // Callbacks arrive fresh each render; keep them in refs so the render effect below does not
  // re-run (and re-render the widget) on every keystroke in the form.
  const cb = useRef({ onToken, onError });
  cb.current = { onToken, onError };

  useEffect(() => {
    let alive = true;
    loadTurnstile()
      .then((turnstile) => {
        if (!alive || !holder.current || widgetId.current) return;
        api.current = turnstile;
        widgetId.current = turnstile.render(holder.current, {
          sitekey,
          appearance: "interaction-only",
          size: "flexible",
          callback: (token: string) => cb.current.onToken(token),
          // A token that expires while the form sits open must not be submitted as if it were fresh —
          // clearing it here is what stops a stale token going out silently.
          "expired-callback": () => cb.current.onToken(null),
          "timeout-callback": () => cb.current.onToken(null),
          "error-callback": () => {
            cb.current.onToken(null);
            cb.current.onError("The security check could not be completed. Please reload and try again.");
          },
        });
      })
      .catch(() => {
        if (alive) cb.current.onError("The security check could not be loaded. Please reload and try again.");
      });
    return () => {
      alive = false;
      // Cloudflare keeps its own DOM + timers; React unmounting our div is not enough to stop them.
      if (api.current && widgetId.current) {
        try {
          api.current.remove(widgetId.current);
        } catch {
          /* already gone — nothing to clean up */
        }
        widgetId.current = null;
      }
    };
  }, [sitekey]);

  // Reset on demand. Skipped on the initial render: `resetSignal` starts at 0 and resetting a widget
  // that has just been created would throw away the challenge it is in the middle of solving.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    cb.current.onToken(null);
    if (api.current && widgetId.current) api.current.reset(widgetId.current);
  }, [resetSignal]);

  return <div ref={holder} data-testid="turnstile-gate" className="mb-4 empty:mb-0" />;
}
