/**
 * LukeExplains — turns an access change into plain language.
 *
 * Access control is stated in vocabulary only the platform team knows: capability codes,
 * levels, role dimensions. Requesters therefore ask for the wrong thing and approvers click
 * Approve without knowing what they just handed over. This module is the single place that
 * translates: given a capability and a level (or a change between two levels), it says what
 * becomes possible, what stays blocked, and what an approver should think twice about.
 *
 * Everything here is DERIVED FROM THE REAL BACKEND CONTRACT, not invented copy:
 *   - levels + action semantics mirror core-engine `CapabilityLevel` (#104), see ./capabilities
 *   - the publish/delete action lists mirror the routes actually annotated with
 *     `@RequiresCapabilityAction(PUBLISH|DELETE)` — i.e. exactly what a `contributor` is
 *     blocked from (form publish/retire/unretire/sign-off + purge, signature publish/
 *     sign-off/retire/unretire/seal + purge, email-template publish/retire/unretire + purge,
 *     workflow sign-off/publish)
 *   - roles mirror core-engine `RoleCatalog`
 *
 * Pure and side-effect free so it can be unit-tested and reused by any surface (request form,
 * approval queue, grant editor).
 */
import {
  EMAIL,
  FORMS,
  LEVEL_LABEL,
  LEVEL_RANK,
  PHONE,
  SIGNATURES,
  WORKFLOW,
  type CapabilityLevel,
} from "./capabilities";

/** Who the explanation is addressed to — decides person ("you" vs "Jane") and tone. */
export type ExplainAudience = "requester" | "approver" | "admin";

/** A rendered explanation. Every list is already in plain, non-engineer language. */
export type AccessExplanation = {
  /** One sentence stating the change. */
  headline: string;
  /** What becomes possible. */
  gains: string[];
  /** What stays blocked (the reassuring half — why this isn't a blank cheque). */
  limits: string[];
  /** What is taken away (downgrades only). */
  losses: string[];
  /** Things an approver should weigh before saying yes. */
  cautions: string[];
};

/**
 * The verbs a capability actually supports, split by the action class that governs them.
 * `publish` and `destroy` are the privileged classes a `contributor` cannot perform.
 */
type Vocabulary = {
  /** What the capability manages, as a plural noun ("forms", "email templates"). */
  noun: string;
  read: string[];
  write: string[];
  publish: string[];
  destroy: string[];
  /** The real-world consequence of the publish-class actions — why an approver should care. */
  impact?: string;
};

const GENERIC: Vocabulary = {
  noun: "items",
  read: ["View everything in this section"],
  write: ["Create and edit items", "Save changes to existing items"],
  publish: ["Publish and retire items"],
  destroy: ["Permanently delete items"],
};

/**
 * Per-capability vocabulary. Codes match the gateway's capability map keys. An unknown code
 * falls back to GENERIC, so a capability added on the backend still explains sensibly here.
 */
const VOCABULARY: Record<string, Vocabulary> = {
  [FORMS]: {
    noun: "forms",
    read: ["View forms and their submissions", "Open a form in the designer read-only"],
    write: [
      "Create new forms and edit drafts",
      "Check in new versions of a form",
      "Change form settings and validation",
    ],
    publish: [
      "Publish a version — this is what makes a form live and collecting real submissions",
      "Sign off a version",
      "Retire and unretire a form",
    ],
    destroy: ["Permanently purge a form and its submissions — this cannot be undone"],
    impact: "Publishing a form exposes it to the people who fill it in, including embedded public forms.",
  },
  [EMAIL]: {
    noun: "email templates",
    read: ["View email templates and their content"],
    write: ["Create new templates and edit drafts", "Check in new versions of a template"],
    publish: [
      "Publish a version — this is what makes a template live for real sends",
      "Retire and unretire a template",
    ],
    destroy: ["Permanently purge a template — this cannot be undone"],
    impact: "Published templates are used for email that reaches real recipients outside your organization.",
  },
  [SIGNATURES]: {
    noun: "signature documents",
    read: ["View signature documents and their status"],
    write: ["Create and edit signature documents", "Check in new versions"],
    publish: [
      "Publish and sign off a version",
      "Seal a completed document — this finalizes it as a legal record",
      "Retire and unretire a document",
    ],
    destroy: ["Permanently purge a signature document — this cannot be undone"],
    impact: "Sealing produces a finalized, legally-meaningful document that cannot be edited afterwards.",
  },
  [WORKFLOW]: {
    noun: "workflows",
    read: ["View workflows and their runs"],
    write: ["Create and edit workflow drafts"],
    publish: ["Sign off and publish a workflow — this is what puts it into live operation"],
    destroy: ["Permanently delete a workflow"],
    impact: "Publishing a workflow starts it running against real business data.",
  },
  [PHONE]: {
    noun: "phone flows",
    read: ["View phone numbers, call flows and call history"],
    write: ["Create and edit call flows"],
    publish: ["Put a call flow live"],
    destroy: ["Permanently delete a call flow"],
    impact: "Live call flows answer and place real calls.",
  },
};

