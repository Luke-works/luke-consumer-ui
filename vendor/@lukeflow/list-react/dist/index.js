// src/useListEngine.ts
import { useEffect, useReducer, useRef } from "react";
import {
  createListEngine
} from "@lukeflow/list-core";
function useListEngine(schema, options) {
  const ref = useRef(null);
  if (ref.current === null) {
    ref.current = createListEngine(schema, options);
  }
  const engine = ref.current;
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => engine.subscribe(force), [engine]);
  return engine;
}

// src/ListGrid.tsx
import { useEffect as useEffect2, useMemo, useReducer as useReducer2 } from "react";
import {
  DataGrid,
  renderTextEditor
} from "react-data-grid";
import { jsx } from "react/jsx-runtime";
function ListGrid({ engine, className, height = 400 }) {
  const [, force] = useReducer2((x) => x + 1, 0);
  useEffect2(() => engine.subscribe(force), [engine]);
  const columns = useMemo(
    () => engine.columns().map((col) => ({
      key: col.key,
      name: col.label,
      sortable: true,
      width: col.width,
      // Editable iff the column allows it (presence of renderEditCell makes a cell editable).
      renderEditCell: col.readOnly ? void 0 : renderTextEditor,
      // Show the column type's formatted value, not the raw stored value.
      renderCell: ({ row }) => engine.formatCell(row.__id, col.key)
    })),
    [engine]
  );
  const rows = engine.getView().map((r) => ({ __id: r.id, ...r.cells }));
  const sort = engine.getSort();
  const sortColumns = sort ? [{ columnKey: sort.columnKey, direction: sort.direction === "desc" ? "DESC" : "ASC" }] : [];
  function handleRowsChange(newRows, data) {
    for (const i of data.indexes) {
      const row = newRows[i];
      if (row) engine.setCell(row.__id, data.column.key, row[data.column.key]);
    }
  }
  function handleSortColumnsChange(next) {
    const first = next[0];
    engine.setSort(
      first ? { columnKey: first.columnKey, direction: first.direction === "DESC" ? "desc" : "asc" } : null
    );
  }
  return /* @__PURE__ */ jsx("div", { className, style: { height }, children: /* @__PURE__ */ jsx(
    DataGrid,
    {
      columns,
      rows,
      rowKeyGetter: (row) => row.__id,
      onRowsChange: handleRowsChange,
      sortColumns,
      onSortColumnsChange: handleSortColumnsChange,
      className: "luke-list-grid"
    }
  ) });
}
export {
  ListGrid,
  useListEngine
};
//# sourceMappingURL=index.js.map