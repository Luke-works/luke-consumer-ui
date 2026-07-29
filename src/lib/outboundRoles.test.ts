import { describe, expect, it } from "vitest";
import {
  fieldsWithRoles,
  preparerFillableKeys,
  roleOf,
  schemaForRecipient,
  type FieldRole,
} from "./outboundRoles";

const SCHEMA = JSON.stringify({
  root: ["price", "note", "phone", "heading"],
  entities: {
    price: { type: "text", attributes: { key: "price", label: "Quoted price", disabled: true } },
    note: { type: "textarea", attributes: { key: "note", label: "Your notes" } },
    phone: { type: "text", attributes: { key: "phone", label: "Phone" } },
    heading: { type: "heading", attributes: { text: "Details" } }, // no key — not an input
  },
});

const ROLES: Record<string, FieldRole> = { price: "PREPARER", note: "RECIPIENT", phone: "EITHER" };

describe("roleOf", () => {
  it("uses the explicit role when there is one", () => {
    expect(roleOf("phone", {}, ROLES)).toBe("EITHER");
  });

  it("falls back to `disabled` for forms authored before roles existed", () => {
    // This is what keeps existing outbound forms working without being re-authored: a preparer
    // field has always been expressed as `disabled` in the schema.
    expect(roleOf("price", { disabled: true }, undefined)).toBe("PREPARER");
    expect(roleOf("note", {}, undefined)).toBe("RECIPIENT");
  });

  it("defaults an unmapped field to the recipient", () => {
    // The recipient is the person being asked, so anything unclaimed is theirs to answer —
    // and defaulting the other way would let a field silently become unfillable by them.
    expect(roleOf("brand-new", {}, ROLES)).toBe("RECIPIENT");
  });

  it("ignores a junk role value rather than trusting it", () => {
    expect(roleOf("note", {}, { note: "NONSENSE" as FieldRole })).toBe("RECIPIENT");
  });
});

describe("fieldsWithRoles", () => {
  it("lists only keyed input fields, with their effective roles", () => {
    const fields = fieldsWithRoles(SCHEMA, ROLES);
    expect(fields.map((f) => f.key)).toEqual(["price", "note", "phone"]); // heading excluded
    expect(fields.find((f) => f.key === "phone")?.role).toBe("EITHER");
  });

  it("labels a field by its key when it has no label", () => {
    const schema = JSON.stringify({ entities: { a: { attributes: { key: "ref" } } } });
    expect(fieldsWithRoles(schema, {})[0]).toMatchObject({ key: "ref", label: "ref" });
  });

  it("ignores role entries for fields that no longer exist", () => {
    // The map lives on the definition while the schema is versioned, so it can outlive a field.
    const fields = fieldsWithRoles(SCHEMA, { ...ROLES, deletedField: "PREPARER" });
    expect(fields.map((f) => f.key)).not.toContain("deletedField");
  });

  it("survives a malformed schema", () => {
    expect(fieldsWithRoles("not json", ROLES)).toEqual([]);
    expect(fieldsWithRoles(null, ROLES)).toEqual([]);
  });
});

describe("schemaForRecipient", () => {
  it("disables preparer-owned fields and leaves the rest editable", () => {
    const out = JSON.parse(schemaForRecipient(SCHEMA, ROLES));
    expect(out.entities.price.attributes.disabled).toBe(true);
    expect(out.entities.note.attributes.disabled).toBeUndefined();
    // EITHER is the whole reason the role map exists — the recipient must still be able to fix it.
    expect(out.entities.phone.attributes.disabled).toBeUndefined();
  });

  it("does not disturb the schema when nothing needs disabling", () => {
    const allRecipient = { price: "RECIPIENT", note: "RECIPIENT", phone: "RECIPIENT" } as Record<string, FieldRole>;
    const schema = JSON.stringify({ entities: { note: { attributes: { key: "note" } } } });
    expect(schemaForRecipient(schema, allRecipient)).toBe(schema); // same reference-identical string
  });

  it("keeps a field the schema already disabled disabled, with no role map at all", () => {
    const out = JSON.parse(schemaForRecipient(SCHEMA, undefined));
    expect(out.entities.price.attributes.disabled).toBe(true);
  });

  it("returns the input unchanged when the schema is malformed", () => {
    expect(schemaForRecipient("not json", ROLES)).toBe("not json");
  });
});

describe("preparerFillableKeys", () => {
  it("offers PREPARER and EITHER, never RECIPIENT-only fields", () => {
    expect(preparerFillableKeys(SCHEMA, ROLES).sort()).toEqual(["phone", "price"]);
  });

  it("falls back to the disabled fields when no roles are set", () => {
    expect(preparerFillableKeys(SCHEMA, undefined)).toEqual(["price"]);
  });
});
