import { expect, type Page } from "@playwright/test";
import { ok, type StubOptions } from "./harness";

/**
 * THE SCREEN INVENTORY — every route the app serves, with whatever stubs it needs to render.
 *
 * Extracted so the render matrix and the visual-regression suite walk the SAME list: a screen
 * added here is automatically both smoke-checked and pixel-checked, and the two can never drift
 * into disagreeing about what "every screen" means.
 */

const FORM_ID = "11111111-1111-1111-1111-111111111111";
const SCHEMA = JSON.stringify({
  root: ["name", "email"],
  entities: {
    name: { id: "name", type: "textField", attributes: { key: "name", label: "Name", required: true } },
    email: { id: "email", type: "email", attributes: { key: "email", label: "Email", required: true } },
  },
});
const FORM_DEF = {
  id: FORM_ID,
  code: "CONTACT",
  name: "Contact us",
  kind: "INBOUND",
  status: "PUBLISHED",
  publishedVersion: 1,
  submissionHandling: "INBOX",
  draftSchema: SCHEMA,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};
const VERSIONS = [{ version: 1, schema: SCHEMA, checkedInAt: "2026-06-01T00:00:00Z", signedOffAt: "2026-06-01T00:00:00Z" }];

// Reusable per-endpoint stubs for the Forms detail/runtime routes.
const formRoutes = {
  "/api/form-definitions/*": ok(FORM_DEF),
  "/api/form-definitions/*/versions": ok(VERSIONS),
  "/api/form-definitions/by-code/*": ok(FORM_DEF),
  "/api/public/embed/*": ok({ code: "CONTACT", title: "Contact us", version: 1, schema: SCHEMA }),
};

// ── Access console ──────────────────────────────────────────────────────────
// /access is ONE route hosting eight sections chosen by local state, so each section needs its
// own row (clicked into via afterGoto) or seven of the eight would never be seen. Populated
// rather than empty: the whole point of these baselines is the member rows, role/level pickers
// and grids, none of which exist in an empty state.
const ORG_MEMBERS = [
  {
    id: "workos:user_ada",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    roles: { tenantAdmin: "read-write", tenantUser: "read-write", processUser: "read", taskUser: "none" },
    candidateGroups: ["approvers"],
    attributes: {},
  },
  {
    id: "workos:user_grace",
    firstName: "Grace",
    lastName: "Hopper",
    email: "grace@example.com",
    roles: { tenantUser: "read", processUser: "none", taskUser: "none" },
    candidateGroups: [],
    attributes: {},
  },
];
const ORG_CAPABILITIES = [
  { code: "FORMS", name: "Forms", description: "Build and collect forms.", tier: "FREE", status: "READY" },
  { code: "EMAIL", name: "Email", description: "Send templated email.", tier: "STANDARD", status: "READY" },
];
const ORG_GROUPS = [{ id: "approvers", name: "Approvers" }];
const ACCESS_REQUESTS = [
  {
    id: "req-1",
    capabilityCode: "EMAIL",
    capabilityName: "Email",
    requestedLevel: "contributor",
    status: "PENDING",
    note: "Need to send the onboarding sequence.",
    requestedAt: "2026-06-01T00:00:00Z",
    requesterName: "Grace Hopper",
    requesterId: "workos:user_grace",
  },
];
const accessRoutes = {
  "/api/org/users": ok(ORG_MEMBERS),
  "/api/org/capabilities": ok(ORG_CAPABILITIES),
  "/api/org/candidate-groups": ok(ORG_GROUPS),
  "/api/org/access-requests*": ok(ACCESS_REQUESTS),
  "/auth/org/invitations": ok({
    invitations: [{ id: "inv-1", email: "new.hire@example.com", state: "pending", expiresAt: "2026-07-01T00:00:00Z" }],
  }),
  // Per-member reads the sections fan out to (one request per member — there is no bulk read).
  "/api/org/users/*/capabilities": ok([{ capabilityCode: "FORMS", level: "read-write" }]),
  "/api/org/capabilities/*/owners": ok([{ id: "workos:user_ada", firstName: "Ada", lastName: "Lovelace" }]),
  "/api/org/candidate-groups/*/managers": ok([{ id: "workos:user_ada", firstName: "Ada", lastName: "Lovelace" }]),
};

/** Click into an /access section by its sub-nav label, then wait for the pane to swap. */
const accessSection = (label: RegExp) => async (page: Page) => {
  const nav = page.getByRole("navigation", { name: /access sections/i });
  await nav.getByRole("button", { name: label }).click();
};

export type Screen = {
  name: string;
  path: string;
  opts?: StubOptions;
  /** Optional stable landmark asserted once (content proof beyond "didn't crash"). */
  ready?: (page: Page) => Promise<void>;
  /** Runs right after goto, before the assertions — e.g. to let a redirect settle. */
  afterGoto?: (page: Page) => Promise<void>;
};

const heading = (re: RegExp) => async (page: Page) =>
  expect(page.getByRole("heading", { name: re }).first()).toBeVisible();

