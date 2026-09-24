// The workspace's own AI provider account (bring-your-own-key).
//
// Lukeflow enables the assistant; the workspace brings the account that gets billed —
// the same arrangement as Stripe for form payments. The workspace pastes an API key,
// picks a model, and every AI turn in the app runs on their provider.
//
// The key goes straight into core-engine's encrypted secret store and NEVER comes back:
// the most any response here carries is its last four characters, so a human can tell
// which of their keys is in use. Reading the status is open to any member (every AI panel
// needs to know whether the assistant is usable); connecting and disconnecting are for
// the workspace owner.
import { authed, tenantInit } from "./authApi";

const BASE = "/api/ai";

export type AiProviderId = "groq" | "openai" | "anthropic" | "gemini";

/** One provider a workspace could connect, as the server describes it. */
export type AiProviderOption = {
  id: AiProviderId;
  label: string;
  /** Used when the workspace picks no model. */
  defaultModel: string;
  /** What this provider's keys start with — shown so a paste error is obvious. */
  keyPrefix?: string;
  /** Where to go and create the key. */
  consoleUrl: string;
};

export type AiProviderStatus =
  /** Verified and usable. */
  | "CONNECTED"
  /** The provider refused the key; AI is off until it's reconnected. */
  | "INVALID"
  /** Removed. */
  | "DISCONNECTED";

export type AiProviderView = {
  /** Whether this deployment has an agent fleet at all. */
  enabled: boolean;
  /** Whether a usable provider is connected right now. */
  connected: boolean;
  /** Whether the signed-in user may change any of this (owner only). */
  canManage?: boolean;
  status?: AiProviderStatus;
  provider?: AiProviderId;
  providerLabel?: string;
  /** What the workspace picked; null/absent means "the provider default". */
  model?: string | null;
  /** What a turn will actually run on — the choice, or the provider default. */
  effectiveModel?: string | null;
  keyLast4?: string | null;
  connectedAt?: string | null;
  connectedBy?: string | null;
  verifiedAt?: string | null;
  /** Why the provider last refused. Never contains the key. */
  lastError?: string | null;
  providers?: AiProviderOption[];
  /** Only on a connect response: the models that key may use. */
  models?: string[];
};

export type AiConfig = {
  enabled: boolean;
  providers: AiProviderOption[];
};

/** What this deployment offers, before anything is connected. */
export function getAiConfig(tenantId: string): Promise<AiConfig> {
  return authed(`${BASE}/config`, tenantInit(tenantId));
}

/** The workspace's current AI provider. Readable by any member. */
export function getAiProvider(tenantId: string): Promise<AiProviderView> {
  return authed(`${BASE}/provider`, tenantInit(tenantId));
}

/**
 * Connect (or rotate) the workspace's provider key. Owner only.
 *
 * The server verifies the key with the provider BEFORE storing it, so a mistyped key
 * fails here rather than on someone's next form build.
 */
export function connectAiProvider(
  tenantId: string,
  input: { provider: AiProviderId; apiKey: string; model?: string },
): Promise<AiProviderView> {
  return authed(
    `${BASE}/provider`,
    tenantInit(tenantId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

/** Re-check the stored key against the provider. Owner only. */
export function verifyAiProvider(tenantId: string): Promise<AiProviderView> {
  return authed(`${BASE}/provider/verify`, tenantInit(tenantId, { method: "POST" }));
}

/** The models this workspace's own key may use — read live from their provider. */
export function listAiModels(tenantId: string): Promise<{ models: string[] }> {
  return authed(`${BASE}/provider/models`, tenantInit(tenantId));
}

/** Change the model without re-pasting the key. Owner only. */
export function chooseAiModel(tenantId: string, model: string | null): Promise<AiProviderView> {
  return authed(
    `${BASE}/provider/model`,
    tenantInit(tenantId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model ?? "" }),
    }),
  );
}

/** Forget the key. The row survives as the audit trail of who connected what. Owner only. */
export function disconnectAiProvider(tenantId: string): Promise<AiProviderView> {
  return authed(`${BASE}/provider`, tenantInit(tenantId, { method: "DELETE" }));
}

/**
 * One person's own model choice, within this workspace.
 *
 * The KEY is the workspace's — the owner connects it once and everyone runs on that account.
 * The MODEL is each person's: someone drafting forms may want the cheap fast one while someone
 * working through a tricky workflow wants the capable one, on the same bill. Kept server-side
 * rather than in the browser so the choice follows them between devices.
 */
export type AiPreference = {
  enabled: boolean;
  /** False when the workspace has no usable provider — there is nothing to choose yet. */
  connected: boolean;
  provider?: AiProviderId | null;
  /** What the workspace is set to, offered as the "follow the workspace" option. */
  workspaceModel?: string | null;
  /** This person's own pick; null means they follow the workspace. */
  model?: string | null;
  /** What their turns actually run on right now. */
  effectiveModel?: string | null;
};

/** This person's model choice. Any member — everyone picks their own. */
export function getAiPreference(tenantId: string): Promise<AiPreference> {
  return authed(`${BASE}/preference`, tenantInit(tenantId));
}

/** Choose the model THIS person's turns run on. Blank/null follows the workspace. */
export function chooseMyAiModel(tenantId: string, model: string | null): Promise<AiPreference> {
  return authed(
    `${BASE}/preference`,
    tenantInit(tenantId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model ?? "" }),
    }),
  );
}
