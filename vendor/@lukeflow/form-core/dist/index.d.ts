/**
 * The Lukeflow form schema — the portable JSON contract that every renderer and the
 * backend target.
 *
 * This file OWNS the TypeScript model for the stored form JSON. It is a Coltor-free,
 * React-free, DOM-free re-implementation of the shape that
 * `@coltorapps/builder` persists in `luke-consumer-ui` (see
 * `luke-consumer-ui/src/lib/formSchema.ts` and `.../formBuilder/{entities,attributes}.ts`),
 * kept byte-for-byte compatible so existing stored forms load unchanged.
 *
 * The on-disk SHAPE is intentionally frozen:
 *
 * ```jsonc
 * {
 *   "entities": {
 *     "<id>": { "type": "textField", "attributes": { ... }, "parentId"?: "<id>", "children"?: ["<id>"] }
 *   },
 *   "root": ["<id>", "<id>"],
 *   "settings"?: { ... }
 * }
 * ```
 *
 * Two submission invariants ride on the `key` attribute (mirrored from the
 * builder): every key is a valid expression identifier (so logic/calc can
 * reference it) and every key is unique (so values never collide in scope or in
 * the submitted payload). The engine enforces these via {@link DiagnosticCode}s.
 *
 * @packageDocumentation
 */
/**
 * A field/entity key: a valid expression identifier (letter/underscore start,
 * then word characters). This is the name a field carries in the expression
 * scope and in the submitted payload. Fields without an explicit `key` fall back
 * to their entity `id`.
 *
 * The canonical validity regex is `/^[A-Za-z_][A-Za-z0-9_]*$/` (see
 * {@link KEY_REGEX_SOURCE}); a small set of reserved words is additionally
 * disallowed because they would shadow the expression engine / JS globals.
 *
 * @remarks Kept as a plain `string` alias (not a branded type) so plain JSON
 * deserializes into the schema without a cast. Validity is a runtime concern
 * surfaced as the `invalid-key` diagnostic, not a compile-time guarantee.
 */
type EntityKey = string;
/**
 * A safe expression string evaluated by the engine's sandbox (an `expr-eval`-style
 * arithmetic/boolean grammar — NOT JavaScript `eval`). Expressions reference field
 * values by key, e.g. `price * quantity`, `age >= 18 and country == "US"`.
 *
 * Evaluation is deliberately FAIL-OPEN at runtime (a typo must never blank a field
 * or wedge a submit); authoring-time static analysis is what surfaces typos. See
 * the `customConditional` / `customValidation` / `calculateValue` /
 * `customDefaultValue` attributes below.
 */
type ExpressionString = string;
/**
 * The canonical source of the key-validity regex, exposed so implementations and
 * tests share ONE definition. Anchored form: `^[A-Za-z_][A-Za-z0-9_]*$`.
 */
declare const KEY_REGEX_SOURCE = "^[A-Za-z_][A-Za-z0-9_]*$";
/**
 * Names disallowed as keys because they would shadow the expression engine or JS
 * globals. A syntactically-valid identifier that appears here is still an
 * `invalid-key`.
 */
declare const RESERVED_KEYS: readonly string[];
/**
 * The legacy literal conditional — the simple builder UI for "show this field
 * when `<when>` equals `<eq>`". Comparison is string-coerced
 * (`String(scope[when]) === String(eq)`); `show:false` inverts it (hide on match).
 *
 * Preserved verbatim for back-compat. For richer rules authors use
 * {@link EntityAttributes.customConditional} (a full expression) or
 * {@link LogicRule}s. Precedence when several visibility sources are present is
 * defined by the engine (logic `show`/`hide` wins, then `hidden`, then this
 * literal conditional, then `customConditional`).
 */
interface Conditional {
    /** The key of the field this condition reads. */
    when?: EntityKey;
    /** The value `when` is compared against (string-coerced equality). */
    eq?: unknown;
    /** `true`/absent → show on match; `false` → hide on match. */
    show?: boolean;
}
/**
 * The actions a {@link LogicRule} can apply to its host field when the rule's
 * `when` expression is truthy. Mirrors the builder's `LOGIC_ACTIONS`.
 *
 * - `show` / `hide`        — force visibility (overrides `hidden`/conditional).
 * - `enable` / `disable`   — force the disabled state.
 * - `require` / `optional` — force the required state.
 * - `setValue`             — set the field's value from {@link LogicRule.value}.
 */
type LogicAction = "show" | "hide" | "enable" | "disable" | "require" | "optional" | "setValue";
/**
 * The set of {@link LogicAction} literals, ordered, exposed for validation and
 * builder UIs.
 */
declare const LOGIC_ACTIONS: readonly LogicAction[];
/**
 * A single conditional logic rule attached to a field: "WHEN `when` is truthy,
 * apply `action`". For `action: "setValue"`, `value` is an expression that
 * computes the value to set; for all other actions `value` is ignored.
 *
 * Multiple rules on one field are evaluated in array order; later rules of the
 * same dimension (visibility / disabled / required / value) win — matching the
 * reference renderer's `evalLogic` last-write-wins fold.
 */
interface LogicRule {
    /** Expression gating this rule; truthy fires the `action`. Empty = always fires. */
    when?: ExpressionString;
    /** What to do to the host field when `when` is truthy. */
    action?: LogicAction;
    /** For `setValue`: an expression computing the value to assign. */
    value?: ExpressionString;
}
/**
 * The attribute bag carried by every entity. Open-ended by design — the schema is
 * forward-compatible with field-type-specific attributes
 * (`placeholder`, `min`, `options`, `rows`, …; see the builder's `attributes.ts`)
 * via the index signature, while the engine-relevant attributes that drive
 * evaluation are typed explicitly below.
 *
 * @remarks The index signature's value type is `unknown` (not `any`) so callers
 * must narrow before use. Field-type attribute schemas live in the field-type
 * registry, not here, to keep this contract small and stable.
 */
interface EntityAttributes {
    /** Human-readable label. Required for most field types at the UI layer. */
    label?: string;
    /**
     * The submission/scope key. When present and non-empty the entity is "keyed"
     * (a data field whose value appears in the payload); when absent the entity is
     * a layout/static node and the engine falls back to the entity `id` only for
     * scope addressing. Must satisfy {@link KEY_REGEX_SOURCE}.
     */
    key?: EntityKey;
    /** Legacy literal show/hide rule. See {@link Conditional}. */
    conditional?: Conditional;
    /** Ordered conditional logic rules. See {@link LogicRule}. */
    logic?: LogicRule[];
    /**
     * Expression computing this field's value from other fields, e.g.
     * `price * quantity`. Recomputed whenever a dependency changes. If
     * `allowCalculateOverride` is set, a user edit pins the field and suppresses
     * further recalculation. See the engine's field-precedence model.
     */
    calculateValue?: ExpressionString;
    /**
     * Advanced visibility expression: truthy SHOWS the field (empty = show, error =
     * show — fail-open). Applied after `logic` show/hide and the literal
     * `conditional`/`hidden`.
     */
    customConditional?: ExpressionString;
    /**
     * Custom validation expression: truthy = VALID (empty = valid, error = valid —
     * fail-open). The bound `value` of the field is exposed in scope as `value`.
     */
    customValidation?: ExpressionString;
    /**
     * Expression computing the field's initial value, evaluated once at init when
     * the field is otherwise empty (and no seeded/`defaultValue` is present).
     */
    customDefaultValue?: ExpressionString;
    /**
     * When `true` (the default semantics in the reference renderer), a user edit
     * stops `calculateValue` from overwriting the field. Only meaningful alongside
     * `calculateValue`.
     */
    allowCalculateOverride?: boolean;
    /**
     * When `true`, the field's value is reset to its type-appropriate empty
     * whenever it becomes hidden.
     */
    clearOnHide?: boolean;
    /**
     * When `false`, the field is excluded from the submission payload even though
     * it participates in scope and validation. Absent/`true` → included.
     */
    persistent?: boolean;
    /** Static default value used at init when no seeded value is present. */
    defaultValue?: unknown;
    /** Checkbox-only initial checked state, honored at init. */
    defaultChecked?: boolean;
    /** Forces the field hidden regardless of conditions (lowest-priority show source). */
    hidden?: boolean;
    /** Forces the field disabled (unless a `logic` enable/disable rule overrides). */
    disabled?: boolean;
    /** Marks the field required (unless a `logic` require/optional rule overrides). */
    required?: boolean;
    /** Field-type-specific and presentation attributes are tolerated and preserved. */
    [attribute: string]: unknown;
}
/**
 * A node in the form tree — either a data field (`textField`, `number`, `select`,
 * …) or a layout/container (`panel`, `columns`, `dataGrid`, …) or a static node
 * (`button`, `heading`, `divider`, …). The engine treats containers, grids and
 * static nodes specially; see the field-type registry and {@link FormEngine}.
 *
 * The on-disk record is keyed by `id`, so `id` is duplicated here purely for
 * convenience when an entity is passed around detached from the map.
 */
interface SchemaEntity {
    /** Stable unique id; the key under which this entity lives in {@link FormSchema.entities}. */
    id: string;
    /**
     * The entity type discriminator, e.g. `textField`, `select`, `panel`,
     * `dataGrid`, `button`. Field-type semantics (value type, coercion, emptiness,
     * container/static-ness) are resolved through the field-type registry, not
     * hard-coded here, so new types don't change this contract.
     */
    type: string;
    /** The entity's attributes. See {@link EntityAttributes}. */
    attributes: EntityAttributes;
    /**
     * The parent container's id, or `null`/absent for a root-level entity. When
     * present it MUST agree with the parent's `children`; a mismatch is reported as
     * the `parent-mismatch` diagnostic.
     */
    parentId?: string | null;
    /**
     * Ordered child ids, for container types only. Each id MUST exist in
     * {@link FormSchema.entities}; a dangling reference is the `dangling-child`
     * diagnostic.
     */
    children?: string[];
}
/**
 * Form-level settings stored as a `settings` sibling of `entities`/`root`. Open
 * map; the only currently-defined member is `submitMessage`. Preserved across
 * loads/saves so the builder and renderer round-trip it.
 */
interface FormSettings {
    /** A custom message shown after a successful submission. */
    submitMessage?: string;
    /** Other form-level settings are tolerated and preserved. */
    [setting: string]: unknown;
}
/**
 * A whole form definition: the entity map plus the ordered top-level ids and
 * optional form settings. This is the exact JSON persisted by the builder and
 * consumed by every renderer and the backend.
 *
 * Structural invariants (enforced via diagnostics, never by throwing):
 * - every id in `root` and in any `children` exists in `entities`;
 * - the parent/child tree is acyclic and single-parent;
 * - every keyed field has a valid, unique `key`.
 */
interface FormSchema {
    /**
     * Optional schema-format version for future migrations. Absent = the original
     * Coltor-compatible v0 shape.
     */
    version?: number;
    /** Ordered ids of the top-level entities. */
    root: string[];
    /** All entities by id. */
    entities: Record<string, SchemaEntity>;
    /** Optional form-level settings. See {@link FormSettings}. */
    settings?: FormSettings;
}
/**
 * The submission payload shape: a flat map keyed by field KEY. Grid fields nest
 * an array of per-row key→value maps. This is what {@link FormEngine.collect}
 * returns and what `initialValues` seeds.
 */
type FormData = Record<string, unknown>;

/**
 * Schema integrity utilities — the Coltor-free re-implementation of the form
 * builder/renderer's `formSchema.ts` key + tree operations.
 *
 * The stored schema is `{ entities, root, settings? }`, where each entity is
 * `{ id, type, attributes, parentId?, children? }`. A field entity carries a
 * `key` attribute — the identifier that names the field in the expression scope
 * and in the submitted payload. Two invariants keep submissions trustworthy:
 *
 *   1. Every key is a valid expression identifier  →  logic/calc can reference it.
 *   2. Every key is unique                          →  values never overwrite each
 *                                                       other in scope or payload.
 *
 * This module owns the runtime operations; the TYPES it operates on
 * ({@link FormSchema}, {@link SchemaEntity}, …) and the shared constants
 * ({@link KEY_REGEX_SOURCE}, {@link RESERVED_KEYS}) live in `./types`. Everything
 * here is PURE (never mutates input) and TOLERANT (never throws on malformed
 * input), so the builder, renderer, AI-apply path, and engine can all reuse it.
 *
 * Re-implemented from `luke-consumer-ui/src/lib/formSchema.ts` WITHOUT any
 * `@coltorapps/builder`, React, DOM, zod, or expr-eval dependency.
 *
 * @packageDocumentation
 */

/**
 * The compiled key-validity matcher, built from the single shared
 * {@link KEY_REGEX_SOURCE} so this module and authoring UIs never drift. A valid
 * key starts with a letter/underscore, then word chars.
 */
declare const KEY_RE: RegExp;
/**
 * `true` when `value` is a string that is a valid expression identifier and not a
 * reserved word. Narrows to `string`.
 */
declare function isValidKey(value: unknown): value is string;
/**
 * `true` when this entity participates in the keyed namespace (a data field) —
 * i.e. its attributes carry a `key` property at all (even if empty/invalid; key
 * validity is a separate concern surfaced as a diagnostic).
 */
