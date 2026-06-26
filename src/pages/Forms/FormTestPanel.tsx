/**
 * FormTestPanel — "Test the form" + sign-off, ported from the legacy FormBuilderPage
 * into the @lukeflow/form-builder (Builder-v2) shell.
 *
 * Positive run: fill VALID data → it must pass. Negative run: fill deliberately INVALID
 * data → validation must reject it. Both runs offer a deterministic "Local" heuristic fill
 * AND LukeTests-generated datasets (valid for positive, invalid for negative). Sign-off
 * records that the form passed its self-test (a clean positive run + the negative rejected).
 *
 * Local vs AI verdicts differ on the negative side: the Local heuristic knows WHICH field it
 * broke and why, so it checks each expected violation per-field; an AI invalid dataset has no
 * per-field expectation, so its pass test is simply "the form reported at least one error".
 *
 * Self-contained: it owns all test state and reads the live schema on open via `getJson`
 * (the builder is uncontrolled in v2, so the page mirrors its schema). Unlike the legacy
 * page — which applied an AI fix with saveDraft + a full builder remount — v2 applies the
 * fix through the imperative `onApplyAiSchema` handle, so the builder + AI chat stay mounted.
 */
import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import Tooltip from "../../components/ui/tooltip/Tooltip";
import { BadgeCheck } from "lucide-react";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import LukeTestsMark from "../../components/branding/LukeTestsMark";
import CapabilityBuildingAnimation from "./CapabilityBuildingAnimation";
import { autofillSchema, negativeFillSchema, type NegativeExpectation } from "../../lib/autofill";
import { generateSchema, generateTestData, type BuilderSchemaLike, type TestDataset } from "../../lib/formAgentApi";
import { signOffTest } from "../../lib/formsApi";

const TEST_GEN_STEPS = ["Reading the form…", "Inventing realistic answers…", "Filling the fields…"];
const TEST_FIX_STEPS = ["Reviewing the failures…", "Pinpointing the validation gaps…", "Repairing the form…"];

// Working overlay shown over the Test modal while LukeTests generates data / fixes failures.
function AiProcessingOverlay({ title, steps }: { title: string; steps: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % steps.length), 1600);
    return () => window.clearInterval(t);
  }, [steps.length]);
  return (
    <div className="absolute inset-0 z-10 rounded-2xl bg-white/80 backdrop-blur-[2px] dark:bg-gray-900/80">
      <div className="sticky top-[35vh] mx-auto flex w-fit flex-col items-center gap-2 text-center">
        <CapabilityBuildingAnimation />
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-400">{steps[i]}</p>
        <p className="mt-1 bg-gradient-to-r from-brand-500 to-purple-500 bg-clip-text text-[11px] font-bold uppercase tracking-wider text-transparent">
          LukeTests
        </p>
      </div>
    </div>
  );
}

type TestResult = { ok: boolean; errorCount: number; errorKeys: string[] };

