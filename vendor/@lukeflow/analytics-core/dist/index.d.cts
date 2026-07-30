/**
 * Core data model for analytics — a standalone, strongly-typed record set ("dataset") plus a
 * declarative query that groups by {@link DimensionDef}s and aggregates {@link MeasureDef}s.
 *
 * A dataset is a {@link DatasetSchema} (ordered, typed {@link FieldDef}s) plus {@link DataRow}s.
 * A {@link Query} runs over those rows and yields a tidy {@link ResultSet}: typed columns and
 * grouped result rows. How a measure is computed is owned by the aggregation registry — never
 * hard-coded into the engine.
 */
/** The only scalar primitives a field value or result cell may hold. `null` denotes missing. */
type ScalarValue = string | number | boolean | null;
/** Built-in field type identifiers. */
type FieldType = "string" | "number" | "boolean" | "date";
/** Definition of a single dataset field (column). `key` is the stable identifier in {@link DataRow}. */
interface FieldDef {
    /** Stable, unique-within-dataset field identifier (the key under which values are stored). */
    key: string;
    /** Human-facing field name. */
    label: string;
    /** Field type id. */
    type: FieldType;
    /** Optional display/format hint consumed by renderers (e.g. `"currency"`, `"percent"`). */
    format?: string;
    /** Optional per-field extra config. */
    meta?: Record<string, unknown>;
}
/** A dataset definition: ordered fields plus identifying metadata. */
interface DatasetSchema {
    /** Optional stable id (e.g. the backend `code`). */
    id?: string;
    /** Human-facing dataset name. */
    name: string;
    /** Ordered field definitions. */
    fields: FieldDef[];
}
/** A single source record: a map of field-key → scalar value. */
type DataRow = Record<string, ScalarValue>;
/**
 * Date bucketing granularity for a temporal {@link DimensionDef}. The dimension's grouped value
 * is the truncated ISO date (e.g. month → `"2026-06"`).
 */
type DateGranularity = "day" | "week" | "month" | "quarter" | "year";
/** A grouping dimension: which field to group by, optionally bucketed for dates. */
interface DimensionDef {
    /** Result-column key for this dimension (defaults to `field` when omitted in helpers). */
    key: string;
    /** Source field to group by. */
    field: string;
    /** Optional result-column label (defaults to the field's label). */
    label?: string;
    /** Date bucketing granularity; only meaningful for `date` fields. */
    granularity?: DateGranularity;
}
/** Built-in aggregation identifiers. The registry is extensible, so this is not a closed set. */
type AggregationType = "count" | "sum" | "avg" | "min" | "max" | "countDistinct" | "median";
/** A measure: an aggregation over a field (or `count`, which needs no field). */
interface MeasureDef {
    /** Result-column key for this measure. */
    key: string;
    /** Aggregation id; must resolve in the active aggregation registry. */
    agg: AggregationType | (string & {});
    /** Source field to aggregate. Optional for `count`; required for the rest. */
    field?: string;
    /** Optional result-column label. */
    label?: string;
}
/** Supported filter operators applied to source rows before grouping. */
type FilterOperator = "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "in" | "empty" | "notEmpty";
/** A single filter criterion against one source field. */
interface FilterSpec {
    field: string;
    operator: FilterOperator;
    /** Operand; an array for `in`, ignored for `empty`/`notEmpty`. */
    value?: ScalarValue | ScalarValue[];
}
/** Sort direction. */
type SortDirection = "asc" | "desc";
/** A sort instruction over a result column (dimension or measure {@link DimensionDef.key}/{@link MeasureDef.key}). */
interface SortSpec {
    key: string;
    direction: SortDirection;
}
/** A declarative analytics query. */
interface Query {
    /** Group-by dimensions. Empty → a single grand-total group. */
    dimensions: DimensionDef[];
    /** Aggregated measures. At least one is required for a meaningful result. */
    measures: MeasureDef[];
    /** Row predicates applied before grouping. */
    filters?: FilterSpec[];
    /** Sort applied to the result rows. */
    sort?: SortSpec | null;
    /** Max result rows after sorting. */
    limit?: number;
}
/** Role of a result column. */
type ColumnRole = "dimension" | "measure";
/** A typed column in a {@link ResultSet}. */
interface ResultColumn {
    key: string;
    label: string;
    role: ColumnRole;
    type: FieldType;
}
/** One grouped result row: a map of result-column key → value. */
type ResultRow = Record<string, ScalarValue>;
/** The tidy output of running a {@link Query}. */
interface ResultSet {
    columns: ResultColumn[];
    rows: ResultRow[];
}

