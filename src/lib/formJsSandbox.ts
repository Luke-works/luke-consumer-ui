/**
 * The SANDBOXED evaluator for author form-logic JS on filler-facing surfaces (the fill path).
 *
 * Form authors can attach JavaScript to fields (calculateValueJs / customValidationJs /
 * customConditionalJs). The engine's built-in evaluator runs that via `new Function` — full access
 * to the page — which is fine only for a trusted author viewing their OWN form. On a FILL surface,
 * where a (possibly-malicious) author's JS would run in a different filler's browser on our origin,
 * we instead run it inside a QuickJS WebAssembly isolate: its own realm, memory cap, and execution
 * deadline, with no reach to the DOM, cookies, network, or host globals (member-access realm escapes
 * like `({}).constructor.constructor` can't get out).
 *
 * The SINGLE-FILE (embedded-wasm) QuickJS variant is used so there is no separate `.wasm` asset for
 * the bundler/host to serve — it bundles cleanly and can never 404 at runtime. Everything is
 * dynamically imported and memoized, so the ~1 MB isolate is a lazy chunk loaded once, only when a
 * fill page first needs it.
 */
import { useEffect, useState } from "react";
import type { JsEvaluator } from "@lukeflow/form-core";

let cached: Promise<JsEvaluator> | null = null;

/** Load (once) and return the sandboxed author-JS evaluator. */
export function loadFormJsEvaluator(): Promise<JsEvaluator> {
  cached ??= (async () => {
    const [{ newQuickJSWASMModuleFromVariant }, variant, { createQuickJsEvaluator }] = await Promise.all([
      import("quickjs-emscripten"),
      import("@jitl/quickjs-singlefile-browser-release-sync"),
      import("@lukeflow/form-core/quickjs"),
    ]);
    const module = await newQuickJSWASMModuleFromVariant(variant.default);
    return createQuickJsEvaluator({ module });
  })();
  return cached;
}

/**
 * React hook: returns the sandboxed evaluator once it has loaded (`undefined` until then).
 * IMPORTANT: while it is `undefined`, a fill surface must render with author JS DISABLED
 * (`allowJs={false}`) — never fall back to the unsandboxed `new Function` evaluator.
 */
export function useFormJsEvaluator(): JsEvaluator | undefined {
  const [evaluator, setEvaluator] = useState<JsEvaluator>();
  useEffect(() => {
    let alive = true;
    loadFormJsEvaluator()
      .then((e) => {
        if (alive) setEvaluator(e);
      })
      .catch(() => {
        /* sandbox unavailable → author JS stays off (safe, non-fatal) */
      });
    return () => {
      alive = false;
    };
  }, []);
  return evaluator;
}
