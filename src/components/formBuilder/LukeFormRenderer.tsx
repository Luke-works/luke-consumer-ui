/**
 * Adapter: renders a stored form via the published @lukeflow/form-react engine, exposing a
 * small stable prop shape (schema/initialValues/onSubmit/onChange/onResult/playback/
 * autoSubmitSignal/readOnly/beforeSubmit). This is the ONLY form renderer in the app — every surface goes
 * through it: the builder's Preview + "Test the form", FormFill, FormResponses, InstanceDetail,
 * FormInbox, and the public embed. The package fully supports `playback`/`onResult`/
 * `autoSubmitSignal` (the Test flow). The in-tree coltorapps renderer was removed in the
 * builder cutover.
 *
 * CONTRACT — `initialValues` is read ONCE, when the engine is built (see `parsed` below and the
 * package's `useFormEngine`). Changing it on a MOUNTED renderer has no effect. To show a different
 * record under the same schema (e.g. flipping through submissions), remount with a
 * `key={recordId}`; don't rely on a prop change. Today's callers are fine: FormFill/FormRespondView
 * mount after their data has loaded, InstanceDetail changes the schema when you pick a version, and
 * FormResponses' modal unmounts between records.
 */
import { useMemo, type ReactNode } from "react";
import { FormRenderer as LukeRenderer, type FormTheme } from "@lukeflow/form-react";
import type { FormData, FormSchema, JsEvaluator } from "@lukeflow/form-core";
import "@lukeflow/form-react/styles.css";
import "../../styles/lukeforms-theme.css"; // token bridge — MUST load after the package CSS
import { ensureFontLoaded, fontStack } from "../../lib/formFonts";

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
  jsEvaluator,
  beforeSubmit,
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
  /**
   * A SANDBOXED author-JS evaluator (a QuickJS isolate — see {@link import("../../lib/formJsSandbox")}).
   * Pass this together with `allowJs` on a filler-facing surface so author JS runs WITHOUT DOM / host
   * access instead of via the built-in `new Function`. Omit on author-self-trust surfaces.
   */
  jsEvaluator?: JsEvaluator;
  /**
   * Content rendered inside the form, immediately above the Submit button — for a gate the filler
   * must clear before submitting (the public embed's Turnstile challenge). Suppressed automatically
   * where there is no Submit button (`readOnly`), and in a wizard shown only on the last step.
   */
  beforeSubmit?: ReactNode;
}) {
  void submitting; // the package manages submit state internally; accepted for prop-compat
  // Parse ONCE per schema string. The engine rebuilds whenever the schema OBJECT identity changes
  // (useFormEngine), so parsing inline in the render body handed it a brand-new object on every
  // render — and any re-render of the *host* silently wiped the filler's in-progress answers while
  // the DOM inputs kept showing them, so submit then failed with "field is required". Bit the
  // public embed hardest: finishing an attachment upload bumps a count in the host, and switching
  // to/from the Attachments tab re-renders too. Keying on the string is exact (strings compare by
  // value), so a genuine schema edit — the builder's live preview — still rebuilds.
  const parsed = useMemo(() => parseSchema(schema), [schema]);

  // The form's chosen typeface (Form settings → Font), applied as the renderer's `--lf-font` token.
  // Done HERE, in the one adapter every surface goes through, so the builder preview, the in-app fill,
  // the public embed, the outbound respond page and the PDF harness all render in the same face with no
  // call-site changes. `font` is a catalog ID, so an unknown/hand-edited value falls back to the default
  // rather than injecting anything into the token.
  const fontId = (parsed.settings as { font?: string } | undefined)?.font;
  const theme = useMemo<FormTheme>(() => ({ "--lf-font": fontStack(fontId) }), [fontId]);
  // Webfonts are fetched only when a form actually selects one (a no-op for the system stacks).
  ensureFontLoaded(fontId);

  return (
    <LukeRenderer
      theme={theme}
      schema={parsed}
      initialValues={initialValues as FormData | undefined}
      onSubmit={onSubmit}
      onChange={onChange ? (data: FormData) => onChange(data) : undefined}
      onResult={onResult ? (r) => onResult({ ok: r.ok, errorCount: r.errorCount, errorKeys: [...r.errorKeys] }) : undefined}
      autoSubmitSignal={autoSubmitSignal}
      playback={playback}
      readOnly={readOnly}
      allowJs={allowJs}
      jsEvaluator={jsEvaluator}
      beforeSubmit={beforeSubmit}
    />
  );
}
