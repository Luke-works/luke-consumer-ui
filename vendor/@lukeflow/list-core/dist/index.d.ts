/**
 * Core data model for a "list" — a standalone, strongly-typed data grid.
 *
 * A list is a {@link ListSchema} (an ordered set of {@link ColumnDef}s) plus a set of
 * {@link Row}s. Every cell value is one of the primitives in {@link CellValue}; how a raw
 * input string maps to/from that primitive, and how it is validated and compared, is owned
 * by the column's type in the column-type registry — never hard-coded here.
 */
/** The only value primitives a cell may hold. `null` denotes an empty cell. */
type CellValue = string | number | boolean | null;
/** Built-in column type identifiers. The registry is extensible, so this is not a closed set. */
type ColumnType = "text" | "number" | "currency" | "boolean" | "date" | "select";
/** A selectable option for `select` columns. */
interface SelectOption {
    value: string;
    label: string;
}
/** Definition of a single column. `key` is the stable identifier used in {@link Row.cells}. */
interface ColumnDef {
    /** Stable, unique-within-schema column identifier (the key under which cell values are stored). */
    key: string;
    /** Human-facing column header. */
    label: string;
    /** Column type id; must resolve in the active column-type registry. */
    type: ColumnType | (string & {});
    /** Optional display width hint (px) for renderers. */
    width?: number;
    /** When true, an empty cell fails validation. */
    required?: boolean;
    /** When true, renderers should not allow editing. */
    readOnly?: boolean;
    /** Default value applied to new rows when the cell is otherwise empty. */
    defaultValue?: CellValue;
    /** Options for `select` columns. */
    options?: SelectOption[];
    /** Optional per-column extra config consumed by custom column types. */
    meta?: Record<string, unknown>;
}
/** A list definition: ordered columns plus identifying metadata. */
interface ListSchema {
    /** Optional stable id (e.g. the backend `code`). */
    id?: string;
    /** Human-facing list name. */
    name: string;
    /** Ordered column definitions. Order is the display/iteration order. */
    columns: ColumnDef[];
    /** Optional schema version (bumped by the backend on publish). */
    version?: number;
}
/** A single row: a stable id plus a sparse map of column-key → cell value. */
interface Row {
    id: string;
    cells: Record<string, CellValue>;
}
/** A single validation failure for one cell. */
interface CellError {
    rowId: string;
    columnKey: string;
    message: string;
}
/** Outcome of validating rows against a schema. */
interface ValidationReport {
    ok: boolean;
    errors: CellError[];
}
/** Sort direction. */
type SortDirection = "asc" | "desc";
/** A sort instruction: which column and which direction. */
interface SortSpec {
    columnKey: string;
    direction: SortDirection;
}
/** Supported filter operators. */
type FilterOperator = "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "empty" | "notEmpty";
/** A single filter criterion against one column. */
interface FilterSpec {
    columnKey: string;
    operator: FilterOperator;
    /** Comparison operand; ignored for `empty`/`notEmpty`. */
    value?: CellValue;
}

/**
 * A column type owns everything type-specific about a cell: how a raw input (typed text,
 * pasted string, imported value) becomes the canonical {@link CellValue}, how that value is
 * formatted for display, whether it is valid, and how two values sort. Renderers and the
 * engine stay type-agnostic by delegating to the handler.
 */
interface ColumnTypeHandler {
    /** Type id, e.g. `"number"`. Matched against {@link ColumnDef.type}. */
    type: string;
    /** The empty/cleared value for this type (usually `null`). */
    empty(): CellValue;
    /**
     * Coerce an arbitrary raw input into the canonical cell value. Must be total: an
     * unparseable input should resolve to {@link ColumnTypeHandler.empty} (validation, not
     * parsing, reports the problem), so the engine never throws on bad data.
     */
    parse(input: unknown, col: ColumnDef): CellValue;
    /** Render the value as a display/export string. Empty → `""`. */
    format(value: CellValue, col: ColumnDef): string;
    /** Return an error message if the value is invalid for this column, else `null`. */
    validate(value: CellValue, col: ColumnDef): string | null;
    /** Sort comparison: <0 if a precedes b, >0 if after, 0 if equal. Empty sorts last. */
    compare(a: CellValue, b: CellValue, col: ColumnDef): number;
}
/** A registry of column-type handlers, keyed by type id. Extensible via {@link register}. */
declare class ColumnTypeRegistry {
    private readonly handlers;
    constructor(initial?: ColumnTypeHandler[]);
    register(handler: ColumnTypeHandler): void;
    has(type: string): boolean;
    /** Resolve a handler, falling back to the `text` handler for unknown types. */
    get(type: string): ColumnTypeHandler;
    types(): string[];
}
/** A fresh registry pre-loaded with all built-in column types. */
declare function createDefaultColumnTypeRegistry(): ColumnTypeRegistry;
/** Shared default registry (built-ins only). Create your own to register custom types. */
declare const defaultColumnTypeRegistry: ColumnTypeRegistry;

