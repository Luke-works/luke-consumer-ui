import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible-dialog behaviour for a hand-rolled overlay (drawer or modal): on open,
 * focus the panel; trap Tab within it; close on Escape; restore focus to the trigger
 * on close. Mirrors the shared <Modal> so bespoke overlays get the same a11y.
 *
 * Apply the returned ref to the dialog panel and give it role="dialog", aria-modal,
 * an aria-label, and tabIndex={-1}. Call with the overlay's open state (pass `true`
 * for panels that are conditionally mounted only while open).
 */
export function useDialog<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  // Keep the latest onClose without re-running the effect each render (callers pass
  // inline arrows), which would otherwise steal focus back to the panel on every keystroke.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab" && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null,
        );
        if (items.length === 0) {
          event.preventDefault();
          return;
        }
        // length === 0 handled above, so both ends are defined.
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  return ref;
}
