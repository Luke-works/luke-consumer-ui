/**
 * Per-field ownership for OUTBOUND forms.
 *
 * An outbound form is filled by two people. The preparer sends it with some fields already
 * answered (a quoted price, a case reference); the recipient answers the rest. `outboundRoles`
 * records who owns each field:
 *
 *   PREPARER   the preparer fills it; the recipient sees it but cannot change it
 *   RECIPIENT  the recipient fills it; the preparer does not pre-answer it
 *   EITHER     the preparer may pre-answer it and the recipient may still change it
 *
 * EITHER is the reason this map exists at all. Before it, a preparer field was expressed as
 * `disabled: true` in the schema, which is binary — a field the preparer seeds but the recipient
 * can still correct (a phone number, an address) had nowhere to live.
 *
 * The map is stored per DEFINITION while the schema is versioned, so an entry can outlive the
 * field it names. Everything here therefore derives the field list from the schema and treats the
 * map as advisory: an entry for a field that no longer exists is ignored, and a field with no
 * entry falls back to how it was always expressed (`disabled` → preparer, otherwise recipient).
 * That makes forms authored before roles behave identically without being re-authored.
 */

export type FieldRole = "PREPARER" | "RECIPIENT" | "EITHER";

export const FIELD_ROLES: readonly FieldRole[] = ["RECIPIENT", "PREPARER", "EITHER"] as const;

export const ROLE_LABEL: Record<FieldRole, string> = {
  RECIPIENT: "Recipient fills",
  PREPARER: "You fill",
  EITHER: "You fill, they can edit",
};

type Entity = { type?: string; attributes?: Record<string, unknown> };
type Schema = { entities?: Record<string, Entity>; root?: string[] };

function parse(schemaJson: string | null | undefined): Schema | null {
  if (!schemaJson) return null;
  try {
    const s = JSON.parse(schemaJson) as Schema;
    return s && typeof s === "object" ? s : null;
  } catch {
    return null;
  }
}

/**
 * The effective role of a field: the explicit map entry, else derived from `disabled` so
 * pre-roles forms keep their behaviour.
 */
export function roleOf(
  key: string,
  attributes: Record<string, unknown> | undefined,
  roles: Record<string, FieldRole> | undefined,
): FieldRole {
  const explicit = roles?.[key];
  if (explicit === "PREPARER" || explicit === "RECIPIENT" || explicit === "EITHER") return explicit;
  return attributes?.disabled === true ? "PREPARER" : "RECIPIENT";
}

/** Every keyed field in the schema, in document order, with its effective role. */
export function fieldsWithRoles(
  schemaJson: string | null | undefined,
  roles: Record<string, FieldRole> | undefined,
): Array<{ key: string; label: string; role: FieldRole }> {
  const schema = parse(schemaJson);
  if (!schema?.entities) return [];
  const out: Array<{ key: string; label: string; role: FieldRole }> = [];
  for (const entity of Object.values(schema.entities)) {
    const a = entity?.attributes;
    const key = typeof a?.key === "string" ? a.key : "";
    if (!key) continue; // not an input field
    out.push({
      key,
      label: typeof a?.label === "string" && a.label ? a.label : key,
      role: roleOf(key, a, roles),
    });
  }
  return out;
}

/**
 * The schema as the RECIPIENT should see it: preparer-owned fields rendered read-only.
 *
 * Implemented by stamping `disabled` on those entities rather than by a renderer prop, because
 * the engine already folds `disabled` into each field's resolved state — so the control is
 * disabled, excluded from the recipient's required-checks, and left out of what they can edit,
 * all through the path the renderer already trusts.
 *
 * This is presentation only. The server independently refuses recipient writes to these fields;
 * a disabled input is a courtesy to honest users, not a security boundary.
 */
export function schemaForRecipient(
  schemaJson: string,
  roles: Record<string, FieldRole> | undefined,
): string {
  const schema = parse(schemaJson);
  if (!schema?.entities) return schemaJson;

  let changed = false;
  const entities: Record<string, Entity> = {};
  for (const [id, entity] of Object.entries(schema.entities)) {
    const a = entity?.attributes;
    const key = typeof a?.key === "string" ? a.key : "";
    if (key && roleOf(key, a, roles) === "PREPARER" && a?.disabled !== true) {
      entities[id] = { ...entity, attributes: { ...a, disabled: true } };
      changed = true;
    } else {
      entities[id] = entity;
    }
  }
  return changed ? JSON.stringify({ ...schema, entities }) : schemaJson;
}

/** The keys a preparer may pre-answer when sending: PREPARER and EITHER. */
export function preparerFillableKeys(
  schemaJson: string | null | undefined,
  roles: Record<string, FieldRole> | undefined,
): string[] {
  return fieldsWithRoles(schemaJson, roles)
    .filter((f) => f.role === "PREPARER" || f.role === "EITHER")
    .map((f) => f.key);
}
