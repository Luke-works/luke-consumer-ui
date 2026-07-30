import { describe, it, expect } from "vitest";
import { abilities, explainChange, explainGrant, roleAsExplanation } from "./lukeExplains";
import { EMAIL, FORMS } from "./capabilities";

describe("abilities — what a level allows, per capability", () => {
  it("read can only look", () => {
    const { gains, limits } = abilities(FORMS, "read");
    expect(gains.join(" ")).toMatch(/view/i);
    expect(limits.join(" ")).toMatch(/publish/i);
    expect(limits.join(" ")).toMatch(/purge/i);
  });

  it("contributor can edit but is blocked from publish and purge — the #104 contract", () => {
    const { gains, limits } = abilities(FORMS, "contributor");
    expect(gains.join(" ")).toMatch(/create new forms/i);
    expect(limits.join(" ")).toMatch(/publish/i);
    expect(limits.join(" ")).toMatch(/purge/i);
    // Nothing a contributor can do may appear in both lists.
    expect(gains.filter((g) => limits.includes(g))).toEqual([]);
  });

  it("read-write has no limits at all", () => {
    expect(abilities(FORMS, "read-write").limits).toEqual([]);
  });

  it("none grants nothing", () => {
    expect(abilities(FORMS, "none").gains).toEqual([]);
  });

  it("falls back to generic wording for a capability it has never heard of", () => {
    const { gains, limits } = abilities("SOMETHING_NEW", "contributor");
    expect(gains.length).toBeGreaterThan(0);
    expect(limits.length).toBeGreaterThan(0);
  });
});

describe("explainChange — upgrades, downgrades and no-ops", () => {
  it("an upgrade lists only what is newly possible", () => {
    const e = explainChange({ code: FORMS, name: "Forms", from: "read", to: "contributor", audience: "requester" });
    expect(e.losses).toEqual([]);
    expect(e.gains.join(" ")).toMatch(/create new forms/i);
    // Already had viewing — it must not be re-announced as a gain.
    expect(e.gains.join(" ")).not.toMatch(/^View forms/i);
    expect(e.limits.join(" ")).toMatch(/publish/i);
  });

  it("a downgrade lists what is taken away", () => {
    const e = explainChange({
      code: FORMS,
      name: "Forms",
      from: "read-write",
      to: "contributor",
      audience: "approver",
      subject: "Ada Lovelace",
    });
    expect(e.losses.join(" ")).toMatch(/publish/i);
    expect(e.gains).toEqual([]);
    expect(e.headline).toMatch(/Ada Lovelace/);
  });

  it("says plainly when nothing would change", () => {
    const e = explainChange({ code: FORMS, from: "read", to: "read", audience: "requester" });
    expect(e.headline).toMatch(/nothing would change/i);
    expect(e.gains).toEqual([]);
    expect(e.losses).toEqual([]);
  });

  it("addresses the requester as 'you' and the approver by name", () => {
    expect(
      explainChange({ code: FORMS, from: "none", to: "read", audience: "requester" }).headline,
    ).toMatch(/^You/);
    expect(
      explainChange({ code: FORMS, from: "none", to: "read", audience: "approver", subject: "Ada" }).headline,
    ).toMatch(/^Ada/);
  });

  it("warns an approver about read-write, but never nags the requester", () => {
    const approver = explainChange({ code: EMAIL, from: "none", to: "read-write", audience: "approver" });
    expect(approver.cautions.join(" ")).toMatch(/permanent deletion/i);
    expect(approver.cautions.join(" ")).toMatch(/real recipients/i);

    const requester = explainChange({ code: EMAIL, from: "none", to: "read-write", audience: "requester" });
    expect(requester.cautions).toEqual([]);
  });
});

describe("explainGrant — used where the previous level is unknown", () => {
  it("never claims this is a first-time grant", () => {
    const e = explainGrant({ code: FORMS, name: "Forms", level: "contributor", audience: "approver", subject: "Ada" });
    expect(e.headline).not.toMatch(/first/i);
    expect(e.cautions.join(" ")).not.toMatch(/first access/i);
    expect(e.losses).toEqual([]);
  });

  it("states the resulting level and what it still blocks", () => {
    const e = explainGrant({ code: FORMS, name: "Forms", level: "contributor", audience: "approver", subject: "Ada" });
    expect(e.headline).toMatch(/Contributor/);
    expect(e.limits.join(" ")).toMatch(/publish/i);
  });
});

describe("roleAsExplanation", () => {
  it("flags the escalation risk of org owner", () => {
    const e = roleAsExplanation("tenant-admin", "Org owner");
    expect(e.cautions.join(" ")).toMatch(/any capability/i);
    expect(e.gains.length).toBeGreaterThan(0);
  });

  it("degrades gracefully for a role it doesn't know", () => {
    const e = roleAsExplanation("brand-new-role", "Brand new role");
    expect(e.headline).toMatch(/Brand new role/);
    expect(e.gains).toEqual([]);
  });
});
