import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import Listbox, { type ListboxOption } from "../ui/select/Listbox";
import {
  chooseMyAiModel,
  getAiPreference,
  listAiModels,
  type AiModel,
  type AiPreference,
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

  const choose = async (model: string) => {
    // A ref, not the `saving` state: the state read here is the one captured when this render's
    // closure was built, so a second pick in the same tick would sail past it.
    if (!tenant || savingRef.current) return;
    savingRef.current = true;
    // A model name only means something to the provider offering it, and a workspace may have
    // several connected — so the provider travels with the choice.
    const owner = (models ?? []).find((m) => m.id === model)?.provider ?? null;
    // Keep the control usable rather than disabling it: a browser blurs a focused element when it
    // becomes disabled and drops focus to <body>, so a keyboard user loses their place on every
    // save. `saving` now only guards against overlapping writes.
    setSaving(true);
    setError(null);
    try {
      const saved = await chooseMyAiModel(tenant, model ? owner : null, model || null);
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

  const providerLabel = (id: string) =>
    (pref.providers ?? []).find((p) => p.id === id)?.label ?? id;

  const pinned = pref.model;
  const options: ListboxOption[] = [
    {
      value: "",
      label: "Workspace default",
      hint: pref.workspaceModel ?? undefined,
    },
    // The pinned model has to be SELECTABLE, not merely displayable. The list is fetched on
    // open and may never arrive (a provider blip leaves it empty for good), and without a row
    // to land on the highlight falls to index 0 — so Enter, the natural way to confirm "yes,
    // this one", silently unpinned the model instead. Displaying it was only half the fix; this
    // is the half that was missing here but present in AiConnectionRow.
    ...(pinned && !(models ?? []).some((m) => m.id === pinned)
      ? [{ value: pinned, label: pinned, group: "Current choice" }]
      : []),
    ...(models ?? []).map((m) => ({
      value: m.id,
      label: m.id,
      // Two dimensions at once: which provider offers it, and whether a turn could run on it.
      // A workspace may have several providers connected, and each lists every modality its
      // account can reach — so "Groq" and "Groq — may not work" are different groups.
      group: m.chat ? providerLabel(m.provider) : `${providerLabel(m.provider)} — may not work`,
    })),
  ];

  return (
    <div className={`flex items-center gap-1.5 ${className}`} aria-busy={saving || undefined}>
      <Listbox
        ariaLabel="Model"
        size="sm"
        className="max-w-[220px]"
        value={pref.model ?? ""}
        options={options}
        placeholder="Workspace default"
        onOpen={() => void loadModels()}
        onChange={(next) => void choose(next)}
      />
      {error ? (
        <span role="alert" className="text-xs text-error-600 dark:text-error-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
