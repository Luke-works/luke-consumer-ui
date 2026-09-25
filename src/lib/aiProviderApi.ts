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
  /** Whether this workspace already has this one, so the page offers Add vs Replace key. */
  connected?: boolean;
};

/**
 * One model the workspace's key may use, and whether the assistant could run on it.
 *
 * A provider's list is every model the account can reach across ALL modalities — Groq returns
 * Whisper (speech-to-text) and Orpheus (text-to-speech) beside its chat models, OpenAI returns
 * embeddings and image models. Offering those as equal choices is a trap: pick one and every
 * turn fails with a provider error nobody can act on. `chat` is how the UI groups them.
 *
 * Nothing is hidden. The classification is partly a guess about names the provider owns, and a
 * wrong guess should demote a model into a second group, never make it unreachable.
 */
export type AiModel = {
  /** Which connected provider offers it — a workspace may have several. */
  provider: AiProviderId;
  id: string;
  chat: boolean;
  /**
   * What the PROVIDER says about this model. Every field is optional because they disagree
   * about what to publish — Google ships prose and both token limits, Groq reports its
   * windows, Anthropic only a display name, OpenAI close to nothing.
   *
   * <p>Absent means "the provider did not tell us", which is worth showing as such. None of
   * this is inferred on our side.
   */
  displayName?: string;
  description?: string;
  contextTokens?: number;
  maxOutputTokens?: number;
};

export type AiProviderStatus =
  /** Verified and usable. */
  | "CONNECTED"
  /** The provider refused the key; AI is off until it's reconnected. */
  | "INVALID"
  /** Removed. */
  | "DISCONNECTED";

/** One provider this workspace has connected, and how it is doing. */
export type AiConnection = {
  provider: AiProviderId;
  label?: string;
  status: AiProviderStatus;
  /** The one a turn uses when the person running it hasn't picked a provider. */
  preferred: boolean;
  /** The workspace's model for this provider; null means the provider's own default. */
  model?: string | null;
  /** What a turn on this provider would actually use. */
  effectiveModel?: string | null;
  keyLast4?: string | null;
  connectedAt?: string | null;
  connectedBy?: string | null;
  verifiedAt?: string | null;
  /**
   * The provider says this account is out of credit or over its quota.
   *
   * <p>Not a status: the key still works and the workspace stays connected — they fix this
   * with their provider, not by reconnecting here. It clears when a turn next succeeds.
   */
  exhausted?: boolean;
  exhaustedAt?: string | null;
  /** Why this provider last refused. Never contains the key. */
  lastError?: string | null;
};

export type AiProviderView = {
  /** Whether this deployment has an agent fleet at all. */
  enabled: boolean;
  /** Whether at least one connected provider can actually run a turn. */
  connected: boolean;
  /** Whether the signed-in user may change any of this (owner only). */
  canManage?: boolean;
  /**
   * Every provider connected to this workspace, healthy or not.
   *
   * A list rather than a single provider: connecting a second one used to overwrite the first
   * one's key outright, so a workspace could only ever hold one. Now each keeps its own key and
   * people can run on different ones.
   */
  connections?: AiConnection[];
  providers?: AiProviderOption[];
  /** Only on a connect response: the models that key may use. */
  models?: AiModel[];
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

/** Re-check one connected provider's stored key against it. Owner only. */
export function verifyAiProvider(tenantId: string, provider: AiProviderId): Promise<AiProviderView> {
  return authed(`${BASE}/provider/${provider}/verify`, tenantInit(tenantId, { method: "POST" }));
}

/** Choose which provider a turn uses when the person running it hasn't picked one. Owner only. */
export function setDefaultAiProvider(tenantId: string, provider: AiProviderId): Promise<AiProviderView> {
  return authed(`${BASE}/provider/${provider}/default`, tenantInit(tenantId, { method: "PUT" }));
}

/** The models this workspace's own key may use — read live from their provider. */
export function listAiModels(tenantId: string): Promise<{ models: AiModel[] }> {
  return authed(`${BASE}/provider/models`, tenantInit(tenantId));
}

/** Change one provider's workspace model without re-pasting its key. Owner only. */
export function chooseAiModel(
  tenantId: string,
  provider: AiProviderId,
  model: string | null,
): Promise<AiProviderView> {
  return authed(
    `${BASE}/provider/${provider}/model`,
    tenantInit(tenantId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model ?? "" }),
    }),
  );
}

/** Forget ONE provider's key. The row survives as the audit trail. Owner only. */
export function disconnectAiProvider(tenantId: string, provider: AiProviderId): Promise<AiProviderView> {
  return authed(`${BASE}/provider/${provider}`, tenantInit(tenantId, { method: "DELETE" }));
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
  /** Whether this person could connect one themselves (owner), or must ask someone who can. */
  canManage?: boolean;
  /** The provider this person's turns run on. */
  provider?: AiProviderId | null;
  /** What the workspace defaults to, offered as the "follow the workspace" option. */
  workspaceProvider?: AiProviderId | null;
  workspaceModel?: string | null;
  /**
   * The providers this workspace has, with the label to show and whether that account is out
   * of credit — so the picker can say so BEFORE someone picks it and watches a turn fail.
   */
  providers?: { id: AiProviderId; label: string; exhausted?: boolean }[];
  /** This person's own pick; null means they follow the workspace. */
  model?: string | null;
  /** What their turns actually run on right now. */
  effectiveModel?: string | null;
};

/** This person's model choice. Any member — everyone picks their own. */
export function getAiPreference(tenantId: string): Promise<AiPreference> {
  return authed(`${BASE}/preference`, tenantInit(tenantId));
}

/**
 * Choose the provider AND model THIS person's turns run on. Blank model follows the workspace.
 *
 * Both travel together: a model name only means something to the provider that offers it, and a
 * workspace may now have several connected.
 */
export function chooseMyAiModel(
  tenantId: string,
  provider: AiProviderId | null,
  model: string | null,
): Promise<AiPreference> {
  return authed(
    `${BASE}/preference`,
    tenantInit(tenantId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider ?? "", model: model ?? "" }),
    }),
  );
}
