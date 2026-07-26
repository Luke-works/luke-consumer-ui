/**
 * Adapter: renders a stored form via the published @lukeflow/form-react engine, exposing a
 * small stable prop shape (schema/initialValues/onSubmit/onChange/onResult/playback/
 * autoSubmitSignal/readOnly). This is the ONLY form renderer in the app — every surface goes
 * through it: the builder's Preview + "Test the form", FormFill, FormResponses, InstanceDetail,
 * FormInbox, and the public embed. The package fully supports `playback`/`onResult`/
 * `autoSubmitSignal` (the Test flow). The in-tree coltorapps renderer was removed in the
 * builder cutover.
 */
import { FormRenderer as LukeRenderer } from "@lukeflow/form-react";
import type { FormData, FormSchema } from "@lukeflow/form-core";
import "@lukeflow/form-react/styles.css";
import "../../styles/lukeforms-theme.css"; // token bridge — MUST load after the package CSS

function parseSchema(schema: string | FormSchema): FormSchema {
  if (typeof schema !== "string") return schema;
  try {
    return JSON.parse(schema) as FormSchema;
  } catch {
    return { root: [], entities: {} };
  }
}

export default function LukeFormRenderer({
  schema,
  initialValues,
  onSubmit,
  onChange,
  onResult,
  autoSubmitSignal,
  playback,
  readOnly = false,
  submitting = false,
  allowJs = false,
}: {
  schema: string;
  initialValues?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void;
  onChange?: (data: Record<string, unknown>) => void;
  onResult?: (result: { ok: boolean; errorCount: number; errorKeys: string[] }) => void;
  autoSubmitSignal?: number;
  playback?: { steps: { key: string; value: unknown }[]; signal: number; speed?: number };
  readOnly?: boolean;
  submitting?: boolean;
  /**
   * Whether the engine may execute author-authored JS field logic (customConditionalJs,
   * calculateValueJs, …) via `new Function`. **Defaults to `false` — SAFE BY DEFAULT.** Author JS
   * runs in the viewer's/filler's browser, so a read-only response view (staff/tenant reading a
   * submission) and any surface where the author is untrusted relative to the viewer must NOT run
   * it — leaving this unset now closes that hole automatically. Only an interactive FILL surface,
   * where the author's calc/conditional logic IS the feature, opts in (and ideally via a sandboxed
   * `jsEvaluator`, not raw `new Function`). The safe expression engine (non-JS formulas) is
   * unaffected either way.
   */
  allowJs?: boolean;
}) {
  void submitting; // the package manages submit state internally; accepted for prop-compat
  return (
    <LukeRenderer
      schema={parseSchema(schema)}
      initialValues={initialValues as FormData | undefined}
      onSubmit={onSubmit}
      onChange={onChange ? (data: FormData) => onChange(data) : undefined}
      onResult={onResult ? (r) => onResult({ ok: r.ok, errorCount: r.errorCount, errorKeys: [...r.errorKeys] }) : undefined}
      autoSubmitSignal={autoSubmitSignal}
      playback={playback}
      readOnly={readOnly}
      allowJs={allowJs}
    />
  );
}
