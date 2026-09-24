import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import Button from "../ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/authApi";
import AiConnectionRow from "./AiConnectionRow";
import {
  chooseAiModel,
  connectAiProvider,
  disconnectAiProvider,
  getAiProvider,
  listAiModels,
  setDefaultAiProvider,
  verifyAiProvider,
  type AiModel,
  type AiProviderId,
  type AiProviderOption,
  type AiProviderView,
} from "../../lib/aiProviderApi";

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.message) return e.message;
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * AI — the provider accounts this workspace's assistant runs on.
 *
 * Lives as a section of Account settings rather than a page of its own: it is set up once and
 * rarely revisited, and a permanent slot in the primary navigation was pushing the last nav item
 * below a fold at laptop height.
 *
 * **A workspace may connect several.** It began as one, which meant connecting a second silently
 * overwrote the first one's key — someone who had verified Groq and then added Gemini lost the
 * Groq key with no warning and no way back. Each provider now keeps its own key, so people can
 * run a quick draft on the cheap fast one and something hard on the capable one.
 *
 * Bring-your-own-key throughout: the workspace pays its own provider, Lukeflow adds nothing to
 * the bill, and no key ever comes back to this page — the most it shows is the last four
 * characters.
 */
export default function AiProviderSection() {
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;

  const [view, setView] = useState<AiProviderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [provider, setProvider] = useState<AiProviderId>("groq");
  const [apiKey, setApiKey] = useState("");
  const [adding, setAdding] = useState(false);
  // One fetch serves every row: the endpoint returns every connected provider's models, so a
  // row filters rather than asking again.
  const [models, setModels] = useState<AiModel[] | null>(null);

  const loadModels = useCallback(async () => {
    if (!tenant || models) return;
    try {
      setModels((await listAiModels(tenant)).models);
    } catch {
      setModels([]); // unreadable → keep the current choice, offer nothing new
    }
  }, [tenant, models]);

  useEffect(() => {
    if (!tenant) return;
    let live = true;
    setLoading(true);
    getAiProvider(tenant)
      .then((v) => live && setView(v))
      .catch((e) => live && setError(messageOf(e, "Couldn't load your AI settings.")))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tenant]);

  // Merge, never replace: a response missing `enabled`/`canManage` would otherwise make this card
  // report the feature as unavailable the moment something succeeded.
  const apply = useCallback((v: AiProviderView, message?: string) => {
    setView((prev) => ({ ...(prev ?? {}), ...v }));
    setError(null);
    if (message) setNotice(message);
  }, []);

  const act = async (fn: () => Promise<AiProviderView>, message?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await fn(), message);
    } catch (e) {
      setError(messageOf(e, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    if (!tenant) return;
    await act(
      () => connectAiProvider(tenant, { provider, apiKey }),
      "Connected. Your workspace can use this provider now.",
    );
    setApiKey("");
    setAdding(false);
  };

  const options: AiProviderOption[] = view?.providers ?? [];
  const chosen = options.find((p) => p.id === provider);
  const connections = view?.connections ?? [];
  const canManage = view?.canManage === true;
  // Connecting the same provider again replaces that one key; a different one joins beside it.
  const replacing = options.find((p) => p.id === provider)?.connected === true;

  return (
    // id="ai" so the assistant panels can link straight here with /account/settings#ai
    <section id="ai" className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">AI assistant</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Bring your own AI providers. The assistant that builds your forms, emails and workflows runs on your
        workspace's own accounts — Lukeflow never sees your usage and adds nothing to your bill. Connect more
        than one and people can pick whichever suits the job.
      </p>

      {error ? (
        <p role="alert" className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-lg bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/15 dark:text-success-500">
          {notice}
        </p>
      ) : null}

      {loading && !view ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : !view ? null : !view.enabled ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          AI features aren't available on this Lukeflow environment yet.
        </p>
      ) : (
        <div className="space-y-4">
          {connections.length > 0 ? (
            <ul className="space-y-3">
              {connections.map((c) => (
                <AiConnectionRow
                  key={c.provider}
                  connection={c}
                  canManage={canManage}
                  busy={busy}
                  models={models === null ? null : models.filter((m) => m.provider === c.provider)}
                  onLoadModels={() => void loadModels()}
                  onChooseModel={(model) =>
                    tenant && void act(() => chooseAiModel(tenant, c.provider, model || null), "Model updated.")
                  }
                  onVerify={() => tenant && void act(() => verifyAiProvider(tenant, c.provider))}
                  onMakeDefault={() =>
                    tenant && void act(() => setDefaultAiProvider(tenant, c.provider), "Default changed.")
                  }
                  onRemove={() =>
                    tenant &&
                    void act(
                      () => disconnectAiProvider(tenant, c.provider),
                      "Removed. That key is gone; the others are untouched.",
                    )
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              No AI provider connected yet — the assistant is off until one is.
            </p>
          )}

          {canManage ? (
            adding || connections.length === 0 ? (
              <form
                className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-800"
                onSubmit={(e) => {
                  e.preventDefault();
                  void connect();
                }}
              >
                <div>
                  <label htmlFor="ai-provider" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Provider
                  </label>
                  <select
                    id="ai-provider"
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:text-white/90"
                    value={provider}
                    disabled={busy}
                    onChange={(e) => setProvider(e.target.value as AiProviderId)}
                  >
                    {options.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                        {p.connected ? " — already connected" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ai-key" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    API key
                  </label>
                  <input
                    id="ai-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={chosen?.keyPrefix ? `${chosen.keyPrefix}…` : "Paste your key"}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:text-white/90"
                    value={apiKey}
                    disabled={busy}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Stored encrypted and never shown again. We check it with {chosen?.label ?? "your provider"} before
                    saving.
                    {replacing ? " This replaces the key already stored for this provider." : ""}
                    {chosen?.consoleUrl ? (
                      <>
                        {" "}
                        <a
                          href={chosen.consoleUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 font-medium text-brand-600 underline dark:text-brand-400"
                        >
                          Create one<ExternalLink className="size-3" />
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" disabled={busy || apiKey.trim().length === 0}>
                    {busy ? "Checking your key…" : replacing ? "Replace key" : "Connect"}
                  </Button>
                  {/* A plain button, not our Button: our Button takes no `type`, so inside a
                      <form> it defaults to submit and Cancel would submit the form it cancels. */}
                  {connections.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAdding(false)}
                      disabled={busy}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={busy}>
                  Add another provider
                </Button>
              </div>
            )
          ) : (
            <p className="border-t border-gray-200 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              Only the workspace owner can change AI providers.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