declare function isKeyed(e: SchemaEntity | undefined): boolean;
/**
 * Coerce an arbitrary string into a valid, identifier-safe key. Already-valid
 * keys are returned untouched (so `emailAddress` is preserved, not flattened).
 * Falls back to `field` for empty/symbol-only input.
 */
declare function sanitizeKey(raw: unknown): string;
/**
 * Force a camelCase identifier from a label (or existing key). Unlike
 * {@link sanitizeKey}, it does NOT preserve already-valid keys verbatim, so
 * `snake_case` and `Title Case` collapse to camelCase: `first_name` /
 * `First Name` → `firstName`. Idempotent on already-camelCase input.
 */
declare function toCamelKey(raw: unknown): string;
/** Return `base`, or `base1`, `base2`… until it isn't already in `taken`. */
declare function uniqueKey(base: string, taken: ReadonlySet<string>): string;
/**
 * `true` when `key` still looks auto-derived from `label` — it's the label's
 * camelCase base, or that base with a numeric collision suffix. Lets a label edit
 * decide whether to keep re-deriving the key: once the user changes the key to
 * something that no longer matches the label this returns `false` and the key is
 * treated as a manual override. Computed purely from the key/label pair (no
 * stored flag), so it survives reloads.
 */
declare function isAutoKey(key: string, label: string): boolean;
/**
 * The effective key for an entity: its `key` attribute when a non-empty string,
 * else its `id`. Tolerant of a missing attributes bag.
 */
declare function keyOf(id: string, e: SchemaEntity | undefined): string;
/**
 * Deterministic traversal order: depth-first from `root`, then any entities not
 * reachable from root (orphans), in object-insertion order. Stable ordering
 * matters so that when keys collide the EARLIER field keeps its name and later
 * ones get suffixed — repeated normalization is then idempotent. Guards against
 * cycles and missing entities.
 */
declare function orderedIds(schema: FormSchema): string[];
/** `{ id, key }` for every keyed field, in traversal order. */
declare function collectKeys(schema: FormSchema): Array<{
    id: string;
    key: string;
}>;
/** Ids of keyed entities whose key duplicates an earlier field's key. */
declare function duplicateKeyIds(schema: FormSchema): Set<string>;
/**
 * Return a copy of the schema with every keyed field given a valid, unique key.
 * Valid + still-unique keys are preserved; invalid or colliding ones are
 * sanitized (from the current key, falling back to `label`, then `type`) and
 * suffixed. Pure — does not mutate the input. Idempotent: re-running on its own
 * output is a no-op.
 */
declare function normalizeKeys(schema: FormSchema): FormSchema;
/**
 * Re-key every field to camelCase (derived from its label, else its current key,
 * else its type), keeping keys unique, and rewrite all key references —
 * conditional (`conditional.when`), logic rules (`logic[].when/value`) and the
 * expression attributes — so nothing breaks. Built for AI-applied schemas, whose
 * agent may emit `snake_case` keys. Pure; does not mutate the input.
 */
declare function camelCaseKeys(schema: FormSchema): FormSchema;
/**
 * Return a structurally-sound copy of the schema so the builder/renderer/engine
 * can never choke on a corrupted draft. It:
 *   - drops `root`/`children` ids that don't exist,
 *   - breaks container cycles (removes the back-edge),
 *   - keeps only entities reachable from root, with a correct `parentId`.
 * Pure. `removed` lists entity ids that were unreachable and dropped. Idempotent:
 * a repaired schema repairs to itself with an empty `removed`.
 */
declare function repairSchema(schema: FormSchema): {
    schema: FormSchema;
    removed: string[];
};

/**
 * Diagnostics — the structured, machine-readable problems the engine reports
 * about a {@link import("./schema/types").FormSchema} (authoring/integrity issues)
 * or about expression evaluation at runtime.
 *
 * Diagnostics are NEVER thrown. The engine is tolerant by contract: a malformed
 * schema or a broken expression yields a {@link Diagnostic}, not an exception, so
 * a corrupted draft still loads and renders best-effort. Severity decides whether
 * a problem should block publish (`error`) or is merely advisory (`warning` /
 * `info`).
 *
 * The codes below are the Coltor-free superset of the reference builder's
 * `SchemaProblem` codes (see `luke-consumer-ui/src/lib/formSchema.ts`
 * `validateSchema`) plus the expression-engine codes the headless engine needs.
 *
 * @packageDocumentation
 */
/**
 * Structural / referential-integrity diagnostics about the schema tree itself.
 * These come from static schema analysis, independent of any values.
 *
 * - `malformed-schema` — not an object, or missing `entities`/`root`.
 * - `dangling-root`    — a `root` id has no matching entity.
 * - `dangling-child`   — a container's `children` id has no matching entity.
 * - `parent-mismatch`  — a child's `parentId` disagrees with the parent that lists it.
 * - `cycle`            — the container tree contains a cycle.
 * - `orphan`           — an entity is unreachable from `root`.
 * - `disabled-required`— a field is both disabled AND required with nothing to enable it (warning).
 * - `partial-wizard`   — some (not all) top-level items are Pages, so wizard mode won't engage (warning).
 */
type SchemaDiagnosticCode = "malformed-schema" | "dangling-root" | "dangling-child" | "parent-mismatch" | "cycle" | "orphan" | "disabled-required" | "partial-wizard";
/**
 * Key-namespace diagnostics — the invariants that keep submissions trustworthy.
 *
 * - `invalid-key`   — a field's key isn't a valid identifier (logic/calc can't reference it).
 * - `duplicate-key` — two keyed fields share a key (their answers would collide).
 * - `reserved-key`  — a key is syntactically valid but shadows a reserved word/global.
 */
type KeyDiagnosticCode = "invalid-key" | "duplicate-key" | "reserved-key";
/**
 * Expression / logic diagnostics — surfaced by static analysis (authoring time)
 * and by the runtime sandbox (evaluation time).
 *
 * - `expr-parse-error`     — an expression failed to parse.
 * - `expr-unknown-ident`   — an expression references a field key that doesn't exist.
 * - `expr-runtime-error`   — an expression threw at evaluation time (fail-open; reported, not fatal).
 * - `unknown-field-type`   — an entity's `type` isn't in the field-type registry.
 * - `dependency-cycle`     — calculate/logic dependencies form a cycle (settlement bounded; see engine).
 * - `settlement-not-reached`— multi-pass settlement hit its pass cap without converging.
 */
type ExpressionDiagnosticCode = "expr-parse-error" | "expr-unknown-ident" | "expr-runtime-error" | "unknown-field-type" | "dependency-cycle" | "settlement-not-reached";
/**
 * The closed union of every diagnostic code the engine can emit. Stable strings —
 * treat them as an API surface (UIs and tests match on them).
 */
type DiagnosticCode = SchemaDiagnosticCode | KeyDiagnosticCode | ExpressionDiagnosticCode;
/**
 * Diagnostic severity.
 *
 * - `error`   — blocks publish/check-in; the schema/expression is unsound.
 * - `warning` — advisory; the form still works but something is suspect.
 * - `info`    — purely informational (e.g. a settled-after-N-passes note).
 */
type DiagnosticSeverity = "error" | "warning" | "info";
/**
 * A single structured problem. `code` is the stable machine key; `message` is a
 * human-readable rendering of it; `entityId` scopes field-level problems;
 * `context` carries code-specific data (e.g. `{ key }`, `{ expression, idents }`,
 * `{ passCount }`) for richer UIs and tests without parsing `message`.
 */
interface Diagnostic {
    /** The stable machine code. */
    code: DiagnosticCode;
    /** How serious the problem is. */
    severity: DiagnosticSeverity;
    /** The offending entity, when the problem is field/entity-scoped. */
    entityId?: string;
    /**
     * Code-specific structured payload — never load-bearing for control flow, but
     * useful for rendering and assertions. Always present (possibly empty).
     */
    context: Readonly<Record<string, unknown>>;
    /** Human-readable description of the problem. */
    message: string;
}
/**
 * A batch of diagnostics with cheap derived flags. Returned by schema-level
 * analysis so callers can gate on `hasErrors` without re-scanning.
 */
interface DiagnosticReport {
    /** All diagnostics, in deterministic order (tree order, then code). */
    diagnostics: readonly Diagnostic[];
    /** `true` iff any diagnostic has severity `error`. */
    hasErrors: boolean;
    /** `true` iff any diagnostic has severity `warning`. */
    hasWarnings: boolean;
}

/**
 * Static schema validation — the Coltor-free port of the builder's
 * `validateSchema`, emitting the engine's {@link Diagnostic} envelope rather than
 * the builder's bespoke `SchemaProblem`.
 *
 * Two layers of checks:
 *   1. Referential integrity of the entity tree (dangling refs, cycles, orphans,
 *      parent/child agreement).
 *   2. Key-namespace soundness (validity, reserved words, uniqueness).
 *
 * TOLERANT by contract: a malformed schema yields a `malformed-schema`
 * diagnostic, never an exception. Output is deterministic (tree order, then a
 * stable per-bucket order) so tests can assert on it.
 *
 * @packageDocumentation
 */

/**
 * Full integrity check: referential soundness + key validity/reserved/uniqueness.
 * Returns a flat, deterministically-ordered {@link Diagnostic} list (errors
 * should block check-in/publish; warnings are advisory). Never throws.
 */
declare function validateSchema(schema: FormSchema | null | undefined): Diagnostic[];
/**
 * Wrap {@link validateSchema}'s flat list in a {@link DiagnosticReport} with the
 * cheap derived `hasErrors`/`hasWarnings` flags, so callers can gate on
 * `hasErrors` without re-scanning.
 */
declare function validateSchemaReport(schema: FormSchema | null | undefined): DiagnosticReport;
/** Convenience: does the schema have any blocking (error-severity) diagnostic? */
declare function hasBlockingProblems(schema: FormSchema | null | undefined): boolean;

/**
 * Form-level settings access — the Coltor-free port of the builder's
 * `readSettings`/`readSubmitMessage`.
 *
 * Settings live as a `settings` sibling of `entities`/`root` in the stored schema
 * JSON. The builder preserves it across saves; the renderer reads it after a
 * successful submit. These readers are tolerant of anything (bad JSON, missing
 * keys) and never throw.
 *
 * @packageDocumentation
 */

/** Read form-level settings from a schema JSON string (tolerant of anything). */
declare function readSettings(rawSchema: string | null | undefined): FormSettings;
/** The custom submission message for a form, or `""` when none is set. */
declare function readSubmitMessage(rawSchema: string | null | undefined): string;

/**
 * Schema versioning + migration. Stored forms outlive the code that created them, so
 * an enterprise deployment needs a deterministic way to bring an old `{...,version}`
 * schema up to the current shape on load. Migrations are ordered, idempotent
 * transforms keyed by the version they produce; {@link migrateSchema} applies every
 * migration whose target exceeds the schema's current version, in order, and stamps
 * the result.
 *
 * Pure, DOM-free. The engine can run this automatically via `EngineOptions.migrations`.
 *
 * @packageDocumentation
 */

/** The schema version this build of the engine targets. */
declare const CURRENT_SCHEMA_VERSION = 1;
/** One migration step: transform a schema and declare the version it produces. */
interface SchemaMigration {
    /** The schema `version` this migration upgrades TO (applied when current < `to`). */
    to: number;
    /** The transform. Must be pure and idempotent for its input version. */
    migrate: (schema: FormSchema) => FormSchema;
}
/** The outcome of {@link migrateSchema}. */
interface MigrationResult {
    schema: FormSchema;
    /** The schema's version before migrating (absent → 0). */
    from: number;
    /** The version after migrating. */
    to: number;
    /** The migration target versions applied, in order. */
    applied: number[];
}
/**
 * Apply all `migrations` whose `to` exceeds the schema's current version, in
 * ascending order, then stamp the result's `version` to at least
 * {@link CURRENT_SCHEMA_VERSION}. Never throws; a schema already at/above a
 * migration's target skips it (idempotent on its own output).
 */
declare function migrateSchema(schema: FormSchema, migrations?: readonly SchemaMigration[]): MigrationResult;

/**
 * Validation contract — the value-level (per-field) checking layer.
 *
 * This is distinct from {@link import("../diagnostics").Diagnostic}s: diagnostics
 * describe whether the SCHEMA is sound (authoring/integrity), while a
 * {@link ValidationResult} describes whether a VALUE satisfies a field's rules
 * (required, min/max, length, pattern, email/url, custom expression, …).
 *
 * Re-implements, Coltor-free, the per-type checks in
 * `luke-consumer-ui/.../FormRenderer.tsx` (`validateField`, `stringChecks`,
 * `validateGridRows`), but as a pure, framework-agnostic contract: results carry
 * a stable `code` + structured `params` so the UI owns message rendering and
 * i18n, while `message` is the engine's default English rendering.
 *
 * @packageDocumentation
 */

