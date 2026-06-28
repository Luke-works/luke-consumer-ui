import { ListSchema, SchemaReport, ColumnType, ColumnDef } from '@lukeflow/list-core';
import * as react from 'react';

/** Headless controller for designing a {@link ListSchema}. */
interface ListBuilderController {
    schema: ListSchema;
    /** Structural validation of the current schema (live). */
    report: SchemaReport;
    setName(name: string): void;
    /** Append a new column of `type` with an auto-generated unique key. Returns the new key. */
    addColumn(type?: ColumnType): string;
    /** Patch a column by key. The key itself is identity and is not patchable here. */
    updateColumn(key: string, patch: Partial<Omit<ColumnDef, "key">>): void;
    removeColumn(key: string): void;
    moveColumn(key: string, toIndex: number): void;
    /** Replace the whole schema (e.g. load a different list). */
    reset(next: ListSchema): void;
}
interface UseListBuilderOptions {
    onChange?: (schema: ListSchema) => void;
}
declare function useListBuilder(initialSchema: ListSchema, options?: UseListBuilderOptions): ListBuilderController;

interface ListBuilderProps {
    initialSchema: ListSchema;
    onChange?: (schema: ListSchema) => void;
    className?: string;
}
/**
 * A minimal, accessible column/schema designer for a list. Edits flow through
 * {@link useListBuilder}; structural problems are surfaced live in a Problems panel.
 */
declare function ListBuilder({ initialSchema, onChange, className }: ListBuilderProps): react.JSX.Element;

export { ListBuilder, type ListBuilderController, type ListBuilderProps, type UseListBuilderOptions, useListBuilder };
