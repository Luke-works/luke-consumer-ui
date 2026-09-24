import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import Button from "../ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/authApi";
import {
  chooseAiModel,
  connectAiProvider,
  disconnectAiProvider,
  getAiProvider,
  listAiModels,
  verifyAiProvider,
  type AiProviderId,
  type AiProviderOption,
  type AiProviderView,
} from "../../lib/aiProviderApi";

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.message) return e.message;
  return e instanceof Error && e.message ? e.message : fallback;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

/**
 * AI — where a workspace connects the provider account its assistant runs on.
 *
 * Lives as a section of Account settings rather than a page of its own: it is a thing you set
 * up once and rarely revisit, and a permanent slot in the primary navigation was already pushing
 * the last item below a fold at laptop height.
 *
 * Bring-your-own-key: the owner pastes their own Groq / OpenAI / Anthropic / Gemini key and
 * picks a model. Every AI turn in the app — building a form, drafting an email, sketching a
 * workflow — then runs on that account. Lukeflow enables the assistant and pays nothing for
 * it, which is also why there is no plan gate here.
 *
 * The key is verified with the provider before it is stored, encrypted at rest, and never
 * comes back to this page: the most it ever shows is the last four characters.
 */
export default function AiProviderSection() {
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;

  const [view, setView] = useState<AiProviderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "connect" | "verify" | "disconnect" | "model">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Connect form
  const [provider, setProvider] = useState<AiProviderId>("groq");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[] | null>(null);

  useEffect(() => {
    if (!tenant) return;
    let live = true;
    setLoading(true);
    getAiProvider(tenant)
      .then((v) => {
        if (!live) return;
        setView(v);
        if (v.provider) setProvider(v.provider);
      })
      .catch((e) => live && setError(messageOf(e, "Couldn't load your AI settings.")))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tenant]);

  const apply = useCallback((v: AiProviderView, message?: string) => {
    // Merge, never replace. A response missing `enabled`/`canManage` would otherwise make this
    // card report the feature as unavailable the moment a key was successfully connected. The
    // server now always sends both; merging keeps the component independent of that.
    setView((prev) => ({ ...(prev ?? {}), ...v }));
    setApiKey("");
    setModels(v.models ?? null);
    setError(null);
    if (message) setNotice(message);
  }, []);

  const run = async (action: "connect" | "verify" | "disconnect") => {
    if (!tenant) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      if (action === "connect") {
        apply(
          await connectAiProvider(tenant, { provider, apiKey, model: model.trim() || undefined }),
          "Connected. The assistant now runs on your own account.",
        );
        setModel("");
      } else if (action === "verify") {
        const v = await verifyAiProvider(tenant);
        apply(v, v.status === "CONNECTED" ? "Your key still works." : undefined);
      } else {
        apply(await disconnectAiProvider(tenant), "Disconnected. The assistant is off until you connect a provider.");
        setModels(null);
      }
    } catch (e) {
      setError(messageOf(e, "Something went wrong. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  /** Read the models this key may actually use — live from the provider, not a hardcoded list. */
  const loadModels = async () => {
    if (!tenant || models) return;
    try {
      setModels((await listAiModels(tenant)).models);
    } catch {
      setModels([]); // an unreadable list just means no picker; the default still works
    }
  };

  const saveModel = async (next: string) => {
    if (!tenant) return;
    setBusy("model");
    setError(null);
    setNotice(null);
    try {
      apply(await chooseAiModel(tenant, next || null), "Model updated.");
    } catch (e) {
      setError(messageOf(e, "Couldn't change the model."));
    } finally {
      setBusy(null);
    }
  };

  const options: AiProviderOption[] = view?.providers ?? [];
  /** The provider the connect FORM is showing — used for its placeholder and console link. */
  const chosen = options.find((p) => p.id === provider);
  /** The provider actually CONNECTED — used for anything describing current behaviour. */
  const connectedDefault = options.find((p) => p.id === view?.provider)?.defaultModel;
  const connected = view?.status === "CONNECTED";
  const invalid = view?.status === "INVALID";
  const canManage = view?.canManage === true;

  return (
    // id="ai" so the assistant panels can link straight here with /account/settings#ai
    <section id="ai" className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">AI assistant</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Bring your own AI provider. The assistant that builds your forms, emails and workflows runs on your
        workspace's own account — Lukeflow never sees your usage and adds nothing to your bill.
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

        <div>
          {loading && !view ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : !view ? null : !view.enabled ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              AI features aren't available on this Lukeflow environment yet.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
                    <Sparkles className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-white/90">
                      {connected || invalid ? view.providerLabel || view.provider : "No provider connected"}
                    </p>
                    <p className="mt-0.5 break-all text-sm text-gray-500 dark:text-gray-400">
                      {connected || invalid
                        ? `Key ending ${view.keyLast4 ?? "••••"}${view.effectiveModel ? ` · ${view.effectiveModel}` : ""}`
                        : "Connect a provider to turn the assistant on."}
                    </p>
                  </div>
                </div>
                {canManage && (connected || invalid) ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void run("verify")} disabled={busy !== null}>
                      {busy === "verify" ? "Checking…" : "Check again"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void run("disconnect")} disabled={busy !== null}>
                      {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  </div>
                ) : null}
              </div>

              {connected ? (
                <p className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/15 dark:text-success-500">
                  The assistant is ready.
                  {formatDate(view.verifiedAt) ? ` Last checked ${formatDate(view.verifiedAt)}.` : ""}
                </p>
              ) : null}
              {invalid ? (
                <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {view.lastError || "Your provider rejected this key."} Paste a new key below to turn the assistant
                  back on.
                </p>
              ) : null}

              {/* Model picker — only meaningful once a key is stored. */}
              {connected && canManage ? (
                <div>
                  <label htmlFor="ai-model" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Model
                  </label>
                  <select
                    id="ai-model"
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:text-white/90"
                    value={view.model ?? ""}
                    disabled={busy !== null}
                    onFocus={() => void loadModels()}
                    onChange={(e) => void saveModel(e.target.value)}
                  >
                    <option value="">
                      {/* The CONNECTED provider's default — `chosen` follows the connect form's
                          dropdown, which is a different provider until someone submits it. */}
                      Provider default{connectedDefault ? ` (${connectedDefault})` : ""}
                    </option>
                    {/* The stored choice stays selectable even before the live list loads. */}
                    {view.model && !(models ?? []).includes(view.model) ? (
                      <option value={view.model}>{view.model}</option>
                    ) : null}
                    {(models ?? []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Read from your own account, so this is what your key can actually run.
                  </p>
                </div>
              ) : null}

              {/* Connect / rotate. Shown whenever an owner could change the key. */}
              {canManage ? (
                <form
                  className="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("connect");
                  }}
                >
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {connected || invalid ? "Use a different key" : "Connect a provider"}
                  </p>

                  <div>
                    <label htmlFor="ai-provider" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Provider
                    </label>
                    <select
                      id="ai-provider"
                      className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:text-white/90"
                      value={provider}
                      disabled={busy !== null}
                      onChange={(e) => {
                        setProvider(e.target.value as AiProviderId);
                        setModels(null);
                      }}
                    >
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
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
                      disabled={busy !== null}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      Stored encrypted and never shown again. We check it with {chosen?.label ?? "your provider"}{" "}
                      before saving.
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

                  <Button size="sm" disabled={busy !== null || apiKey.trim().length === 0}>
                    {busy === "connect" ? "Checking your key…" : connected || invalid ? "Replace key" : "Connect"}
                  </Button>
                </form>
              ) : (
                <p className="border-t border-gray-200 pt-5 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  Only the workspace owner can change the AI provider.
                </p>
              )}
            </div>
          )}
        </div>
    </section>
  );
}