export default function FormTestPanel({
  open,
  onClose,
  tenant,
  formId,
  formName,
  canEdit,
  getJson,
  onApplyAiSchema,
  onSignedOff,
}: {
  open: boolean;
  onClose: () => void;
  tenant: string;
  formId: string;
  formName: string;
  canEdit: boolean;
  /** Snapshot of the live schema as JSON (settings merged) — read fresh on each open. */
  getJson: () => string;
  /** Apply an AI-repaired schema via the builder's imperative handle (no remount). */
  onApplyAiSchema: (schema: BuilderSchemaLike) => void;
  /** Bubble a successful sign-off up so the page can light its "Tested" badge. */
  onSignedOff: (lastTestedAt: number) => void;
}) {
  const [testSchema, setTestSchema] = useState("");
  const [posInitial, setPosInitial] = useState<Record<string, unknown>>({});
  const [negInitial, setNegInitial] = useState<Record<string, unknown>>({});
  const [negExpected, setNegExpected] = useState<NegativeExpectation[]>([]);
  const [posResult, setPosResult] = useState<TestResult | null>(null);
  const [negResult, setNegResult] = useState<TestResult | null>(null);
  const [posPlay, setPosPlay] = useState(0); // bump → (re)play the positive typing animation
  const [negPlay, setNegPlay] = useState(0); // bump → (re)play the negative typing animation
  const [testNonce, setTestNonce] = useState(0); // remounts the renderers per test session
  const [testTab, setTestTab] = useState<"positive" | "negative">("positive");
  const [signing, setSigning] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);
  const [aiFixing, setAiFixing] = useState(false);
  const [aiTestError, setAiTestError] = useState<string | null>(null);
  // LukeTests datasets per run; sel = which one is active ("local" = the deterministic heuristic).
  const [posAiSets, setPosAiSets] = useState<TestDataset[]>([]);
  const [posSel, setPosSel] = useState<"local" | number>("local");
  const [negAiSets, setNegAiSets] = useState<TestDataset[]>([]);
  const [negSel, setNegSel] = useState<"local" | number>("local");
  const [genCount, setGenCount] = useState(5);

  // Read the live schema lazily on open without re-snapshotting every time the
  // page hands us a new closure identity.
  const getJsonRef = useRef(getJson);
  useEffect(() => { getJsonRef.current = getJson; });

  // On open: snapshot the schema, auto-fill valid + invalid sample data, reset verdicts, and
  // run BOTH the positive AND negative renderers (so the summary shows real verdicts right away
  // — the negative isn't left saying "running…" while you're still on the positive tab).
  useEffect(() => {
    if (!open) return;
    const json = getJsonRef.current();
    const neg = negativeFillSchema(json);
    setTestSchema(json);
    setPosInitial(autofillSchema(json));
    setNegInitial(neg.values);
    setNegExpected(neg.expected);
    setPosResult(null);
    setNegResult(null);
    setPosAiSets([]);
    setPosSel("local");
    setNegAiSets([]);
    setNegSel("local");
    setTestTab("positive");
    setAiTestError(null);
    setPosPlay((p) => p + 1);
    setNegPlay((p) => p + 1);
    setTestNonce((n) => n + 1);
  }, [open]);

  const signOff = async () => {
    setSigning(true);
    try {
      const updated = await signOffTest(tenant, formId);
      onSignedOff(updated.lastTestedAt ?? Date.now());
      onClose();
    } finally {
      setSigning(false);
    }
  };

  // Verdicts. An AI invalid dataset has no per-field expectation, so it passes when the form
  // reports ANY error (it must reject deliberately-broken data). The Local heuristic checks each
  // expected violation per-field. Sign-off needs a clean positive AND a rejected negative
  // (negNA = the local heuristic found nothing breakable → negative is n/a).
  const negAi = negSel !== "local";
  const negCaught = negResult ? negExpected.filter((e) => negResult.errorKeys.includes(e.key)) : [];
  const negNA = !negAi && negExpected.length === 0;
  const negOk =
    !!negResult &&
    (negAi ? negResult.errorCount > 0 : negExpected.every((e) => negResult.errorKeys.includes(e.key)));
  const posOk = !!posResult?.ok;
  const canSignOff = posOk && (negNA || negOk);
  // Playback steps (form order) for the typing animation.
  const posSteps = Object.entries(posInitial).map(([key, value]) => ({ key, value }));
  const negSteps = Object.entries(negInitial).map(([key, value]) => ({ key, value }));

  // Is there a failure on the active tab that LukeTests could fix?
  const hasFixableFailure =
    (testTab === "positive" && !!posResult && !posOk) ||
    (testTab === "negative" && !!negResult && !negNA && !negOk);

  // key -> label, from the schema under test (for readable fix prompts).
  const fieldLabels = (): Record<string, string> => {
    try {
      const s = JSON.parse(testSchema) as BuilderSchemaLike;
      const out: Record<string, string> = {};
      for (const [id, e] of Object.entries(s.entities ?? {})) {
        const a = (e as { attributes?: { key?: string; label?: string } }).attributes ?? {};
        out[a.key ?? id] = a.label ?? a.key ?? id;
      }
      return out;
    } catch {
      return {};
    }
  };

  // Generate a batch of LukeTests datasets for the active tab: realistic VALID data for the
  // positive run, or varied INVALID data for the negative run.
  const fillWithAi = async (mode: "valid" | "invalid") => {
    setAiFilling(true);
    setAiTestError(null);
    try {
      const schema = JSON.parse(getJsonRef.current()) as BuilderSchemaLike;
      const { datasets } = await generateTestData(schema, mode, genCount, formName, tenant ?? undefined);
      if (!datasets.length) {
        setAiTestError("LukeTests returned no datasets — try again.");
        return;
      }
      if (mode === "valid") {
        setPosAiSets(datasets);
        setPosSel(0);
        setPosInitial(datasets[0].values);
        setTestTab("positive");
        setPosResult(null);
        setPosPlay((p) => p + 1); // replay with the first dataset, then re-validate
      } else {
        setNegAiSets(datasets);
        setNegSel(0);
        setNegInitial(datasets[0].values);
        setNegExpected([]); // AI invalid data has no per-field expectation
        setTestTab("negative");
        setNegResult(null);
        setNegPlay((p) => p + 1);
      }
    } catch (e) {
      setAiTestError((e as Error).message);
    } finally {
      setAiFilling(false);
    }
  };

  // Switch the active positive dataset (Local heuristic, or one of the AI batch) and replay.
  const selectPositive = (sel: "local" | number) => {
    setPosSel(sel);
    setPosInitial(sel === "local" ? autofillSchema(testSchema) : posAiSets[sel]?.values ?? {});
    setPosResult(null);
    setPosPlay((p) => p + 1);
  };

  // Switch the active negative dataset. Local restores the heuristic's per-field expectations;
  // an AI dataset has none (judged purely by "did the form reject it?").
  const selectNegative = (sel: "local" | number) => {
    setNegSel(sel);
    if (sel === "local") {
      const neg = negativeFillSchema(testSchema);
      setNegInitial(neg.values);
      setNegExpected(neg.expected);
    } else {
      setNegInitial(negAiSets[sel]?.values ?? {});
      setNegExpected([]);
    }
    setNegResult(null);
    setNegPlay((p) => p + 1);
  };

  // Hand the active-tab failures to LukeTests and apply its fix through the builder's
  // imperative handle (v2: no remount — the page's onApplyAiSchema persists via onChange).
  const askAiToFix = async () => {
    setAiFixing(true);
    setAiTestError(null);
    try {
      const labels = fieldLabels();
      let message: string;
      if (testTab === "positive" && posResult) {
        const fields = posResult.errorKeys.map((k) => labels[k] ?? k).join(", ") || "some fields";
        message = `In a Test run I filled this form with VALID data, but these fields still fail validation: ${fields}. The validation is too strict or misconfigured — adjust the form so correct input passes.`;
      } else if (negAi) {
        message = `In a Test run, LukeTests filled this form with deliberately INVALID data and the form ACCEPTED it (no validation errors). Tighten the field validation so invalid input is rejected.`;
      } else {
        const missed = negExpected.filter((e) => !negResult?.errorKeys.includes(e.key));
        const fields = missed.map((e) => `${e.label} (${e.reason})`).join(", ") || "some fields";
        message = `In a Test run these fields should REJECT invalid input but don't: ${fields}. Add or repair their validation so invalid values are rejected.`;
      }
      const result = await generateSchema(
        message,
        JSON.parse(getJsonRef.current()) as BuilderSchemaLike,
        formName,
        tenant ?? undefined,
      );
      onClose();
      onApplyAiSchema(result.schema); // camelCaseKeys + setSchema → autosave (page owns persistence)
    } catch (e) {
      setAiTestError((e as Error).message);
    } finally {
      setAiFixing(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} className="mx-4 max-h-[90vh] w-full max-w-[640px] overflow-y-auto">
      <div className="relative p-6 sm:p-8">
        {/* LukeTests working overlay — the user sees it building/fixing in the background. */}
        {(aiFilling || aiFixing) && (
          <AiProcessingOverlay
            title={aiFixing ? "LukeTests is fixing the form…" : "LukeTests is generating test data…"}
            steps={aiFixing ? TEST_FIX_STEPS : TEST_GEN_STEPS}
          />
        )}
        <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Test — {formName}</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          <strong>Positive</strong> fills valid data (must pass). <strong>Negative</strong> fills invalid data (validation must reject it). LukeTests can generate richer datasets for either. Regex / custom-rule fields may need a manual value.
        </p>

        {/* Overall summary */}
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-medium ${posResult ? (posOk ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400" : "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400") : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"}`}>
            Positive: {posResult ? (posOk ? "✓ valid" : `✗ ${posResult.errorCount} error${posResult.errorCount === 1 ? "" : "s"}`) : "running…"}
          </span>
          <span className={`rounded-full px-2.5 py-1 font-medium ${negResult ? (negNA || negOk ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400" : "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400") : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"}`}>
            Negative: {negResult
              ? negNA
                ? "n/a (no rules)"
                : negAi
                  ? (negOk ? `✓ rejected (${negResult.errorCount} error${negResult.errorCount === 1 ? "" : "s"})` : "✗ accepted invalid data")
                  : `${negOk ? "✓" : "✗"} ${negCaught.length}/${negExpected.length} rejected`
              : "running…"}
          </span>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {(["positive", "negative"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTestTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition ${testTab === t ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Negative — Local heuristic: per-field breakdown of which broken rules were caught. */}
        {testTab === "negative" && !negAi && negResult && !negNA && (
          <ul className="mb-4 space-y-1 rounded-lg bg-gray-50 p-3 text-xs dark:bg-white/5">
            {negExpected.map((e) => {
              const caught = negResult.errorKeys.includes(e.key);
              return (
                <li key={e.key} className="flex items-center gap-2">
                  <span aria-hidden className={caught ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}>{caught ? "✓" : "✗"}</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{e.label}</span>
                  <span className="text-gray-400">— {e.reason} {caught ? "rejected" : "NOT rejected (validation gap)"}</span>
                </li>
              );
            })}
          </ul>
        )}

        {/* Negative — AI invalid dataset: no per-field expectation, so just whether it was rejected. */}
        {testTab === "negative" && negAi && negResult && (
          <p className={`mb-4 rounded-lg p-3 text-xs ${negOk ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400" : "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400"}`}>
            {negOk
              ? `✓ The form rejected this invalid data (${negResult.errorCount} validation error${negResult.errorCount === 1 ? "" : "s"}).`
              : "✗ The form ACCEPTED this invalid data — no validation errors. Tighten the rules so bad input is rejected."}
          </p>
        )}

        {/* Positive dataset selector (Local heuristic + LukeTests valid batch). */}
        {testTab === "positive" && posAiSets.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-gray-400">Dataset:</span>
            {(["local", ...posAiSets.map((_, i) => i)] as ("local" | number)[]).map((sel) => (
              <button
                key={String(sel)}
                type="button"
                onClick={() => selectPositive(sel)}
                title={typeof sel === "number" ? posAiSets[sel].notes : "Heuristic auto-fill"}
                className={`rounded-full border px-2.5 py-0.5 transition ${posSel === sel ? "border-brand-400 bg-brand-50 text-brand-600 dark:bg-brand-500/10" : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"}`}
              >
                {sel === "local" ? "Local" : `AI ${sel + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Negative dataset selector (Local heuristic + LukeTests invalid batch). */}
        {testTab === "negative" && negAiSets.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-gray-400">Dataset:</span>
            {(["local", ...negAiSets.map((_, i) => i)] as ("local" | number)[]).map((sel) => (
              <button
                key={String(sel)}
                type="button"
                onClick={() => selectNegative(sel)}
                title={typeof sel === "number" ? negAiSets[sel].notes : "Heuristic invalid-data fill (rule-aware)"}
                className={`rounded-full border px-2.5 py-0.5 transition ${negSel === sel ? "border-brand-400 bg-brand-50 text-brand-600 dark:bg-brand-500/10" : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"}`}
              >
                {sel === "local" ? "Local" : `AI ${sel + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Renderers play the typing animation then validate. Inactive tab is hidden but mounted. */}
        <div className={testTab === "positive" ? "" : "hidden"}>
          <FormRenderer key={`pos-${testNonce}`} schema={testSchema} playback={{ steps: posSteps, signal: posPlay }} onResult={setPosResult} />
        </div>
        <div className={testTab === "negative" ? "" : "hidden"}>
          <FormRenderer key={`neg-${testNonce}`} schema={testSchema} playback={{ steps: negSteps, signal: negPlay }} onResult={setNegResult} />
        </div>

        {aiTestError && (
          <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-600 dark:bg-error-500/10">{aiTestError}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => (testTab === "positive" ? setPosPlay((s) => s + 1) : setNegPlay((s) => s + 1))}>Re-run</Button>
            {canEdit && (
              <div className="flex items-center gap-1.5">
                <Tooltip content={testTab === "positive" ? "Let LukeTests generate realistic valid datasets (they should pass)." : "Let LukeTests generate varied invalid datasets (they should be rejected)."}>
                  <Button size="sm" variant="outline" onClick={() => fillWithAi(testTab === "positive" ? "valid" : "invalid")} disabled={aiFilling} startIcon={<LukeTestsMark className="size-4" />}>
                    {aiFilling ? "Generating…" : "Generate data"}
                  </Button>
                </Tooltip>
                <select
                  aria-label="How many datasets to generate"
                  value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value))}
                  className="h-9 rounded-lg border border-gray-300 bg-transparent px-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-300"
                >
                  {[1, 3, 5].map((n) => <option key={n} value={n}>{n} set{n === 1 ? "" : "s"}</option>)}
                </select>
              </div>
            )}
            {canEdit && hasFixableFailure && (
              <Tooltip content="Hand the failing fields to LukeTests and apply its fix.">
                <Button size="sm" variant="outline" onClick={askAiToFix} disabled={aiFixing} startIcon={<LukeTestsMark className="size-4" />}>
                  {aiFixing ? "Fixing…" : "Ask LukeTests to fix"}
                </Button>
              </Tooltip>
            )}
          </div>
          {canEdit ? (
            <Tooltip content={canSignOff ? "Record that this form passed its self-test." : "Sign-off needs a clean positive run and the negative run rejected."}>
              <span>
                <Button size="sm" onClick={signOff} disabled={!canSignOff || signing} startIcon={<BadgeCheck className="size-4" />}>
                  {signing ? "Signing off…" : "Sign off"}
                </Button>
              </span>
            </Tooltip>
          ) : (
            <span className="text-xs text-gray-400">Sign-off needs edit access.</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
