import { useRef, useEffect } from "react";

/**
 * Space a dialog's top-right content must leave for the floating close button.
 *
 * The X is absolutely positioned over the content (44px, inset 24px), so anything a caller puts in
 * the top-right corner runs underneath it — which has now bitten a heading, a paragraph and a
 * button row in three different dialogs. It is NOT applied automatically: padding the whole content
 * wrapper would indent every dialog body by 56px, and a float spacer breaks the callers whose
 * content is a flex column. Reserving it belongs to whatever the caller actually puts up there.
 *
 * Apply to the element that reaches furthest right at the top — usually the header row, or the
 * heading AND its description when they are separate blocks.
 */
export const MODAL_HEADER_SAFE = "pe-14";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  /**
   * Classes for the wrapper around `children`.
   *
   * Children are wrapped in a div, so a dialog laying itself out as a flex column — header, scrolling
   * body, footer, the standard shape for anything with more content than fits — cannot do it from
   * `className` alone: that styles the OUTER box, and the wrapper in between stays block-flow, which
   * silently defeats `flex-1` / `min-h-0` on the body. (It did exactly that to the form settings
   * dialog: the body grew to its content, the footer was pushed out, and `overflow-hidden` clipped
   * the lot with nothing scrollable.) Pass the layout here instead — e.g.
   * `className="h-[32rem] overflow-hidden"` + `contentClassName="flex h-full flex-col"`.
   */
  contentClassName?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // New prop to control close button visibility
  isFullscreen?: boolean; // Default to false for backwards compatibility
  /** Accessible name for the dialog (falls back to a generic label). */
  ariaLabel?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  contentClassName,
  showCloseButton = true, // Default to true for backwards compatibility
  isFullscreen = false,
  ariaLabel = "Dialog",
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Keep the latest onClose in a ref so the focus-trap effect can call it without
  // listing onClose as a dependency. Callers pass an inline `() => ...` that changes
  // identity on every render; if the effect depended on it, each parent re-render
  // (e.g. every keystroke in a child input) would re-run the effect and `node.focus()`
  // would steal focus back to the dialog — losing focus from the input on each char.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Accessibility (#34): on open focus the dialog and trap Tab inside it; Esc closes;
  // restore focus to the trigger on close. Selecting a builder field opens this modal,
  // so this is also "focus moves to the settings panel on select".
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = modalRef.current;
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

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const contentClasses = isFullscreen
    ? "w-full h-full"
    : "relative w-full rounded-3xl bg-white  dark:bg-gray-900";

  return (
    // Pad the viewport for non-fullscreen dialogs so a `w-full` content box (the
    // common caller pattern) can never exceed the screen on phones — this is what
    // keeps every modal in the app inset from the edges uniformly instead of each
    // caller having to remember `mx-4`.
    <div
      className={`fixed inset-0 flex items-center justify-center overflow-y-auto modal z-99999 ${
        isFullscreen ? "" : "p-4 sm:p-6"
      }`}
    >
      {!isFullscreen && (
        <div
          className="fixed inset-0 h-full w-full bg-gray-400/50 backdrop-blur-[32px]"
          onClick={onClose}
          aria-hidden="true"
        ></div>
      )}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`${contentClasses} outline-none ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute right-3 top-3 z-999 flex h-9.5 w-9.5 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white sm:right-6 sm:top-6 sm:h-11 sm:w-11"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
                fill="currentColor"
              />
            </svg>
          </button>
        )}
        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  );
};
