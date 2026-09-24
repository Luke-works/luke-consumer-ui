import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
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
}: {
  options: ListboxOption[];
  initial?: string;
  onPick?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Listbox
        ariaLabel="Model"
        value={value}
        options={options}
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

  it("puts the highlight on the saved value, not on the first row", async () => {
    render(<Harness options={[{ value: "", label: "Workspace default" }, chat("a"), chat("b")]} initial="b" />);
    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    const activeId = trigger.getAttribute("aria-activedescendant");
    expect(document.getElementById(activeId!)).toHaveTextContent("b");
  });

  it("Enter commits the saved row, not the first one", async () => {
    // The consequence of the above: a keyboard user opening on their pinned model and pressing
    // Enter to confirm was silently reset to the workspace default.
    const onPick = vi.fn();
    render(<Harness options={[{ value: "", label: "Workspace default" }, chat("a"), chat("b")]} initial="b" onPick={onPick} />);
    screen.getByRole("combobox").focus();

    await userEvent.keyboard("{ArrowDown}"); // opens
    await userEvent.keyboard("{Enter}");

    expect(onPick).not.toHaveBeenCalledWith("");
  });

  it("returns focus to the page, not to <body>, when tabbing out", async () => {
    // The popup is a portal at the end of <body>; letting Tab proceed from inside it walks off
    // the end of the document instead of to the next control.
    render(<Harness options={[chat("a"), chat("b")]} />);
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");

    await userEvent.tab();

    expect(document.body).not.toBe(document.activeElement);
    expect(document.activeElement).toBe(document.getElementById("after"));
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
