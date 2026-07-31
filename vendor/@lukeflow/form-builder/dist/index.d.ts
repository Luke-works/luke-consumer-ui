import { FormSchema, Diagnostic, EntityAttributes, InsertTarget, FormSettings, SchemaEntity, FieldTypeRegistry, FormTemplate, FieldState } from '@lukeflow/form-core';
export { FieldTypeRegistry } from '@lukeflow/form-core';
import * as react from 'react';
import { ReactNode } from 'react';
import { FieldComponent } from '@lukeflow/form-react';
export { FieldComponent, FieldComponentProps } from '@lukeflow/form-react';

/**
 * `useFormBuilder` — the state controller for the form builder. It owns the working
 * {@link FormSchema}, the current selection, and an undo/redo history, and exposes
 * editing actions that delegate to the pure {@link operations} in
 * `@lukeflow/form-core`. Every action produces a new schema (immutably), pushes the
 * prior one onto the undo stack, and re-derives the schema's {@link Diagnostic}s so
 * the Problems panel is always in sync.
 *
 * No DOM here — this hook is the headless brain of the builder; the UI is a view of
 * it.
 *
 * @packageDocumentation
 */

interface UseFormBuilderResult {
    /** The current working schema. */
    schema: FormSchema;
    /** The selected entity id, or `null`. */
    selectedId: string | null;
    /** Schema integrity + key diagnostics for the Problems panel. */
    problems: readonly Diagnostic[];
    /** `true` when there are blocking (error-severity) problems. */
    hasErrors: boolean;
    /** Select an entity (or clear with `null`). */
    select: (id: string | null) => void;
    /** Create a field of `type` and insert it (selecting the new node). */
    addField: (type: string, attributes?: Partial<EntityAttributes>, target?: InsertTarget) => void;
    /** Create a container of `type` pre-seeded with `children`, in ONE undo step (e.g. Tabs
     *  with two starter tab panels). Selects the new container. */
    addFieldWithChildren: (type: string, attributes: Partial<EntityAttributes>, children: ReadonlyArray<{
        type: string;
        attributes?: Partial<EntityAttributes>;
    }>, target?: InsertTarget) => void;
    /** Remove an entity and its subtree. */
    removeField: (id: string) => void;
    /** Relocate an entity under a new parent/index. */
    moveField: (id: string, target: InsertTarget) => void;
    /** Duplicate an entity's subtree after the original. */
    duplicateField: (id: string) => void;
    /** Reorder within a sibling list (root when `parentId` is null). */
    reorderField: (parentId: string | null, fromIndex: number, toIndex: number) => void;
    /** Merge an attribute patch into an entity. */
    updateAttributes: (id: string, patch: Partial<EntityAttributes>) => void;
    /** Merge form-level settings. */
    setSettings: (patch: Partial<FormSettings>) => void;
    /** Replace the whole schema (e.g. load a draft). */
    setSchema: (schema: FormSchema) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}
declare function useFormBuilder(initialSchema?: FormSchema): UseFormBuilderResult;

interface PaletteItem {
    type: string;
    label: string;
    /** Seed attributes applied when this field is added (e.g. starter options). */
    defaults?: Record<string, unknown>;
}

/**
 * The attribute-editor framework — the declarative, pluggable model behind the
 * builder's tabbed settings panel.
 *
 * An {@link AttributeEditor} describes ONE control in the panel: which attribute it
 * reads/writes, which tab it lives under, what kind of control it is, and when it
 * applies (by field type and/or a live predicate). {@link defaultAttributeEditors}
 * is a comprehensive set covering the standard field set across the six tabs
 * (Display / Data / Validation / API / Conditional / Logic); a host extends or
 * overrides it via {@link mergeAttributeEditors} (the `attributeEditors` prop on
 * `<FormBuilder>`), so domain-specific attributes (rich-text, masks, currency
 * codes, signature pens …) live in the app without forking the package.
 *
 * This file is pure description — no React, no DOM. The rendering of each
 * {@link AttributeControl} (and the visual logic-rule builder) lives in
 * `SettingsPanel.tsx`.
 *
 * @packageDocumentation
 */

