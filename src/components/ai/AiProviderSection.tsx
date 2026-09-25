import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import Select from "../ui/select/Select";
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
  const busyRef = useRef(false);
  // One fetch serves every row: the endpoint returns every connected provider's models, so a
  // row filters rather than asking again.
  const [models, setModels] = useState<AiModel[] | null>(null);

  // Bumped by `apply` whenever the set of providers may have changed. A fetch stamps the
  // generation it started in and discards its own result if that has moved on — otherwise a
  // request in flight across a connect writes its PRE-connect list back afterwards, and since
  // `loadModels` bails on any non-null cache, the new provider's dropdown stays empty for the
  // life of the page. That is the bug the comment in `apply` claims to have fixed.
  const generation = useRef(0);
  // WHICH generation is in flight, not merely whether one is. A plain boolean deadlocked the
  // two guards against each other: a reopen while a stale fetch was outstanding bailed on the
  // boolean, and then the stale fetch discarded its own result because the generation had moved
  // — zero fetches, zero data, and a dropdown left open in front of someone showing no models
  // at all until they closed and reopened it. A fetch only blocks another fetch of its OWN
  // generation.
  const fetching = useRef<number | null>(null);

  const loadModels = useCallback(async () => {
    if (!tenant || models) return;
    const startedAt = generation.current;
    if (fetching.current === startedAt) return;
    fetching.current = startedAt;
    try {
      const fetched = (await listAiModels(tenant)).models;
      if (generation.current === startedAt) setModels(fetched);
    } catch {
      if (generation.current === startedAt) setModels([]); // unreadable → offer nothing new
    } finally {
      // Only clear it if a newer fetch has not claimed the slot meanwhile.
      if (fetching.current === startedAt) fetching.current = null;
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
    // Drop the cached model list: which providers exist may have just changed, and a one-shot
    // cache meant a newly added provider's dropdown stayed empty for the life of the page.
    generation.current += 1;
    setModels(null);
    setError(null);
    if (message) setNotice(message);
  }, []);

  /** What this provider already has pinned, so a key rotation does not silently drop it. */
  const pinnedModelFor = (id: AiProviderId): string | undefined =>
    (view?.connections ?? []).find((c) => c.provider === id)?.model ?? undefined;

  /** Runs one action, reporting whether it actually succeeded. */
  const act = async (fn: () => Promise<AiProviderView>, message?: string): Promise<boolean> => {
    // A ref, for the same reason AiModelPicker uses one: `busy` is state, read from the closure
    // this render built, so a second call in the same tick sails past it.
    //
    // This became load-bearing when the model Listbox stopped honouring `busy` (a disabled
    // focused control drops focus to <body>). Every OTHER caller here is still behind
    // `disabled={busy}`, which left the model picker as the one unguarded way in — and `apply`
    // is last-response-wins, so two overlapping saves let the older server snapshot land second
    // and wipe the newer change off the screen while the server kept it.
    if (busyRef.current) {
      // Say so. The model Listbox is deliberately NOT disabled while busy (disabling a focused
      // control drops focus to <body>), which makes picking again mid-save an ordinary thing to
      // do rather than a rarity — and silently dropping it left someone watching the control
      // snap back to the old value with no request sent and nothing explaining why.
      setNotice(null);
      setError("Still saving the last change — try that again in a moment.");
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await fn(), message);
      return true;
    } catch (e) {
      setError(messageOf(e, "Something went wrong. Please try again."));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const connect = async () => {
    if (!tenant) return;
    // Only on success. `act` swallows the error to show it, so awaiting it says nothing about
    // the outcome — clearing unconditionally threw away the key someone had just pasted and
    // collapsed the form as though it had worked, with the failure showing above an empty form.
    const ok = await act(
      // Carry the pinned model through a ROTATION. The server treats an absent model as
      // "no model", not as "leave it alone" — normalizeModel(null) returns null and the row is
      // set to it — so replacing a key silently reset the workspace back to the provider's
      // default, which is not what "rotate this key" means to anyone.
      () => connectAiProvider(tenant, { provider, apiKey, model: pinnedModelFor(provider) }),
      "Connected. Your workspace can use this provider now.",
    );
    if (!ok) return;
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
                  <Select
                    id="ai-provider"
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
                  </Select>
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
