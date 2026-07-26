import { describe, it, expect } from "vitest";
import { loadFormJsEvaluator } from "./formJsSandbox";

// Runtime proof that the QuickJS sandbox actually LOADS and RUNS (not just that CI is green).
// The single-file variant embeds the wasm, so this exercises the very same code path the browser
// bundle uses — if it works here it works in the built SPA (there is no separate .wasm to 404).
describe("formJsSandbox — QuickJS isolate (runtime proof)", () => {
  it("loads the embedded-wasm sandbox and evaluates author calc JS", async () => {
    const evaluate = await loadFormJsEvaluator();
    const r = evaluate("value = data.qty * data.price;", { qty: 3, price: 4 }, 0);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(12);
  }, 30_000);

  it("isolates author JS from the host — window/document/realm escapes cannot reach out", async () => {
    const evaluate = await loadFormJsEvaluator();
    // The vitest host (jsdom) HAS window/document; the isolate must not see them.
    expect(evaluate("value = typeof window;", {}, 0).value).toBe("undefined");
    expect(evaluate("value = typeof document;", {}, 0).value).toBe("undefined");
    // The classic Function-constructor realm escape stays inside the isolate's realm (no host window).
    expect(evaluate("value = ({}).constructor.constructor('return typeof window')();", {}, 0).value)
      .not.toBe("object");
  }, 30_000);

  it("is memoized — one isolate is shared, not reloaded per call", async () => {
    const a = await loadFormJsEvaluator();
    const b = await loadFormJsEvaluator();
    expect(a).toBe(b);
  }, 30_000);
});