/** The fixed set of settings tabs, in display order. */
type AttributeTab = "display" | "settings" | "data" | "validation" | "api" | "conditional" | "logic";
/** Tab ids paired with their human labels, in render order. `settings` holds a field's
 *  STRUCTURAL config (layout containers' columns/borders/collapse/theme, a heading's size,
 *  a content block's HTML) — distinct from `data` (value/options) which layout types lack. */
declare const ATTRIBUTE_TABS: ReadonlyArray<{
    id: AttributeTab;
    label: string;
}>;
/**
 * The built-in control kinds. `logic` is the visual conditional-rule builder;
 * `options` is the choice-list editor; `expression`/`js` are the safe-expression
 * and trusted-JS code editors; `custom` defers entirely to the editor's `render`.
 */
type AttributeControl = "text" | "number" | "checkbox" | "textarea" | "select" | "options" | "tags" | "expression" | "js" | "logic" | "dataSource" | "asyncValidation" | "exclude" | "custom";
/** The runtime context handed to a custom editor `render` (and used internally by controls). */
interface AttributeEditorContext {
    /** The selected entity being edited. */
    entity: SchemaEntity;
    /** The whole working schema (for cross-field pickers / validation). */
    schema: FormSchema;
    /** Keys of OTHER value-bearing fields — for expression/logic field pickers. */
    fieldKeys: string[];
    /** Current value of `editor.attribute` (undefined when the editor has no `attribute`). */
    value: unknown;
    /** Patch this editor's `attribute` (no-op when the editor has no `attribute`). */
    setValue: (value: unknown) => void;
    /** Patch arbitrary attributes on the selected entity. */
    patch: (patch: Partial<EntityAttributes>) => void;
}
/**
 * A single editor in the settings panel. Declarative: the panel renders it by
 * `control` (or `render` for `custom`), filters it by `appliesTo`/`when`, places it
 * in `tab`, and orders it by `order`. `id` is the merge key — a host editor with the
 * same `id` replaces a default in place; a new `id` appends; `remove: true` drops a
 * default.
 */
interface AttributeEditor {
    /** Stable id; the merge key for {@link mergeAttributeEditors}. */
    id: string;
    /** Which tab this editor renders under. */
    tab: AttributeTab;
    /** The attribute key this editor reads/writes. Omit for attribute-less editors (`logic`, `custom`). */
    attribute?: string;
    /** Control label. */
    label?: string;
    /** Helper text shown beneath the control. */
    hint?: string;
    /** Placeholder for text/textarea/expression/js controls. */
    placeholder?: string;
    /** The control kind. */
    control: AttributeControl;
    /** Options for the `select` control. */
    options?: ReadonlyArray<{
        label: string;
        value: string;
    }>;
    /** Order within the tab (lower first). Default 100. */
    order?: number;
    /** Restrict to these entity types (omit = governed by `when`/applies to all). */
    appliesTo?: ReadonlyArray<string>;
    /** Live predicate gating visibility against the selected entity + schema. */
    when?: (entity: SchemaEntity, schema: FormSchema) => boolean;
    /** Fully custom renderer; when present it overrides `control`. */
    render?: (ctx: AttributeEditorContext) => ReactNode;
    /** Merge directive: drop the default editor with this id (used in the `attributeEditors` array form). */
    remove?: boolean;
}
/** A value-bearing field (anything the registry doesn't mark `valueType: "none"`). */
declare function isDataField(type: string): boolean;
/** A layout container (panel, page, grid …). */
declare function isContainerType(type: string): boolean;
/** A static / presentational node (heading, divider, button …). */
declare function isStaticType(type: string): boolean;
/**
 * The standard editor set. A host merges over this via {@link mergeAttributeEditors}.
 * Returns a NEW array each call so callers may mutate their copy freely.
 */
declare function createDefaultAttributeEditors(): AttributeEditor[];
/** A frozen reference copy of the default editors. */
declare const defaultAttributeEditors: ReadonlyArray<AttributeEditor>;
/** The shape a host passes to `<FormBuilder attributeEditors=…>`. */
type AttributeEditorsInput = ReadonlyArray<AttributeEditor> | ((defaults: AttributeEditor[]) => AttributeEditor[]);
/**
 * Merge host editors over the defaults. The function form gets the full default
 * list and returns the final list (total control). The array form merges by `id`:
 * a matching id REPLACES the default in place, a new id APPENDS, and `remove: true`
 * DROPS the default.
 */