/**
 * The closed set of built-in validation failure codes. Stable strings — UIs and
 * tests match on them; `message` is only the default rendering.
 *
 * - `required`        — a required field is empty.
 * - `minLength`/`maxLength` — string length out of bounds.
 * - `minWords`/`maxWords`   — word count out of bounds.
 * - `min`/`max`       — numeric value out of bounds.
 * - `pattern`         — value fails the `pattern` regex.
 * - `email`/`url`     — value isn't a valid email / URL.
 * - `minDate`/`maxDate`/`minTime`/`maxTime` — date/time out of bounds.
 * - `minSelected`/`maxSelected` — selection count out of bounds (selectBoxes).
 * - `minTags`/`maxTags`         — tag count out of bounds.
 * - `minRows`/`maxRows`         — grid row count out of bounds.
 * - `minFiles`/`maxFiles`/`maxFileSize` — file-count / size limits.
 * - `custom`          — the `customValidation` expression returned falsy.
 */
type ValidationCode = "required" | "minLength" | "maxLength" | "minWords" | "maxWords" | "min" | "max" | "pattern" | "email" | "url" | "minDate" | "maxDate" | "minTime" | "maxTime" | "minSelected" | "maxSelected" | "minTags" | "maxTags" | "minRows" | "maxRows" | "minFiles" | "maxFiles" | "maxFileSize" | "custom";
/**
 * The outcome of validating ONE field's value.
 *
 * On success `valid` is `true` and `code`/`params`/`message` are absent. On
 * failure `valid` is `false` and the failure is fully described: `code` is the
 * stable machine key, `params` is the structured payload for message
 * interpolation (e.g. `{ min: 3 }`), and `message` is the engine's default
 * English rendering — overridable by the field's `customMessage`/`errorLabel`.
 *
 * Only the FIRST failure per field is reported (the reference renderer
 * short-circuits), matching one-error-per-field UI semantics.
 */
interface ValidationResult {
    /** The field this result is about (its KEY; grid cells use a `key[row]` path). */
    field: EntityKey;
    /** `true` when the value satisfies every rule. */
    valid: boolean;
    /** The failing rule's stable code (absent when `valid`). */
    code?: ValidationCode;
    /** Structured data for message interpolation, e.g. `{ min, max, actual }`. */
    params?: Readonly<Record<string, unknown>>;
    /** Default human-readable message (absent when `valid`); UI may override. */
    message?: string;
}
/**
 * The runtime context a {@link Validator} sees: the value under test plus the
 * scope it can reference. `value` is also injected into `scope.value` so custom
 * expressions can read the field's own value as `value`, matching the reference
 * renderer.
 */
interface ValidationContext {
    /** The field's KEY (for building the result and addressing scope). */
    field: EntityKey;
    /** The value under test (already coerced to the field's value type). */
    value: unknown;
    /**
     * The full evaluation scope (all field values by key), with the field's own
     * value additionally bound as `value`. Read-only — validators never mutate it.
     */
    scope: Readonly<Record<string, unknown>>;
}
/**
 * A validator: a pure function from a {@link ValidationContext} to a
 * {@link ValidationResult}. Built-in validators (required, length, range,
 * pattern, email/url, custom-expression, …) are composed per field-type from the
 * field's attributes; callers may also register custom validators.
 *
 * Implementations MUST be pure and total (never throw — a thrown custom
 * expression is treated as VALID, fail-open, and reported as an
 * `expr-runtime-error` diagnostic instead).
 */
type Validator = (ctx: ValidationContext) => ValidationResult;
/**
 * A named, reusable validator factory bound to a code — the unit the engine
 * registers and composes. `build` reads a field's attributes and returns a
 * concrete {@link Validator}, or `null` when the rule doesn't apply to that field
 * (e.g. no `minLength` attribute present).
 */
interface ValidatorRule {
    /** The code this rule emits on failure. */
    code: ValidationCode;
    /**
     * Compile this rule against a field's attributes. Returns a {@link Validator}
     * to run, or `null` if the rule is inert for this field.
     */
    build: (attributes: Readonly<Record<string, unknown>>) => Validator | null;
}

/**
 * Validation message templating — the engine's default English rendering for each
 * {@link import("./types").ValidationCode}, plus a tiny `{placeholder}`
 * substitution helper.
 *
 * Messages are intentionally simple and overridable: a {@link ValidationResult}
 * carries a stable `code` and structured `params`, so a UI can fully ignore the
 * `message` string and render its own (i18n) copy from `code` + `params`. The
 * default templates here exist so the headless engine still produces a readable
 * string, mirroring the literals in the reference renderer's `validateField`.
 *
 * Substitution is deliberately minimal — `{name}` tokens replaced by `params`
 * values, no expression language, no locale logic — so it is pure, total, and
 * never throws.
 *
 * @packageDocumentation
 */

/**
 * The default message TEMPLATES per code, with `{placeholder}` tokens filled from
 * a result's `params`. `{label}` is the field's display name (`errorLabel` →
 * `label` → `"This field"`), the rest are rule bounds (`{min}`, `{max}`, …).
 *
 * Pluralization is handled by a `{unit}`/`{units}` pair the rule supplies in
 * `params` (e.g. `unit: "tag"`, `units: "tags"`), so the template stays free of
 * branching while matching the reference renderer's singular/plural wording.
 */
declare const DEFAULT_MESSAGES: Readonly<Record<ValidationCode, string>>;
/**
 * Substitute `{name}` tokens in `template` from `params`. Unknown tokens are left
 * verbatim; `null`/`undefined` param values render as the empty string. Pure and
 * total — never throws, never reads anything but its arguments.
 *
 * @example
 * interpolate("Must be at least {min} characters", { min: 3 })
 * // => "Must be at least 3 characters"
 */
declare function interpolate(template: string, params?: Readonly<Record<string, unknown>>): string;
/**
 * Render the default human-readable message for a failure `code` with `params`
 * interpolated. A `customMessage` (when present) takes precedence over the
 * template entirely — it is returned as-is, not interpolated, matching the
 * reference renderer where `customMessage` short-circuits the default literal.
 */
declare function renderMessage(code: ValidationCode, params?: Readonly<Record<string, unknown>>, customMessage?: string): string;

/**
 * Built-in validator rules — the Coltor-free port of the per-type checks in
 * `luke-consumer-ui/.../FormRenderer.tsx` (`validateField`, `stringChecks`),
 * expressed as {@link ValidatorRule} factories that read a field's attributes and
 * return a concrete {@link Validator} (or `null` when the rule is inert).
 *
 * Each validator returns a structured {@link ValidationResult}: a stable `code`, a
 * `params` payload for message interpolation, and a default `message`. None of
 * them throw — a malformed bound or a bad regex is treated as "no constraint"
 * (fail-open), exactly as the reference renderer does.
 *
 * Rules here cover the value-level constraints driven purely by attributes:
 * `required`, length / words (string), `min`/`max` (numeric), `pattern`,
 * `email`/`url` (by field type), date/time bounds, selection / tag / file counts,
 * and file size. The cross-field `customValidation` expression rule is NOT here —
 * it needs the evaluation scope and lives in {@link import("./registry")}.
 *
 * @packageDocumentation
 */

/** A passing result for a field. */
declare function ok(field: string): ValidationResult;
/**
 * A failing result: stamps the stable `code`, structured `params`, and the
 * default (or `customMessage`-overridden) `message`.
 */
declare function fail(field: string, code: ValidationCode, params: Readonly<Record<string, unknown>>, customMessage?: string): ValidationResult;
/** Whether a value counts as "empty" for required/skip-checks (matches the renderer). */
declare function isEmptyValue(v: unknown): boolean;
/**
 * `required` — value must be present. For checkboxes, presence means `=== true`;
 * for everything else, non-{@link isEmptyValue}. Inert unless the field's
 * `required` attribute is truthy.
 */
declare const requiredRule: ValidatorRule;
/** `minLength` — string shorter than `minLength` chars fails. */
declare const minLengthRule: ValidatorRule;
/** `maxLength` — string longer than `maxLength` chars fails. */
declare const maxLengthRule: ValidatorRule;
/** `minWords` — fewer than `minWords` words fails. */
declare const minWordsRule: ValidatorRule;
/** `maxWords` — more than `maxWords` words fails. */
declare const maxWordsRule: ValidatorRule;
/**
 * `pattern` — the string value must match the `pattern` regex. A malformed regex
 * is treated as "no constraint" (fail-open), matching the renderer's swallow.
 */
declare const patternRule: ValidatorRule;
/** `min` — numeric value below `min` fails. */
declare const minRule: ValidatorRule;
/** `max` — numeric value above `max` fails. */
declare const maxRule: ValidatorRule;
/**
 * `email` — when the field's `type` attribute is `"email"`, the value must look
 * like an email. (Field type is passed through `attributes.type` by the registry
 * composer; see {@link import("./registry").buildFieldValidators}.)
 */
declare const emailRule: ValidatorRule;
/** `url` — when the field's `type` is `"url"`, the value must look like an http(s) URL. */
declare const urlRule: ValidatorRule;
/** `minDate` — ISO date string before `minDate` fails (lexical compare). */
declare const minDateRule: ValidatorRule;
/** `maxDate` — ISO date string after `maxDate` fails. */
declare const maxDateRule: ValidatorRule;
/** `minTime` — time string before `minTime` fails. */
declare const minTimeRule: ValidatorRule;
/** `maxTime` — time string after `maxTime` fails. */
declare const maxTimeRule: ValidatorRule;
/** `minSelected` — fewer than `minSelected` selections fails (selectBoxes). */
declare const minSelectedRule: ValidatorRule;
/** `maxSelected` — more than `maxSelected` selections fails. */
declare const maxSelectedRule: ValidatorRule;
/** `minTags` — fewer than `minTags` tags fails. */
declare const minTagsRule: ValidatorRule;
/** `maxTags` — more than `maxTags` tags fails. */
declare const maxTagsRule: ValidatorRule;
/** `minRows` — fewer than `minRows` grid rows fails. */
declare const minRowsRule: ValidatorRule;
/** `maxRows` — more than `maxRows` grid rows fails. */
declare const maxRowsRule: ValidatorRule;
/** `minFiles` — fewer than `minFiles` files fails. */
declare const minFilesRule: ValidatorRule;
/** `maxFiles` — more than `maxFiles` files fails. */
declare const maxFilesRule: ValidatorRule;
/**
 * `maxFileSize` — any file larger than `maxSize` MB fails. Reads the array of
 * file descriptors (objects with a numeric `size` in bytes), matching the
 * renderer's `f.size > maxSize * 1024 * 1024` check.
 */
declare const maxFileSizeRule: ValidatorRule;
/**
 * The built-in rules in evaluation ORDER. The composer runs them head-to-tail and
 * returns the FIRST failure (one error per field), matching the reference
 * renderer's short-circuit: `required` first, then string/number/shape/bound/count
 * checks, with `customValidation` (registered separately) running last.
 */
declare const BUILTIN_RULES: readonly ValidatorRule[];

/**
 * The validator registry + composition — `registerValidator`, the built-in
 * registry, the `customValidation` expression rule (which needs the evaluation
 * scope), and `buildFieldValidators` / `validateValue`, the entry points the
 * engine uses to check one field's value.
 *
 * A {@link ValidatorRule} is registered by its {@link ValidationCode}; the
 * registry is ordered (registration order) so composition produces a stable,
 * one-error-per-field short-circuit matching the reference renderer. The built-in
 * rules (required/length/words/pattern/min/max/email/url/date/time/count/file)
 * are pre-registered; callers may `registerValidator` additional rules or replace
 * a built-in by re-registering the same code.
 *
 * The `customValidation` expression check is special — it reads the field's own
 * value (bound as `value`) plus the whole {@link ValidationContext.scope} through
 * the safe expression sandbox, FAIL-OPEN: a blank or broken expression is treated
 * as VALID (the engine separately records the runtime failure as an
 * `expr-runtime-error` diagnostic).
 *
 * @packageDocumentation
 */

/**
 * An ordered, mutable registry of {@link ValidatorRule}s. Order is registration
 * order; a re-registration of the same {@link ValidationCode} REPLACES the prior
 * rule in place (keeping its position), so built-ins can be overridden without
 * reordering the whole pipeline.
 */
declare class ValidatorRegistry {
    private readonly order;
    private readonly rules;
    /** Register (or replace, by code) a rule. Returns `this` for chaining. */
    register(rule: ValidatorRule): this;
    /** The rule registered for a code, or `undefined`. */
    get(code: ValidationCode): ValidatorRule | undefined;
    /** Whether a code has a registered rule. */
    has(code: ValidationCode): boolean;
    /** All registered rules in registration order. */
    all(): readonly ValidatorRule[];
    /** A shallow clone (same rules, independent order) for scoped customization. */
    clone(): ValidatorRegistry;
}
/** Build a fresh registry pre-loaded with all built-in rules in canonical order. */
declare function createDefaultRegistry(): ValidatorRegistry;
/**
 * The process-wide default registry, pre-loaded with the built-ins. `registerValidator`
 * mutates this one; pass an explicit registry to {@link buildFieldValidators} /
 * {@link validateValue} to avoid global state in tests or multi-tenant use.
 */
declare const defaultRegistry: ValidatorRegistry;
/**
 * Register a custom {@link ValidatorRule} on the default registry (or a supplied
 * one). Re-registering an existing {@link ValidationCode} replaces it. Returns the
 * registry for chaining.
 */
