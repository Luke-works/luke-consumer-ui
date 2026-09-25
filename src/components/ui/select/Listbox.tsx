import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { twMerge } from "tailwind-merge";
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

/** Room to leave between the popup and the viewport edge. */
const GUTTER = 24;
const MAX_POPUP = 320;
/** Model ids are long; a popup matching a narrow trigger truncates all of them. */
const MIN_POPUP_WIDTH = 240;

/**
 * A dropdown for lists the native one genuinely fails: long, grouped, worth searching.
 *
 * <p>Most selects in this app should NOT be this. A real `<select>` gives correct mobile
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
 *
 * <p>Two things a native `<select>` does for free that this had to be taught, both found in
 * review rather than in use:
 *
 * <ul>
 *   <li><b>It can show a value it has no option for.</b> Both call sites fetch their options
 *       lazily on open, so between mount and that fetch the selected value is not in `options`.
 *       Deriving the label purely from `options` made a saved model render as "Select…" — the
 *       control reporting that nothing is pinned when something is. The native version it
 *       replaced had an explicit fallback for this, with a comment explaining why; the
 *       conversion dropped it.</li>
 *   <li><b>Its highlight follows the selection.</b> The active index has to be recomputed when
 *       the lazily-fetched options arrive, or the highlight sits on entry 0 while
 *       `aria-selected` sits elsewhere — and Enter then commits the wrong row.</li>
 * </ul>
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
  const baseId = id ?? reactId;
  const listId = `${baseId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Type-ahead state, for jumping to an option by typing when there is no search box.
  const typed = useRef({ text: "", at: 0 });

  const selected = options.find((o) => o.value === value);
  /**
   * The label for a value we have no option for — see the class note above. Rendered from the
   * value itself, which for a model id is the same string the option would have shown.
   */
  const orphanLabel = value && !selected ? value : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  /**
   * Grouped for rendering.
   *
   * <p>Keyed by group NAME, not by consecutive runs. A caller's array is not sorted by group —
   * a provider returns its models in its own order — so a run-based grouping repeats a heading
   * every time the array interleaves, which produced duplicate React keys and duplicate DOM ids
   * for the same heading. Order of first appearance is preserved, so the caller still controls
   * which group comes first.
   */
  const groups = useMemo(() => {
    const byName = new Map<string | undefined, ListboxOption[]>();
    for (const option of visible) {
      const existing = byName.get(option.group);
      if (existing) existing.push(option);
      else byName.set(option.group, [option]);
    }
    return [...byName.entries()].map(([name, items]) => ({ name, items }));
  }, [visible]);

  /** Flat order matching what is rendered, so `active` indexes the same list the eye sees. */
  const flatOptions = useMemo(() => groups.flatMap((g) => g.items), [groups]);

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

  /**
   * Keep the highlight on the selection.
   *
   * <p>Has to re-run when the options ARRIVE, because they are fetched after opening — keyed on
   * `open` alone this ran against an empty list and never corrected itself.
   *
   * <p>But it must not re-run merely because the array is a NEW array. Both call sites build
   * `options` inline, so every parent render mints a fresh one — a streaming assistant turn, a
   * sibling row going busy — and depending on its identity meant the highlight snapped back to
   * the selection every time, so a keyboard user could not arrow anywhere while the panel was
   * alive. Depending on the CONTENT fires on a real change and stays quiet for a re-render.
   */
  //
  // <p>Built from `options`, the UNFILTERED prop, and skipped entirely while a query is active:
  // once someone is filtering, the filter owns the highlight (it puts it on the top match).
  //
  // <p>`query` is in the deps, and that is load-bearing rather than tidiness. Reading it inside
  // the effect while leaving it out meant CLEARING the filter re-ran nothing — none of `open`,
  // the signature, or `value` changes when a query empties — so the highlight stayed where the
  // filter had left it, on row 0, and Enter then committed "Workspace default" and unpinned the
  // model. That is the very failure an earlier round fixed, reintroduced by the fix for the
  // round after it. The exhaustive-deps rule would have caught it; the disable comment that
  // used to sit here is why it did not.
  const optionSignature = options.map((o) => o.value).join("\u0000");
  useEffect(() => {
    if (!open || query) return;
    const at = flatOptions.findIndex((o) => o.value === value);
    setActive(at >= 0 ? at : 0);
    // flatOptions is intentionally absent: unfiltered it is `options`, which optionSignature
    // already tracks by content, and depending on its identity is what made this effect fight
    // every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, optionSignature, value]);

  /**
   * Focus the filter once it actually exists.
   *
   * <p>`rect` is null on the first commit after opening, so the portal — and the input inside it
   * — is not mounted yet. Keyed on `open` alone this was a no-op on the FIRST open of the
   * control's life and worked on every one after, which is a horrible thing to debug.
   */
  useEffect(() => {
    if (!open || !rect) return;
    if (flatOptions.length > searchAfter) searchRef.current?.focus();
  }, [open, rect, flatOptions.length, searchAfter]);

  /**
   * Keep the active row on screen — the list scrolls, and the highlight must not walk off it.
   *
   * <p>Scrolling the list slides a different row under a STATIONARY cursor, and the browser
   * fires `mouseenter` for that — so arrowing past the fold handed the highlight back to
   * whatever the pointer happened to be over. The rows listen for `mousemove` instead, which
   * only fires when the pointer itself moves.
   */
  useEffect(() => {
    if (!open) return;
    // getElementById, not a CSS selector: useId produces ids containing colons, which need
    // escaping in a selector and need nothing here.
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      // Clear the query too. Every other exit does, and leaving it behind meant reopening to a
      // stale filter and an empty list, with nothing on screen explaining where the models went.
      setOpen(false);
      setQuery("");
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
    if (!flatOptions.length) return;
    setActive((i) => {
      let next = i;
      // Step over disabled entries rather than landing on something unselectable.
      for (let step = 0; step < flatOptions.length; step++) {
        next = (next + delta + flatOptions.length) % flatOptions.length;
        if (!flatOptions[next]?.disabled) break;
      }
      return next;
    });
  };

  /** First/last SELECTABLE row — Home/End landing on a disabled option is a dead end. */
  const edge = (from: "start" | "end") => {
    if (!flatOptions.length) return;
    const order = from === "start" ? flatOptions.map((_, i) => i) : flatOptions.map((_, i) => flatOptions.length - 1 - i);
    const hit = order.find((i) => !flatOptions[i]?.disabled);
    if (hit !== undefined) setActive(hit);
  };

  const hasFilter = flatOptions.length > searchAfter || query.length > 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    // Whether the keystroke is being typed into the filter field. Home/End belong to the CARET
    // there, not to the list, so they must not be hijacked.
    const inFilter = e.target === searchRef.current;
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
        if (inFilter) break;
        e.preventDefault();
        edge("start");
        break;
      case "End":
        if (inFilter) break;
        e.preventDefault();
        edge("end");
        break;
      case "Enter":
        e.preventDefault();
        if (flatOptions[active]) pick(flatOptions[active]);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        // Like a native select losing focus: commit nothing and move on. Focus has to come back
        // to the TRIGGER first — the filter lives in a portal at the end of <body>, so letting
        // Tab proceed from there walks off the end of the document instead of to the next
        // control. No preventDefault: the browser then does the moving, from the right place.
        triggerRef.current?.focus();
        setOpen(false);
        setQuery("");
        break;
      default: {
        // Type-ahead, for when there is no filter box to type into.
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
        if (hasFilter) return;
        const now = Date.now();
        typed.current.text = now - typed.current.at > 700 ? e.key : typed.current.text + e.key;
        typed.current.at = now;
        const hit = flatOptions.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text.toLowerCase()));
        if (hit >= 0) setActive(hit);
      }
    }
  };

  function optionId(i: number) {
    return `${listId}-opt-${i}`;
  }
  /** Ids are derived from POSITION, never from the group's text: a name with a space in it
   *  ("Groq — may not work") is several IDREF tokens, so `aria-labelledby` silently resolved to
   *  the wrong heading, or to none at all. */
  const groupId = (i: number) => `${listId}-grp-${i}`;

  const activeDescendant = open && flatOptions[active] ? optionId(active) : undefined;

  /** Keep the popup on screen: flip above the trigger when there is more room up there, and
   *  never let it run off the right edge. It is position:fixed, so anything outside the viewport
   *  is clipped rather than scrollable — and this control's main home is a RIGHT-DOCKED panel,
   *  where a popup wider than its trigger grows straight off the screen. */
  const geometry = () => {
    if (!rect) return null;
    const below = window.innerHeight - rect.bottom - GUTTER;
    const above = rect.top - GUTTER;
    const flip = below < 180 && above > below;
    const height = Math.max(160, Math.min(MAX_POPUP, flip ? above : below));
    const room = Math.max(160, window.innerWidth - 2 * GUTTER);
    const width = Math.min(Math.max(rect.width, MIN_POPUP_WIDTH), room);
    return {
      height,
      width,
      top: flip ? Math.max(GUTTER, rect.top - 6 - height) : rect.bottom + 6,
      left: Math.max(GUTTER, Math.min(rect.left, window.innerWidth - width - GUTTER)),
    };
  };
  const geo = geometry();

  let flat = -1; // running index across groups, so aria-activedescendant matches `flatOptions`

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
        aria-activedescendant={hasFilter ? undefined : activeDescendant}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
        className={twMerge(
          "relative flex w-full items-center justify-between gap-2 rounded-lg border bg-white text-left font-medium text-gray-800 transition",
          "hover:border-gray-400 focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-500/10",
          "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400",
          "border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:hover:border-gray-600",
          BOX[size],
          className,
        )}
      >
        <span className="truncate">
          {selected ? (
            selected.label
          ) : orphanLabel ? (
            orphanLabel
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={`shrink-0 text-gray-400 transition ${size === "sm" ? "size-3.5" : "size-4"} ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && rect && geo
        ? createPortal(
            <div
              ref={popupRef}
              style={{
                position: "fixed",
                top: geo.top,
                left: geo.left,
                width: geo.width,
                maxHeight: geo.height,
              }}
              className="z-[60] flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
            >
              {hasFilter ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
                  <Search aria-hidden className="size-4 shrink-0 text-gray-400" />
                  {/* Stays a text field — a second role="combobox" here would mean two of them
                      in one control. It carries `aria-activedescendant` because that has to sit
                      on the element with FOCUS, or a screen reader announces nothing as you
                      arrow through a list you are filtering. */}
                  <input
                    ref={searchRef}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeDescendant}
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
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={ariaLabel}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
              >
                {groups.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-gray-400">Nothing matches “{query}”.</li>
                ) : (
                  groups.map((group, gi) => (
                    <li key={group.name ?? "__ungrouped"} role="presentation">
                      {group.name ? (
                        <p
                          id={groupId(gi)}
                          className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400"
                        >
                          {group.name}
                        </p>
                      ) : null}
                      {/* role="group" so the heading is announced, not merely drawn: a screen
                          reader user otherwise hears a flat list and loses which provider a
                          model belongs to, which is the whole reason it is grouped. */}
                      <ul role={group.name ? "group" : "presentation"} aria-labelledby={group.name ? groupId(gi) : undefined}>
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
                              // mousemove, not mouseenter: see the scroll-into-view note above.
                              onMouseMove={() => i !== active && setActive(i)}
                              onClick={() => pick(option)}
                              className={[
                                "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm",
                                option.disabled ? "cursor-not-allowed opacity-50" : "",
                                isActive ? "bg-brand-50 dark:bg-brand-500/10" : "",
                                isSelected ? "font-medium text-brand-600 dark:text-brand-300" : "text-gray-700 dark:text-gray-200",
                              ].join(" ")}
                            >
                              <Check aria-hidden className={`mt-0.5 size-3.5 shrink-0 ${isSelected ? "" : "invisible"}`} />
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