declare function mergeAttributeEditors(defaults: AttributeEditor[], input?: AttributeEditorsInput): AttributeEditor[];
/** The editors that apply to `entity` (filtered by `appliesTo` + `when`). */
declare function editorsForEntity(editors: AttributeEditor[], entity: SchemaEntity, schema: FormSchema): AttributeEditor[];
/** Group applicable editors by tab (each tab sorted by `order`), preserving {@link ATTRIBUTE_TABS} order. */
declare function editorsByTab(editors: AttributeEditor[]): Array<{
    tab: AttributeTab;
    label: string;
    editors: AttributeEditor[];
}>;

/** One choice a host offers for every data variable. */
interface DataAnnotationOption {
    /** The value stored when this option is picked. */
    id: string;
    label: string;
    /** One line explaining what picking this means, shown under the label. */
    hint?: string;
}
/**
 * A host-defined per-variable choice, surfaced as a `+` beside each key and used to group the
 * field list. Lukeflow drives outbound fill roles through this.
 */
interface DataAnnotations {
    /** The question the picker asks, e.g. "Who provides it?". */
    title: string;
    /** The primary choices, in the order they should be offered AND grouped. */
    options: readonly DataAnnotationOption[];
    /**
     * An optional qualifier nested under one option. Ticking it stores `id` INSTEAD of `under`, so a
     * host whose model has three stored states can still present exactly two primary choices — which
     * is the point: a third top-level option would be a third thing to explain.
     */
    modifier?: {
        under: string;
        id: string;
        label: string;
        hint?: string;
    };
    /** The current stored value per field key (an option id, or the modifier's id). */
    value: Readonly<Record<string, string>>;
    /** Store a new value for a key. */
    onChange: (key: string, id: string) => void;
    /** Heading for fields with no answer yet (default "Not assigned"). */
    unassignedLabel?: string;
}
/** A row that is always in the payload regardless of the form's fields (host-supplied). */
interface DataMetadataRow {
    key: string;
    typeLabel: string;
    description: string;
}
interface DataStructureViewProps {
    /** The schema to describe (the live working schema). */
    schema: FormSchema;
    /** Field-type registry (defaults to the standard set) — must match the builder's. */
    registry?: FieldTypeRegistry;
    /** Called with an entity id when a field key is clicked (e.g. jump to it on the canvas). */
    onSelect?: (entityId: string) => void;
    /** Filename stem for the downloaded template (default "form"). */
    formName?: string;
    /**
     * Override the "Generate template" download with a custom encoder (e.g. a real
     * `.xlsx`). Receives the derived {@link FormTemplate} and the sanitized file stem.
     * When omitted, a CSV is downloaded.
     */
    onGenerateTemplate?: (template: FormTemplate, fileStem: string) => void;
    /** A per-variable choice offered beside each key; also groups the field list. */
    annotations?: DataAnnotations;
    /** Rows always recorded alongside the answers — shown as their own card. */
    metadata?: readonly DataMetadataRow[];
}
declare function DataStructureView({ schema, registry, onSelect, formName, onGenerateTemplate, annotations, metadata, }: DataStructureViewProps): react.JSX.Element;

