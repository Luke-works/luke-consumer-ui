import { ListSchema, CreateListEngineOptions, ListEngine } from '@lukeflow/list-core';
import * as react from 'react';

/**
 * Create a {@link ListEngine} bound to a React component and re-render on every engine change.
 *
 * The engine is created once (on first render) and treated as a stable store — like a Zustand
 * store, the `schema`/`options` are read only at creation; pass a new component `key` if you
 * need to rebuild the engine for a different schema.
 */
declare function useListEngine(schema: ListSchema, options?: CreateListEngineOptions): ListEngine;

interface ListGridProps {
    /** The headless engine that owns the data. The grid is a thin view over it. */
    engine: ListEngine;
    /** Optional class on the bounding wrapper. */
    className?: string;
    /** RDG needs a bounded height to scroll/virtualize. Default 400px. */
    height?: number | string;
}
/**
 * Renders a {@link ListEngine} as an editable spreadsheet using react-data-grid. The engine is
 * the single source of truth: cell edits and header-sort clicks are pushed back into the engine,
 * which re-emits and re-renders the grid. RDG provides the Excel interaction layer (cell
 * selection, keyboard navigation, copy/paste); the engine provides the typed data model.
 */
declare function ListGrid({ engine, className, height }: ListGridProps): react.JSX.Element;

export { ListGrid, type ListGridProps, useListEngine };