declare function registerValidator(rule: ValidatorRule, registry?: ValidatorRegistry): ValidatorRegistry;
/**
 * The `customValidation` expression validator. Reads `attributes.customValidation`;
 * when present, evaluates it against the context scope (with the field's value
 * bound as `value`). Truthy / `undefined` (blank or error) = VALID, falsy =
 * INVALID with code `custom`. Never throws — the sandbox is fail-open.
 *
 * This is not a {@link ValidatorRule} (it needs the runtime scope, not just
 * attributes), so the composer appends it after the attribute-driven rules.
 */
declare function customValidationValidator(attributes: Readonly<Record<string, unknown>>): Validator | null;
/**
 * Compile the ordered list of {@link Validator}s for one field from its
 * attributes: every registered rule that is live for this field (its `build`
 * returns non-null), in registry order, followed by the `customValidation`
 * expression rule (last, matching the reference renderer).
 *
 * `attributes` is the field's attribute bag; the field `type` is expected to be
 * present as `attributes.type` (the engine stamps it before calling) so type-gated
 * rules (email/url) can self-select.
 */
declare function buildFieldValidators(attributes: Readonly<Record<string, unknown>>, registry?: ValidatorRegistry): Validator[];
/**
 * Validate ONE field's value: build its validators and run them in order,
 * returning the FIRST failure (one error per field) or a passing result. Pure and
 * total — never throws. Each individual validator is also defensively guarded so a
 * buggy custom rule can never wedge validation (a throw is swallowed and treated
 * as a pass for that rule, fail-open).
 *
 * @param attributes - the field's attribute bag (with `type` stamped in).
 * @param ctx - the runtime context: value under test + scope.
 * @param registry - the rule registry (defaults to the process-wide one).
 */
declare function validateValue(attributes: Readonly<Record<string, unknown>>, ctx: ValidationContext, registry?: ValidatorRegistry): ValidationResult;

/**
 * Engine types — the runtime model the {@link import("./FormEngine").FormEngine}
 * computes and exposes.
 *
 * Where {@link import("../schema/types").FormSchema} is the static, stored
 * definition, this file describes the LIVE, derived state for a form instance:
 * each field's value and computed flags (visible / disabled / required / dirty /
 * touched / error), the field-type behavior registry, the whole engine state, and
 * the evaluation trace used for debugging and tests.
 *
 * Coltor-free, React-free, DOM-free.
 *
 * @packageDocumentation
 */

/**
 * Where a field's current value came from, in ascending precedence. Used to decide
 * whether a new computed value may overwrite the current one (a user edit pins the
 * value against lower-precedence computed sources when override is allowed).
 *
 * - `seed`          — `initialValues` / saved submission data.
 * - `default`       — static `defaultValue` / `defaultChecked`.
 * - `customDefault` — `customDefaultValue` expression (init-only).
 * - `calculate`     — `calculateValue` expression (continuous).
 * - `logicSetValue` — a `logic[].setValue` rule.
 * - `user`          — a direct user edit via {@link import("./FormEngine").FormEngine.update}.
 * - `clearOnHide`   — reset to empty because the field became hidden.
 */
type ValueSource = "seed" | "default" | "customDefault" | "calculate" | "logicSetValue" | "user" | "clearOnHide";
/**
 * How a field's current value was produced — the provenance the engine uses to
 * arbitrate field precedence (see the engine's precedence model). `priority` is
 * the numeric rank of `source` (higher wins); two writes of equal priority are
 * resolved last-write-wins in evaluation order.
 */
interface ValueComputed {
    /** The source that last set the value. */
    source: ValueSource;
    /** Numeric precedence of {@link source}; higher overrides lower. */
    priority: number;
}
/**
 * The live, derived state of ONE field. `value` is the current bound value; the
 * `is*` flags are the resolved booleans after folding `hidden`/`disabled`/
 * `required` attributes with conditional, `customConditional`, and `logic` rules;
 * `computed` records value provenance; `error` is the first validation failure (or
 * `null` when valid / not yet validated).
 */
interface FieldState {
    /** The field's id (its key under {@link EngineState.fields}). */
    entityId: string;
    /** The field's effective KEY (its name in scope and payload). */
    key: EntityKey;
    /** The current bound value, coerced to the field-type's value type. */
    value: unknown;
    /** Resolved visibility (after logic show/hide, hidden, conditional, customConditional). */
    isVisible: boolean;
    /** Resolved disabled state (after logic enable/disable, disabled). */
    isDisabled: boolean;
    /** Resolved required state (after logic require/optional, required). */
    isRequired: boolean;
    /** `true` once the value differs from its initial/seeded value. */
    isDirty: boolean;
    /** `true` once the user has interacted with the field (focus/edit). */
    isTouched: boolean;
    /** The first validation failure, or `null` when valid / unvalidated. */
    error: ValidationResult | null;
    /** Provenance of {@link value}. See {@link ValueComputed}. */
    computed: ValueComputed;
}
/**
 * The behavioral contract for a field/entity `type` (e.g. `textField`, `number`,
 * `select`, `checkbox`, `dataGrid`). The registry of these is what makes the
 * engine type-agnostic: value coercion, the type's "empty", and equality all live
 * here rather than in `switch (type)` blocks.
 *
 * Implementations MUST be pure.
 *
 * @typeParam T - the field's runtime value type.
 */
interface FieldType<T = unknown> {
    /** The `type` discriminator this entry handles (matches {@link import("../schema/types").SchemaEntity.type}). */
    name: string;
    /**
     * The conceptual value category, for default validators and scope coercion.
     * `none` marks layout/static types that hold no value (and never enter scope).
     */
    valueType: "string" | "number" | "boolean" | "array" | "object" | "date" | "file" | "none";
    /**
     * `true` for container types that nest `children` (`panel`, `columns`,
     * `dataGrid`, …). Containers don't hold a scalar value; grids hold an array of
     * per-row maps.
     */
    isContainer?: boolean;
    /**
     * `true` for repeating-row container types (`dataGrid`, `editGrid`) whose value
     * is an array of per-row key→value maps and whose children form the row template.
     */
    isGrid?: boolean;
    /**
     * `true` for static/presentational types (`button`, `heading`, `divider`,
     * `content`, wizard nav) that neither hold a value nor enter scope.
     */
    isStatic?: boolean;
    /**
     * Coerce an arbitrary stored/input value into this type's canonical runtime
     * value (e.g. numeric-looking strings → numbers for `number`). Total: must
     * handle `undefined`/`null` by returning {@link empty}.
     */
    coerce: (value: unknown) => T;
    /** The type-appropriate empty value (e.g. `""`, `false`, `[]`, `null`). */
    empty: () => T;
    /**
     * Value-equality used to gate churn — must treat numerically-equal primitives as
     * equal (so a calculated `2` doesn't endlessly overwrite a typed `"2"`) and
     * support shallow array comparison, mirroring the reference renderer's
     * `sameValue`.
     */
    compare: (a: unknown, b: unknown) => boolean;
}
/**
 * A read-only registry mapping a `type` string to its {@link FieldType}. Lookups
 * for an unknown type yield `undefined`, which the engine reports as an
 * `unknown-field-type` diagnostic and treats as an opaque, value-less node.
 */
type FieldTypeRegistry = ReadonlyMap<string, FieldType>;
/**
 * The complete live state of a form instance: every field's {@link FieldState} by
 * id, the flat scope (values by key) that expressions read, and engine-level
 * status. This is what {@link import("./FormEngine").FormEngine.getState} returns
 * and {@link import("./FormEngine").FormEngine.serialize}/`reset` round-trip.
 */
interface EngineState {
    /** Per-field derived state, keyed by entity id. */
    fields: Readonly<Record<string, FieldState>>;
    /**
     * The expression scope: every keyed field's coerced value by KEY (grids expose
     * their row array). This is exactly what {@link import("./FormEngine").FormEngine.getScope}
     * returns and what validators/expressions read.
     */
    scope: Readonly<Record<string, unknown>>;
    /**
     * `true` once any field is dirty (its value differs from its initial value).
     */
    isDirty: boolean;
    /**
     * `true` when the last {@link import("./FormEngine").FormEngine.validate} found
     * no errors across visible fields. `null` before the first validate.
     */
    isValid: boolean | null;
    /**
     * How many settlement passes the last evaluation took (see the engine's bounded
     * multi-pass model). Useful for perf assertions; `0` before the first evaluate.
     */
    passCount: number;
}
/**
 * One recorded step of an evaluation pass — the audit trail behind a single
 * derived change. Emitted only when tracing is enabled; collected into an
 * {@link EvalTrace}. Lets tests assert WHY a field changed and detect runaway
 * re-evaluation.
 */
interface EvalTraceStep {
    /** Which settlement pass (1-based) produced this step. */
    pass: number;
    /** The entity whose derived state changed. */
    entityId: string;
    /** What was recomputed. */
    kind: "value" | "visibility" | "disabled" | "required" | "validation";
    /** For value changes: the source that won (see {@link ValueSource}). */
    source?: ValueSource;
    /** The previous derived value/flag (for diffing). */
    from?: unknown;
    /** The new derived value/flag. */
    to?: unknown;
    /**
     * The dependency keys that triggered this recompute (the upstream fields whose
     * change invalidated this one).
     */
    dependsOn?: readonly EntityKey[];
}
/**
 * The full trace of an evaluation cycle: the ordered steps plus the settlement
 * outcome. `settled` is `false` when the pass cap was hit without convergence
 * (also surfaced as a `settlement-not-reached` diagnostic).
 */
interface EvalTrace {
    /** Ordered steps across all passes of this evaluation cycle. */
    steps: readonly EvalTraceStep[];
    /** Number of settlement passes performed. */
    passCount: number;
    /** `true` when the cycle converged before hitting the pass cap. */
    settled: boolean;
}

/**
 * A tiny, dependency-free expression parser + evaluator — the engine's safe expression
 * language (arithmetic / comparison / boolean / ternary over field values by key). It replaces
 * the `expr-eval` dependency (which carried an unfixed high-severity prototype-pollution /
 * unrestricted-function advisory) with a purpose-built evaluator that is safe BY CONSTRUCTION:
 *
 *   - identifiers resolve ONLY to OWN-enumerable properties of the supplied scope — never via the
 *     prototype chain — so `constructor` / `__proto__` / `valueOf` / `toString` etc. are simply
 *     "undefined variable" (they throw, the wrapper fails open). No host value can ever leak.
 *   - there is NO member access (`a.b` / `a["b"]`), NO assignment, NO `this`, NO globals.
 *   - the only callable names are a fixed allow-list of PURE functions (below); any other call
 *     throws "undefined function".
 *
 * Grammar (precedence low→high): ternary `?:` · `or`/`||` · `and`/`&&` · `==`/`!=` ·
 * `<` `<=` `>` `>=` · `+` `-` · `*` `/` `%` · `^` (right-assoc) · unary `-` `+` `!`/`not` ·
 * call / literal / `( )`. Literals: number, string (`'…'`/`"…"`), `true`/`false`.
 *
 * The parser THROWS on a syntax error and the evaluator THROWS on an undefined variable/function
 * (matching the prior expr-eval contract); the security wrapper in `expression.ts` catches both
 * and fails open. This module never reads anything but its arguments.
 *
 * @packageDocumentation
 */
type ExprNode = {
    k: "lit";
    v: number | string | boolean;
} | {
    k: "var";
    name: string;
} | {
    k: "unary";
    op: string;
    arg: ExprNode;
} | {
    k: "bin";
    op: string;
    l: ExprNode;
    r: ExprNode;
} | {
    k: "logical";
    op: "and" | "or";
    l: ExprNode;
    r: ExprNode;
} | {
    k: "ternary";
    cond: ExprNode;
    then: ExprNode;
    else: ExprNode;
} | {
    k: "call";
    name: string;
    args: ExprNode[];
} | {
    k: "array";
    items: ExprNode[];
};

/**
 * The safe expression sandbox.
 *
 * Lukeflow form rules (`calculateValue`, `customConditional`, `customValidation`,
 * `customDefaultValue`, `logic[].when` / `.value`) are authored as small
 * arithmetic/boolean expressions that reference field values BY KEY, e.g.
 * `price * quantity` or `age >= 18 and country == "US"`. They are evaluated by the
 * engine's OWN {@link import("./exprParser") parser/evaluator} (`exprParser.ts`) — a
 * sandboxed expression language, NOT JavaScript `eval`, and NOT a third-party dependency:
 * no property write, no member access, no prototype access, no host call-out. Identifiers
 * resolve only to OWN scope properties, so an expression can never reach `constructor` /
 * `__proto__` on a scope value. (This replaced the `expr-eval` dependency, which carried an
 * unfixed prototype-pollution / unrestricted-function advisory — see docs/SECURITY.md.)
 *
 * Two concerns live here, and only here, so the rest of the engine never touches the
 * parser directly:
 *
 *   1. STATIC ANALYSIS — {@link parseExpression} compiles an expression once and, on
 *      success, exposes the field KEYS it references via {@link CompiledExpression.variables}
 *      (an AST walk that excludes literals and built-in function names). The dependency
 *      graph is built from these, NOT from a regex.
 *
 *   2. RUNTIME EVALUATION — {@link evaluateExpression} runs a compiled (or raw) expression
 *      against a value-by-key scope. Evaluation is deliberately FAIL-OPEN: a parse or runtime
 *      error returns `undefined` (the caller then shows the field / treats validation as
 *      passing / no-ops a calculate) so a typo can never blank a field or wedge a submit. The
 *      failure is surfaced to the caller as a structured outcome (never thrown, never logged
 *      here) so the engine can record it as an `expr-runtime-error` diagnostic.
 *
 * @packageDocumentation
 */

