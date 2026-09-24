import { forwardRef, type SelectHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";
import { ChevronDown } from "lucide-react";

// Omit the native `size`, which is a NUMBER of visible rows — intersecting it with our
// "sm" | "md" yields `never` and every use of it silently degrades to `any`.
export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  /** Matches the app's input heights: `md` beside text inputs, `sm` in dense rows and toolbars. */
  size?: SelectSize;
  /** Red border + `aria-invalid`, for a field a form has rejected. */
  invalid?: boolean;
  /**
   * Fills its container — the common case, and what a select in a labelled field wants.
   *
   * <p>Pass `false` for a control that sits in a flex row and should size to its own content;
   * a full-width wrapper there stretches it across the whole row.
   */
  fullWidth?: boolean;
  /** Layout for the wrapper (width, margin). Appearance belongs on `className`. */
  wrapperClassName?: string;
};

export type SelectSize = "sm" | "md";

const BOX: Record<SelectSize, string> = {
  sm: "h-9 pl-3 pr-8 text-xs",
  md: "h-11 pl-4 pr-10 text-sm",
};

const CHEVRON: Record<SelectSize, string> = {
  sm: "right-2.5 size-3.5",
  md: "right-3.5 size-4",
};

/**
 * The app's select.
 *
 * <p>Still a real `<select>` underneath, deliberately. The browser's own popup is the most
 * reliable list we can put in front of someone — correct on every mobile keyboard, every screen
 * reader, every zoom level — and re-implementing it buys appearance at the cost of things that
 * currently work for free. What is wrong with the native control is its CLOSED state, which is
 * all anyone actually looks at, and that is entirely ours to style.
 *
 * <p>So: `appearance-none` to drop the OS chevron, one of our own, and a single set of tokens.
 * Before this, eighteen selects across the app had drifted into their own spellings —
 * `border-gray-200` beside `border-gray-300`, `bg-white` beside `bg-transparent`, two different
 * focus colours — which is most of why they looked unfinished next to the inputs beside them.
 *
 * <p>`className` is merged with `twMerge`, not concatenated. Concatenation looks like it works
 * and does not: two Tailwind classes for the same property have equal specificity, so the winner
 * is whichever sits later in the generated STYLESHEET, not later in the attribute. A call site
 * passing `h-8` would silently keep this component's `h-9` — which is exactly what happened
 * while these call sites still carried their old hand-rolled styles.
 *
 * <p>Where a list is long or grouped enough that the native popup genuinely fails it, use
 * `Listbox` instead. That one earns its complexity; this one should stay boring.
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", invalid = false, fullWidth = true, wrapperClassName, className, disabled, children, ...rest },
  ref,
) {
  return (
    <div className={twMerge("relative", fullWidth ? "w-full" : "inline-block", wrapperClassName)}>
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={twMerge(
          "w-full appearance-none rounded-lg border bg-white font-medium text-gray-800 transition",
          "focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-500/10",
          "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400",
          "dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800 dark:disabled:text-gray-500",
          invalid
            ? "border-error-400 focus:border-error-500 focus:ring-error-500/10 dark:border-error-500/60"
            : "border-gray-300 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600",
          BOX[size],
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {/* Ours, not the OS one. pointer-events-none so the whole control still opens on click. */}
      <ChevronDown
        aria-hidden
        className={twMerge(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400 transition",
          CHEVRON[size],
          disabled ? "opacity-40" : "",
        )}
      />
    </div>
  );
});

export default Select;
