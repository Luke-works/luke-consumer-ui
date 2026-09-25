import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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
/** Quiet by default: these sit under the prompt box and should read as settings you can reach,
 *  not form fields competing with the thing you are typing. */
/** Sentinel for the row that expands the list instead of choosing from it. */
const SHOW_ALL = "__show_all__";

const QUIET =
  "h-7 max-w-full border-transparent bg-transparent px-2 text-[11px] text-gray-500 " +
  "hover:border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-white/5";

export default function AiModelPicker({
  className = "",
  agent,
  task,
}: {
  className?: string;
  /**
   * Which job the models are for — `form`, `email`, `workflow`.
   *
   * <p>A model that drafts a good email is not automatically one that builds a valid form, so
   * the recommendation is per agent. Omitted, the list comes back unranked and this behaves
   * exactly as it did.
   */
  agent?: string;
  /** How to name that job to a person: "building forms". */
  task?: string;
}) {
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
  /** Whether the long tail past the shortlist is on screen. */
  const [showAll, setShowAll] = useState(false);

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
      setModels((await listAiModels(tenant, agent)).models);
    } catch {
      setModels([]); // no list → keep the current choice, offer nothing new
    } finally {
      loading.current = false;
    }
  }, [tenant, models, agent]);

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
    // Not a model — it reveals the rest of them. Handled here rather than by the Listbox so
    // that component stays a list of choices and knows nothing about this one's meaning.
    if (value === SHOW_ALL) {
      setShowAll(true);
      return;
    }
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
  /** Whose models the model control should offer: your provider, else the workspace's. */
  const shownProvider = mine ?? pref.workspaceProvider ?? null;
  const labelOf = (id?: string | null) =>
    (pref.providers ?? []).find((p) => p.id === id)?.label ?? id ?? "";

  /** Providers that actually have models to offer. */
  const connected = (pref.providers ?? []).filter(
    (p) => (models ?? []).some((m) => m.provider === p.id),
  );

  /**
   * Provider is its own control.
   *
   * <p>It was only reachable as a heading inside the model list, which meant moving from
   * Anthropic to Google was something you had to go looking for — and you could not see which
   * provider you were on without opening that list. Which account a turn is billed to is at
   * least as consequential as which model runs it, so it gets equal billing in the panel.
   */
  const providerOptions: ListboxOption[] = [
    {
      value: "",
      label: "Workspace default",
      hint: pref.workspaceProvider ? labelOf(pref.workspaceProvider) : undefined,
    },
    // An out-of-credit provider stays SELECTABLE — it is their account and the credit may be
    // back before we hear about it — but it says so, because the alternative is picking it and
    // learning from a failed turn.
    ...connected.map((p) => ({
      value: `p:${p.id}`,
      label: p.label,
      hint: p.exhausted ? "Out of credit" : undefined,
      tone: p.exhausted ? ("danger" as const) : undefined,
    })),
  ];

  /** Models of the provider in force — the other control decides which that is. */
  const forProvider = (models ?? []).filter((m) => m.provider === shownProvider);
  /** Every model of an out-of-credit provider is equally unrunnable — mark them all. */
  const providerDry = (pref.providers ?? []).find((p) => p.id === shownProvider)?.exhausted ?? false;
  /**
   * Two dozen models is not a choice, it is a quiz.
   *
   * <p>So the few worth using come first and the rest sit behind one more click — never
   * removed. Capability here is partly learned and partly guessed, and the rule this file has
   * followed throughout is that a wrong guess costs a click rather than making a model
   * unreachable. While someone is filtering, everything is in scope: a filter that searched
   * only the shortlist would be a worse lie than a long list.
   */
  const recommended = forProvider
    .filter((m) => m.recommended)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const rest = forProvider.filter((m) => !m.recommended);
  const shortlisted = recommended.length > 0 && !showAll;

  const asOption = (m: AiModel, group?: string): ListboxOption => ({
    value: `m:${m.provider}:${m.id}`,
    label: m.id,
    group,
    hint: providerDry ? "Out of credit" : undefined,
    tone: providerDry ? ("danger" as const) : undefined,
  });

  const modelOptions: ListboxOption[] = [
    { value: "", label: "Workspace default", hint: pref.workspaceModel ?? undefined },
    // A pinned model stays SELECTABLE even when the live list has not arrived or came back
    // without it — otherwise the highlight falls to row 0 and Enter silently unpins it.
    ...(pinned && !forProvider.some((m) => m.id === pinned)
      ? [{ value: `m:${mine ?? ""}:${pinned}`, label: pinned, group: "Current choice" }]
      : []),
    ...recommended.map((m) => asOption(m, task ? `Recommended for ${task}` : "Recommended")),
    // One row to reveal the rest. Selecting it expands rather than commits — it is not a model,
    // so picking it must not change what anyone's turns run on.
    ...(shortlisted && rest.length > 0
      ? [{ value: SHOW_ALL, label: `Show all ${forProvider.length} models`, keepOpen: true }]
      : []),
    ...(shortlisted
      ? []
      : [
          ...rest.filter((m) => m.chat).map((m) => asOption(m, recommended.length ? "Other models" : undefined)),
          // Demoted, never hidden: capability is partly guessed from names, and a wrong guess
          // must cost a click, not make a model unreachable.
          ...rest.filter((m) => !m.chat).map((m) => asOption(m, "May not work for building")),
        ]),
  ];

  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className}`} aria-busy={saving || undefined}>
      <Listbox
        ariaLabel="Provider"
        size="sm"
        className={QUIET}
        value={mine ? `p:${mine}` : ""}
        options={providerOptions}
        placeholder={mine ? labelOf(mine) : "Workspace default"}
        onOpen={() => void loadModels()}
        onChange={(next) => void choose(next)}
      />
      <span aria-hidden className="shrink-0 text-[11px] text-gray-300 dark:text-gray-600">/</span>
      <Listbox
        ariaLabel="Model"
        size="sm"
        className={QUIET}
        value={pinned ? `m:${mine ?? ""}:${pinned}` : ""}
        options={modelOptions}
        placeholder={pinned ?? pref.workspaceModel ?? "Workspace default"}
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
          const tokens = (n?: number) =>
            n == null ? null : n >= 1000 ? `${Math.round(n / 1000).toLocaleString()}k` : String(n);
          // What the provider published about it. Absent fields stay absent: a provider that
          // says nothing is a fact about that provider, not a blank for us to fill in.
          const facts: { term: string; value: string }[] = [
            label ? { term: "Provider", value: label } : null,
            m ? { term: "Runs a build turn", value: m.chat ? "Yes" : "No — a turn on it would fail" } : null,
            tokens(m?.contextTokens) ? { term: "Context window", value: `${tokens(m?.contextTokens)} tokens` } : null,
            tokens(m?.maxOutputTokens) ? { term: "Longest reply", value: `${tokens(m?.maxOutputTokens)} tokens` } : null,
          ].filter(Boolean) as { term: string; value: string }[];

          return (
            <div className="mt-3 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              {m?.description ? (
                <p className="leading-relaxed">{m.description}</p>
              ) : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                {facts.map((f) => (
                  <Fragment key={f.term}>
                    <dt className="text-gray-400">{f.term}</dt>
                    <dd className="text-gray-700 dark:text-gray-200">{f.value}</dd>
                  </Fragment>
                ))}
              </dl>
              {!m?.description ? (
                <p className="rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-500 dark:bg-white/5 dark:text-gray-400">
                  {label ?? "This provider"} publishes no description for its models — the
                  figures above are everything it tells us. Google is the one that ships prose
                  today, so a model from there will say more here.
                </p>
              ) : null}
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