/**
 * The values-by-KEY map an expression reads. Every keyed field's coerced value is
 * exposed here under its key; expressions reference these names directly.
 */
type Scope = Record<string, unknown>;
/**
 * A successfully-parsed expression plus the field KEYS it references. The keys come from a real
 * AST walk ({@link import("./exprParser").variablesOf}) which excludes literals and built-in
 * function names — so `floor(price) * qty` yields exactly `["price", "qty"]`.
 */
interface CompiledExpression {
    /** The original (trimmed) source. */
    readonly source: string;
    /** The compiled AST, ready to {@link evaluateCompiled}. */
    readonly ast: ExprNode;
    /** The referenced field keys, de-duplicated, in first-seen order. */
    readonly variables: readonly string[];
}
/**
 * The outcome of compiling an expression. A blank/whitespace-only source is
 * `{ ok: true, expression: null }` (an absent rule, not an error); a real syntax
 * error is `{ ok: false }` with the parser's message, which the caller maps to an
 * `expr-parse-error` diagnostic. Never throws.
 */
type ParseResult = {
    ok: true;
    expression: CompiledExpression | null;
} | {
    ok: false;
    error: string;
};
/**
 * The outcome of evaluating an expression. `ok: false` carries the runtime error
 * message (mapped by the caller to `expr-runtime-error`); callers that want
 * fail-open semantics use {@link evaluateExpression}, which collapses the error to
 * `undefined`. Never throws.
 */
type EvalResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: string;
};
/**
 * `true` if the raw expression references any {@link HOSTILE_IDENTIFIERS} token. We
 * scan the RAW SOURCE (not the AST `variables()`, which returns `[]` for exactly
 * these names — they are invisible to any allow-listing built on the dep graph). The
 * single chokepoint every runtime evaluator routes through, so `calculateValue`,
 * `customConditional`, `logic`, `customDefaultValue` AND `customValidation` are
 * uniformly protected.
 */
declare function hasHostileIdentifier(expr: string): boolean;
/**
 * Compile an expression string, extracting the field KEYS it references. Tolerant
 * and total:
 *
 * - Empty / whitespace-only (or non-string) input → `{ ok: true, expression: null }`
 *   — an absent rule contributes no dependencies and is not an error.
 * - A syntax error → `{ ok: false, error }` (the caller emits `expr-parse-error`).
 * - Otherwise → `{ ok: true, expression }` with `expression.variables` populated.
 *
 * Variable extraction is a real AST walk (NOT a regex), so it correctly ignores string
 * literals, keywords, and built-in functions/constants.
 *
 * TOTALITY: this never throws. A pathologically large/deep expression (e.g. thousands of
 * nested terms) is rejected up front by {@link MAX_EXPRESSION_LENGTH}, and the AST walk is
 * defensively guarded — so a deep AST can never leak a `RangeError` (stack overflow) past
 * the fail-open boundary into a render/validate.
 */
declare function parseExpression(expr: unknown): ParseResult;
/**
 * The field KEYS an expression references, ignoring built-in functions/constants.
 * A convenience over {@link parseExpression} for the dependency graph: a blank or
 * un-parseable expression contributes no dependencies (empty array). The
 * parse-error itself is surfaced separately by the graph builder via
 * {@link parseExpression}, so swallowing it here only affects edge extraction.
 */
declare function expressionVariables(expr: unknown): string[];
/**
 * Evaluate an already-compiled expression against `scope`, returning a structured
 * result. Never throws; a runtime error becomes `{ ok: false, error }`.
 */
declare function evaluateCompiled(expr: CompiledExpression, scope: Scope): EvalResult;
/**
 * Parse + evaluate a raw expression string against `scope`, FAIL-OPEN: any parse
 * or runtime error (and a blank expression) yields `undefined`. This mirrors the
 * reference `evaluateExpression` semantics exactly, minus the global error sink
 * (the engine records failures as diagnostics through the structured variants
 * above rather than a module-level reporter, keeping this module pure).
 */
declare function evaluateExpression(expr: unknown, scope: Scope): unknown;

/**
 * Form.io-style JAVASCRIPT field logic — an optional, more powerful alternative to
 * the {@link import("./expression") expr-eval} sandbox for authors who need real
 * JS to express complex calculate / conditional / default / validation logic, e.g.
 *
 * ```js
 * value = data.quantity * data.price;            // calculateValueJs
 * show  = data.country === "US" && data.age > 18; // customConditionalJs
 * valid = input.length >= 3 ? true : "Too short"; // customValidationJs
 * ```
 *
 * The snippet reads other fields via `data.<key>` (and its own value via `value` /
 * `input`), and ASSIGNS its result to `value` (calc/default), `show` (conditional),
 * or `valid` (validation — `true`, `false`, or a string message). Grid rows expose
 * the current row as `row`.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SECURITY MODEL — READ THIS
 * ──────────────────────────────────────────────────────────────────────────────
 * This runs author-supplied JavaScript via the `Function` constructor. It is a
 * TRUSTED-AUTHOR feature, exactly like Form.io's custom JS: the people who BUILD
 * forms are trusted; the people who FILL them are not (end users never author JS).
 * We shadow the common host globals (window/globalThis/process/require/fetch/eval/
 * Function/…) so casual references resolve to `undefined`, and evaluation is
 * FAIL-OPEN (a throw yields the default — never blanks a field or wedges a submit).
 *
 * This is NOT a security boundary against a MALICIOUS author: raw JS can still reach
 * the realm via member-access tricks (`({}).constructor.constructor`). If your forms
 * can be authored by untrusted parties you have two stronger options:
 *   1. Disable JS logic entirely via the engine's `allowJs: false` option (then only the
 *      safe expr-eval sandbox runs) — simplest, if you don't need JS at all.
 *   2. Run author JS in a TRUE isolate by passing `EngineOptions.jsEvaluator` from
 *      `createQuickJsEvaluator()` (see {@link import("./quickjs").createQuickJsEvaluator},
 *      the `@lukeflow/form-core/quickjs` subpath) — a WebAssembly QuickJS VM with its own
 *      realm, memory cap, and execution deadline; member-access escapes can't reach the host.
 *
 * @packageDocumentation
 */
/**
 * A JS-logic evaluator. The built-in {@link evaluateJs} uses `Function` (trusted
 * author). Enterprises needing true isolation against UNTRUSTED authors can supply
 * their own — e.g. a QuickJS-wasm or Web-Worker sandbox — via `EngineOptions.jsEvaluator`,
 * keeping the same channels contract.
 */
type JsEvaluator = (code: string, scope: Record<string, unknown>, self?: unknown) => JsResult;
/** The outcome of evaluating a JS snippet: the three conventional result channels. */
interface JsResult {
    /** The `value` after the snippet ran (calc / default). */
    value: unknown;
    /** The `show` flag after the snippet ran (conditional; default `true`). */
    show: unknown;
    /** The `valid` result after the snippet ran (validation; `true`/`false`/message). */
    valid: unknown;
    /** `false` when the snippet threw (the channels then hold their defaults). */
    ok: boolean;
    /** The thrown message when `ok` is `false`. */
    error?: string;
}
/**
 * Evaluate a JS snippet against `scope` (exposed as `data`), with the field's own
 * value as `value`/`input` and an optional grid `row`. FAIL-OPEN: any throw returns
 * the defaults with `ok: false` and the error message. Pure aside from the internal
 * compile cache.
 */
declare function evaluateJs(code: string, scope: Record<string, unknown>, self?: unknown, row?: unknown): JsResult;
/**
 * Extract the field KEYS a JS snippet reads via `data.<key>` or `data["key"]`, so
 * the dependency graph can wire incremental recomputation for JS logic just like it
 * does for expr-eval. A static scan (regex) — it can't see fully-dynamic
 * `data[expr]` access, which simply won't create an edge (that field then settles on
 * the next full evaluate, never wrong, just not incrementally targeted).
 */
declare function extractDataRefs(code: string): string[];

/**
 * Standalone visibility + required resolution for a single field's attributes against a
 * scope — the shared primitives used for GRID CELL conditional logic (per-row), so the
 * engine's grid validation and the renderer agree on which cells are shown and which are
 * required. They mirror the evaluator's attribute-driven sources but omit `logic[]` rules,
 * which don't apply to grid cells. Fail-open: a broken expression SHOWS / falls back to
 * the static `required`.
 *
 * @packageDocumentation
 */

/**
 * Resolve whether a field is visible for `scope`. `allowJs` gates the JS variant; `jsEvaluator`
 * routes author `customConditionalJs` through a host-supplied isolate (e.g. `createQuickJsEvaluator()`)
 * — defaults to the built-in `evaluateJs`, so isolation reaches grid cells too, not just top-level fields.
 */
declare function evaluateVisibility(attributes: Record<string, unknown> | undefined, scope: Readonly<Record<string, unknown>>, opts?: {
    allowJs?: boolean;
    jsEvaluator?: JsEvaluator;
}): boolean;
/**
 * Resolve whether a field is REQUIRED for `scope`. A `requiredWhen` expression (evaluated
 * against the scope) overrides the static `required` — when truthy the field is required,
 * when falsy it is optional. This is the per-row required channel for grid cells (symmetric
 * with {@link evaluateVisibility}'s `customConditional`). Fail-safe: a missing/hostile/broken
 * expression falls back to the static `required` attribute, so a typo can't silently drop a
 * required check.
 */
declare function evaluateRequired(attributes: Record<string, unknown> | undefined, scope: Readonly<Record<string, unknown>>): boolean;

/**
 * The dependency graph's public data model: the {@link DependencySource} tag, a
 * directed {@link DependencyEdge}, a detected {@link DependencyCycle}, and the built
 * {@link DependencyGraph} itself. Split out of `dependencyGraph.ts`; re-exported
 * from there so existing import paths and the package barrel stay unchanged.
 *
 * @packageDocumentation
 */

/**
 * Which attribute an extracted dependency came from - useful for tracing and for
 * richer authoring diagnostics. Mirrors the expression-bearing attributes plus the
 * legacy literal conditional.
 */
type DependencySource = "calculateValue" | "customConditional" | "customValidation" | "customDefaultValue" | "logic.when" | "logic.value" | "conditional.when";
/**
 * One directed edge `from -> to`: the field keyed `to` reads the field keyed
 * `from`, so `from` must settle first. `via` records the attribute on the `to`
 * field that introduced the dependency.
 */
interface DependencyEdge {
    /** The depended-upon field key (settles first). */
    readonly from: string;
    /** The dependent field key (settles after `from`). */
    readonly to: string;
    /** The attribute on the `to` field that referenced `from`. */
    readonly via: DependencySource;
}
/**
 * A detected dependency cycle, as the ordered key path that closes the loop, e.g.
 * `["a", "b", "a"]` for `a -> b -> a`, or `["a", "a"]` for a self-reference. The
 * first and last entries are the same key. Surfaced both here and as a
 * `dependency-cycle` {@link Diagnostic} in {@link DependencyGraph.diagnostics}.
 */
interface DependencyCycle {
    /** The cycle path; `path[0] === path[path.length - 1]`. */
    readonly path: readonly string[];
}
/**
 * The built dependency graph for a schema.
 *
 * `keys` is the de-duplicated set of all field keys that participate (every keyed
 * field, plus any key referenced by an expression even if no such field exists -
 * a dangling reference, which the engine separately flags as `expr-unknown-ident`).
 *
 * `order` is a total topological order over `keys`: a field never appears before a
 * field it depends on, EXCEPT where a cycle makes that impossible, in which case
 * the cycle's members are emitted in deterministic tree order so evaluation stays
 * total (the engine resolves the remaining churn via bounded multi-pass
 * settlement). `hasCycle` / `cycles` report those loops.
 */
interface DependencyGraph {
    /** All participating field keys (keyed fields union referenced keys), tree-ordered. */
    readonly keys: readonly string[];
    /** Every directed dependency edge `from -> to`. */
    readonly edges: readonly DependencyEdge[];
    /**
     * `dependents.get(k)` = the keys that read `k` (the heads of edges out of `k`).
     * Drives incremental invalidation: editing `k` dirties exactly these (transitively).
     */
    readonly dependents: ReadonlyMap<string, readonly string[]>;
    /**
     * `dependencies.get(k)` = the keys `k` reads (the tails of edges into `k`).
     */
    readonly dependencies: ReadonlyMap<string, readonly string[]>;
    /** A total settlement order over {@link keys} (see the type docs for cycle handling). */
    readonly order: readonly string[];
    /** `true` iff any dependency cycle (including a self-reference) was found. */
    readonly hasCycle: boolean;
    /** Every detected cycle, as a closed key path. */
    readonly cycles: readonly DependencyCycle[];
    /**
     * Static-analysis diagnostics: a `dependency-cycle` per cycle, and an
     * `expr-parse-error` per expression that failed to parse (so a typo'd rule is
     * detectable at build time, not silently dropped from the graph).
     */
    readonly diagnostics: readonly Diagnostic[];
}

