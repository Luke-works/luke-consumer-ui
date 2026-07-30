// src/useAnalyticsEngine.ts
import { useEffect, useReducer, useRef } from "react";
import {
  createAnalyticsEngine
} from "@lukeflow/analytics-core";
function useAnalyticsEngine(schema, options) {
  const ref = useRef(null);
  if (ref.current === null) {
    ref.current = createAnalyticsEngine(schema, options);
  }
  const engine = ref.current;
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => engine.subscribe(force), [engine]);
  return engine;
}

// src/AnalyticsChart.tsx
import { useMemo } from "react";
import { Bar, ResponsiveBar } from "@nivo/bar";
import { Line, ResponsiveLine } from "@nivo/line";
import { Pie, ResponsivePie } from "@nivo/pie";
import { buildChartData } from "@lukeflow/analytics-core";
import { jsx } from "react/jsx-runtime";
var DEFAULT_MARGIN = { top: 24, right: 24, bottom: 48, left: 56 };
function AnalyticsChart({
  spec,
  result,
  width,
  height,
  animate = true
}) {
  const data = useMemo(() => buildChartData(spec, result), [spec, result]);
  const fixed = typeof width === "number" && typeof height === "number";
  const options = spec.options ?? {};
  if (data.kind === "pie") {
    const common2 = {
      data: data.data,
      margin: DEFAULT_MARGIN,
      animate,
      ...options
    };
    return fixed ? /* @__PURE__ */ jsx(Pie, { width, height, ...common2 }) : /* @__PURE__ */ jsx(ResponsivePie, { ...common2 });
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
    return fixed ? /* @__PURE__ */ jsx(Line, { width, height, ...common2 }) : /* @__PURE__ */ jsx(ResponsiveLine, { ...common2 });
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
  return fixed ? /* @__PURE__ */ jsx(Bar, { width, height, ...common }) : /* @__PURE__ */ jsx(ResponsiveBar, { ...common });
}

// src/EngineChart.tsx
import { useEffect as useEffect2, useReducer as useReducer2, useRef as useRef2 } from "react";
import { createAnalyticsEngine as createAnalyticsEngine2 } from "@lukeflow/analytics-core";
import { jsx as jsx2 } from "react/jsx-runtime";
var EMPTY_SCHEMA = { name: "", fields: [] };
function EngineChart({
  spec,
  engine,
  schema,
  options,
  ...chartProps
}) {
  const internalRef = useRef2(null);
  if (!engine && internalRef.current === null) {
    internalRef.current = createAnalyticsEngine2(schema ?? EMPTY_SCHEMA, options);
  }
  const active = engine ?? internalRef.current;
  const [, force] = useReducer2((x) => x + 1, 0);
  useEffect2(() => active.subscribe(force), [active]);
  const result = active.run(spec.query);
  return /* @__PURE__ */ jsx2(AnalyticsChart, { spec, result, ...chartProps });
}
export {
  AnalyticsChart,
  EngineChart,
  useAnalyticsEngine
};
//# sourceMappingURL=index.js.map