/**
 * An aggregation owns how a measure is computed over a group of rows. It is a small reducer:
 * {@link init} seeds an accumulator, {@link step} folds each row's field value in, and
 * {@link finalize} produces the scalar result. The engine stays math-agnostic by delegating to
 * the handler, so the set of measures is extensible.
 *
 * The accumulator is opaque (`unknown`) to the engine; each handler defines its own shape.
 */
interface AggregationHandler {
    /** Aggregation id, e.g. `"sum"`. Matched against {@link MeasureDef.agg}. */
    type: string;
    /** Result column type — `"number"` for every built-in. */
    resultType: "number";
    /** Whether this aggregation requires a source field (`count` does not; `sum` does). */
    needsField: boolean;
    /**
     * Whether the source field must be numeric. `sum`/`avg`/`min`/`max`/`median` require it;
     * `count` (field-less) and `countDistinct` (works on any type) do not.
     */
    requiresNumericField: boolean;
    /** Seed a fresh accumulator for one group. */
    init(): unknown;
    /**
     * Fold one row's field value into the accumulator and return the (possibly new) accumulator.
     * `value` is `undefined` for the field-less `count`. Implementations should ignore `null` /
     * non-applicable values rather than throw.
     */
    step(acc: unknown, value: ScalarValue | undefined): unknown;
    /** Produce the final scalar from the accumulator (a fully-empty group → `0` or `null`). */
    finalize(acc: unknown): ScalarValue;
}
/** A registry of aggregation handlers, keyed by type id. Extensible via {@link register}. */
declare class AggregationRegistry {
    private readonly handlers;
    constructor(initial?: AggregationHandler[]);
    register(handler: AggregationHandler): void;
    has(type: string): boolean;
    /** Resolve a handler, or `undefined` for an unknown type (callers decide how to handle). */
    get(type: string): AggregationHandler | undefined;
    types(): string[];
}
/** A fresh registry pre-loaded with all built-in aggregations. */
declare function createDefaultAggregationRegistry(): AggregationRegistry;
/** Shared default registry (built-ins only). Create your own to register custom aggregations. */
declare const defaultAggregationRegistry: AggregationRegistry;

interface QueryProblem {
    /** Result-column key (dimension/measure) the problem applies to, or `null` for query-level. */
    key: string | null;
    message: string;
}
interface QueryReport {
    ok: boolean;
    problems: QueryProblem[];
}
/**
 * Structurally validate a {@link Query} against a {@link DatasetSchema}: result-column keys are
 * present and unique, dimension/measure/filter fields resolve, granularity is only used on date
 * fields, aggregations are known and supplied with a numeric field where required, and at least
 * one measure exists. This guards the contract before the engine runs it.
 */
declare function validateQuery(query: Query, schema: DatasetSchema, registry?: AggregationRegistry): QueryReport;

/**
 * Truncate a date value to a {@link DateGranularity} bucket key. The bucket key is a stable,
 * lexicographically-sortable string (`year` → `"2026"`, `month` → `"2026-06"`, `quarter` →
 * `"2026-Q2"`, `week` → ISO week `"2026-W26"`, `day` → `"2026-06-28"`). Unparseable values are
 * returned as their string form unchanged so they form their own group rather than throwing.
 */
declare function bucketDate(value: ScalarValue, granularity: DateGranularity): ScalarValue;

interface CreateAnalyticsEngineOptions {
    /** Initial source rows. */
    rows?: DataRow[];
    /** Aggregation registry; defaults to the built-in registry. */
    registry?: AggregationRegistry;
}
/** Snapshot suitable for persistence / resume. */
interface SerializedAnalytics {
    schema: DatasetSchema;
    rows: DataRow[];
}
/**
 * Headless analytics engine. Owns the source row store and runs declarative {@link Query}s over
 * it — filter → group-by → aggregate → sort → limit — returning a tidy {@link ResultSet}. No
 * rendering concerns; a renderer reads {@link AnalyticsEngine.run} output and draws it. Subscribe
 * for change notifications when the underlying rows mutate.
 */
