import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import {
  chooseMyAiModel,
  getAiPreference,
  listAiModels,
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
  const [models, setModels] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The live model list costs a round trip to the provider, so it is fetched when someone
  // actually opens the picker rather than on every panel mount.
  const loading = useRef(false);

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
    if (!tenant) return;
    // Keep the control usable rather than disabling it: a browser blurs a focused element when it
    // becomes disabled and drops focus to <body>, so a keyboard user loses their place on every
    // save. `saving` now only guards against overlapping writes.
    setSaving(true);
    setError(null);
    try {
      const saved = await chooseMyAiModel(tenant, model || null);
      // Merge, never replace: a response missing `enabled` would otherwise unmount this control
      // the instant a save succeeded. The server now always sends it; this makes the component
      // independent of that promise.
      setPref((prev) => ({ ...(prev ?? {}), ...saved }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the model.");
    } finally {
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

  const options = models ?? [];
  const current = pref.model ?? "";

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <label htmlFor="ai-model-picker" className="sr-only">
        Model
      </label>
      <select
        id="ai-model-picker"
        value={current}
        aria-busy={saving}
        title={`Runs on ${pref.effectiveModel ?? "the workspace default"}`}
        onFocus={() => void loadModels()}
        onChange={(e) => void choose(e.target.value)}
        className="max-w-[180px] truncate rounded-lg border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-600 focus:border-brand-300 focus:outline-none disabled:opacity-60 dark:border-gray-700 dark:text-gray-300"
      >
        <option value="">
          Workspace default{pref.workspaceModel ? ` (${pref.workspaceModel})` : ""}
        </option>
        {/* The saved choice stays selectable before the live list arrives, so the control never
            appears to have silently reset to the default while loading. */}
        {current && !options.includes(current) ? <option value={current}>{current}</option> : null}
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {error ? (
        <span role="alert" className="text-xs text-error-600 dark:text-error-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
