'use strict';

var quickjsEmscripten = require('quickjs-emscripten');

// src/engine/quickjs.ts
var DEFAULT_MEMORY = 8 * 1024 * 1024;
var DEFAULT_TIMEOUT_MS = 100;
var U2028 = String.fromCharCode(8232);
var U2029 = String.fromCharCode(8233);
var LINE_SEPARATORS = new RegExp("[" + U2028 + U2029 + "]", "g");
var escapeLineSep = (c) => c === U2028 ? "\\u2028" : "\\u2029";
function jsLiteral(v) {
  let s;
  try {
    s = JSON.stringify(v);
  } catch {
    return "null";
  }
  if (s === void 0) return "undefined";
  return s.replace(LINE_SEPARATORS, escapeLineSep);
}
function errMessage(dumped) {
  if (dumped && typeof dumped === "object" && "message" in dumped) {
    return String(dumped.message);
  }
  return String(dumped);
}
async function createQuickJsEvaluator(options = {}) {
  const memoryLimitBytes = options.memoryLimitBytes ?? DEFAULT_MEMORY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const QuickJS = options.module ?? await quickjsEmscripten.getQuickJS();
  return function quickJsEvaluate(code, scope, self, row) {
    if (typeof code !== "string" || !code.trim()) {
      return { value: self, show: true, valid: true, ok: true };
    }
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(memoryLimitBytes);
    const deadline = Date.now() + timeoutMs;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const vm = runtime.newContext();
    try {
      const src = '(function(){"use strict";\nvar data = ' + jsLiteral(scope) + ";\nvar value = " + jsLiteral(self) + ", input = value, show = true, valid = true;\nvar row = " + jsLiteral(row) + ";\nvoid input; void row;\n" + code + "\n;return JSON.stringify({value:value,show:show,valid:valid});})()";
      const result = vm.evalCode(src);
      if (result.error) {
        const dumped = vm.dump(result.error);
        result.error.dispose();
        return { value: self, show: true, valid: true, ok: false, error: errMessage(dumped) };
      }
      const json = vm.dump(result.value);
      result.value.dispose();
      const parsed = JSON.parse(json);
      return { value: parsed.value, show: parsed.show, valid: parsed.valid, ok: true };
    } catch (e) {
      return {
        value: self,
        show: true,
        valid: true,
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      };
    } finally {
      vm.dispose();
      runtime.dispose();
    }
  };
}

exports.createQuickJsEvaluator = createQuickJsEvaluator;
//# sourceMappingURL=quickjs.cjs.map
//# sourceMappingURL=quickjs.cjs.map