interface FormBuilderProps {
    /** The schema to edit (uncontrolled — the builder owns it after mount). */
    initialSchema?: FormSchema;
    /** Notified after every edit with the current schema. */
    onChange?: (schema: FormSchema) => void;
    /** Extra palette entries for custom field types (paired with renderer `components`). */
    extraFields?: ReadonlyArray<PaletteItem>;
    /**
     * Custom field components by `type`, forwarded to BOTH the engine-backed canvas previews and
     * the live preview's {@link FormRenderer} — so a custom field added via
     * {@link FormBuilderProps.extraFields} renders with its real control everywhere in the builder,
     * not a fallback input. Pass the SAME map your app gives `<FormRenderer>` at runtime so the
     * builder matches what ships.
     *
     * Pass a STABLE reference (module constant or `useMemo`d), not a fresh object literal each
     * render — an unstable map churns the canvas previews and can remount your custom controls.
     */
    components?: Record<string, FieldComponent>;
    /** A custom field-type registry, forwarded to the canvas previews + live preview (defaults to the standard set). */
    registry?: FieldTypeRegistry;
    /**
     * Extend or override the settings panel's attribute editors. Array form merges by
     * `id` over the defaults (replace / append / `remove`); function form receives the
     * defaults and returns the final list. See {@link AttributeEditorsInput}.
     */
    attributeEditors?: AttributeEditorsInput;
    /**
     * Where the field settings live:
     * - `"panel"` (default): an inline third column (palette · canvas · settings).
     * - `"modal"`: a modal that opens on field-select — frees the third column for
     *   {@link FormBuilderProps.aside} (e.g. an AI-assist panel).
     */
    settings?: "panel" | "modal";
    /**
     * Content for the third column (only used with `settings="modal"`). The builder owns
     * the palette + canvas; the host fills this slot — e.g. an AI assistant tied to its
     * own backend. The host reads the live schema via {@link FormBuilderProps.onChange}.
     */
    aside?: ReactNode;
    /**
     * Hide the toolbar's built-in "Preview" button. Use when the host provides its own preview
     * affordance (e.g. in its own top bar) so the form isn't previewable from two places.
     */
    hidePreview?: boolean;
    /** Filename stem for the Data view's "Generate template" download (default "form"). */
    formName?: string;
    /**
     * Override the Data view's template download with a custom encoder (e.g. a real
     * `.xlsx`). Receives the derived {@link FormTemplate} and a sanitized file stem;
     * when omitted, a CSV is downloaded.
     */
    onGenerateTemplate?: (template: FormTemplate, fileStem: string) => void;
    /**
     * Hide the Design/Data toggle and stay on the canvas. For a form whose data contract tells the
     * author nothing they can act on — Lukeflow hides it on INBOUND forms, where every field is simply
     * filled by whoever opens the form and there is no second party to divide the data between.
     */
    hideDataView?: boolean;
    /** A host-defined choice offered against every data variable in the Data view. */
    dataAnnotations?: DataAnnotations;
    /** Rows always recorded alongside the answers, listed in the Data view. */
    dataMetadata?: readonly DataMetadataRow[];
    className?: string;
}
/** Imperative handle (via `ref`) for replacing the schema without a remount. */
interface FormBuilderHandle {
    /**
     * Replace the working schema — e.g. apply an AI-generated form — WITHOUT remounting
     * the builder, so the {@link FormBuilderProps.aside} (an AI panel + its chat) and the
     * undo history survive (the replace is itself undoable).
     */
    setSchema: (schema: FormSchema) => void;
    /** Read the current working schema. */
    getSchema: () => FormSchema;
}
declare const FormBuilder: react.ForwardRefExoticComponent<FormBuilderProps & react.RefAttributes<FormBuilderHandle>>;

interface SettingsPanelProps {
    builder: UseFormBuilderResult;
    /** The merged (defaults + host) editor list. */
    editors: AttributeEditor[];
}
declare function SettingsPanel({ builder, editors }: SettingsPanelProps): react.JSX.Element;

declare function NodePreview({ entity, field, components }: {
    entity: SchemaEntity;
    field?: FieldState;
    components?: Record<string, FieldComponent>;
}): react.JSX.Element | null;

/**
 * @lukeflow/form-builder — the reference React form builder for @lukeflow/form-core.
 *
 * {@link useFormBuilder} is the headless controller (schema state + undo/redo +
 * edit actions over the pure builder-core ops); {@link FormBuilder} is the complete
 * UI built on it (palette, canvas, tabbed settings, Problems, live preview). The
 * settings panel is driven by the declarative {@link AttributeEditor} framework —
 * extend or override {@link defaultAttributeEditors} via the `attributeEditors` prop.
 */
declare const VERSION = "0.1.0-alpha.0";

export { ATTRIBUTE_TABS, type AttributeControl, type AttributeEditor, type AttributeEditorContext, type AttributeEditorsInput, type AttributeTab, type DataAnnotationOption, type DataAnnotations, type DataMetadataRow, DataStructureView, type DataStructureViewProps, FormBuilder, type FormBuilderHandle, type FormBuilderProps, NodePreview, SettingsPanel, type SettingsPanelProps, type UseFormBuilderResult, VERSION, createDefaultAttributeEditors, defaultAttributeEditors, editorsByTab, editorsForEntity, isContainerType, isDataField, isStaticType, mergeAttributeEditors, useFormBuilder };