interface AnalyticsEngine {
    readonly schema: DatasetSchema;
    /** Fields in declaration order. */
    fields(): FieldDef[];
    /** Current source rows (copy). */
    getRows(): DataRow[];
    /** Replace the entire source row set. */
    setRows(rows: DataRow[]): void;
    /** Append a row. */
    addRow(row: DataRow): void;
    /** Run a query and return its result set. Pure — does not mutate the store. */
    run(query: Query): ResultSet;
    /** Snapshot for persistence. */
    serialize(): SerializedAnalytics;
    /** Subscribe to row-change notifications; returns an unsubscribe fn. */
    subscribe(listener: () => void): () => void;
}
declare function createAnalyticsEngine(schema: DatasetSchema, options?: CreateAnalyticsEngineOptions): AnalyticsEngine;

/** Supported chart types. Renderer-agnostic; `analytics-react` maps these onto Nivo. */
type ChartType = "bar" | "line" | "area" | "pie";
/**
 * How result columns map to a chart's visual channels.
 * - `index`: the dimension result-column drawn along the category / x axis (pie slice id).
 * - `values`: the measure result-column(s) drawn as bars / lines / the slice value.
 * - `series`: an optional second dimension to split into separate bars/lines (pivoted). When
 *   set, `values` should name a single measure — that measure becomes each series' value.
 */
interface ChartEncoding {
    index: string;
    values: string[];
    series?: string;
}
/** A chart: a chart type, the query that produces its data, and the channel encoding. */
interface ChartSpec {
    id?: string;
    type: ChartType;
    title?: string;
    query: Query;
    encoding: ChartEncoding;
    /** Opaque renderer options passed through to the drawing layer. */
    options?: Record<string, unknown>;
}
/**
 * One datum for a bar chart: the index value under the `indexBy` key plus a numeric cell per
 * series/measure key. Keys never collide with `indexBy` because result-column keys are unique
 * (enforced by `validateQuery`), and for a pivoted series the index/series come from distinct
 * dimensions.
 */
type BarDatum = Record<string, ScalarValue>;
/** One point in a line/area series. */
interface LinePoint {
    x: ScalarValue;
    y: number | null;
}
/** One line/area series. */
interface LineSeries {
    id: string;
    data: LinePoint[];
}
/** One pie slice. */
interface PieDatum {
    id: string;
    label: string;
    value: number;
}
/**
 * Normalized chart data, tagged by the shape the renderer needs. `bar` feeds a grouped/stacked
 * bar chart; `line` feeds both line and area charts; `pie` feeds a pie chart.
 */
type ChartData = {
    kind: "bar";
    indexBy: string;
    keys: string[];
    data: BarDatum[];
} | {
    kind: "line";
    series: LineSeries[];
} | {
    kind: "pie";
    data: PieDatum[];
};

/**
 * Transform a {@link ResultSet} into the normalized {@link ChartData} the renderer needs, per the
 * chart's {@link ChartSpec.encoding}. Pure and framework-agnostic — `analytics-react` maps the
 * output onto Nivo props. When `encoding.series` is set, the data is pivoted so each distinct
 * series value becomes its own bar/line, using the first measure in `encoding.values`.
 */
declare function buildChartData(spec: ChartSpec, result: ResultSet): ChartData;

export { type AggregationHandler, AggregationRegistry, type AggregationType, type AnalyticsEngine, type BarDatum, type ChartData, type ChartEncoding, type ChartSpec, type ChartType, type ColumnRole, type CreateAnalyticsEngineOptions, type DataRow, type DatasetSchema, type DateGranularity, type DimensionDef, type FieldDef, type FieldType, type FilterOperator, type FilterSpec, type LinePoint, type LineSeries, type MeasureDef, type PieDatum, type Query, type QueryProblem, type QueryReport, type ResultColumn, type ResultRow, type ResultSet, type ScalarValue, type SerializedAnalytics, type SortDirection, type SortSpec, bucketDate, buildChartData, createAnalyticsEngine, createDefaultAggregationRegistry, defaultAggregationRegistry, validateQuery };
