import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * A LukeBuilds turn that takes a while must still arrive.
 *
 * The outage this exists for: the browser aborted any single agent request after 25s, while
 * luke-agents allows one provider call 30s — and a RESEARCH turn is three of them (the build that
 * asks for a fact, the web search, then the rebuild with the findings), bounded at 85s. So a
 * research turn could never finish. It failed with "Couldn't reach the form assistant. signal is
 * aborted without reason", and the client then RETRIED it, starting a fresh round of billable web
 * searches nobody would ever see.
 *
 * Unit tests pin the numbers (`agentTransport.test.ts`) and the server's own budget lives in
 * luke-agents. Neither can answer the question a person actually asks — *does the answer reach
 * the screen?* — because that spans the panel, the transport, its retry loop and the render. Only
 * a browser driving the real UI can.
 *
 * No LLM is involved, deliberately. The agent's reply is stubbed at core-engine's `/api/ai/**`
 * boundary; what is under test is the WAIT, which is where the bug was. A test needing a real
 * provider key would be flaky, billable, and still wouldn't prove this.
 */
const GATEWAY = "http://localhost:9999";
const FORM_ID = "11111111-1111-1111-1111-111111111111";

/** Comfortably past the 25s that used to abort, comfortably inside the 100s that replaced it. */
const SLOW_TURN_MS = 32_000;

/**
 * The CHAT turn specifically. Not `**\/api\/ai\/**` — the model picker's provider and model
 * lookups live under the same prefix (`aiProviderApi`'s BASE is also "/api/ai"), so a broad
 * pattern both delays them by 32s and counts them as chat attempts: one turn reads as three.
 */
const CHAT = "**/api/ai/agents/form/chat";

const SCHEMA = JSON.stringify({
  root: ["name"],
  entities: { name: { id: "name", type: "textField", attributes: { key: "name", label: "Name" } } },
});
const SESSION = {
  userId: "u1", provisioned: true, operator: false, tenantAdmin: true, tenant: "t1", tenants: ["t1"],
  roles: {}, candidateGroups: [], capabilities: { FORMS: "read-write" }, can: ["FORMS"],
};
const USER = { id: "u1", email: "gm@example.com", firstName: "GM", lastName: "User", profilePictureUrl: null, emailVerified: true };

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

/** What the agent answers once it finally does: one added field, so the effect is observable. */
const AGENT_REPLY = {
  schema: {
    root: ["name", "guests"],
    entities: {
      name: { id: "name", type: "textField", attributes: { key: "name", label: "Name" } },
      guests: { id: "guests", type: "stepper", attributes: { key: "guests", label: "Guests", min: 1 } },
    },
  },
  title: "TCC contact Us form",
  reply: "Added a Guests stepper.",
  suggestions: [],
  changed: true,
  brain: "anthropic",
  sources: [],
};

async function openBuilder(page: Page) {
  await page.route(`${GATEWAY}/**`, (route) => route.fulfill(json([])));
  await page.route(`${GATEWAY}/auth/refresh`, (route) =>
    route.fulfill(json({ accessToken: "x", sid: "s", user: USER, session: SESSION })));
  await page.route(`${GATEWAY}/session*`, (route) => route.fulfill(json(SESSION)));
  await page.route(`${GATEWAY}/api/form-definitions/${FORM_ID}`, (route) =>
    route.fulfill(json({
      id: FORM_ID, code: "FM-KOHV-30JUL26", name: "TCC contact Us form", status: "DRAFT",
      draftSchema: SCHEMA, showBranding: true, brandingLocked: true,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
    })));
  await page.goto(`/forms/${FORM_ID}`);
}

/**
 * Answer the agent call after `delayMs`, counting how many times it is asked.
 *
 * Register this AFTER `openBuilder`: the agent goes through core-engine at
 * `VITE_AUTH_API_URL/api/ai/**`, which is the SAME origin as the gateway catch-all, and
 * Playwright resolves routes in reverse registration order. Registered first, the catch-all wins
 * and answers `[]` with a 200 — which the panel then reports as
 * "Cannot read properties of undefined (reading 'root')", a stubbing artefact that looks
 * convincingly like a product bug.
 */
function slowAgent(page: Page, delayMs: number, calls: { n: number }) {
  return page.route(CHAT, async (route: Route) => {
    calls.n += 1;
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill(json(AGENT_REPLY));
  });
}

test.describe("LukeBuilds: a slow turn", () => {
  // The whole point is outlasting a 25s abort, so the test itself needs room to do so.
  test.setTimeout(120_000);

  test("arrives instead of being cancelled by the client that asked for it", async ({ page }) => {
    const calls = { n: 0 };
    await openBuilder(page);
    await slowAgent(page, SLOW_TURN_MS, calls); // after openBuilder — see slowAgent's note

    const prompt = page.getByPlaceholder(/add a required date of birth/i);
    await expect(prompt).toBeVisible();
    await prompt.fill("add a guests stepper");
    await page.getByRole("button", { name: "Send" }).click();

    // The reply has to land — this is the assertion the outage would fail.
    await expect(page.getByText("Added a Guests stepper.")).toBeVisible({ timeout: 90_000 });

    // And exactly once. A timeout used to be treated as retryable, so one slow turn became
    // three — each a fresh round of billable web searches on the workspace's own key.
    expect(calls.n, "a slow turn must not be re-sent").toBe(1);

    await expect(page.getByText(/couldn't reach the form assistant/i)).toHaveCount(0);
  });

  test("a real failure is still reported rather than waited on forever", async ({ page }) => {
    // The fix must not turn every fault into a long stare at a spinner: a deterministic error
    // still comes straight back.
    await openBuilder(page);
    await page.route(CHAT, (route) =>
      route.fulfill(json({ detail: "Your organization has reached its daily AI usage limit." }, 429)));

    const prompt = page.getByPlaceholder(/add a required date of birth/i);
    await prompt.fill("add a guests stepper");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(/daily AI usage limit/i)).toBeVisible({ timeout: 20_000 });
  });
});