export const SCREENS: Screen[] = [
  // ── Authed dashboard screens (provisioned tenant-admin, all capabilities) ──
  { name: "dashboard", path: "/dashboard" },
  // Landing route for a brand-new (unprovisioned) user → the create-organization flow.
  { name: "create-organization", path: "/", opts: { session: { provisioned: false } } },
  { name: "email", path: "/email" },
  { name: "email-templates", path: "/email-templates", ready: heading(/email templates/i) },
  { name: "email-template-builder", path: "/email-templates/tpl-1", opts: { routes: { "/api/email-templates/*": ok({ id: "tpl-1", name: "Welcome", subject: "Hi", doc: { blocks: [] }, status: "DRAFT" }) } } },
  { name: "signatures", path: "/signatures", ready: heading(/signatures/i) },
  { name: "phone", path: "/phone", ready: heading(/phone/i) },
  { name: "workflows", path: "/workflow", ready: heading(/workflows/i) },
  { name: "workflow-connections", path: "/workflow/connections", ready: heading(/connections/i) },
  { name: "profile", path: "/account/profile", ready: heading(/edit profile/i) },
  { name: "settings", path: "/account/settings" },
  // /access lands on "Manage My Access"; the other seven sections are local state, so each is
  // clicked into. Without these rows a whole console of eight screens had one baseline.
  { name: "access", path: "/access", opts: { routes: accessRoutes }, ready: heading(/access/i) },
  {
    name: "access-approve",
    path: "/access",
    opts: { routes: accessRoutes },
    afterGoto: accessSection(/approve requests/i),
    ready: heading(/pending requests/i),
  },
  {
    name: "access-roles",
    path: "/access",
    opts: { routes: accessRoutes },
    afterGoto: accessSection(/^roles$/i),
    ready: heading(/what each role means/i),
  },
  {
    name: "access-attributes",
    path: "/access",
    opts: { routes: accessRoutes },
    afterGoto: accessSection(/^attributes$/i),
    ready: heading(/^attributes$/i),
  },
  {
    name: "access-capabilities",
    path: "/access",
    opts: { routes: accessRoutes },
    afterGoto: accessSection(/^capabilities$/i),
    ready: heading(/^capabilities$/i),
  },
  {
    name: "access-members",
    path: "/access",
    opts: { routes: accessRoutes },
    afterGoto: accessSection(/^members$/i),
    ready: heading(/add user to organization/i),
  },
  {
    name: "access-candidate-groups",
    path: "/access",
    opts: { routes: accessRoutes },
    afterGoto: accessSection(/candidate groups/i),
    ready: heading(/create a candidate group/i),
  },
  {
    name: "access-invitations",
    path: "/access",
    opts: { routes: accessRoutes },
    afterGoto: accessSection(/^invitations$/i),
    ready: heading(/invite a teammate/i),
  },
  { name: "support", path: "/support", ready: heading(/support/i) },
  { name: "forms", path: "/forms", ready: heading(/^forms$/i) },
  { name: "form-instances", path: "/forms/instances", ready: heading(/form instances/i) },
  { name: "form-inbox", path: "/forms/inbox", ready: heading(/form inbox/i) },
  { name: "form-builder", path: `/forms/${FORM_ID}`, opts: { routes: formRoutes } },
  { name: "form-responses", path: "/forms/CONTACT/responses", opts: { routes: formRoutes }, ready: heading(/responses/i) },
  { name: "form-fill", path: "/forms/CONTACT/fill", opts: { routes: formRoutes } },
  { name: "form-preview", path: `/forms/${FORM_ID}/preview`, opts: { routes: formRoutes } },
  { name: "call-detail", path: "/phone/call-1", opts: { routes: { "/api/phone-calls/*": ok({ id: "call-1", direction: "outbound", status: "completed", toNumber: "+15551234567", fromNumber: "+15557654321", startedAt: "2026-06-01T00:00:00Z", endedAt: "2026-06-01T00:02:00Z", createdAt: "2026-06-01T00:00:00Z", transcript: [], summary: "" }) } } },
  { name: "signature-builder", path: "/signatures/sig-1", opts: { routes: { "/sign-core/*": ok({ id: "sig-1", name: "NDA", status: "DRAFT", schema: { signers: [], fields: [] }, documentSource: null }) } } },
  { name: "workflow-builder", path: "/workflow/wf-1", opts: { routes: {
    "/api/workflow/definitions/*": ok({ id: "wf-1", name: "Onboarding", status: "DRAFT", version: 1, doc: { nodes: [], edges: [] } }),
    "/api/workflow/catalog": ok({ triggers: [], actions: [], tasks: [] }),
    "/api/workflow/integrations": ok([]),
  } } },
  // A transient handler: it restores the session then redirects. Wait for it to
  // leave /sso-callback so we assert on the settled landing page, not mid-redirect.
  { name: "sso-callback", path: "/sso-callback", afterGoto: (page) => page.waitForURL((u) => !u.pathname.includes("/sso-callback"), { timeout: 10_000 }) },

  // ── Public screens (no session) ──
  { name: "signin", path: "/signin", opts: { loggedOut: true } },
  { name: "signup", path: "/signup", opts: { loggedOut: true } },
  { name: "embed-form", path: "/embed/tok-1", opts: { loggedOut: true, routes: { "/api/public/embed/*": ok({ code: "CONTACT", title: "Contact us", version: 1, schema: SCHEMA }) } }, ready: heading(/contact us/i) },
  { name: "not-found", path: "/no-such-route", opts: { loggedOut: true } },
  { name: "respond-form", path: "/respond/tok-1", opts: { loggedOut: true, routes: { "/api/public/form-instances/*": ok({ token: "tok-1", status: "SENT", requiresOtp: true, email: "r@x.com", code: "CONTACT", title: "Contact us", version: 1, schema: SCHEMA }) } } },
  { name: "sign-page", path: "/sign/tok-1", opts: { loggedOut: true, routes: { "/sign/*": (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }) } } },
];
