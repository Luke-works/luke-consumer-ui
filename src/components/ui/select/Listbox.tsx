import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export type ListboxOption = {
  value: string;
  label: string;
  /** Optional second line — a model's provider, a plan's price. */
  hint?: string;
  /** Heading this option sits under. Options with no group come first, ungrouped. */
  group?: string;
  disabled?: boolean;
};

export type ListboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: ListboxOption[];
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Shows a filter box once the list is longer than this. */
  searchAfter?: number;
  disabled?: boolean;
  size?: SelectSize;
  className?: string;
  /** Required: this replaces a native control, so it must still be named for a screen reader. */
  ariaLabel: string;
  id?: string;
  /**
   * Fired when the list opens.
   *
   * <p>For options that cost something to fetch — a provider's live model list, say — so the
   * round trip happens when someone actually looks rather than on every render of every row.
   */
  onOpen?: () => void;
};

export type SelectSize = "sm" | "md";

const BOX: Record<SelectSize, string> = {
  sm: "h-9 pl-3 pr-8 text-xs",
  md: "h-11 pl-4 pr-10 text-sm",
};

/**
 * A dropdown for lists the native one genuinely fails: long, grouped, worth searching.
 *
 * <p>Most selects in this app should NOT be this. A real `<Select>` gives correct mobile
 * keyboards, screen-reader behaviour and zoom handling for free, and re-implementing that is how
 * a dropdown ends up looking better and working worse. This exists for the cases where the
 * native popup is actively unhelpful — a provider's model list, say, which arrives grouped, runs
 * to dozens of entries, and has names nobody can scan without filtering.
 *
 * <p>Because it replaces a control people rely on, it has to earn the swap:
 * `role="combobox"` + `role="listbox"` with `aria-activedescendant`, full keyboard handling
 * (arrows, Home/End, Enter, Escape, type-ahead), and a visible focus ring. It renders through a
 * portal because the panels it lives in clip their overflow — the AI assistant panel is
 * `overflow-hidden`, so an in-flow popup would be cut off at the panel edge.
 */
export default function Listbox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchAfter = 8,
  disabled = false,
  size = "md",
  className = "",
  ariaLabel,
  id,
  onOpen,
}: ListboxProps) {
  const reactId = useId();
  const listId = `${id ?? reactId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Type-ahead state, for jumping to an option by typing when there is no search box.
  const typed = useRef({ text: "", at: 0 });

  const selected = options.find((o) => o.value === value);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  /** Grouped for rendering, preserving the order the caller gave. */
  const groups = useMemo(() => {
    const out: { name: string | undefined; items: ListboxOption[] }[] = [];
    for (const option of visible) {
      const last = out[out.length - 1];
      if (last && last.name === option.group) last.items.push(option);
      else out.push({ name: option.group, items: [option] });
    }
    return out;
  }, [visible]);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Fixed positioning means the popup does not travel with a scrolling ancestor, so follow it.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, visible.findIndex((o) => o.value === value)));
    // Focus the filter when there is one; otherwise the trigger keeps focus and drives the list.
    if (visible.length > searchAfter) searchRef.current?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popupRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    onOpen?.();
  };

  const close = (refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };

  const pick = (option: ListboxOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };

  const move = (delta: number) => {
    if (!visible.length) return;
    setActive((i) => {
      let next = i;
      // Step over disabled entries rather than landing on something unselectable.
      for (let step = 0; step < visible.length; step++) {
        next = (next + delta + visible.length) % visible.length;
        if (!visible[next]?.disabled) break;
      }
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(visible.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (visible[active]) pick(visible[active]);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        // Tab commits nothing and moves on, like a native select losing focus.
        close(false);
        break;
      default: {
        // Type-ahead, for when there is no filter box to type into.
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
        if (visible.length > searchAfter) return;
        const now = Date.now();
        typed.current.text = now - typed.current.at > 700 ? e.key : typed.current.text + e.key;
        typed.current.at = now;
        const hit = visible.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text.toLowerCase()));
        if (hit >= 0) setActive(hit);
      }
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  let flat = -1; // running index across groups, so aria-activedescendant matches `visible`

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={open && visible[active] ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
        className={[
          "relative flex w-full items-center justify-between gap-2 rounded-lg border bg-white text-left font-medium text-gray-800 transition",
          "hover:border-gray-400 focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-500/10",
          "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400",
          "border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:hover:border-gray-600",
          BOX[size],
          className,
        ].join(" ")}
      >
        <span className="truncate">
          {selected ? selected.label : <span className="text-gray-400">{placeholder}</span>}
        </span>
        <ChevronDown
          aria-hidden
          className={`shrink-0 text-gray-400 transition ${size === "sm" ? "size-3.5" : "size-4"} ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={popupRef}
              style={{
                position: "fixed",
                top: Math.min(rect.bottom + 6, window.innerHeight - 24),
                left: rect.left,
                width: Math.max(rect.width, 240),
                maxHeight: Math.max(160, window.innerHeight - rect.bottom - 24),
              }}
              className="z-[60] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
            >
              {visible.length > searchAfter || query ? (
                <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
                  <Search aria-hidden className="size-4 shrink-0 text-gray-400" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder="Filter…"
                    aria-label={`Filter ${ariaLabel}`}
                    className="w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-white/90"
                  />
                </div>
              ) : null}

              <ul
                id={listId}
                role="listbox"
                aria-label={ariaLabel}
                className="max-h-[inherit] overflow-y-auto overscroll-contain py-1"
                style={{ maxHeight: "min(320px, 60vh)" }}
              >
                {groups.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-gray-400">Nothing matches “{query}”.</li>
                ) : (
                  groups.map((group) => (
                    <li key={group.name ?? "__ungrouped"} role="presentation">
                      {group.name ? (
                        <p
                          id={`${listId}-grp-${group.name}`}
                          className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400"
                        >
                          {group.name}
                        </p>
                      ) : null}
                      {/* role="group" so the heading is announced, not merely drawn: a screen
                          reader user otherwise hears a flat list and loses which provider a
                          model belongs to, which is the whole reason it is grouped. */}
                      <ul
                        role={group.name ? "group" : "presentation"}
                        aria-labelledby={group.name ? `${listId}-grp-${group.name}` : undefined}
                      >
                        {group.items.map((option) => {
                          flat += 1;
                          const i = flat;
                          const isActive = i === active;
                          const isSelected = option.value === value;
                          return (
                            <li
                              key={option.value}
                              id={optionId(i)}
                              role="option"
                              aria-selected={isSelected}
                              aria-disabled={option.disabled || undefined}
                              onMouseEnter={() => setActive(i)}
                              onClick={() => pick(option)}
                              className={[
                                "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm",
                                option.disabled ? "cursor-not-allowed opacity-50" : "",
                                isActive ? "bg-brand-50 dark:bg-brand-500/10" : "",
                                isSelected ? "font-medium text-brand-600 dark:text-brand-300" : "text-gray-700 dark:text-gray-200",
                              ].join(" ")}
                            >
                              <Check
                                aria-hidden
                                className={`mt-0.5 size-3.5 shrink-0 ${isSelected ? "" : "invisible"}`}
                              />
                              <span className="min-w-0">
                                <span className="block truncate">{option.label}</span>
                                {option.hint ? (
                                  <span className="block truncate text-xs text-gray-400">{option.hint}</span>
                                ) : null}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
