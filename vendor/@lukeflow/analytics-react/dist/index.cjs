"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AnalyticsChart: () => AnalyticsChart,
  EngineChart: () => EngineChart,
  useAnalyticsEngine: () => useAnalyticsEngine
});
module.exports = __toCommonJS(index_exports);

// src/useAnalyticsEngine.ts
var import_react = require("react");
var import_analytics_core = require("@lukeflow/analytics-core");
function useAnalyticsEngine(schema, options) {
  const ref = (0, import_react.useRef)(null);
  if (ref.current === null) {
    ref.current = (0, import_analytics_core.createAnalyticsEngine)(schema, options);
  }
  const engine = ref.current;
  const [, force] = (0, import_react.useReducer)((x) => x + 1, 0);
  (0, import_react.useEffect)(() => engine.subscribe(force), [engine]);
  return engine;
}

// src/AnalyticsChart.tsx
var import_react2 = require("react");
var import_bar = require("@nivo/bar");
var import_line = require("@nivo/line");
var import_pie = require("@nivo/pie");
var import_analytics_core2 = require("@lukeflow/analytics-core");
var import_jsx_runtime = require("react/jsx-runtime");
var DEFAULT_MARGIN = { top: 24, right: 24, bottom: 48, left: 56 };
function AnalyticsChart({
  spec,
  result,
  width,
  height,
  animate = true
}) {
  const data = (0, import_react2.useMemo)(() => (0, import_analytics_core2.buildChartData)(spec, result), [spec, result]);
  const fixed = typeof width === "number" && typeof height === "number";
  const options = spec.options ?? {};
  if (data.kind === "pie") {
    const common2 = {
      data: data.data,
      margin: DEFAULT_MARGIN,
      animate,
      ...options
    };
    return fixed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_pie.Pie, { width, height, ...common2 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_pie.ResponsivePie, { ...common2 });
  }
  if (data.kind === "line") {
    const common2 = {
      // Adapter boundary: the transform guarantees numeric/string points; Nivo's stricter
      // AllowedValue type (no boolean) is satisfied at runtime, so we narrow here.
      data: data.series,
      margin: DEFAULT_MARGIN,
      animate,
      enableArea: spec.type === "area",
      useMesh: true,
      xScale: { type: "point" },
      yScale: { type: "linear", min: "auto", max: "auto" },
      ...options
    };
    return fixed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_line.Line, { width, height, ...common2 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_line.ResponsiveLine, { ...common2 });
  }
  const common = {
    // Adapter boundary: bar values are coerced to numbers by the transform; narrow to the
    // datum shape Nivo's Bar expects (string|number cells).
    data: data.data,
    keys: data.keys,
    indexBy: data.indexBy,
    margin: DEFAULT_MARGIN,
    animate,
    groupMode: "grouped",
    ...options
  };
  return fixed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_bar.Bar, { width, height, ...common }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_bar.ResponsiveBar, { ...common });
}

// src/EngineChart.tsx
var import_react3 = require("react");
var import_analytics_core3 = require("@lukeflow/analytics-core");
var import_jsx_runtime2 = require("react/jsx-runtime");
var EMPTY_SCHEMA = { name: "", fields: [] };
function EngineChart({
  spec,
  engine,
  schema,
  options,
  ...chartProps
}) {
  const internalRef = (0, import_react3.useRef)(null);
  if (!engine && internalRef.current === null) {
    internalRef.current = (0, import_analytics_core3.createAnalyticsEngine)(schema ?? EMPTY_SCHEMA, options);
  }
  const active = engine ?? internalRef.current;
  const [, force] = (0, import_react3.useReducer)((x) => x + 1, 0);
  (0, import_react3.useEffect)(() => active.subscribe(force), [active]);
  const result = active.run(spec.query);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AnalyticsChart, { spec, result, ...chartProps });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AnalyticsChart,
  EngineChart,
  useAnalyticsEngine
});
//# sourceMappingURL=index.cjs.map