/**
 * The dependency graph - the static analysis that turns a {@link FormSchema} into
 * the order in which fields must be (re)derived.
 *
 * Every field can derive its value/visibility/required-ness/validity from OTHER
 * fields, through expression-bearing attributes:
 *
 *   - `calculateValue`      - value expression.
 *   - `customConditional`   - visibility expression.
 *   - `customValidation`    - validity expression.
 *   - `customDefaultValue`  - init-value expression.
 *   - `logic[].when`        - each logic rule's gate expression.
 *   - `logic[].value`       - each `setValue` rule's value expression.
 *   - `conditional.when`    - the legacy literal "show when <when> == <eq>"
 *                             rule references a single key directly.
 *
 * For each field B we collect the field KEYS those expressions reference (via the
 * real expr-eval AST walk in {@link expressionVariables} - NOT a regex). A
 * reference from B to A's key means "B depends on A", which we record as a
 * directed edge `A -> B` (A must be settled before B). The engine then:
 *
 *   1. topologically sorts the nodes so each field is derived after its
 *      dependencies, and
 *   2. detects dependency CYCLES (including self-references) - a calc/logic loop
 *      that can't be resolved by a single sweep - reporting each as a
 *      `dependency-cycle` {@link Diagnostic} that names the offending key path.
 *
 * The result is layout-order-independent: the edges depend only on which fields
 * reference which, never on the order entities appear in the schema. Output
 * orderings are made deterministic by breaking ties in TREE order (the schema's
 * {@link orderedIds} traversal), so the same schema always yields the same plan.
 *
 * Pure, tolerant (never throws on malformed input), Coltor-/React-/DOM-free.
 *
 * This module is the GRAPH-CONSTRUCTION orchestrator; its cohesive pieces live in
 * sibling modules and are re-exported here so existing import paths and the package
 * barrel keep resolving unchanged:
 *
 *   dependencyGraphTypes — DependencySource/DependencyEdge/DependencyCycle/Graph.
 *   dependencyExtraction — entityExpressions + the self-value identifier guard.
 *   dependencyTopoSort   — Kahn's algorithm, cycle finding, adjacency freezing.
 *
 * @packageDocumentation
 */

/**
 * Build the {@link DependencyGraph} for a schema.
 *
 * Walks every keyed field, extracts the keys each of its expressions references,
 * and records an edge `referenced -> field`. Then computes a deterministic
 * topological order (Kahn's algorithm with tree-order tie-breaking) and detects
 * cycles. Pure and total - malformed entities/attributes are skipped, never thrown
 * on.
 *
 * @param schema - the parsed (ideally key-normalized) form definition.
 */
declare function buildDependencyGraph(schema: FormSchema): DependencyGraph;

/**
 * The evaluator's data model and source-precedence ladder: the working
 * {@link EvalField} record, the static {@link EvalModel}/{@link EvalNode}, the
 * {@link EvaluatorOptions} tuning, the {@link SettlementResult} outcome, the
 * {@link DEFAULT_MAX_PASSES} cap and the {@link sourcePriority} gate. Split out of
 * `evaluator.ts`; re-exported from there so existing import paths are unchanged.
 *
 * @packageDocumentation
 */

/** Numeric precedence of a {@link ValueSource} (higher overrides lower). */
declare function sourcePriority(source: ValueSource): number;
/**
 * One field's live, evaluator-owned state. This is the mutable working record the
 * evaluator settles; the {@link import("./FormEngine").FormEngine} maps it onto the
 * public read-only {@link import("./types").FieldState}.
 */
interface EvalField {
    /** The entity id (stable identity). */
    readonly entityId: string;
    /** The field's KEY (its name in scope). */
    readonly key: string;
    /** The field-type behavior, or `undefined` for an unknown/value-less type. */
    readonly fieldType: FieldType | undefined;
    /** The current bound value, coerced to the field-type's value type. */
    value: unknown;
    /** The source that last wrote {@link value}. */
    source: ValueSource;
    /**
     * `true` once a `user` edit has pinned the field against recalculation (only set
     * when the field has `allowCalculateOverride`). Cleared by `clearOnHide`.
     */
    pinned: boolean;
    /** Resolved visibility after logic show/hide, `hidden`, conditional, customConditional. */
    isVisible: boolean;
    /** Resolved disabled state after logic enable/disable and `disabled`. */
    isDisabled: boolean;
    /** Resolved required state after logic require/optional and `required`. */
    isRequired: boolean;
}
/**
 * The static, schema-derived inputs the evaluator needs. Built once per schema (the
 * {@link FormEngine} caches it); reused across every evaluate/incremental call.
 */
interface EvalModel {
    /** Keyed entities in tree order: `{ id, key, entity }`. */
    readonly nodes: readonly EvalNode[];
    /** The fields' keys, in dependency (topological) order. */
    readonly order: readonly string[];
    /** Key → node, for O(1) lookup. */
    readonly byKey: ReadonlyMap<string, EvalNode>;
    /** The dependency graph (downstream closure + topo order source). */
    readonly graph: DependencyGraph;
    /** The field-type registry. */
    readonly registry: FieldTypeRegistry;
    /**
     * For each grid container key, its ROW TEMPLATE: the keyed descendant fields that
     * make up one row. A grid's value is an array of per-row `{ cellKey: value }` maps;
     * these template nodes carry the field-type for coercing and the attributes for
     * validating each cell. Grid descendants are deliberately ABSENT from
     * {@link nodes}/{@link byKey} (they are not top-level scope fields).
     */
    readonly gridTemplates: ReadonlyMap<string, readonly EvalNode[]>;
}
/** A keyed entity plus its resolved scope KEY. */
interface EvalNode {
    readonly id: string;
    readonly key: string;
    readonly entity: SchemaEntity;
    readonly fieldType: FieldType | undefined;
}
/** Tuning for a settlement run. */
interface EvaluatorOptions {
    /** Hard cap on settlement passes (default {@link DEFAULT_MAX_PASSES}). */
    maxPasses?: number;
    /**
     * When `true`, record an {@link EvalTraceStep} for every derived change (value /
     * visibility / disabled / required) across all passes, returned on
     * {@link SettlementResult.trace}. Off by default — the hot settlement path does
     * zero trace work unless this is set.
     */
    trace?: boolean;
    /**
     * When `false`, Form.io-style JS attributes (`calculateValueJs` /
     * `customConditionalJs` / …) are IGNORED (only the safe expr-eval sandbox runs) —
     * the safety valve for forms authored by untrusted parties. Defaults to `true`.
     */
    allowJs?: boolean;
    /** Custom JS-logic evaluator (true-isolation sandbox); defaults to the built-in {@link evaluateJs}. */
    jsEvaluator?: JsEvaluator;
}
/** The default settlement pass cap — small, since real forms settle in 1–3 passes. */
declare const DEFAULT_MAX_PASSES = 10;
/**
 * The outcome of a settlement run: how many passes it took, whether it reached a
 * fixpoint, and the runtime diagnostics gathered (fail-open `expr-runtime-error`s
 * plus a `settlement-not-reached` when the cap was hit). The settled field map is
 * the `fields` argument, mutated in place.
 */
interface SettlementResult {
    /** Settlement passes performed (≥ 1 when any field exists). */
    passCount: number;
    /** `true` iff the run converged before the pass cap. */
    settled: boolean;
    /** Runtime diagnostics gathered this run (never thrown). */
    diagnostics: Diagnostic[];
    /**
     * The ordered {@link EvalTraceStep}s of this run, present only when
     * {@link EvaluatorOptions.trace} was set (otherwise `undefined`).
     */
    trace?: EvalTraceStep[];
}

/**
 * The evaluator's static model construction: {@link buildEvalModel} (schema +
 * dependency graph + registry → the topo-ordered {@link EvalModel}, with grid row
 * templates) and {@link seedFields} (a fresh working field map from a key → value
 * map). Pure; reads no live values. Split out of `evaluator.ts`.
 *
 * @packageDocumentation
 */

/**
 * Build the static {@link EvalModel} from a schema, its dependency graph and a
 * field-type registry. Pure; does not read or hold any values.
 *
 * Nodes are the KEYED entities in tree order. `order` is the graph's topological
 * order, restricted to keys that actually have a field node and suffixed with any
 * keyed node the graph omitted (defensive — keeps the order total over `nodes`).
 */
declare function buildEvalModel(schema: FormSchema, graph: DependencyGraph, registry: FieldTypeRegistry): EvalModel;
/**
 * Seed a fresh field map from an {@link EvalModel} and a `key → value` map. The
 * caller (the engine) has already applied seed/default/customDefault precedence
 * into `values`; here every field simply takes its coerced seeded value with the
 * given {@link ValueSource} (default `seed`). Layout/static/unknown-type fields are
 * still tracked (so visibility/flags resolve) but coerce through a pass-through.
 */
declare function seedFields(model: EvalModel, values: Readonly<Record<string, unknown>>, source?: ValueSource): Map<string, EvalField>;

/**
 * Field-type coercion helpers and small attribute/value utilities used across the
 * evaluator — total over a possibly-`undefined` {@link FieldType}, and the numeric-
 * aware {@link defaultSameValue} that suppresses settlement churn. Split out of
 * `evaluator.ts` as a cohesive, dependency-light unit; the evaluator re-exports the
 * public {@link defaultSameValue} from its original module path.
 *
 * @packageDocumentation
 */

/**
 * The built-in numeric-aware, shallow-array `sameValue`, ported from the reference
 * renderer. Treats numerically-equal primitives as equal so settlement is stable.
 */
declare function defaultSameValue(a: unknown, b: unknown): boolean;

/**
 * The evaluator — pure, deterministic resolution of the derived state of a form:
 * visibility, defaults, calculated values, logic actions (show/hide/enable/
 * disable/require/optional/setValue) and `clearOnHide`. It is the Coltor-free,
 * React-free, DOM-free re-implementation of the tangle of `useEffect`s in
 * `luke-consumer-ui/.../FormRenderer.tsx` (custom-default, calculate + logic
 * setValue, clearOnHide, visibility) as a pure state machine.
 *
 * This module is the SETTLEMENT ORCHESTRATOR; its cohesive pieces live in sibling
 * modules and are re-exported from here so existing `from "./evaluator"` imports and
 * the package barrel keep resolving unchanged:
 *
 *   evaluatorTypes      — EvalField/EvalModel/EvalNode/EvaluatorOptions/Settlement-
 *                         Result, the source-precedence ladder + DEFAULT_MAX_PASSES.
 *   evaluatorModel      — buildEvalModel + seedFields (static, value-free).
 *   evaluatorCoercion   — field-type coercion/empty/sameValue + small utilities.
 *   evaluatorExpression — null-proto scope + fail-open, sandboxed expression eval.
 *   evaluatorLogic      — logic-rule folding + visibility resolution.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * MODEL
 * ──────────────────────────────────────────────────────────────────────────────
 * The evaluator works over a flat set of FIELDS, one per keyed entity. Each field
 * holds its current value, its provenance (which {@link ValueSource} last wrote
 * it), and its resolved visibility/disabled/required flags. Values are addressed
 * by the entity's KEY (its scope name); the {@link DependencyGraph} (built from the
 * same schema) gives the topological order to derive them in, and the per-key
 * downstream closure used for incremental invalidation.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SETTLEMENT
 * ──────────────────────────────────────────────────────────────────────────────
 * Because a `calculateValue`/`logic.setValue` can read a field that a later field
 * in the same sweep just changed, ONE topological pass may not reach a fixpoint.
 * {@link evaluate} sweeps the topo order repeatedly until a pass makes no change
 * (quiescence) or a {@link EvaluatorOptions.maxPasses} cap is hit (oscillation),
 * the latter recorded as a `settlement-not-reached` diagnostic. Churn is gated by
 * the field-type's `compare`, so `2` vs `"2"` is not counted as a change and the
 * sweep stays stable.
 *
 * {@link evaluateIncremental} recomputes only the transitive downstream closure of
 * a set of changed keys (still in topological order, still multi-pass), so an
 * `update` does not re-derive the whole form. By construction the incremental
 * result equals the full {@link evaluate} for the same inputs.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * VALUE PRECEDENCE (low → high)
 * ──────────────────────────────────────────────────────────────────────────────
 *   seed < default < customDefault < calculate < logicSetValue < user
 *
 * - `default` / `customDefault` are init-only (applied by the engine before the
 *   first evaluate; `customDefault` only when the field is otherwise empty).
 * - `calculate` is continuous, but a `user` edit PINS the field against further
 *   recalculation when `allowCalculateOverride` is set.
 * - `logicSetValue` overrides `calculate` within a pass (matching the reference
 *   renderer, which runs setValue before calculate and lets the later write win),
 *   but never overrides a pinned `user` value.
 * - `clearOnHide` is orthogonal: a field that becomes non-visible is reset to its
 *   type empty (source `clearOnHide`) and UN-pinned, so it can recompute if shown
 *   again.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * RUNTIME SEMANTICS
 * ──────────────────────────────────────────────────────────────────────────────
 * Expression evaluation is FAIL-OPEN via the safe {@link evaluateExpression}
 * sandbox: a parse/runtime error makes a `customConditional` SHOW, a `logic.when`
 * NOT fire, and a `calculate`/`setValue`/`customDefault` NO-OP — never blanking a
 * field. The sandbox forbids member access, so `__proto__`/`constructor`/`Function`
 * /`process`/`globalThis` can never be reached and cause no prototype pollution.
 * Every runtime failure is recorded as an `expr-runtime-error` diagnostic.
 *
 * Pure: no React/DOM, no I/O, deterministic given its inputs. The evaluator never
 * mutates its input field map — it returns a fresh result.
 *
 * @packageDocumentation
 */

