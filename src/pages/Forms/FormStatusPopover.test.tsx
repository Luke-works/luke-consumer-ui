import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormStatusPopover, { type FormStatusInfo } from "./FormStatusPopover";

const info = (over: Partial<FormStatusInfo> = {}): FormStatusInfo => ({
  status: "draft",
  version: 4,
  publishedVersion: null,
  signedOff: false,
  canEdit: true,
  checkedOut: true,
  saveLabel: "Saved",
  saveError: false,
  ...over,
});

const icon = () => screen.getByRole("button", { name: /^form status:/i });
const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(icon());
  return screen.findByRole("dialog", { name: /form status/i });
};

describe("FormStatusPopover", () => {
  // The whole point of collapsing four chips and a banner into one icon is that the icon still
  // answers the question. If these three drift, the consolidation has cost information.
  describe("state is readable WITHOUT opening it", () => {
    it("view-only wins over everything else — it's what stops your edits saving", () => {
      render(<FormStatusPopover info={info({ checkedOut: false, publishedVersion: 3 })} />);
      expect(icon()).toHaveAccessibleName(/view only/i);
    });

    it("names the live version when one is published", () => {
      render(<FormStatusPopover info={info({ publishedVersion: 3 })} />);
      expect(icon()).toHaveAccessibleName(/published v3/i);
    });

    it("says so when nothing is live yet", () => {
      render(<FormStatusPopover info={info({ publishedVersion: null })} />);
      expect(icon()).toHaveAccessibleName(/not published/i);
    });
  });

  it("shows the version being edited alongside the live one — they can differ", async () => {
    const user = userEvent.setup();
    render(<FormStatusPopover info={info({ version: 7, publishedVersion: 3 })} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText("v7")).toBeInTheDocument();
    expect(within(panel).getByText("v3")).toBeInTheDocument();
  });

  it("distinguishes signed off from not signed off", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<FormStatusPopover info={info({ signedOff: false })} />);
    expect(within(await openPanel(user)).getByText(/not signed off/i)).toBeInTheDocument();
    unmount();

    render(<FormStatusPopover info={info({ signedOff: true, lastTestedAt: Date.parse("2026-07-02T14:02:00Z") })} />);
    const panel = await openPanel(user);
    expect(within(panel).queryByText(/not signed off/i)).not.toBeInTheDocument();
  });

  it("offers Checkout from the view-only state — 'read-only' and 'how do I edit' are one question", async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn();
    render(<FormStatusPopover info={info({ checkedOut: false })} onCheckout={onCheckout} />);
    const panel = await openPanel(user);
    await user.click(within(panel).getByRole("button", { name: /checkout to edit/i }));
    expect(onCheckout).toHaveBeenCalled();
    // ...and it closes, because the state it was describing has just changed.
    expect(screen.queryByRole("dialog", { name: /form status/i })).not.toBeInTheDocument();
  });

  it("tells a read-only user why they can't edit, without dangling a Checkout button", async () => {
    const user = userEvent.setup();
    render(<FormStatusPopover info={info({ canEdit: false, checkedOut: false })} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText(/read access/i)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /checkout/i })).not.toBeInTheDocument();
  });

  it("hides the save state when there is no editing session to save", async () => {
    const user = userEvent.setup();
    render(<FormStatusPopover info={info({ checkedOut: false, saveLabel: "Saved" })} />);
    expect(within(await openPanel(user)).queryByText("Saved")).not.toBeInTheDocument();
  });

  it("surfaces a failed autosave while editing", async () => {
    const user = userEvent.setup();
    render(<FormStatusPopover info={info({ saveLabel: "Save failed", saveError: true })} />);
    expect(within(await openPanel(user)).getByText(/save failed/i)).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the icon", async () => {
    // The only way out for a keyboard user — the outside-click handler does nothing for them.
    const user = userEvent.setup();
    render(<FormStatusPopover info={info()} />);
    await openPanel(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /form status/i })).not.toBeInTheDocument();
    expect(icon()).toHaveFocus();
  });
});
