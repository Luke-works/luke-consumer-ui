import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Harness for the LIVE lane. Two jobs: give the browser an identity (the only thing still faked),
 * and drive the real API to put the engine into the state a test needs.
 */

export const ENGINE = process.env.LIVE_ENGINE ?? "http://localhost:8080";


/**
 * Headers every capability call needs. CapabilityAccessInterceptor 401s on a missing X-User-Id
 * just as readily as on a missing tenant — identity is per-user, not per-tenant — so both go on
 * every request, reads included.
 */
export const apiHeaders = (tenant: string) => ({
  "X-Tenant-Id": tenant,
  "X-User-Id": "e2e-user",
  "Content-Type": "application/json",
});

/**
 * The tenant this run uses. Shared with the gateway stand-in via the same env var, so the session
 * it serves and the data the specs seed always refer to the same tenant.
 */
export const TENANT = process.env.LIVE_TENANT ?? "e2e-live-local";

/**
 * Give the test tenant real access to FORMS.
 *
 * The engine gates capability routes on TWO things, and a request needs both: the tenant must hold
 * an active subscription, and the user must have a grant on it (tenant owners get read-write
 * implicitly, but this run's user isn't seeded as one). Spring Security is `permitAll` here, so
 * it's easy to assume the API is open in dev — it isn't; `CapabilityAccessInterceptor` answers 403
 * before a controller ever sees the request. Provisioning it properly is the point: the fixture
 * uses the same endpoints an operator would, so this lane can't drift from how access really works.
 */
export async function provisionTenant(api: APIRequestContext, tenant: string, capability = "FORMS"): Promise<void> {
  const subscribed = await api.put(`${ENGINE}/api/tenants/${tenant}/capabilities/${capability}`, {
    headers: { "X-User-Id": "e2e-user" },
  });
  expect(subscribed.ok(), `subscribe ${capability}: ${subscribed.status()} ${await subscribed.text()}`).toBeTruthy();

  const granted = await api.put(`${ENGINE}/api/tenants/${tenant}/users/e2e-user/capabilities/${capability}`, {
    headers: { "X-User-Id": "e2e-user", "Content-Type": "application/json" },
    data: { level: "read-write" },
  });
  expect(granted.ok(), `grant ${capability}: ${granted.status()} ${await granted.text()}`).toBeTruthy();
}

/** A minimal but realistic two-field form. `id` on each entity is what the renderer derives the
 *  control id — and therefore the label association — from; without it inputs have no accessible name. */
export function schemaOf(submitMessage = "Thanks — we got it.") {
  return JSON.stringify({
    root: ["fullName", "email"],
    entities: {
      fullName: { id: "fullName", type: "textField", attributes: { key: "fullName", label: "Full name", required: true } },
      email: { id: "email", type: "email", attributes: { key: "email", label: "Email", required: true } },
    },
    settings: { submitMessage },
  });
}

/**
 * Put a PUBLISHED form in the engine by walking its real lifecycle — create → save draft →
 * check in → sign off → publish. Driving the actual endpoints rather than inserting rows means
 * the fixture itself exercises the lifecycle, so a break there fails setup loudly instead of
 * leaving a test to fail somewhere confusing later.
 */
export async function publishForm(
  api: APIRequestContext,
  tenant: string,
  name: string,
  schema = schemaOf(),
): Promise<{ id: string; code: string }> {
  const headers = apiHeaders(tenant);

  const created = await api.post(`${ENGINE}/api/form-definitions`, {
    headers,
    data: { name, kind: "INBOUND" },
  });
  expect(created.ok(), `create form: ${created.status()} ${await created.text()}`).toBeTruthy();
  const form = (await created.json()) as { id: string; code: string };

  const draft = await api.put(`${ENGINE}/api/form-definitions/${form.id}/draft`, { headers, data: { schema } });
  expect(draft.ok(), `save draft: ${draft.status()}`).toBeTruthy();

  const version = await api.post(`${ENGINE}/api/form-definitions/${form.id}/versions`, { headers, data: { schema } });
  expect(version.ok(), `check in: ${version.status()} ${await version.text()}`).toBeTruthy();
  const v = (await version.json()) as { version: number };

  // Publishing is gated on sign-off — that gate is the product's whole point, so the fixture
  // satisfies it properly rather than reaching around it.
  const signed = await api.post(`${ENGINE}/api/form-definitions/${form.id}/sign-off`, { headers });
  expect(signed.ok(), `sign off: ${signed.status()} ${await signed.text()}`).toBeTruthy();

  const published = await api.post(`${ENGINE}/api/form-definitions/${form.id}/versions/${v.version}/publish`, { headers });
  expect(published.ok(), `publish: ${published.status()} ${await published.text()}`).toBeTruthy();

  return form;
}

/** Read back the instances the engine actually stored for a form — the proof a submit landed. */
export async function instancesFor(
  api: APIRequestContext,
  tenant: string,
  code: string,
): Promise<Array<{ id: string; state: string; data?: Record<string, unknown> }>> {
  const res = await api.get(`${ENGINE}/api/form-instances?definitionCode=${encodeURIComponent(code)}`, {
    headers: apiHeaders(tenant),
  });
  expect(res.ok(), `list instances: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as unknown;
  const items = Array.isArray(body) ? body : ((body as { items?: unknown[] }).items ?? []);
  return items as Array<{ id: string; state: string; data?: Record<string, unknown> }>;
}
