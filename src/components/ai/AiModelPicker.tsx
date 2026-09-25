import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import Listbox, { type ListboxOption } from "../ui/select/Listbox";
import { Modal } from "../ui/modal";
import {
  chooseMyAiModel,
  getAiPreference,
  listAiModels,
  type AiModel,
  type AiPreference,
  type AiProviderId,
} from "../../lib/aiProviderApi";

/**
 * Pick the model YOUR assistant turns run on, from inside the panel you are working in.
 *
 * The workspace owner connects one key and everyone runs on that account; the model is each
 * person's own, so a quick form draft and a gnarly workflow need not cost the same. The choice
 * is saved against the person, not the browser, so it follows them to another machine.
 *
 * Deliberately quiet: it renders nothing at all until there is something to choose. No provider
 * connected, or a single model available, and it stays out of the way — the panel it sits in is
 * for building forms, not for administering AI.
 */
export default function AiModelPicker({ className = "" }: { className?: string }) {
  const { session } = useAuth();
  const tenant = session?.tenant ?? null;

  const [pref, setPref] = useState<AiPreference | null>(null);
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The live model list costs a round trip to the provider, so it is fetched when someone
  // actually opens the picker rather than on every panel mount.
  const loading = useRef(false);
  const savingRef = useRef(false);
  /** The model whose ⓘ was pressed, if any. */
  const [info, setInfo] = useState<ListboxOption | null>(null);

  useEffect(() => {
    if (!tenant) return;
    let live = true;
    getAiPreference(tenant)
      .then((p) => live && setPref(p))
      .catch(() => live && setPref(null)); // a picker that cannot load is simply not shown
    return () => {
      live = false;
    };
  }, [tenant]);

  const loadModels = useCallback(async () => {
    if (!tenant || models || loading.current) return;
    loading.current = true;
    try {
      setModels((await listAiModels(tenant)).models);
    } catch {
      setModels([]); // no list → keep the current choice, offer nothing new
    } finally {
      loading.current = false;
    }
  }, [tenant, models]);

  /**
   * Option values carry their provider.
   *
   * <p>`""` follows the workspace · `p:<provider>` switches provider · `m:<provider>:<model>`
   * picks one model. Encoding it beats deriving it: the previous version looked the model up in
   * the fetched list to find its provider, which silently missed for a pinned model that was not
   * in that list and sent no provider at all — and the server resolves that to the workspace's
   * PREFERRED provider, quietly moving someone from Anthropic to Groq.
   */
  const decode = (value: string): { provider: AiProviderId | null; model: string | null } => {
    if (!value) return { provider: null, model: null };
    if (value.startsWith("p:")) {
      const id = value.slice(2) as AiProviderId;
      // A provider with no model means "follow the workspace" to the server — it forgets the
      // provider too. So switching provider has to name one of ITS models: its first chat model
      // is what a turn on that provider would run anyway.
      const first = (models ?? []).find((m) => m.provider === id && m.chat)
        ?? (models ?? []).find((m) => m.provider === id);
      return { provider: id, model: first?.id ?? null };
    }
    const cut = value.indexOf(":", 2);
    return { provider: value.slice(2, cut) as AiProviderId, model: value.slice(cut + 1) };
  };

  const choose = async (value: string) => {
    // A ref, not the `saving` state: the state read here is the one captured when this render's
    // closure was built, so a second pick in the same tick would sail past it.
    if (!tenant || savingRef.current) return;
    savingRef.current = true;
    const { provider, model } = decode(value);
    // Keep the control usable rather than disabling it: a browser blurs a focused element when it
    // becomes disabled and drops focus to <body>, so a keyboard user loses their place on every
    // save. `saving` now only guards against overlapping writes.
    setSaving(true);
    setError(null);
    try {
      const saved = await chooseMyAiModel(tenant, model ? provider : null, model || null);
      // Merge, never replace: a response missing `enabled` would otherwise unmount this control
      // the instant a save succeeded. The server now always sends it; this makes the component
      // independent of that promise.
      setPref((prev) => ({ ...(prev ?? {}), ...saved }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the model.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!pref?.enabled) return null;

  // Nothing connected. Only the owner can fix that, so only the owner is sent to the page that
  // fixes it; anyone else is told who to ask, which is the actionable half for them.
  if (!pref.connected) {
    return pref.canManage ? (
      <Link
        to="/account/settings#ai"
        className={`text-xs font-medium text-brand-600 underline dark:text-brand-400 ${className}`}
      >
        Connect an AI provider
      </Link>
    ) : (
      <span className={`text-xs text-gray-400 ${className}`}>
        Ask the workspace owner to connect an AI provider
      </span>
    );
  }


  const pinned = pref.model;
  const mine = pref.provider ?? null;

  /** Providers in the order the workspace lists them, each with the models it actually offers. */
  const byProvider = (pref.providers ?? []).map((p) => ({
    ...p,
    models: (models ?? []).filter((m) => m.provider === p.id),
  }));

  const options: ListboxOption[] = [
    { value: "", label: "Workspace default", hint: pref.workspaceModel ?? undefined },
    // The pinned model stays SELECTABLE even when the live list has not arrived or came back
    // without it — otherwise the highlight falls to row 0 and Enter silently unpins it.
    ...(pinned && !(models ?? []).some((m) => m.id === pinned)
      ? [{ value: `m:${mine ?? ""}:${pinned}`, label: pinned, group: "Current choice" }]
      : []),
    // Each provider is a heading you can actually PICK — that is how you move from Anthropic to
    // Google without first knowing which of its models you want.
    ...byProvider.flatMap((p) =>
      p.models.length === 0
        ? []
        : [
            {
              value: `p:${p.id}`,
              label: p.label,
              parent: true,
              hint: p.id === mine ? "Current provider" : "Switch to this provider",
            } satisfies ListboxOption,
            ...p.models
              .filter((m) => m.chat)
              .map((m) => ({ value: `m:${p.id}:${m.id}`, label: m.id })),
            ...p.models
              .filter((m) => !m.chat)
              .map((m) => ({
                value: `m:${p.id}:${m.id}`,
                label: m.id,
                // Demoted, never hidden: capability is partly guessed from names, and a wrong
                // guess must cost a click, not make a model unreachable.
                group: `${p.label} — may not work for building`,
              })),
          ],
    ),
  ];

  /** What the closed control should say. */
  const current = pinned
    ? `${(pref.providers ?? []).find((p) => p.id === mine)?.label ?? mine ?? ""} · ${pinned}`.replace(/^ · /, "")
    : "Workspace default";

  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className}`} aria-busy={saving || undefined}>
      <Listbox
        ariaLabel="Model"
        size="sm"
        // Quiet by default: this sits under the prompt box, where it should read as a setting
        // you can reach, not a form field competing with the thing you are typing.
        className="h-7 max-w-full border-transparent bg-transparent px-2 text-[11px] text-gray-500 hover:border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-white/5"
        value={pinned ? `m:${mine ?? ""}:${pinned}` : ""}
        options={options}
        placeholder={current}
        onOpen={() => void loadModels()}
        onChange={(next) => void choose(next)}
        onOptionInfo={(o) => setInfo(o)}
      />
      <Modal
        isOpen={!!info}
        onClose={() => setInfo(null)}
        ariaLabel="About this model"
        className="max-w-md p-5"
      >
        <h3 className="pe-10 text-base font-semibold text-gray-800 dark:text-white/90">{info?.label}</h3>
        {(() => {
          const m = (models ?? []).find((x) => `m:${x.provider}:${x.id}` === info?.value);
          const label = (pref.providers ?? []).find((p) => p.id === m?.provider)?.label ?? m?.provider;
          return (
            <div className="mt-3 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <p>
                Offered by <span className="font-medium text-gray-800 dark:text-white/90">{label ?? "your provider"}</span>
                {m ? (m.chat
                  ? " · can run a build turn"
                  : " · not a chat model, so a build turn on it would fail") : ""}
              </p>
              {/* Placeholder. We do not invent capability claims: providers do not publish a
                  machine-readable "what this is good at", and the model list we get back carries
                  only an id and its modality. Real guidance goes here once there is a source for
                  it — a curated catalogue, or the provider's own metadata. */}
              <p className="rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-500 dark:bg-white/5 dark:text-gray-400">
                Guidance on what this model is best at is coming. For now the honest answer is
                that we only know what your provider tells us — its name and whether it can hold
                a conversation — so anything more specific would be a guess dressed up as advice.
              </p>
            </div>
          );
        })()}
      </Modal>
      {error ? (
        <span role="alert" className="text-xs text-error-600 dark:text-error-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