const vocab = (code: string): Vocabulary => VOCABULARY[code] ?? GENERIC;

/** Everything a level lets you do, and everything it still doesn't, for one capability. */
export function abilities(code: string, level: CapabilityLevel): { gains: string[]; limits: string[] } {
  const v = vocab(code);
  switch (level) {
    case "none":
      return { gains: [], limits: [`No access — ${v.noun} stay hidden entirely`] };
    case "read":
      return { gains: [...v.read], limits: [...v.write, ...v.publish, ...v.destroy] };
    case "contributor":
      return { gains: [...v.read, ...v.write], limits: [...v.publish, ...v.destroy] };
    case "read-write":
      return { gains: [...v.read, ...v.write, ...v.publish, ...v.destroy], limits: [] };
  }
}

/** "you" / "Jane Doe" / "this member" — the grammatical subject of the explanation. */
function subjectOf(audience: ExplainAudience, name?: string): { who: string; will: string } {
  if (audience === "requester") return { who: "You", will: "You'll be able to" };
  const who = name?.trim() || "This member";
  return { who, will: `${who} will be able to` };
}

/** Set difference that preserves order and drops duplicates. */
const without = (all: string[], remove: string[]) => all.filter((x) => !remove.includes(x));

/**
 * Explain a change from one level to another — the core of LukeExplains.
 *
 * Handles upgrades, downgrades and no-ops, and phrases them for either the person asking
 * (`requester`) or the person deciding (`approver` / `admin`).
 */
export function explainChange(input: {
  /** Capability code (e.g. "FORMS"). */
  code: string;
  /** Friendly capability name for display; falls back to the code. */
  name?: string;
  /** The level held today. */
  from: CapabilityLevel;
  /** The level after the change. */
  to: CapabilityLevel;
  audience: ExplainAudience;
  /** Display name of the person the change applies to (approver/admin audiences). */
  subject?: string;
}): AccessExplanation {
  const { code, from, to, audience } = input;
  const name = input.name?.trim() || code;
  const { who, will } = subjectOf(audience, input.subject);
  const before = abilities(code, from);
  const after = abilities(code, to);
  const v = vocab(code);

  const gains = without(after.gains, before.gains);
  const losses = without(before.gains, after.gains);
  const limits = after.limits;

  const cautions: string[] = [];
  if (audience !== "requester") {
    // `who` here is always a name or "This member" — the requester audience never reaches
    // this branch — so no pronoun juggling is needed.
    if (to === "read-write") {
      cautions.push(
        "Read & write includes publishing and permanent deletion. If they only need to create and edit, Contributor covers that without the irreversible actions.",
      );
      if (v.impact) cautions.push(v.impact);
    }
    if (from === "none" && to !== "none") {
      cautions.push(`This is their first access to ${name}.`);
    }
    if (LEVEL_RANK[to] < LEVEL_RANK[from] && to !== "none") {
      cautions.push("Lowering a level takes effect immediately — work in progress stays, but the removed actions stop working.");
    }
  }

  let headline: string;
  if (from === to) {
    headline =
      audience === "requester"
        ? `You already have ${name} at this level — nothing would change.`
        : `${who} already holds ${name} at this level — approving changes nothing.`;
  } else if (LEVEL_RANK[to] > LEVEL_RANK[from]) {
    headline =
      from === "none"
        ? `${will} open ${name} for the first time.`
        : `${will} do more in ${name} than today.`;
  } else {
    headline = to === "none" ? `${who} will lose access to ${name} entirely.` : `${who} will be able to do less in ${name}.`;
  }

  return { headline, gains, limits, losses, cautions };
}

