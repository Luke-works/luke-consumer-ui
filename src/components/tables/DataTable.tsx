import { useEffect, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { useMediaQuery } from "../../hooks/useMediaQuery";

// Per-column display hints, read in the header/cell renderers below.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "right" | "center";
    headerClassName?: string;
    cellClassName?: string;
    /** In the small-screen card view, use this column as the always-visible card
     *  title. Defaults to the first column when no column opts in. */
    mobilePrimary?: boolean;
    /** Hide this column from the expanded detail list in the card view (e.g. a
     *  redundant/action column already surfaced elsewhere). */
    mobileHidden?: boolean;
  }
}

/**
 * Server-driven mode (#26). When provided, the table stops paginating/sorting/
 * filtering the (already-paged) `data` client-side and instead reports user intent
 * to the parent, which refetches a page. `data` is one server page; `rowCount` is the
 * full server total. Omit this prop entirely for the default client-side behaviour.
 */
export type ManualTable = {
  pageIndex: number;
  pageSize: number;
  /** Full server-side row count (drives page-count + the "of N" label). */
  rowCount: number;
  onPageChange: (pageIndex: number) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  search: string;
  onSearchChange: (search: string) => void;
};

type DataTableProps<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  enableSearch?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  emptyMessage?: string;
  /** Tailwind min-width on the table so columns don't crush on small screens. */
  minWidth?: string;
  /** Extra controls rendered on the toolbar row, opposite the search box. */
  toolbar?: React.ReactNode;
  /** Opt in to server-side pagination/sort/search. See {@link ManualTable}. */
  manual?: ManualTable;
  /** On narrow screens (< Tailwind `sm`), collapse each row into an expandable
   *  card (primary column + chevron; tap to reveal the rest as label/value
   *  rows) instead of a horizontally-scrolling table. On by default; pass
   *  `false` to keep the plain scrolling table everywhere. */
  mobileCards?: boolean;
};

const alignClass = (a?: string) =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

