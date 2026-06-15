import { describe, it, expect } from "vitest";
import { autofillSchema } from "./autofill";

type Ent = { type: string; attributes: Record<string, unknown>; children?: string[] };
const schema = (entities: Record<string, Ent>, root: string[]) => JSON.stringify({ entities, root });
const one = (type: string, attributes: Record<string, unknown>, id = "f1") =>
  schema({ [id]: { type, attributes } }, [id]);

describe("autofillSchema", () => {
  it("returns an empty object for invalid JSON", () => {
    expect(autofillSchema("not json")).toEqual({});
  });

  it("keys output by field key", () => {
    expect(autofillSchema(one("textField", { key: "firstName" }))).toEqual({ firstName: "Sample text" });
  });

  it("respects minLength", () => {
    const v = autofillSchema(one("textField", { key: "code", minLength: 20 })).code as string;
    expect(v.length).toBeGreaterThanOrEqual(20);
  });

  it("respects maxLength", () => {
    const v = autofillSchema(one("textField", { key: "code", maxLength: 4 })).code as string;
    expect(v.length).toBeLessThanOrEqual(4);
  });

  it("generates valid email / url / number", () => {
    expect(autofillSchema(one("email", { key: "e" })).e).toMatch(/@/);
    expect(autofillSchema(one("url", { key: "u" })).u).toMatch(/^https?:\/\//);
    expect(autofillSchema(one("number", { key: "n", min: 5, max: 9 })).n).toBe(5);
  });

  it("picks the first option for select/radio", () => {
    const s = one("select", { key: "c", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }] });
    expect(autofillSchema(s).c).toBe("a");
  });

  it("checks a checkbox (so required passes)", () => {
    expect(autofillSchema(one("checkbox", { key: "agree" })).agree).toBe(true);
  });

  it("fills minSelected select boxes", () => {
    const s = one("selectBoxes", { key: "c", minSelected: 2, options: ["a", "b", "c"] });
    expect(autofillSchema(s).c).toEqual(["a", "b"]);
  });

  it("fills minTags tags", () => {
    expect(autofillSchema(one("tagsField", { key: "t", minTags: 3 })).t).toHaveLength(3);
  });

  it("wraps a multiple field in an array", () => {
    expect(autofillSchema(one("textField", { key: "alias", multiple: true })).alias).toEqual(["Sample text"]);
  });

  it("fills minRows rows for a grid, keyed by cell key", () => {
    const s = schema(
      {
        g1: { type: "dataGrid", attributes: { key: "rows", minRows: 2 }, children: ["c1"] },
        c1: { type: "textField", attributes: { key: "name" }, parentId: "g1" } as Ent,
      },
      ["g1"],
    );
    expect(autofillSchema(s).rows).toEqual([{ name: "Sample text" }, { name: "Sample text" }]);
  });

  it("skips layout/static entities", () => {
    const s = schema(
      {
        h1: { type: "heading", attributes: { label: "Title" } },
        t1: { type: "textField", attributes: { key: "name" } },
      },
      ["h1", "t1"],
    );
    expect(autofillSchema(s)).toEqual({ name: "Sample text" });
  });
});
