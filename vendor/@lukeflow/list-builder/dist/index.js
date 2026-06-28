// src/useListBuilder.ts
import { useCallback, useMemo, useState } from "react";
import {
  validateSchema
} from "@lukeflow/list-core";
function uniqueKey(existing) {
  const keys = new Set(existing.map((c) => c.key));
  let n = existing.length + 1;
  let key = `col_${n}`;
  while (keys.has(key)) {
    n += 1;
    key = `col_${n}`;
  }
  return key;
}
var DEFAULT_LABEL = {
  text: "Text",
  number: "Number",
  currency: "Amount",
  boolean: "Flag",
  date: "Date",
  select: "Choice"
};
function useListBuilder(initialSchema, options = {}) {
  const [schema, setSchema] = useState(initialSchema);
  const { onChange } = options;
  const commit = useCallback(
    (next) => {
      setSchema(next);
      onChange?.(next);
    },
    [onChange]
  );
  const setName = useCallback(
    (name) => commit({ ...schema, name }),
    [commit, schema]
  );
  const addColumn = useCallback(
    (type = "text") => {
      const key = uniqueKey(schema.columns);
      const col = {
        key,
        label: DEFAULT_LABEL[type] ?? "Column",
        type,
        ...type === "select" ? { options: [] } : {}
      };
      commit({ ...schema, columns: [...schema.columns, col] });
      return key;
    },
    [commit, schema]
  );
  const updateColumn = useCallback(
    (key, patch) => {
      commit({
        ...schema,
        columns: schema.columns.map((c) => c.key === key ? { ...c, ...patch } : c)
      });
    },
    [commit, schema]
  );
  const removeColumn = useCallback(
    (key) => {
      commit({ ...schema, columns: schema.columns.filter((c) => c.key !== key) });
    },
    [commit, schema]
  );
  const moveColumn = useCallback(
    (key, toIndex) => {
      const from = schema.columns.findIndex((c) => c.key === key);
      if (from === -1) return;
      const clamped = Math.max(0, Math.min(toIndex, schema.columns.length - 1));
      if (clamped === from) return;
      const cols = [...schema.columns];
      const [moved] = cols.splice(from, 1);
      cols.splice(clamped, 0, moved);
      commit({ ...schema, columns: cols });
    },
    [commit, schema]
  );
  const reset = useCallback((next) => commit(next), [commit]);
  const report = useMemo(() => validateSchema(schema), [schema]);
  return { schema, report, setName, addColumn, updateColumn, removeColumn, moveColumn, reset };
}

// src/ListBuilder.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var COLUMN_TYPES = ["text", "number", "currency", "boolean", "date", "select"];
function ListBuilder({ initialSchema, onChange, className }) {
  const b = useListBuilder(initialSchema, onChange ? { onChange } : {});
  return /* @__PURE__ */ jsxs("div", { className: ["luke-list-builder", className].filter(Boolean).join(" "), children: [
    /* @__PURE__ */ jsx("div", { className: "llb-header", children: /* @__PURE__ */ jsxs("label", { className: "llb-field", children: [
      /* @__PURE__ */ jsx("span", { children: "List name" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          value: b.schema.name,
          onChange: (e) => b.setName(e.target.value),
          "aria-label": "List name"
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs("table", { className: "llb-columns", children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { scope: "col", children: "Label" }),
        /* @__PURE__ */ jsx("th", { scope: "col", children: "Type" }),
        /* @__PURE__ */ jsx("th", { scope: "col", children: "Required" }),
        /* @__PURE__ */ jsx("th", { scope: "col", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: b.schema.columns.map((col, i) => /* @__PURE__ */ jsxs("tr", { "data-column-key": col.key, children: [
        /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: col.label,
            "aria-label": `Column ${i + 1} label`,
            onChange: (e) => b.updateColumn(col.key, { label: e.target.value })
          }
        ) }),
        /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx(
          "select",
          {
            value: col.type,
            "aria-label": `Column ${i + 1} type`,
            onChange: (e) => b.updateColumn(col.key, { type: e.target.value }),
            children: COLUMN_TYPES.map((t) => /* @__PURE__ */ jsx("option", { value: t, children: t }, t))
          }
        ) }),
        /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx(
          "input",
          {
            type: "checkbox",
            checked: col.required ?? false,
            "aria-label": `Column ${i + 1} required`,
            onChange: (e) => b.updateColumn(col.key, { required: e.target.checked })
          }
        ) }),
        /* @__PURE__ */ jsxs("td", { children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => b.moveColumn(col.key, i - 1),
              disabled: i === 0,
              "aria-label": `Move column ${i + 1} up`,
              children: "\u2191"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => b.moveColumn(col.key, i + 1),
              disabled: i === b.schema.columns.length - 1,
              "aria-label": `Move column ${i + 1} down`,
              children: "\u2193"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => b.removeColumn(col.key),
              "aria-label": `Remove column ${i + 1}`,
              children: "\u2715"
            }
          )
        ] })
      ] }, col.key)) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "llb-actions", children: /* @__PURE__ */ jsx("button", { type: "button", onClick: () => b.addColumn("text"), children: "Add column" }) }),
    !b.report.ok && /* @__PURE__ */ jsx("ul", { className: "llb-problems", "aria-label": "Schema problems", children: b.report.problems.map((p, i) => /* @__PURE__ */ jsx("li", { children: p.message }, i)) })
  ] });
}
export {
  ListBuilder,
  useListBuilder
};
//# sourceMappingURL=index.js.map