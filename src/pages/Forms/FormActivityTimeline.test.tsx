import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import FormActivityTimeline from "./FormActivityTimeline";
import type { AuditEvent } from "../../lib/formsApi";

const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo: number, hour = 9) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, 4, 0, 0);
  return d.getTime();
};

const ev = (action: string, over: Partial<AuditEvent> = {}): AuditEvent => ({
  action,
  at: at(0),
  actorName: "Gowtham Murududdi",
  ...over,
});

describe("FormActivityTimeline", () => {
  it("says what happened in words, never the raw action slug", () => {
    render(
      <FormActivityTimeline
        events={[ev("checked_in", { detail: "v7" }), ev("embed_version_set", { detail: "AUTO" }), ev("tested", { detail: "Signed off v7" })]}
      />,
    );
    expect(screen.getByText("Checked in")).toBeInTheDocument();
    expect(screen.getByText("Embed version changed")).toBeInTheDocument();
    expect(screen.getByText("Signed off")).toBeInTheDocument();
    // The underscored slug was what made the old feed read as noise.
    expect(screen.queryByText(/checked_in|embed_version_set/)).not.toBeInTheDocument();
  });

  it("pulls the version out of the detail as a chip and keeps the rest as words", () => {
    render(<FormActivityTimeline events={[ev("embed_version_set", { detail: "PINNED v4" })]} />);
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.getByText("PINNED")).toBeInTheDocument();
  });

  it("groups by day with Today / Yesterday headings", () => {
    render(
      <FormActivityTimeline
        events={[ev("published", { at: at(0) }), ev("checked_in", { at: at(1) }), ev("created", { at: at(9) })]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
    // Anything older gets a real date rather than an ever-growing "N days ago".
    expect(screen.getAllByRole("heading")).toHaveLength(3);
  });

  it("keeps same-day events under one heading, in the order given", () => {
    render(
      <FormActivityTimeline
        events={[ev("published", { at: at(0, 14) }), ev("checked_in", { at: at(0, 9), detail: "v7" })]}
      />,
    );
    expect(screen.getAllByRole("heading", { name: "Today" })).toHaveLength(1);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Published")).toBeInTheDocument();
  });

  it("shows an unrecognised action rather than dropping it", () => {
    // A feed that silently hides entries it doesn't know is indistinguishable from nothing having
    // happened — the one failure mode an audit trail must not have.
    render(<FormActivityTimeline events={[ev("some_future_action")]} />);
    expect(screen.getByText("some future action")).toBeInTheDocument();
  });

  it("exposes the exact timestamp even though it displays a short time", () => {
    const when = at(0, 15);
    render(<FormActivityTimeline events={[ev("published", { at: when })]} />);
    const time = screen.getByTitle(new Date(when).toLocaleString());
    expect(time).toHaveAttribute("dateTime", new Date(when).toISOString());
  });

  it("falls back to the raw actor id with the workos: prefix stripped", () => {
    render(<FormActivityTimeline events={[ev("published", { actorName: undefined, actor: "workos:user_ada" })]} />);
    expect(screen.getByText("user_ada")).toBeInTheDocument();
  });

  it("has an empty state that explains what will appear", () => {
    render(<FormActivityTimeline events={[]} />);
    expect(screen.getByText(/nothing has happened to this form yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