/**
 * Fully settle every field: derive visibility, disabled, required, calculated
 * values and logic actions in topological order, sweeping until a fixpoint or the
 * pass cap. Mutates `fields` in place and returns the run {@link SettlementResult}. Used
 * at init and after a bulk `setValues`.
 */
declare function evaluate(model: EvalModel, fields: Map<string, EvalField>, options?: EvaluatorOptions): SettlementResult;
/**
 * Incrementally re-settle only the transitive downstream closure of `changedKeys`
 * (the fields whose derivation could be affected), in topological order, with the
 * same bounded multi-pass settlement. The changed keys themselves are included so
 * their OWN visibility/flags refresh. Equivalent in result to a full
 * {@link evaluate} for the same field values — only cheaper.
 */
declare function evaluateIncremental(model: EvalModel, fields: Map<string, EvalField>, changedKeys: Iterable<string>, options?: EvaluatorOptions): SettlementResult;
/**
 * The transitive downstream closure of `seeds`: every key reachable by following
 * dependency edges (`dependents`) plus the seeds themselves. Determines which
 * fields an incremental recompute must revisit. Bounded by the key set, so it
 * terminates even on a cyclic graph.
 */
declare function downstreamClosure(model: EvalModel, seeds: Iterable<string>): Set<string>;

/**
 * Construction-time options for a {@link FormEngine}.
 */
interface EngineOptions {
    /**
     * Seed values keyed by field KEY (instance prefill + saved submission data).
     * Grid fields are seeded with an array of per-row key→value maps. Missing keys
     * fall back to `defaultValue`/`customDefaultValue`/empty.
     */
    initialValues?: FormData;
    /**
     * The field-type behavior registry. When omitted the engine uses its built-in
     * registry covering the standard Lukeflow/Form.io field set. Provide a custom
     * registry to add field types without forking the engine.
     */
    registry?: FieldTypeRegistry;
    /**
     * Hard cap on settlement passes per evaluation cycle (default ~10). Reaching it
     * emits a `settlement-not-reached` diagnostic and stops, leaving the
     * best-effort state in place.
     */
    maxPasses?: number;
    /**
     * When `true`, evaluation records an {@link EvalTrace} retrievable for the last
     * cycle. Off by default (tracing has a cost); enable in tests/debug.
     */
    trace?: boolean;
    /**
     * When `false`, Form.io-style JavaScript field logic (`calculateValueJs`,
     * `customConditionalJs`, `customDefaultValueJs`, `customValidationJs`) is IGNORED
     * and only the safe expr-eval sandbox runs. Defaults to `true`. Set `false` when
     * forms may be authored by untrusted parties — JS logic is a TRUSTED-AUTHOR feature
     * (it runs author code via `Function`; it is not a sandbox against a malicious author).
     */
    allowJs?: boolean;
    /**
     * A custom JS-logic evaluator for true isolation against UNTRUSTED authors (e.g. a
     * QuickJS-wasm or Web-Worker sandbox). When provided it replaces the built-in
     * `Function`-based `evaluateJs` everywhere JS logic runs. See `engine/js.ts`'s
     * {@link import("./js").JsEvaluator}.
     */
    jsEvaluator?: JsEvaluator;
    /**
     * Schema migrations run on {@link FormEngine.init} to bring an older stored schema
     * up to the current version before evaluation. See `schema/migrate.ts`.
     */
    migrations?: SchemaMigration[];
    /**
     * Resume a prior session from a {@link SerializedEngineState} (produced by
     * {@link FormEngine.serialize}). When present, its `initialValues` seed the form —
     * so the {@link FormEngine.reset} baseline and dirty-tracking match the ORIGINAL
     * pristine form — and its `touched` keys are then replayed from `values` as user
     * edits before a final settle, reproducing the live state exactly. Takes
     * precedence over {@link initialValues}.
     */
    restore?: SerializedEngineState;
}
/**
 * The result of a {@link FormEngine.validate} call: per-field results plus the
 * overall verdict and the submission payload assembled from currently-valid,
 * persistent, visible fields.
 */
interface ValidationReport {
    /** `true` iff every visible field passed. */
    ok: boolean;
    /** Only the FAILING results, in tree order (one per failing field). */
    errors: readonly ValidationResult[];
    /** The KEYS of the failing fields (convenience for per-field UI assertions). */
    errorKeys: readonly EntityKey[];
}
/**
 * The headless form engine. One instance owns one form instance's live state.
 *
 * Lifecycle: construct → {@link init} (builds the dependency graph and settles
 * initial state) → drive with {@link update}/{@link setValues} (each re-settles
 * incrementally) → {@link validate}/{@link collect} on submit. {@link serialize}
 * persists a resumable snapshot; {@link reset} restores initial values.
 *
 * Every method is synchronous, pure with respect to its arguments, and free of
 * side effects beyond mutating this instance's internal state. Returned objects
 * are read-only snapshots; callers must not mutate them.
 */
interface FormEngine {
    /**
     * Build the engine from a parsed {@link FormSchema}: validate structure (emitting
     * {@link Diagnostic}s, never throwing), normalize keys, construct the dependency
     * graph and topological order, seed values (precedence: seed → default →
     * customDefault), then run a full {@link evaluate} to settle initial visibility /
     * disabled / required / calculated values. Returns `this` for chaining.
     *
     * Idempotent: re-`init`-ing with the same schema yields the same state.
     *
     * @param schema - the parsed form definition.
     * @param options - seed values, registry, pass cap, tracing. See {@link EngineOptions}.
     */
    init(schema: FormSchema, options?: EngineOptions): FormEngine;
    /**
     * Apply a single user edit to one field (addressed by KEY), mark it `touched`
     * and `dirty`, pin it against recalculation when override is allowed, then
     * INCREMENTALLY re-settle only the changed field's transitive dependents and
     * re-validate the fields whose value/visibility changed.
     *
     * Grid edits use a path key like `"rows[2].amount"` (engine-defined); see
     * {@link setValues} for bulk grid replacement.
     *
     * @param key - the field key (or grid path) to set.
     * @param value - the new value; coerced via the field-type's `coerce`.
     * @returns the resulting full {@link EngineState} snapshot.
     */
    update(key: EntityKey, value: unknown): EngineState;
    /**
     * Replace multiple values at once (e.g. prefill, autosave restore, programmatic
     * "test the form" playback). Unlike {@link update}, values set here are NOT
     * marked `touched`/pinned by default — they behave like a fresh seed — and a
     * full {@link evaluate} re-settles the form afterward.
     *
     * @param values - partial map of field KEY → value to apply over the current state.
     * @param options - `{ markTouched }` to treat these as user edits instead of seeds.
     * @returns the resulting full {@link EngineState} snapshot.
     */
    setValues(values: FormData, options?: {
        markTouched?: boolean;
    }): EngineState;
    /**
     * Run a FULL settlement: topologically re-derive every field's value
     * (default/customDefault/calculate/logic.setValue per precedence), visibility,
     * disabled and required flags via bounded multi-pass settlement, applying
     * `clearOnHide`. Does NOT run value validation (that is {@link validate}).
     * Called automatically by {@link init} and {@link setValues}; exposed for
     * explicit re-evaluation and testing.
     *
     * @returns the resulting full {@link EngineState} snapshot.
     */
    evaluate(): EngineState;
    /**
     * Validate field VALUES against their rules (required, length/range, pattern,
     * email/url, date/time bounds, selection/tag/row/file counts, and
     * `customValidation`). Only VISIBLE fields are validated (hidden fields can't
     * block a submit), matching the reference renderer. Stores each result on the
     * corresponding {@link FieldState.error} and updates {@link EngineState.isValid}.
     *
     * @param fields - optional subset of field KEYS to validate; omit to validate all visible fields.
     * @returns a {@link ValidationReport} (ok flag + failing results + failing keys).
     */
    validate(fields?: readonly EntityKey[]): ValidationReport;
    /**
     * The current expression scope: every keyed field's coerced value by KEY (grids
     * expose their row array). This is exactly what expressions and validators read.
     * A read-only snapshot — does not reflect later mutations.
     */
    getScope(): Readonly<Record<string, unknown>>;
    /**
     * The current full {@link EngineState} (per-field {@link FieldState}, scope, and
     * engine-level flags). A read-only snapshot.
     */
    getState(): EngineState;
    /**
     * The derived state of a single field by KEY, or `undefined` for an unknown /
     * value-less (layout/static) key.
     */
    getField(key: EntityKey): FieldState | undefined;
    /**
     * All diagnostics accumulated so far — schema-integrity problems from
     * {@link init} plus any runtime `expr-runtime-error` /
     * `settlement-not-reached` emitted during evaluation. As a
     * {@link DiagnosticReport} with derived `hasErrors`/`hasWarnings`.
     */
    getDiagnostics(): DiagnosticReport;
    /**
     * The {@link EvalTrace} of the most recent evaluation cycle, or `undefined` when
     * tracing wasn't enabled ({@link EngineOptions.trace}).
     */
    getTrace(): EvalTrace | undefined;
    /**
     * Serialize a resumable snapshot of the live state — enough to reconstruct the
     * engine via {@link init} + restore. Includes current values, per-field
     * touched/dirty flags and value provenance, but NOT the schema (the caller
     * stores that separately). Plain JSON.
     */
    serialize(): SerializedEngineState;
    /**
     * Restore the engine to its INITIAL state: values reset to the seeded/default
     * values captured at {@link init}, all `touched`/`dirty`/`error` cleared, then a
     * full {@link evaluate}. Mirrors the renderer's reset button.
     *
     * @returns the resulting full {@link EngineState} snapshot.
     */
    reset(): EngineState;
    /**
     * Assemble the submission payload keyed by field KEY, from VISIBLE,
     * persistent (`persistent !== false`) fields, with grids emitting an array of
     * per-row key→value maps (matching the reference renderer's `collect`). Does not
     * validate — call {@link validate} first when gating a submit.
     *
     * @returns the {@link FormData} payload.
     */
    collect(): FormData;
}
/**
 * The JSON-serializable snapshot produced by {@link FormEngine.serialize} and
 * accepted when resuming. Deliberately schema-free: pair it with the stored
 * {@link FormSchema} to rebuild the engine.
 */
interface SerializedEngineState {
    /** Snapshot format version, for forward migration. */
    version: 1;
    /** Current values by field KEY (grids as row arrays). */
    values: FormData;
    /** The initial/seeded values, so {@link FormEngine.reset} works after a resume. */
    initialValues: FormData;
    /** Field KEYS the user has touched (drives override pinning). */
    touched: readonly EntityKey[];
    /** Diagnostics carried alongside the snapshot (advisory). */
    diagnostics?: readonly Diagnostic[];
}
/**
 * Factory signature for constructing an engine instance. The concrete
 * implementation (a class or closure) is provided later; consumers depend on this
 * type, not the implementation.
 *
 * @example
 * ```ts
 * const engine = createFormEngine().init(schema, { initialValues });
 * engine.update("country", "US");
 * const { ok, errors } = engine.validate();
 * if (ok) submit(engine.collect());
 * ```
 */
type CreateFormEngine = (options?: EngineOptions) => FormEngine;

/**
 * {@link createFormEngine} — the concrete implementation of the headless
 * {@link FormEngine} interface. It is the orchestration layer that ties the
 * already-pure building blocks together behind one stateful object:
 *
 *   schema/repair   → structural repair + key normalization (load any draft safely)
 *   schema/validate → integrity diagnostics (never thrown)
 *   dependencyGraph → the topological settle order + cycle detection
 *   evaluator       → bounded multi-pass settlement (visibility/value/logic/clearOnHide)
 *   validation      → per-field value checking (built-ins + customValidation)
 *   fieldTypes      → the built-in field-type registry (coerce/empty/compare)
 *
 * The engine owns exactly one form instance's live state. It performs no I/O, holds
 * no React/DOM references, and is deterministic given its inputs — the React
 * adapter (`@lukeflow/form-react`) and the backend submission runtime both drive
 * THIS, so the evaluation semantics live in one tested place instead of being
 * re-derived per renderer.
 *
 * Value precedence, fail-open expression semantics, and settlement are all defined
 * by the {@link import("./evaluator")} module; this file only seeds init-time
 * values (seed → default → customDefault, which the evaluator deliberately leaves
 * to the engine) and maps the evaluator's working {@link EvalField}s onto the
 * public read-only {@link FieldState}s.
 *
 * @packageDocumentation
 */

