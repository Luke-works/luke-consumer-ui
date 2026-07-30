// src/aggregations/registry.ts
var isEmpty = (v) => v === null || v === void 0 || v === "";
function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
var countType = {
  type: "count",
  resultType: "number",
  needsField: false,
  requiresNumericField: false,
  init: () => ({ n: 0 }),
  // Count of rows in the group (field-less). If a field is supplied, count non-empty values.
  step: (acc, value) => {
    const a = acc;
    if (value === void 0 || !isEmpty(value)) a.n += 1;
    return a;
  },
  finalize: (acc) => acc.n
};
var sumType = {
  type: "sum",
  resultType: "number",
  needsField: true,
  requiresNumericField: true,
  init: () => ({ sum: 0, seen: false }),
  step: (acc, value) => {
    const a = acc;
    const n = toNumber(value);
    if (n !== null) {
      a.sum += n;
      a.seen = true;
    }
    return a;
  },
  // No numeric values seen → null (distinct from a real 0).
  finalize: (acc) => acc.seen ? acc.sum : null
};
var avgType = {
  type: "avg",
  resultType: "number",
  needsField: true,
  requiresNumericField: true,
  init: () => ({ sum: 0, n: 0 }),
  step: (acc, value) => {
    const a = acc;
    const n = toNumber(value);
    if (n !== null) {
      a.sum += n;
      a.n += 1;
    }
    return a;
  },
  finalize: (acc) => {
    const a = acc;
    return a.n === 0 ? null : a.sum / a.n;
  }
};
function makeExtremaType(type) {
  const keep = type === "min" ? (n, b) => n < b : (n, b) => n > b;
  return {
    type,
    resultType: "number",
    needsField: true,
    requiresNumericField: true,
    init: () => ({ best: null }),
    step: (acc, value) => {
      const a = acc;
      const n = toNumber(value);
      if (n !== null && (a.best === null || keep(n, a.best))) a.best = n;
      return a;
    },
    finalize: (acc) => acc.best
  };
}
var countDistinctType = {
  type: "countDistinct",
  resultType: "number",
  needsField: true,
  requiresNumericField: false,
  init: () => ({ set: /* @__PURE__ */ new Set() }),
  step: (acc, value) => {
    const a = acc;
    if (!isEmpty(value)) a.set.add(String(value));
    return a;
  },
  finalize: (acc) => acc.set.size
};
var medianType = {
  type: "median",
  resultType: "number",
  needsField: true,
  requiresNumericField: true,
  init: () => ({ values: [] }),
  step: (acc, value) => {
    const a = acc;
    const n = toNumber(value);
    if (n !== null) a.values.push(n);
    return a;
  },
  finalize: (acc) => {
    const v = acc.values;
    if (v.length === 0) return null;
    const sorted = [...v].sort((x, y) => x - y);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
};
var BUILT_INS = [
  countType,
  sumType,
  avgType,
  makeExtremaType("min"),
  makeExtremaType("max"),
  countDistinctType,
  medianType
];
var AggregationRegistry = class {
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
  /** Resolve a handler, or `undefined` for an unknown type (callers decide how to handle). */
  get(type) {
    return this.handlers.get(type);
  }
  types() {
    return [...this.handlers.keys()];
  }
};
function createDefaultAggregationRegistry() {
  return new AggregationRegistry(BUILT_INS);
}
var defaultAggregationRegistry = createDefaultAggregationRegistry();

// src/schema/validateQuery.ts
function validateQuery(query, schema, registry = defaultAggregationRegistry) {
  const problems = [];
  const fieldsByKey = new Map(schema.fields.map((f) => [f.key, f]));
  if (!Array.isArray(query.measures) || query.measures.length === 0) {
    problems.push({ key: null, message: "Query must have at least one measure" });
  }
  const seenKeys = /* @__PURE__ */ new Set();
  const noteKey = (key, role) => {
    if (!key || key.trim() === "") {
      problems.push({ key: null, message: `${role} is missing a key` });
      return null;
    }
    if (seenKeys.has(key)) {
      problems.push({ key, message: `Duplicate result-column key "${key}"` });
    }
    seenKeys.add(key);
    return key;
  };
  for (const dim of query.dimensions ?? []) {
    const key = noteKey(dim.key, "Dimension");
    const field = fieldsByKey.get(dim.field);
    if (!field) {
      problems.push({
        key: key ?? dim.field ?? null,
        message: `Dimension references unknown field "${dim.field}"`
      });
      continue;
    }
    if (dim.granularity && field.type !== "date") {
      problems.push({
        key,
        message: `Granularity "${dim.granularity}" only applies to date fields, but "${dim.field}" is ${field.type}`
      });
    }
  }
  for (const measure of query.measures ?? []) {
    const key = noteKey(measure.key, "Measure");
    const handler = registry.get(String(measure.agg));
    if (!handler) {
      problems.push({ key, message: `Measure has unknown aggregation "${measure.agg}"` });
      continue;
    }
    if (handler.needsField) {
      if (!measure.field) {
        problems.push({ key, message: `Aggregation "${measure.agg}" requires a field` });
        continue;
      }
      const field = fieldsByKey.get(measure.field);
      if (!field) {
        problems.push({ key, message: `Measure references unknown field "${measure.field}"` });
        continue;
      }
      if (handler.requiresNumericField && field.type !== "number") {
        problems.push({
          key,
          message: `Aggregation "${measure.agg}" needs a number field, but "${measure.field}" is ${field.type}`
        });
      }
    }
  }
  for (const filter of query.filters ?? []) {
    if (!fieldsByKey.has(filter.field)) {
      problems.push({
        key: null,
        message: `Filter references unknown field "${filter.field}"`
      });
    }
  }
  if (query.sort && !seenKeys.has(query.sort.key)) {
    problems.push({
      key: null,
      message: `Sort references unknown result column "${query.sort.key}"`
    });
  }
  return { ok: problems.length === 0, problems };
}

// src/engine/dateBucket.ts
var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
function bucketDate(value, granularity) {
  if (value === null) return null;
  const s = String(value);
  const m = DATE_RE.exec(s);
  if (!m) return s;
  const year = m[1];
  const month = m[2];
  const day = m[3];
  switch (granularity) {
    case "year":
      return year;
    case "quarter": {
      const q = Math.floor((Number(month) - 1) / 3) + 1;
      return `${year}-Q${q}`;
    }
    case "month":
      return `${year}-${month}`;
    case "week":
      return isoWeekKey(Number(year), Number(month), Number(day));
    case "day":
    default:
      return `${year}-${month}-${day}`;
  }
}
function isoWeekKey(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDow + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1e3));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// src/engine/AnalyticsEngine.ts
var isEmpty2 = (v) => v === null || v === "";
function compareValues(a, b) {
  const ae = isEmpty2(a);
  const be = isEmpty2(b);
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), void 0, { numeric: true, sensitivity: "base" });
}
function matchesFilter(row, f) {
  const cell = row[f.field] ?? null;
  switch (f.operator) {
    case "empty":
      return isEmpty2(cell);
    case "notEmpty":
      return !isEmpty2(cell);
    case "eq":
      return cell === (f.value ?? null);
    case "neq":
      return cell !== (f.value ?? null);
    case "contains":
      return String(cell ?? "").toLowerCase().includes(String(f.value ?? "").toLowerCase());
    case "in":
      return Array.isArray(f.value) && f.value.some((v) => v === cell);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (isEmpty2(cell)) return false;
      const operand = Array.isArray(f.value) ? null : f.value ?? null;
      const cmp = compareValues(cell, operand);
      if (f.operator === "gt") return cmp > 0;
      if (f.operator === "gte") return cmp >= 0;
      if (f.operator === "lt") return cmp < 0;
      return cmp <= 0;
    }
    default:
      return true;
  }
}
function dimensionValue(row, dim) {
  const raw = row[dim.field] ?? null;
  return dim.granularity ? bucketDate(raw, dim.granularity) : raw;
}
function createAnalyticsEngine(schema, options = {}) {
  const registry = options.registry ?? defaultAggregationRegistry;
  const fieldsByKey = new Map(schema.fields.map((f) => [f.key, f]));
  let rows = (options.rows ?? []).map((r) => ({ ...r }));
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    for (const l of listeners) l();
  };
  function run(query) {
    const dimensions = query.dimensions ?? [];
    const measures = query.measures ?? [];
    const filters = query.filters ?? [];
    const source = filters.length ? rows.filter((r) => filters.every((f) => matchesFilter(r, f))) : rows;
    const groups = /* @__PURE__ */ new Map();
    if (dimensions.length > 0) {
      for (const row of source) {
        const dims = dimensions.map((d) => dimensionValue(row, d));
        const key = JSON.stringify(dims);
        let group = groups.get(key);
        if (!group) {
          group = { dims, accs: measures.map((m) => registry.get(String(m.agg))?.init() ?? null) };
          groups.set(key, group);
        }
        measures.forEach((m, i) => {
          const handler = registry.get(String(m.agg));
          if (!handler) return;
          const value = m.field !== void 0 ? row[m.field] ?? null : void 0;
          group.accs[i] = handler.step(group.accs[i], value);
        });
      }
    }
    let resultRows;
    if (dimensions.length === 0) {
      const accs = measures.map((m) => {
        const handler = registry.get(String(m.agg));
        if (!handler) return null;
        let acc = handler.init();
        for (const row of source) {
          const value = m.field !== void 0 ? row[m.field] ?? null : void 0;
          acc = handler.step(acc, value);
        }
        return handler.finalize(acc);
      });
      const out = {};
      measures.forEach((m, i) => {
        out[m.key] = accs[i] ?? null;
      });
      resultRows = [out];
    } else {
      resultRows = [...groups.values()].map((group) => {
        const out = {};
        dimensions.forEach((d, i) => {
          out[d.key] = group.dims[i] ?? null;
        });
        measures.forEach((m, i) => {
          const handler = registry.get(String(m.agg));
          out[m.key] = handler ? handler.finalize(group.accs[i]) : null;
        });
        return out;
      });
    }
    resultRows = applySort(resultRows, query.sort ?? null);
    if (typeof query.limit === "number" && query.limit >= 0) {
      resultRows = resultRows.slice(0, query.limit);
    }
    const columns = [
      ...dimensions.map((d) => {
        const field = fieldsByKey.get(d.field);
        return {
          key: d.key,
          label: d.label ?? field?.label ?? d.field,
          role: "dimension",
          // A bucketed date becomes a string key; otherwise the source field type.
          type: d.granularity ? "string" : field?.type ?? "string"
        };
      }),
      ...measures.map((m) => {
        const handler = registry.get(String(m.agg));
        return {
          key: m.key,
          label: m.label ?? `${m.agg}${m.field ? ` of ${fieldsByKey.get(m.field)?.label ?? m.field}` : ""}`,
          role: "measure",
          type: handler?.resultType ?? "number"
        };
      })
    ];
    return { columns, rows: resultRows };
  }
  function applySort(resultRows, sort) {
    if (!sort) return resultRows;
    const dir = sort.direction === "desc" ? -1 : 1;
    return [...resultRows].sort(
      (a, b) => dir * compareValues(a[sort.key] ?? null, b[sort.key] ?? null)
    );
  }
  return {
    schema,
    fields: () => [...schema.fields],
    getRows: () => rows.map((r) => ({ ...r })),
    setRows(next) {
      rows = next.map((r) => ({ ...r }));
      emit();
    },
    addRow(row) {
      rows.push({ ...row });
      emit();
    },
    run,
    serialize: () => ({ schema, rows: rows.map((r) => ({ ...r })) }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

// src/charts/transform.ts
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
var labelOf = (v) => v === null ? "\u2014" : String(v);
function buildChartData(spec, result) {
  const { type, encoding } = spec;
  const rows = result.rows;
  if (type === "pie") {
    const valueKey = encoding.values[0];
    const data2 = rows.map((r) => {
      const id = labelOf(r[encoding.index] ?? null);
      return { id, label: id, value: valueKey ? num(r[valueKey] ?? null) : 0 };
    });
    return { kind: "pie", data: data2 };
  }
  if (type === "line" || type === "area") {
    let series;
    if (encoding.series) {
      const valueKey = encoding.values[0];
      const bySeries = /* @__PURE__ */ new Map();
      for (const r of rows) {
        const sid = labelOf(r[encoding.series] ?? null);
        let s = bySeries.get(sid);
        if (!s) {
          s = { id: sid, data: [] };
          bySeries.set(sid, s);
        }
        s.data.push({ x: r[encoding.index] ?? null, y: valueKey ? numOrNull(r[valueKey] ?? null) : null });
      }
      series = [...bySeries.values()];
    } else {
      series = encoding.values.map((key) => ({
        id: key,
        data: rows.map((r) => ({ x: r[encoding.index] ?? null, y: numOrNull(r[key] ?? null) }))
      }));
    }
    return { kind: "line", series };
  }
  const indexBy = encoding.index;
  if (encoding.series) {
    const valueKey = encoding.values[0];
    const keys2 = /* @__PURE__ */ new Set();
    const byIndex = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const idx = r[indexBy] ?? null;
      let datum = byIndex.get(idx);
      if (!datum) {
        datum = { [indexBy]: idx };
        byIndex.set(idx, datum);
      }
      const sid = labelOf(r[encoding.series] ?? null);
      keys2.add(sid);
      datum[sid] = valueKey ? num(r[valueKey] ?? null) : 0;
    }
    return { kind: "bar", indexBy, keys: [...keys2], data: [...byIndex.values()] };
  }
  const keys = encoding.values;
  const data = rows.map((r) => {
    const datum = { [indexBy]: r[indexBy] ?? null };
    for (const key of keys) datum[key] = num(r[key] ?? null);
    return datum;
  });
  return { kind: "bar", indexBy, keys, data };
}

export { AggregationRegistry, bucketDate, buildChartData, createAnalyticsEngine, createDefaultAggregationRegistry, defaultAggregationRegistry, validateQuery };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map