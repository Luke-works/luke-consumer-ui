import { QuickJSWASMModule } from 'quickjs-emscripten';

/**
 * Form.io-style JAVASCRIPT field logic — an optional, more powerful alternative to
 * the {@link import("./expression") expr-eval} sandbox for authors who need real
 * JS to express complex calculate / conditional / default / validation logic, e.g.
 *
 * ```js
 * value = data.quantity * data.price;            // calculateValueJs
 * show  = data.country === "US" && data.age > 18; // customConditionalJs
 * valid = input.length >= 3 ? true : "Too short"; // customValidationJs
 * ```
 *
 * The snippet reads other fields via `data.<key>` (and its own value via `value` /
 * `input`), and ASSIGNS its result to `value` (calc/default), `show` (conditional),
 * or `valid` (validation — `true`, `false`, or a string message). Grid rows expose
 * the current row as `row`.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SECURITY MODEL — READ THIS
 * ──────────────────────────────────────────────────────────────────────────────
 * This runs author-supplied JavaScript via the `Function` constructor. It is a
 * TRUSTED-AUTHOR feature, exactly like Form.io's custom JS: the people who BUILD
 * forms are trusted; the people who FILL them are not (end users never author JS).
 * We shadow the common host globals (window/globalThis/process/require/fetch/eval/
 * Function/…) so casual references resolve to `undefined`, and evaluation is
 * FAIL-OPEN (a throw yields the default — never blanks a field or wedges a submit).
 *
 * This is NOT a security boundary against a MALICIOUS author: raw JS can still reach
 * the realm via member-access tricks (`({}).constructor.constructor`). If your forms
 * can be authored by untrusted parties you have two stronger options:
 *   1. Disable JS logic entirely via the engine's `allowJs: false` option (then only the
 *      safe expr-eval sandbox runs) — simplest, if you don't need JS at all.
 *   2. Run author JS in a TRUE isolate by passing `EngineOptions.jsEvaluator` from
 *      `createQuickJsEvaluator()` (see {@link import("./quickjs").createQuickJsEvaluator},
 *      the `@lukeflow/form-core/quickjs` subpath) — a WebAssembly QuickJS VM with its own
 *      realm, memory cap, and execution deadline; member-access escapes can't reach the host.
 *
 * @packageDocumentation
 */
/**
 * A JS-logic evaluator. The built-in {@link evaluateJs} uses `Function` (trusted
 * author). Enterprises needing true isolation against UNTRUSTED authors can supply
 * their own — e.g. a QuickJS-wasm or Web-Worker sandbox — via `EngineOptions.jsEvaluator`,
 * keeping the same channels contract.
 */
type JsEvaluator = (code: string, scope: Record<string, unknown>, self?: unknown) => JsResult;
/** The outcome of evaluating a JS snippet: the three conventional result channels. */
interface JsResult {
    /** The `value` after the snippet ran (calc / default). */
    value: unknown;
    /** The `show` flag after the snippet ran (conditional; default `true`). */
    show: unknown;
    /** The `valid` result after the snippet ran (validation; `true`/`false`/message). */
    valid: unknown;
    /** `false` when the snippet threw (the channels then hold their defaults). */
    ok: boolean;
    /** The thrown message when `ok` is `false`. */
    error?: string;
}

/**
 * QuickJS-isolated JS evaluator — a TRUE security boundary for author JavaScript
 * (`calculateValueJs` / `customConditionalJs` / `customValidationJs`) when form AUTHORS
 * are not fully trusted.
 *
 * The built-in {@link import("./js").evaluateJs} runs author JS via `Function` in the
 * HOST realm: fast, but a malicious author can reach the host via member-access tricks
 * like `({}).constructor.constructor("return process")()`. This evaluator instead runs
 * each snippet inside a WebAssembly QuickJS virtual machine with its OWN realm, OWN
 * globals, a per-eval memory cap, and a wall-clock deadline — so author JS cannot reach
 * `window`/`process`/`fetch`, escape via the `Function` constructor, exhaust host memory,
 * or hang the tab with an infinite loop. Communication is JSON-only across the boundary.
 *
 * Wiring (once, at host startup — `getQuickJS()` loads the wasm asynchronously, then the
 * returned evaluator is fully synchronous and satisfies the engine's `JsEvaluator` hook):
 *
 * ```ts
 * import { createFormEngine } from "@lukeflow/form-core";
 * import { createQuickJsEvaluator } from "@lukeflow/form-core/quickjs";
 *
 * const jsEvaluator = await createQuickJsEvaluator();        // loads the wasm once
 * const engine = createFormEngine(schema, { jsEvaluator });  // author JS now isolated
 * ```
 *
 * `quickjs-emscripten` is an OPTIONAL peer dependency — install it only if you enable
 * isolated JS. (If a deployment has untrusted authors and needs no JS at all, prefer the
 * simplest valve: `allowJs: false`, which disables every JS path outright.)
 *
 * @packageDocumentation
 */

/** Tuning for the QuickJS evaluator (per-evaluation resource bounds). */
interface QuickJsEvaluatorOptions {
    /** Per-evaluation heap cap, in bytes. Default 8 MiB. */
    memoryLimitBytes?: number;
    /** Per-evaluation wall-clock deadline, in ms — exceeding it interrupts (fail-open). Default 100. */
    timeoutMs?: number;
    /**
     * A pre-built QuickJS WASM module. Supply one to control the loading VARIANT — e.g. a
     * single-file (embedded-wasm) browser variant so no separate `.wasm` asset has to be served,
     * which avoids a runtime 404 in a bundled SPA. Omit to lazily load the default via
     * {@link getQuickJS}. Build one with `newQuickJSWASMModuleFromVariant(variant)`.
     */
    module?: QuickJSWASMModule;
}
/**
 * Create a synchronous, VM-isolated {@link JsEvaluator}. Awaits the QuickJS wasm module
 * once, then returns a closure that evaluates each snippet in a fresh runtime + context
 * (no state leaks between fields). FAIL-OPEN: a throw, a timeout, or a memory overflow
 * returns the channel defaults with `ok: false` — never blanks a field or wedges a submit.
 */
declare function createQuickJsEvaluator(options?: QuickJsEvaluatorOptions): Promise<JsEvaluator>;

export { type QuickJsEvaluatorOptions, createQuickJsEvaluator };