/**
 * Construct a {@link FormEngine}. Call {@link FormEngine.init} with a parsed
 * {@link FormSchema} to load a form; before `init` the engine is inert (empty
 * state). Options passed here are defaults that {@link FormEngine.init} options
 * override.
 *
 * @example
 * ```ts
 * const engine = createFormEngine().init(schema, { initialValues });
 * engine.update("country", "US");
 * const { ok } = engine.validate();
 * if (ok) submit(engine.collect());
 * ```
 */
declare const createFormEngine: CreateFormEngine;

/**
 * The built-in field-type registry — the standard Lukeflow/Form.io field set's
 * value behavior (`coerce` / `empty` / `compare`, plus the container/grid/static
 * markers). This is what {@link import("./FormEngine").FormEngine} falls back to
 * when no custom {@link FieldTypeRegistry} is supplied.
 *
 * The engine itself is type-AGNOSTIC: every place it touches a value — seeding,
 * calculate/setValue writes, churn-gating, emptiness for `clearOnHide`, the
 * submission payload — routes through the {@link FieldType} found here. Adding a
 * field type is registering one entry, never editing the engine. An unknown
 * `type` simply resolves to `undefined` and the engine treats the node as an
 * opaque, pass-through value (and emits an `unknown-field-type` diagnostic).
 *
 * Coltor-free, React-free, DOM-free. Equality uses {@link defaultSameValue}, the
 * numeric-aware comparator ported from the reference renderer, so a calculated
 * `2` never churns against a typed `"2"`.
 *
 * @packageDocumentation
 */

/**
 * Build a fresh {@link FieldTypeRegistry} pre-loaded with the standard Lukeflow
 * field set. Returns a NEW map each call (callers may extend their own copy);
 * derive a custom registry by spreading this into a new `Map` and overriding or
 * adding entries.
 */
declare function createDefaultFieldTypeRegistry(): FieldTypeRegistry;
/**
 * A shared, process-wide default field-type registry. Read-only in practice — to
 * customize, build your own via {@link createDefaultFieldTypeRegistry} and mutate
 * that copy, then pass it as `EngineOptions.registry`.
 */
declare const defaultFieldTypeRegistry: FieldTypeRegistry;

/**
 * Secure data-source contract — the "Minions" integration. A field can declare a
 * {@link DataSource} that fetches LIVE data (e.g. dependent-dropdown options, a
 * looked-up value) through a host-provided {@link MinionClient}. The crucial
 * property: the client's implementation is a SECURE PROXY — it authenticates and
 * authorizes the request SERVER-SIDE (inside the minions backend) so credentials and
 * access rules never reach the browser. The form only names an operation (`minion`)
 * and maps some field values to its params; it never holds a token, a URL secret, or
 * authorization logic.
 *
 * This module is the pure, framework-free CONTRACT + helpers (read the declaration,
 * resolve its params from the live scope, shape a response into options). The React
 * wiring (provider + fetch hook + option population) lives in `@lukeflow/form-react`.
 *
 * @packageDocumentation
 */
/** When the data source fetches: once on load, or whenever its params change. */
type DataSourceTrigger = "load" | "change";
/**
 * A field's live data binding. `params` maps a REQUEST parameter name to the FIELD
 * KEY whose value supplies it (so a dependent dropdown re-fetches as upstream fields
 * change). For option-bearing fields, `resultPath`/`labelPath`/`valuePath` shape the
 * response into `{label,value}` options.
 */
interface DataSource {
    /** The minion OPERATION name; the secure backend resolves it to an authorized call. */
    minion: string;
    /** Request-param name → field KEY supplying its value. */
    params?: Record<string, string>;
    /** Dot-path to the array within the response (when not the response itself). */
    resultPath?: string;
    /** Dot-path to each item's label (defaults to the item stringified). */
    labelPath?: string;
    /** Dot-path to each item's value (defaults to the item stringified). */
    valuePath?: string;
    /** Fetch timing. Defaults to `load`. */
    trigger?: DataSourceTrigger;
}
/**
 * The host-provided secure client. Its implementation is where ALL auth/authz lives
 * (a server-side proxy / the minions backend); the engine and renderer only ever
 * call `request`. Credential-free by contract.
 */
interface MinionClient {
    /**
     * Perform an authorized minion call. Resolves with the raw response; rejects on
     * transport/authorization failure. `signal` lets callers cancel a stale fetch.
     */
    request(minion: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
}
/** A resolved selectable option. */
interface MinionOption {
    label: string;
    value: string;
}
/** Read and validate a field's `dataSource` attribute, or `null` when absent/invalid. */
declare function readDataSource(attributes: Record<string, unknown> | undefined): DataSource | null;
/** Build the request params by reading each mapped field KEY from the live scope. */
declare function resolveMinionParams(ds: DataSource, scope: Readonly<Record<string, unknown>>): Record<string, unknown>;
/** Shape a minion response into `{label,value}` options per the data source's paths. */
declare function toOptions(result: unknown, ds: DataSource): MinionOption[];
/**
 * Async (server-side) validation for a field — e.g. a uniqueness/availability check
 * that must hit the backend. Like {@link DataSource}, it names a minion operation and
 * maps field values to params; the field's own value is always sent as `value`.
 */
interface AsyncValidation {
    /** The minion operation that performs the check. */
    minion: string;
    /** Extra request params: param name → field KEY. */
    params?: Record<string, string>;
    /** Default failure message (the response may override it). */
    message?: string;
}
/** Read and validate a field's `asyncValidation` attribute, or `null`. */
declare function readAsyncValidation(attributes: Record<string, unknown> | undefined): AsyncValidation | null;
/**
 * Run an async validation via the secure {@link MinionClient}. Sends the mapped
 * params plus the field's `value`; interprets the response as `{ valid, message? }`
 * (or a bare truthy/falsy). Returns the verdict; the caller decides fail-open vs
 * fail-closed on a rejected request.
 */
declare function runAsyncValidation(av: AsyncValidation, scope: Readonly<Record<string, unknown>>, value: unknown, client: MinionClient, signal?: AbortSignal): Promise<{
    valid: boolean;
    message?: string;
}>;
/** Read a dot-path (`a.b.c`) from a nested object, or `undefined`. */
declare function getPath(obj: unknown, path: string): unknown;

/**
 * Render a form SUBMISSION to a clean, self-contained, printable HTML document
 * (label → value), suitable for printing or "Save as PDF". Pure and DOM-free — it
 * produces a string; the React side (`printSubmission` in `@lukeflow/form-react`)
 * opens it in a print window. Walks the schema tree for labels/order, reads values
 * from the collected `data`, renders grids as tables, and skips static/value-less
 * nodes. All text is HTML-escaped.
 *
 * @packageDocumentation
 */

interface PrintOptions {
    /** Document title / heading (default "Form Submission"). */
    title?: string;
    /** Field-type registry (defaults to the standard set). */
    registry?: FieldTypeRegistry;
    /** Optional translator for labels (e.g. the i18n `t`). */
    t?: (text: string) => string;
}
/** Render the submission to a complete printable HTML document string. */
declare function toPrintableHtml(schema: FormSchema, data: FormData, options?: PrintOptions): string;

/**
 * Headless builder operations — the pure, framework-free schema-mutation layer the
 * (React) form builder is built on. Every function takes a {@link FormSchema} and
 * returns a NEW one (immutable; the input is never mutated), so a builder UI can
 * treat these as reducer-style transitions and get undo/redo for free.
 *
 * Each operation is TOTAL: an invalid target (missing parent, out-of-range index,
 * moving a node into its own descendant) degrades to a best-effort no-op rather than
 * throwing — matching the engine's tolerant contract. Structural integrity
 * (parent/child agreement, no dangling refs, single-parent) is re-established after
 * every structural change via {@link repairSchema}, and key uniqueness/validity is
 * enforced on insert / duplicate / key-edit via the shared key helpers — so the
 * builder can never produce a schema the engine would choke on.
 *
 * Coltor-free, React-free, DOM-free.
 *
 * @packageDocumentation
 */

/** Where to place an entity: under a `parentId` container (or root when null), at `index`. */
interface InsertTarget {
    /** The container to insert into; `null`/absent = the form root. */
    parentId?: string | null;
    /** Position among siblings; out-of-range or absent = append at the end. */
    index?: number;
}
/** Generate a fresh entity id (crypto UUID when available, else a unique fallback). */
declare function defaultIdGen(): string;
/**
 * Build a new {@link SchemaEntity} of `type` with a provisional key (the explicit
 * `attributes.key`, else derived from the label/type). Uniqueness is finalized by
 * {@link insert}; this just mints the node.
 */
declare function createEntity(type: string, attributes?: Partial<EntityAttributes>, idgen?: () => string): SchemaEntity;
/** Insert an entity into the schema at a target (key made unique; structure repaired). */
declare function insert(schema: FormSchema, entity: SchemaEntity, target?: InsertTarget): FormSchema;
/** Remove an entity AND its entire subtree, unlinking it from its parent/root. */
declare function remove(schema: FormSchema, id: string): FormSchema;
/** Relocate an entity (with its subtree) under a new parent/index. No-op for cycles. */
declare function move(schema: FormSchema, id: string, target: InsertTarget): FormSchema;
/** Deep-clone an entity's subtree (fresh ids + unique keys) right after the original. */
declare function duplicate(schema: FormSchema, id: string, idgen?: () => string): FormSchema;
/** Reorder a node within its sibling list (root when `parentId` is null). */
declare function reorder(schema: FormSchema, parentId: string | null, fromIndex: number, toIndex: number): FormSchema;
/** Merge an attribute patch into an entity; a `key` change is sanitized + made unique. */
declare function updateAttributes(schema: FormSchema, id: string, patch: Partial<EntityAttributes>): FormSchema;
/** Merge a patch into form-level settings. */
declare function setSettings(schema: FormSchema, patch: Partial<FormSettings>): FormSchema;

/** @lukeflow/form-core — the headless Lukeflow form engine. */
declare const VERSION = "0.1.0-alpha.0";

export { type AsyncValidation, BUILTIN_RULES, CURRENT_SCHEMA_VERSION, type CompiledExpression, type Conditional, type CreateFormEngine, DEFAULT_MAX_PASSES, DEFAULT_MESSAGES, type DataSource, type DataSourceTrigger, type DependencyCycle, type DependencyEdge, type DependencyGraph, type DependencySource, type Diagnostic, type DiagnosticCode, type DiagnosticReport, type DiagnosticSeverity, type EngineOptions, type EngineState, type EntityAttributes, type EntityKey, type EvalField, type EvalModel, type EvalNode, type EvalResult, type EvalTrace, type EvalTraceStep, type EvaluatorOptions, type ExpressionDiagnosticCode, type ExpressionString, type FieldState, type FieldType, type FieldTypeRegistry, type FormData, type FormEngine, type FormSchema, type FormSettings, type InsertTarget, type JsEvaluator, type JsResult, KEY_RE, KEY_REGEX_SOURCE, type KeyDiagnosticCode, LOGIC_ACTIONS, type LogicAction, type LogicRule, type MigrationResult, type MinionClient, type MinionOption, type ParseResult, type PrintOptions, RESERVED_KEYS, type SchemaDiagnosticCode, type SchemaEntity, type SchemaMigration, type Scope, type SerializedEngineState, type SettlementResult, VERSION, type ValidationCode, type ValidationContext, type ValidationReport, type ValidationResult, type Validator, ValidatorRegistry, type ValidatorRule, type ValueComputed, type ValueSource, buildDependencyGraph, buildEvalModel, buildFieldValidators, camelCaseKeys, collectKeys, createDefaultFieldTypeRegistry, createDefaultRegistry, createEntity, createFormEngine, customValidationValidator, defaultFieldTypeRegistry, defaultIdGen, defaultRegistry, defaultSameValue, downstreamClosure, duplicate, duplicateKeyIds, emailRule, evaluate, evaluateCompiled, evaluateExpression, evaluateIncremental, evaluateJs, evaluateRequired, evaluateVisibility, expressionVariables, extractDataRefs, fail, getPath, hasBlockingProblems, hasHostileIdentifier, insert, interpolate, isAutoKey, isEmptyValue, isKeyed, isValidKey, keyOf, maxDateRule, maxFileSizeRule, maxFilesRule, maxLengthRule, maxRowsRule, maxRule, maxSelectedRule, maxTagsRule, maxTimeRule, maxWordsRule, migrateSchema, minDateRule, minFilesRule, minLengthRule, minRowsRule, minRule, minSelectedRule, minTagsRule, minTimeRule, minWordsRule, move, normalizeKeys, ok, orderedIds, parseExpression, patternRule, readAsyncValidation, readDataSource, readSettings, readSubmitMessage, registerValidator, remove, renderMessage, reorder, repairSchema, requiredRule, resolveMinionParams, runAsyncValidation, sanitizeKey, seedFields, setSettings, sourcePriority, toCamelKey, toOptions, toPrintableHtml, uniqueKey, updateAttributes, urlRule, validateSchema, validateSchemaReport, validateValue };
