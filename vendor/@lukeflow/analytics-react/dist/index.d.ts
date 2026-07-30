import { DatasetSchema, CreateAnalyticsEngineOptions, AnalyticsEngine, ChartSpec, ResultSet } from '@lukeflow/analytics-core';
import * as react from 'react';

/**
 * Create an {@link AnalyticsEngine} bound to a React component and re-render on every engine
 * change (rows added/replaced).
 *
 * The engine is created once (on first render) and treated as a stable store — the
 * `schema`/`options` are read only at creation; pass a new component `key` if you need to
 * rebuild the engine for a different dataset. Call `engine.run(query)` inside render to derive a
 * result set; because the component re-renders on data changes, the result stays current.
 */
declare function useAnalyticsEngine(schema: DatasetSchema, options?: CreateAnalyticsEngineOptions): AnalyticsEngine;

interface AnalyticsChartProps {
    /** The chart definition (type + query + encoding). */
    spec: ChartSpec;
    /** The result set to draw — typically `engine.run(spec.query)`. */
    result: ResultSet;
    /**
     * Fixed pixel dimensions. When both are provided the chart renders at that exact size; when
     * omitted it fills its (sized) parent via Nivo's responsive wrapper. Tests pass fixed sizes to
     * avoid the ResizeObserver measurement path.
     */
    width?: number;
    height?: number;
    /** Enable Nivo's enter/update animations. Defaults to `true`. */
    animate?: boolean;
}
/**
 * Render a {@link ChartSpec} + {@link ResultSet} as a Nivo chart. The heavy lifting —
 * turning the result set into the renderer's data shape — lives in `analytics-core`'s
 * {@link buildChartData}; this component only maps that onto the matching Nivo chart. The
 * drawing layer is therefore swappable without touching the engine or the chart-spec contract.
 */
declare function AnalyticsChart({ spec, result, width, height, animate, }: AnalyticsChartProps): react.JSX.Element;

interface EngineChartProps extends Omit<AnalyticsChartProps, "result"> {
    /** The chart to draw; its `query` is run against the engine. */
    spec: ChartSpec;
    /** An existing engine to draw from. Mutually exclusive with `schema`. */
    engine?: AnalyticsEngine;
    /** Create an engine from this schema/options when no `engine` is passed. */
    schema?: DatasetSchema;
    options?: CreateAnalyticsEngineOptions;
}
/**
 * Convenience: run `spec.query` against an engine and render the result. Pass either an existing
 * `engine` or a `schema` (+ `options`) to create one. The component subscribes to whichever
 * engine is active, so the chart re-runs the query whenever that engine's rows change.
 */
declare function EngineChart({ spec, engine, schema, options, ...chartProps }: EngineChartProps): react.JSX.Element;

export { AnalyticsChart, type AnalyticsChartProps, EngineChart, type EngineChartProps, useAnalyticsEngine };
