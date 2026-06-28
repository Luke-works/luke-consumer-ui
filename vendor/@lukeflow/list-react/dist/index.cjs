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
  ListGrid: () => ListGrid,
  useListEngine: () => useListEngine
});
module.exports = __toCommonJS(index_exports);

// src/useListEngine.ts
var import_react = require("react");
var import_list_core = require("@lukeflow/list-core");
function useListEngine(schema, options) {
  const ref = (0, import_react.useRef)(null);
  if (ref.current === null) {
    ref.current = (0, import_list_core.createListEngine)(schema, options);
  }
  const engine = ref.current;
  const [, force] = (0, import_react.useReducer)((x) => x + 1, 0);
  (0, import_react.useEffect)(() => engine.subscribe(force), [engine]);
  return engine;
}

// src/ListGrid.tsx
var import_react2 = require("react");
var import_react_data_grid = require("react-data-grid");
var import_jsx_runtime = require("react/jsx-runtime");
function ListGrid({ engine, className, height = 400 }) {
  const [, force] = (0, import_react2.useReducer)((x) => x + 1, 0);
  (0, import_react2.useEffect)(() => engine.subscribe(force), [engine]);
  const columns = (0, import_react2.useMemo)(
    () => engine.columns().map((col) => ({
      key: col.key,
      name: col.label,
      sortable: true,
      width: col.width,
      // Editable iff the column allows it (presence of renderEditCell makes a cell editable).
      renderEditCell: col.readOnly ? void 0 : import_react_data_grid.renderTextEditor,
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className, style: { height }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_react_data_grid.DataGrid,
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ListGrid,
  useListEngine
});
//# sourceMappingURL=index.cjs.map