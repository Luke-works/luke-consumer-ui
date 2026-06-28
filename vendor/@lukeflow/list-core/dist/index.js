// src/columns/registry.ts
var isEmpty = (v) => v === null || v === "";
function emptyAwareCompare(a, b, cmp) {
  const ae = isEmpty(a);
  const be = isEmpty(b);
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;
  return cmp(a, b);
}
var requiredError = (value, col) => col.required && isEmpty(value) ? `${col.label} is required` : null;
var textType = {
  type: "text",
  empty: () => null,
  parse: (input) => {
    if (input === null || input === void 0) return null;
    const s = String(input);
    return s === "" ? null : s;
  },
  format: (value) => value === null ? "" : String(value),
  validate: (value, col) => requiredError(value, col),
  compare: (a, b) => emptyAwareCompare(
    a,
    b,
    (x, y) => String(x).localeCompare(String(y), void 0, { numeric: true, sensitivity: "base" })
  )
};
function makeNumberType(type) {
  return {
    type,
    empty: () => null,
    parse: (input) => {
      if (input === null || input === void 0 || input === "") return null;
      if (typeof input === "number") return Number.isFinite(input) ? input : null;
      const cleaned = String(input).replace(/[^0-9.+-]/g, "");
      if (cleaned === "" || cleaned === "-" || cleaned === "+") return null;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    },
    format: (value) => value === null ? "" : String(value),
    validate: (value, col) => {
      const req = requiredError(value, col);
      if (req) return req;
      if (!isEmpty(value) && typeof value !== "number") {
        return `${col.label} must be a number`;
      }
      return null;
    },
    compare: (a, b) => emptyAwareCompare(a, b, (x, y) => Number(x) - Number(y))
  };
}
var booleanType = {
  type: "boolean",
  empty: () => false,
  parse: (input) => {
    if (typeof input === "boolean") return input;
    if (input === null || input === void 0 || input === "") return false;
    const s = String(input).trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
  },
  format: (value) => value === true ? "true" : value === false ? "false" : "",
  validate: (value, col) => {
    if (col.required && value !== true) return `${col.label} is required`;
    return null;
  },
  compare: (a, b) => emptyAwareCompare(a, b, (x, y) => Number(Boolean(x)) - Number(Boolean(y)))
};
var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
var dateType = {
  type: "date",
  empty: () => null,
  parse: (input) => {
    if (input === null || input === void 0 || input === "") return null;
    const s = String(input).trim();
    if (ISO_DATE.test(s)) return s;
    const t = Date.parse(s);
    if (Number.isNaN(t)) return s;
    return new Date(t).toISOString().slice(0, 10);
  },
  format: (value) => value === null ? "" : String(value),
  validate: (value, col) => {
    const req = requiredError(value, col);
    if (req) return req;
    if (!isEmpty(value) && !ISO_DATE.test(String(value))) {
      return `${col.label} must be a date (YYYY-MM-DD)`;
    }
    return null;
  },
  // ISO YYYY-MM-DD sorts correctly as a string.
  compare: (a, b) => emptyAwareCompare(a, b, (x, y) => String(x).localeCompare(String(y)))
};
var selectType = {
  type: "select",
  empty: () => null,
  parse: (input) => {
    if (input === null || input === void 0 || input === "") return null;
    return String(input);
  },
  format: (value, col) => {
    if (value === null) return "";
    const opt = col.options?.find((o) => o.value === String(value));
    return opt ? opt.label : String(value);
  },
  validate: (value, col) => {
    const req = requiredError(value, col);
    if (req) return req;
    if (!isEmpty(value) && col.options && !col.options.some((o) => o.value === String(value))) {
      return `${col.label} has an invalid option`;
    }
    return null;
  },
  compare: (a, b) => emptyAwareCompare(a, b, (x, y) => String(x).localeCompare(String(y)))
};
var BUILT_INS = [
  textType,
  makeNumberType("number"),
  makeNumberType("currency"),
  booleanType,
  dateType,
  selectType
];
var ColumnTypeRegistry = class {
  constructor(initial = []) {
    this.handlers = /* @__PURE__ */ new Map();
    for (const h of initial) this.handlers.set(h.type, h);
  }
  register(handler) {
    this.handlers.set(handler.type, handler);
  }
  has(type) {
    return this.handlers.has(type);
  }
  /** Resolve a handler, falling back to the `text` handler for unknown types. */
  get(type) {
    return this.handlers.get(type) ?? textType;
  }
  types() {
    return [...this.handlers.keys()];
  }
};
function createDefaultColumnTypeRegistry() {
  return new ColumnTypeRegistry(BUILT_INS);
}
var defaultColumnTypeRegistry = createDefaultColumnTypeRegistry();

// src/schema/validateSchema.ts
function validateSchema(schema, registry = defaultColumnTypeRegistry) {
  const problems = [];
  if (!schema.name || schema.name.trim() === "") {
    problems.push({ columnKey: null, message: "List name is required" });
  }
  if (!Array.isArray(schema.columns) || schema.columns.length === 0) {
    problems.push({ columnKey: null, message: "List must have at least one column" });
  }
  const seen = /* @__PURE__ */ new Set();
  for (const col of schema.columns ?? []) {
    const key = col.key;
    if (!key || key.trim() === "") {
      problems.push({ columnKey: key ?? null, message: "Column key is required" });
      continue;
    }
    if (seen.has(key)) {
      problems.push({ columnKey: key, message: `Duplicate column key "${key}"` });
    }
    seen.add(key);
    if (!col.label || col.label.trim() === "") {
      problems.push({ columnKey: key, message: `Column "${key}" needs a label` });
    }
    if (!registry.has(String(col.type))) {
      problems.push({
        columnKey: key,
        message: `Column "${key}" has unknown type "${col.type}"`
      });
    }
    if (String(col.type) === "select" && (!col.options || col.options.length === 0)) {
      problems.push({ columnKey: key, message: `Select column "${key}" needs options` });
    }
  }
  return { ok: problems.length === 0, problems };
}