interface SchemaProblem {
    /** Column key the problem applies to, or `null` for list-level problems. */
    columnKey: string | null;
    message: string;
}
interface SchemaReport {
    ok: boolean;
    problems: SchemaProblem[];
}
/**
 * Structurally validate a {@link ListSchema}: a non-empty name, at least one column, unique
 * non-empty column keys, and column types known to the registry. This guards the design-time
 * contract; cell-data validation is separate (see the engine's `validate`).
 */
declare function validateSchema(schema: ListSchema, registry?: ColumnTypeRegistry): SchemaReport;

interface CreateListEngineOptions {
    /** Initial rows. Cell values are re-parsed through their column type so imported data is canonical. */
    initialRows?: Row[];
    /** Column-type registry; defaults to the built-in registry. */
    registry?: ColumnTypeRegistry;
    /** Row-id factory (override for deterministic ids in tests). Defaults to a monotonic counter. */
    idFactory?: () => string;
}
/** Snapshot suitable for persistence / resume. */
interface SerializedList {
    schema: ListSchema;
    rows: Row[];
}
/**
 * Headless data-grid engine. Owns the row store and exposes typed cell mutation, validation,
 * and a filtered+sorted *view* over the rows — with no rendering concerns. A renderer drives
 * it through {@link ListEngine.setCell} etc. and re-reads {@link ListEngine.getView}; subscribe
 * for change notifications.
 */
interface ListEngine {
    readonly schema: ListSchema;
    /** Columns in display order. */
    columns(): ColumnDef[];
    /** Rows in storage order (unfiltered, unsorted). */
    getRows(): Row[];
    /** Rows with the active filters and sort applied — what a grid should render. */
    getView(): Row[];
    /** Raw stored value for one cell (storage order independent). */
    getCell(rowId: string, columnKey: string): CellValue;
    /** Display string for one cell, via its column type's formatter. */
    formatCell(rowId: string, columnKey: string): string;
    /** Parse `rawInput` through the column type and store it. No-op for unknown row/column. */
    setCell(rowId: string, columnKey: string, rawInput: unknown): void;
    /** Append a row, applying column defaults; returns the created row. */
    addRow(seed?: Record<string, unknown>): Row;
    /** Remove a row by id. */
    removeRow(rowId: string): void;
    /** Move a row to a new storage index (clamped). */
    moveRow(rowId: string, toIndex: number): void;
    /** Set (or clear with `null`) the active sort. */
    setSort(sort: SortSpec | null): void;
    getSort(): SortSpec | null;
    /** Replace the active filter set. */
    setFilters(filters: FilterSpec[]): void;
    getFilters(): FilterSpec[];
    /** Validate every cell against its column; `ok` is whole-list. */
    validate(): ValidationReport;
    /** Snapshot for persistence. */
    serialize(): SerializedList;
    /** Subscribe to change notifications; returns an unsubscribe fn. */
    subscribe(listener: () => void): () => void;
}
declare function createListEngine(schema: ListSchema, options?: CreateListEngineOptions): ListEngine;

export { type CellError, type CellValue, type ColumnDef, type ColumnType, type ColumnTypeHandler, ColumnTypeRegistry, type CreateListEngineOptions, type FilterOperator, type FilterSpec, type ListEngine, type ListSchema, type Row, type SchemaProblem, type SchemaReport, type SelectOption, type SerializedList, type SortDirection, type SortSpec, type ValidationReport, createDefaultColumnTypeRegistry, createListEngine, defaultColumnTypeRegistry, validateSchema };
