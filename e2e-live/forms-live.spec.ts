import { expect, test } from "@playwright/test";
import { ENGINE, TENANT, apiHeaders, instancesFor, provisionTenant, publishForm } from "./support/live";

/**
 * The app against a REAL core-engine.
 *
 * Everything here is chosen because a stub cannot prove it. The hermetic suite already covers that
 * the fill page renders, that required fields gate, that submitting shows a confirmation — all of
 * which it verifies against canned JSON it wrote itself. What it can never verify is that the
 * other side AGREES: that the engine accepts this exact request shape, stores what the app sent,
 * and applies the rules the app assumes. That agreement is what breaks silently in production.
 */

const tenant = TENANT;

// Subscribe + grant once for the whole file. Capability access is tenant state, not per-test
// state, and re-provisioning per test would only re-prove the same two endpoints.
test.beforeAll(async ({ request }) => {
  await provisionTenant(request, tenant);
});

test.describe("live — form fill against a real engine", () => {
  test("a submitted form is really persisted, with the keys the schema declares", async ({ page, request }) => {
    const form = await publishForm(request, tenant, "Live Contact");

    await page.goto(`/forms/${form.code}/fill`);

    // Reaching here already proves several things no stub could: the engine created a runtime
    // instance for the published version, resolved the pinned schema, and returned it in the shape
    // the client parses.
    const name = page.getByRole("textbox", { name: /full name/i });
    await expect(name).toBeVisible();
    await name.fill("Ada Lovelace");
    await page.getByRole("textbox", { name: /email/i }).fill("ada@example.com");
    await page.getByRole("button", { name: /submit/i }).click();
    await expect(page.getByText(/thanks — we got it\./i)).toBeVisible();

    // The claim under test: it is actually in the database, SUBMITTED, with both answers intact.
    // A client/server disagreement about field naming would surface right here as a missing key,
    // while the hermetic suite stayed green.
    await expect
      .poll(async () => (await instancesFor(request, tenant, form.code)).filter((i) => i.state === "SUBMITTED").length, {
        message: "the submission never reached the engine",
        timeout: 20_000,
      })
      .toBe(1);

    const [instance] = (await instancesFor(request, tenant, form.code)).filter((i) => i.state === "SUBMITTED");
    expect(instance?.data).toMatchObject({ fullName: "Ada Lovelace", email: "ada@example.com" });
  });

  test("the engine strips a field the schema never declared", async ({ page, request }) => {
    // This is the exact hazard the server-side backstop was built for, and the one a stub can
    // never show you: the app posts an extra key and it silently does NOT come back. Asserting it
    // here means a future change that loosens the backstop fails a test instead of quietly
    // widening what a tampered client can write into process variables.
    const form = await publishForm(request, tenant, "Live Strip");

    await page.goto(`/forms/${form.code}/fill`);
    await expect(page.getByRole("textbox", { name: /full name/i })).toBeVisible();

    // Submit through the API as the browser session would, but with one undeclared field added.
    const instances = await instancesFor(request, tenant, form.code);
    const open = instances.find((i) => i.state !== "SUBMITTED");
    expect(open, "the fill page should have created an open instance").toBeTruthy();

    const res = await request.post(`${ENGINE}/api/form-instances/${open!.id}/submit`, {
      headers: apiHeaders(tenant),
      data: { data: { fullName: "Grace", email: "grace@example.com", isAdmin: true } },
    });
    expect(res.ok(), `submit: ${res.status()} ${await res.text()}`).toBeTruthy();

    const stored = (await instancesFor(request, tenant, form.code)).find((i) => i.id === open!.id);
    expect(stored?.data).toMatchObject({ fullName: "Grace", email: "grace@example.com" });
    expect(stored?.data, "an undeclared key must never reach process variables").not.toHaveProperty("isAdmin");
  });

  test("the engine rejects a submission missing a required answer", async ({ request }) => {
    // The renderer blocks this client-side (covered hermetically). Here we prove the SERVER also
    // refuses it, which is what actually protects the data when the request doesn't come from a
    // browser at all.
    const form = await publishForm(request, tenant, "Live Required");
    const headers = apiHeaders(tenant);

    const created = await request.post(`${ENGINE}/api/form-instances`, {
      headers,
      data: { definitionCode: form.code },
    });
    expect(created.ok()).toBeTruthy();
    const view = (await created.json()) as { instance: { id: string } };

    const res = await request.post(`${ENGINE}/api/form-instances/${view.instance.id}/submit`, {
      headers,
      data: { data: { email: "no-name@example.com" } }, // fullName is required and absent
    });
    expect(res.status(), "a submission missing a required field must be refused").toBe(400);
    expect(await res.text()).toContain("fullName");
  });
});
