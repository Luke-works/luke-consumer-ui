import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Listbox, { type ListboxOption } from "./Listbox";

/**
 * Regressions found by review rather than by use.
 *
 * Every case here is something a native `<select>` does for free and this had to be taught. They
 * are written against the behaviour a person experiences — what the control SAYS is selected,
 * where focus lands — not against the implementation that happened to be wrong.
 */

function Harness({
  options,
  initial = "",
  onPick,
  lazy = false,
}: {
  options: ListboxOption[];
  initial?: string;
  onPick?: (v: string) => void;
  /**
   * Deliver `options` only AFTER the list is opened, which is what both real call sites do —
   * they fetch the provider's model list on `onOpen`. Passing the full list at mount quietly
   * removes the race these tests exist to pin down, and a test written that way passes against
   * the broken code too.
   */
  lazy?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState<ListboxOption[] | null>(lazy ? null : options);
  const shown = loaded ?? options.filter((o) => o.value === "");
  return (
    <>
      <Listbox
        ariaLabel="Model"
        value={value}
        options={shown}
        onOpen={() => {
          if (lazy) void Promise.resolve().then(() => setLoaded(options));
        }}
        onChange={(v) => {
          setValue(v);
          onPick?.(v);
        }}
      />
      <button id="after">after</button>
    </>
  );
}

const chat = (id: string, group = "Groq"): ListboxOption => ({ value: id, label: id, group });

describe("Listbox — the things a native select does for free", () => {
  it("shows a saved value it has no option for yet", async () => {
    // Both call sites fetch options lazily on open, so between mount and that fetch the saved
    // value is not in `options`. Deriving the label only from `options` made the control report
    // that nothing was pinned when something was.
    render(<Harness options={[{ value: "", label: "Workspace default" }]} initial="llama-3.1-8b-instant" />);

    expect(screen.getByRole("combobox")).toHaveTextContent("llama-3.1-8b-instant");
    expect(screen.getByRole("combobox")).not.toHaveTextContent(/select…/i);
  });

  it("gives every group a heading that actually names it", async () => {
    // Group ids were built by interpolating the group NAME. aria-labelledby is a space-separated
    // IDREF list, and every real group name has spaces in it, so the attribute resolved to the
    // wrong heading — or to none.
    render(
      <Harness
        options={[chat("a", "Groq"), chat("w", "Groq — may not work")]}
      />,
    );
    await userEvent.click(screen.getByRole("combobox"));

    for (const group of screen.getAllByRole("group")) {
      const labelledBy = group.getAttribute("aria-labelledby") ?? "";
      expect(labelledBy).not.toMatch(/\s/); // a single IDREF, not several tokens
      expect(document.getElementById(labelledBy)).not.toBeNull();
    }
    // …and each heading names its own group.
    const groups = screen.getAllByRole("group");
    const names = groups.map((g) => document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent);
    expect(new Set(names).size).toBe(groups.length);
  });

  it("does not repeat a heading when the list interleaves groups", async () => {
    // A provider returns its models in its own order, not sorted by group. Grouping by
    // consecutive runs produced the same heading twice — duplicate React keys and duplicate ids.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Harness
        options={[chat("a", "Groq"), chat("w", "Groq — may not work"), chat("b", "Groq"), chat("v", "Groq — may not work")]}
      />,
    );
    await userEvent.click(screen.getByRole("combobox"));

    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("same key"), expect.anything(), expect.anything());
    // Both of a group's options ended up under its single heading.
    const groq = screen.getAllByRole("group")[0]!;
    expect(within(groq).getAllByRole("option")).toHaveLength(2);
    warn.mockRestore();
  });

  it("moves the highlight onto the saved value once the options arrive", async () => {
    // Lazy on purpose. With the list present at mount, the old `[open]`-only effect already saw
    // it and this passed against the broken code — the race was never created.
    render(
      <Harness lazy options={[{ value: "", label: "Workspace default" }, chat("a"), chat("b")]} initial="b" />,
    );
    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);
    await screen.findByRole("option", { name: "b" });

    await waitFor(() => {
      const activeId = trigger.getAttribute("aria-activedescendant");
      expect(document.getElementById(activeId!)).toHaveTextContent("b");
    });
  });

  it("Enter commits the saved row, not the workspace default", async () => {
    // The consequence of the above, and the reason it matters: a keyboard user opening on their
    // pinned model and pressing Enter to confirm it was silently reset to the workspace default.
    const onPick = vi.fn();
    render(
      <Harness
        lazy
        options={[{ value: "", label: "Workspace default" }, chat("a"), chat("b")]}
        initial="b"
        onPick={onPick}
      />,
    );
    screen.getByRole("combobox").focus();

    await userEvent.keyboard("{ArrowDown}"); // opens, and triggers the fetch
    await screen.findByRole("option", { name: "b" });
    await userEvent.keyboard("{Enter}");

    expect(onPick).not.toHaveBeenCalledWith("");
  });

  it("hands focus back to the trigger before letting Tab move on", async () => {
    // The scenario is Tab from the FILTER, which lives in a portal at the end of <body> — so it
    // needs a list long enough to render one (the two-option version tested nothing: no filter
    // was mounted and focus never left the trigger).
    //
    // Asserted as the handler's own contract — focus is on the trigger once Tab is handled —
    // rather than through userEvent.tab(). user-event computes its destination from the event
    // TARGET rather than the post-handler activeElement, so it lands on <body> in jsdom whatever
    // this code does. Verified separately in a real browser that focus then moves to #after.
    const many = Array.from({ length: 20 }, (_, i) => chat(`model-${i}`));
    render(<Harness options={many} />);
    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);
    const filter = await screen.findByRole("textbox", { name: /filter/i });
    expect(document.activeElement).toBe(filter);

    fireEvent.keyDown(filter, { key: "Tab" });

    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("focuses the filter the FIRST time it opens, not only the second", async () => {
    // The portal is gated on a measured rect, which is null on the first commit after opening.
    const many = Array.from({ length: 20 }, (_, i) => chat(`model-${i}`));
    render(<Harness options={many} />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: /filter/i }));
  });

  it("keeps the combobox wiring on whichever element has focus", async () => {
    // While the filter holds focus, an activedescendant on the unfocused trigger announces
    // nothing as you arrow.
    const many = Array.from({ length: 20 }, (_, i) => chat(`model-${i}`));
    render(<Harness options={many} />);
    await userEvent.click(screen.getByRole("combobox"));

    const filter = screen.getByRole("textbox", { name: /filter/i });
    expect(filter).toHaveAttribute("aria-activedescendant");
    expect(filter.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    // …and exactly one thing claims to be the combobox.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("highlights the top MATCH while filtering, not the saved value", async () => {
    // The active-index effect and the filter's own setActive(0) both want the highlight. Keying
    // the effect on the FILTERED list made it re-run on every keystroke that changed the result
    // set and win — so typing "model-1" left the highlight on the already-saved model-11 and
    // Enter re-committed the very model you were filtering away from. Worse, it was
    // inconsistent: a keystroke that narrowed nothing left setActive(0) standing.
    const many = Array.from({ length: 12 }, (_, i) => chat(`model-${i}`));
    render(<Harness options={[{ value: "", label: "Workspace default" }, ...many]} initial="model-11" />);
    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    const filter = await screen.findByRole("textbox", { name: /filter/i });
    await userEvent.type(filter, "model-1");

    // model-1, model-10, model-11 match; the first is what a person expects to be armed.
    const active = document.getElementById(filter.getAttribute("aria-activedescendant")!);
    expect(active).toHaveTextContent("model-1");
    expect(active).not.toHaveTextContent("model-11");
  });

  it("leaves Home and End to the caret while typing in the filter", async () => {
    const many = Array.from({ length: 20 }, (_, i) => chat(`model-${i}`));
    render(<Harness options={many} />);
    await userEvent.click(screen.getByRole("combobox"));

    const filter = screen.getByRole("textbox", { name: /filter/i }) as HTMLInputElement;
    await userEvent.type(filter, "model-1");
    await userEvent.keyboard("{Home}");

    // The caret moved; the key was not swallowed to jump the list.
    expect(filter.selectionStart).toBe(0);
  });
});