// src/engine/ListEngine.ts
var isEmpty2 = (v) => v === null || v === "";
function createListEngine(schema, options = {}) {
  const registry = options.registry ?? defaultColumnTypeRegistry;
  const columnsByKey = new Map(schema.columns.map((c) => [c.key, c]));
  let counter = 0;
  const idFactory = options.idFactory ?? (() => {
    counter += 1;
    return `row-${counter}`;
  });
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    for (const l of listeners) l();
  };
  const canonicalize = (cells) => {
    const out = {};
    for (const col of schema.columns) {
      const handler = registry.get(String(col.type));
      const raw = cells[col.key];
      if (raw === void 0) {
        out[col.key] = col.defaultValue !== void 0 ? handler.parse(col.defaultValue, col) : handler.empty();
      } else {
        out[col.key] = handler.parse(raw, col);
      }
    }
    return out;
  };
  const rows = (options.initialRows ?? []).map((r) => ({
    id: r.id,
    cells: canonicalize(r.cells)
  }));
  for (const r of rows) {
    const m = /^row-(\d+)$/.exec(r.id);
    if (m && m[1]) counter = Math.max(counter, Number(m[1]));
  }
  let sort = null;
  let filters = [];
  const rowIndex = (rowId) => rows.findIndex((r) => r.id === rowId);
  const matchesFilter = (row, f) => {
    const col = columnsByKey.get(f.columnKey);
    if (!col) return true;
    const handler = registry.get(String(col.type));
    const cell = row.cells[f.columnKey] ?? null;
    switch (f.operator) {
      case "empty":
        return isEmpty2(cell);
      case "notEmpty":
        return !isEmpty2(cell);
      case "contains":
        return handler.format(cell, col).toLowerCase().includes(String(f.value ?? "").toLowerCase());
      case "eq":
        return cell === handler.parse(f.value, col);
      case "neq":
        return cell !== handler.parse(f.value, col);
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        if (isEmpty2(cell)) return false;
        const cmp = handler.compare(cell, handler.parse(f.value, col), col);
        if (f.operator === "gt") return cmp > 0;
        if (f.operator === "gte") return cmp >= 0;
        if (f.operator === "lt") return cmp < 0;
        return cmp <= 0;
      }
      default:
        return true;
    }
  };
  return {
    schema,
    columns: () => [...schema.columns],
    getRows: () => rows.map((r) => ({ id: r.id, cells: { ...r.cells } })),
    getView() {
      let view = rows.filter((r) => filters.every((f) => matchesFilter(r, f)));
      if (sort) {
        const col = columnsByKey.get(sort.columnKey);
        if (col) {
          const handler = registry.get(String(col.type));
          const dir = sort.direction === "desc" ? -1 : 1;
          view = [...view].sort(
            (a, b) => dir * handler.compare(a.cells[sort.columnKey] ?? null, b.cells[sort.columnKey] ?? null, col)
          );
        }
      }
      return view.map((r) => ({ id: r.id, cells: { ...r.cells } }));
    },
    getCell(rowId, columnKey) {
      const i = rowIndex(rowId);
      if (i === -1) return null;
      return rows[i].cells[columnKey] ?? null;
    },
    formatCell(rowId, columnKey) {
      const col = columnsByKey.get(columnKey);
      if (!col) return "";
      const i = rowIndex(rowId);
      if (i === -1) return "";
      return registry.get(String(col.type)).format(rows[i].cells[columnKey] ?? null, col);
    },
    setCell(rowId, columnKey, rawInput) {
      const col = columnsByKey.get(columnKey);
      if (!col || col.readOnly) return;
      const i = rowIndex(rowId);
      if (i === -1) return;
      rows[i].cells[columnKey] = registry.get(String(col.type)).parse(rawInput, col);
      emit();
    },
    addRow(seed = {}) {
      const row = { id: idFactory(), cells: canonicalize(seed) };
      rows.push(row);
      emit();
      return { id: row.id, cells: { ...row.cells } };
    },
    removeRow(rowId) {
      const i = rowIndex(rowId);
      if (i === -1) return;
      rows.splice(i, 1);
      emit();
    },
    moveRow(rowId, toIndex) {
      const i = rowIndex(rowId);
      if (i === -1) return;
      const clamped = Math.max(0, Math.min(toIndex, rows.length - 1));
      if (clamped === i) return;
      const [row] = rows.splice(i, 1);
      rows.splice(clamped, 0, row);
      emit();
    },
    setSort(next) {
      sort = next;
      emit();
    },
    getSort: () => sort,
    setFilters(next) {
      filters = [...next];
      emit();
    },
    getFilters: () => [...filters],
    validate() {
      const errors = [];
      for (const row of rows) {
        for (const col of schema.columns) {
          const msg = registry.get(String(col.type)).validate(row.cells[col.key] ?? null, col);
          if (msg) errors.push({ rowId: row.id, columnKey: col.key, message: msg });
        }
      }
      return { ok: errors.length === 0, errors };
    },
    serialize: () => ({
      schema,
      rows: rows.map((r) => ({ id: r.id, cells: { ...r.cells } }))
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export { ColumnTypeRegistry, createDefaultColumnTypeRegistry, createListEngine, defaultColumnTypeRegistry, validateSchema };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map