// Headless TanStack table wrapped in TailAdmin's table styling: sortable
// headers, a global search box, and (by default) client-side pagination. Pass
// `manual` to drive pagination/sort/search from the server instead. Bring your own
// column defs (use createColumnHelper) and the rest is handled here.
export default function DataTable<T>({
  columns,
  data,
  enableSearch = true,
  searchPlaceholder = "Search…",
  pageSize = 10,
  onRowClick,
  rowClassName,
  emptyMessage = "No results.",
  minWidth = "min-w-[640px]",
  toolbar,
  manual,
  mobileCards = true,
}: DataTableProps<T>) {
  const isManual = !!manual;

  // Below Tailwind `sm` we swap the scrolling table for expandable cards. Only
  // one of the two ever renders (not CSS-hidden), so there's no duplicate DOM.
  // Under jsdom/SSR this is always false → the table renders, as before.
  const isNarrow = useMediaQuery("(max-width: 639px)");
  const cardMode = mobileCards && isNarrow;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // Client-mode state (ignored in manual mode).
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  // Manual-mode search input, debounced so each keystroke doesn't refetch.
  const [searchInput, setSearchInput] = useState(manual?.search ?? "");
  useEffect(() => {
    if (!isManual) return;
    const id = setTimeout(() => {
      if (searchInput !== manual!.search) manual!.onSearchChange(searchInput);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, isManual]);

  const table = useReactTable({
    data,
    columns,
    state: isManual
      ? {
          sorting: manual.sorting,
          pagination: { pageIndex: manual.pageIndex, pageSize: manual.pageSize },
        }
      : { sorting, globalFilter },
    manualPagination: isManual,
    manualSorting: isManual,
    manualFiltering: isManual,
    rowCount: isManual ? manual.rowCount : undefined,
    onSortingChange: isManual
      ? (updater) =>
          manual.onSortingChange(typeof updater === "function" ? updater(manual.sorting) : updater)
      : setSorting,
    onPaginationChange: isManual
      ? (updater) => {
          const next =
            typeof updater === "function"
              ? updater({ pageIndex: manual.pageIndex, pageSize: manual.pageSize })
              : updater;
          manual.onPageChange(next.pageIndex);
        }
      : undefined,
    onGlobalFilterChange: isManual ? undefined : setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: isManual ? undefined : getSortedRowModel(),
    getFilteredRowModel: isManual ? undefined : getFilteredRowModel(),
    getPaginationRowModel: isManual ? undefined : getPaginationRowModel(),
    initialState: isManual ? undefined : { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  // Look up a column's header (for its label) when rendering the card detail list.
  const headerFor = (columnId: string) =>
    table.getFlatHeaders().find((h) => h.column.id === columnId);
  const currentPageSize = isManual ? manual.pageSize : pageSize;
  const totalRows = isManual ? manual.rowCount : table.getFilteredRowModel().rows.length;
  const pageIndex = isManual ? manual.pageIndex : table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  const from = totalRows === 0 ? 0 : pageIndex * currentPageSize + 1;
  const to = Math.min((pageIndex + 1) * currentPageSize, totalRows);

  const searchValue = isManual ? searchInput : globalFilter;
  const onSearch = isManual ? setSearchInput : setGlobalFilter;

  return (
    <div>
      {(enableSearch || toolbar) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {enableSearch ? (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchValue}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-lg border border-gray-200 bg-transparent pl-10 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
              />
            </div>
          ) : (
            <span />
          )}
          {toolbar}
        </div>
      )}

      {!cardMode && (
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <table className={`w-full ${minWidth} text-left text-sm`}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800"
              >
                {hg.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      // aria-sort lets AT announce asc/desc/none (#34).
                      aria-sort={canSort ? (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") : undefined}
                      className={`px-5 py-3 font-medium ${alignClass(meta?.align)} ${meta?.headerClassName ?? ""}`}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={`inline-flex items-center gap-1 transition hover:text-gray-600 dark:hover:text-gray-300 ${
                            meta?.align === "right" ? "flex-row-reverse" : ""
                          }`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ChevronUp className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getAllLeafColumns().length}
                  className="px-5 py-10 text-center text-sm text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`group border-b border-gray-100 transition-colors last:border-0 dark:border-gray-800/70 ${
                    onRowClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03]" : ""
                  } ${rowClassName?.(row.original) ?? ""}`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <td
                        key={cell.id}
                        className={`px-5 py-3 ${alignClass(meta?.align)} ${meta?.cellClassName ?? ""}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {cardMode && (
        <div className="space-y-2">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
              {emptyMessage}
            </div>
          ) : (
            rows.map((row) => {
              const cells = row.getVisibleCells();
              // The always-visible card title: the column that opts in via
              // meta.mobilePrimary, else the first column.
              const primaryIdx = Math.max(
                0,
                cells.findIndex((c) => c.column.columnDef.meta?.mobilePrimary),
              );
              const primary = cells[primaryIdx];
              const details = cells.filter(
                (c, i) => i !== primaryIdx && !c.column.columnDef.meta?.mobileHidden,
              );
              const isOpen = !!expanded[row.id];
              return (
                <div
                  key={row.id}
                  className={`overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${rowClassName?.(row.original) ?? ""}`}
                >
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        onRowClick ? onRowClick(row.original) : toggleExpanded(row.id)
                      }
                      className="min-w-0 flex-1 text-left text-sm text-gray-800 dark:text-white/90"
                    >
                      {primary
                        ? flexRender(primary.column.columnDef.cell, primary.getContext())
                        : null}
                    </button>
                    {details.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.id)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Hide details" : "Show details"}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5"
                      >
                        <ChevronDown
                          className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  </div>
                  {isOpen && details.length > 0 && (
                    <dl className="space-y-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                      {details.map((cell) => {
                        const header = headerFor(cell.column.id);
                        return (
                          <div
                            key={cell.id}
                            className="flex items-start justify-between gap-3 text-sm"
                          >
                            <dt className="shrink-0 text-gray-400">
                              {header && !header.isPlaceholder
                                ? flexRender(header.column.columnDef.header, header.getContext())
                                : null}
                            </dt>
                            <dd className="min-w-0 break-words text-right text-gray-700 dark:text-gray-300">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>
            Showing {from}–{to} of {totalRows}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