/**
 * Explain a level on its own terms, WITHOUT claiming to know what was held before.
 *
 * Use this wherever the current level genuinely isn't available — the approval queue returns a
 * request without the requester's existing grant, so saying "their first access" or "they gain
 * X" there would be a guess. This states only what the resulting level allows, which is always
 * true.
 */
export function explainGrant(input: {
  code: string;
  name?: string;
  level: CapabilityLevel;
  audience: ExplainAudience;
  subject?: string;
}): AccessExplanation {
  const { code, level, audience } = input;
  const name = input.name?.trim() || code;
  const { who, will } = subjectOf(audience, input.subject);
  const { gains, limits } = abilities(code, level);
  const v = vocab(code);

  const cautions: string[] = [];
  if (audience !== "requester" && level === "read-write") {
    cautions.push(
      "Read & write includes publishing and permanent deletion. If they only need to create and edit, Contributor covers that without the irreversible actions.",
    );
    if (v.impact) cautions.push(v.impact);
  }

  const headline =
    level === "none"
      ? `${who} will have no access to ${name}.`
      : audience === "requester"
        ? `${will} do the following in ${name}:`
        : `${who} will hold ${name} at ${LEVEL_LABEL[level]}.`;

  return { headline, gains, limits, losses: [], cautions };
}

/** Explain a level on its own terms (no change involved) — used by pickers and legends. */
export const explainLevel = explainGrant;

/* ─────────────────────────────────── Roles ──────────────────────────────────── */

/** Plain-language meaning of a platform role. Ids mirror core-engine `RoleCatalog`. */
export type RoleExplanation = {
  summary: string;
  gains: string[];
  /** Why granting it deserves a second look. */
  cautions: string[];
};

export const ROLE_EXPLAIN: Record<string, RoleExplanation> = {
  "tenant-admin": {
    summary: "Runs the organization. The most powerful role you can assign.",
    gains: [
      "Grant and revoke anyone's access, including their own",
      "Approve or deny every access request",
      "Invite, add and remove members",
      "Manage groups and organization settings",
    ],
    cautions: [
      "An org owner can give themselves any capability at any level — this role bypasses the request-and-approve flow entirely.",
      "Keep the number of owners small; every owner can undo what the others did.",
    ],
  },
  "tenant-user": {
    summary: "The baseline role for everyone in the organization.",
    gains: [
      "Sign in and see the organization",
      "Request access to capabilities",
      "Use whatever capabilities they've been granted",
    ],
    cautions: [],
  },
  "process-operator": {
    summary: "Works with running processes — the operations persona.",
    gains: ["View and act on running process instances", "Investigate and correct process state"],
    cautions: ["Operating a live process affects work already in flight."],
  },
  "task-worker": {
    summary: "Completes assigned work items.",
    gains: ["See tasks routed to them or their groups", "Claim and complete tasks"],
    cautions: [],
  },
  deployer: {
    summary: "Platform-managed developer role with deploy rights.",
    gains: ["Deploy process definitions"],
    cautions: ["Managed by the platform team — not assignable from this screen."],
  },
};

export const roleExplain = (roleId: string): RoleExplanation | undefined => ROLE_EXPLAIN[roleId];

/**
 * Render a role as a standard {@link AccessExplanation} so the same LukeExplains panel can
 * present roles and capabilities identically. Unknown role ids degrade to a neutral summary
 * rather than disappearing.
 */
export function roleAsExplanation(roleId: string, label: string): AccessExplanation {
  const r = roleExplain(roleId);
  return {
    headline: r?.summary ?? `${label} is a platform role.`,
    gains: r?.gains ?? [],
    limits: [],
    losses: [],
    cautions: r?.cautions ?? [],
  };
}
