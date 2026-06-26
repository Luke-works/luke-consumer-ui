import { EngineState, EntityKey, FieldState, FormData, ValidationReport, DiagnosticReport, FormEngine, FormSchema, EngineOptions, SchemaEntity, FieldTypeRegistry, SerializedEngineState, JsEvaluator, MinionOption, MinionClient, PrintOptions } from '@lukeflow/form-core';
import * as react from 'react';
import { ReactNode, Component, ErrorInfo } from 'react';

/**
 * `useFormEngine` — the React adapter over the headless {@link FormEngine}.
 *
 * The hook owns ONE engine instance for the life of a form (re-created only when the
 * `schema` identity changes), drives it imperatively, and re-renders by snapshotting
 * {@link FormEngine.getState} after every mutation. All evaluation — visibility,
 * calculate, logic, validation, settlement — happens in `@lukeflow/form-core`; this
 * file adds nothing but React glue, so the rendered behavior is exactly the engine's.
 *
 * @packageDocumentation
 */

/** The value returned by {@link useFormEngine}: the live snapshot plus bound actions. */
interface UseFormEngineResult {
    /** The latest {@link EngineState} snapshot (re-rendered on every mutation). */
    state: EngineState;
    /** The derived state of one field by KEY (or grid path), or `undefined`. */
    getField: (key: EntityKey) => FieldState | undefined;
    /** Apply a user edit to one field (KEY or `grid[row].cell` path) and re-render. */
    update: (key: EntityKey, value: unknown) => void;
    /** Replace multiple values at once (seeds by default; `markTouched` for user edits). */
    setValues: (values: FormData, options?: {
        markTouched?: boolean;
    }) => void;
    /** Validate (all visible fields, or a subset) and re-render; returns the report. */
    validate: (fields?: readonly EntityKey[]) => ValidationReport;
    /** Restore initial values and re-render. */
    reset: () => void;
    /** The submission payload from visible, persistent fields (does not validate). */
    collect: () => FormData;
    /** The current expression scope (values by key). */
    getScope: () => Readonly<Record<string, unknown>>;
    /** Accumulated schema + runtime diagnostics. */
    getDiagnostics: () => DiagnosticReport;
    /** Escape hatch to the underlying engine for advanced use. */
    engine: FormEngine;
}
/**
 * Create and drive a {@link FormEngine} for a schema. The engine is built once and
 * reused; passing a new `schema` object (identity change) rebuilds it. `options`
 * (initialValues / registry / maxPasses / trace / restore) are read at build time.
 */
declare function useFormEngine(schema: FormSchema, options?: EngineOptions): UseFormEngineResult;

/**
 * HTML sanitization for the static `content` / `html` field. Author-supplied HTML is
 * run through DOMPurify before it ever reaches `dangerouslySetInnerHTML`, so a form
 * authored by a LESS-trusted party can't inject `<script>` / `onerror=` / `javascript:`
 * XSS into every end user who fills the form.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * TRUST MODEL
 * ──────────────────────────────────────────────────────────────────────────────
 * Previously the content field rendered author HTML verbatim ("trusted author", like
 * Form.io's content component). That is safe only when form AUTHORS are fully trusted.
 * In a multi-tenant deployment where authors are not fully trusted, raw HTML is a
 * stored-XSS vector. Sanitizing by default closes it while keeping rich content working
 * (formatting, links, lists, tables, images — just not script/handlers/dangerous URLs).
 *
 * SSR: DOMPurify needs a DOM. In the browser that's the global `window`; under SSR there
 * is none, so `DOMPurify.isSupported` is `false` and `DOMPurify.sanitize()` would return
 * its INPUT UNCHANGED — which would emit unsanitized HTML into the server response. We
 * therefore fall back to escaping the markup to inert text server-side (never unsafe).
 * Hosts that need real HTML in the SSR pass can inject a DOM-backed sanitizer via
 * {@link import("../FormRenderer").FormRendererProps.sanitizeHtml}.
 *
 * @packageDocumentation
 */
/** Sanitize untrusted HTML into a safe HTML string for `dangerouslySetInnerHTML`. */
type SanitizeHtmlFn = (dirtyHtml: string) => string;
/**
 * The default sanitizer: DOMPurify with the standard HTML profile when a DOM is
 * available, escaping to inert text otherwise. Strips `<script>`, event-handler
 * attributes, `javascript:`/`data:` script URLs, and other XSS vectors while keeping
 * ordinary rich content. Pure and side-effect-free.
 */
declare const defaultSanitizeHtml: SanitizeHtmlFn;

/** A telemetry/observability event emitted by the renderer (see {@link FormRendererProps.onEvent}). */
interface FormTelemetryEvent {
    type: "submit" | "invalid" | "async-invalid" | "error";
    data?: FormData;
    errorKeys?: readonly string[];
    error?: Error;
}
interface FormRendererProps {
    /** The form definition to render. */
    schema: FormSchema;
    /** Seed values (instance prefill / saved submission). */
    initialValues?: FormData;
    /** Called with the collected payload on a VALID submit. */
    onSubmit?: (data: FormData) => void;
    /** Called after every field change with the current payload + engine state. */
    onChange?: (data: FormData, state: EngineState) => void;
    /** Render read-only (all controls disabled, no submit). */
    readOnly?: boolean;
    /** A custom field-type registry (defaults to the standard set). */
    registry?: FieldTypeRegistry;
    /** Custom field components by `type` — add new field types or override built-ins. */
    components?: Record<string, FieldComponent>;
    /** Resume a saved draft (a {@link FormRendererProps.onAutosave} snapshot). */
    restore?: SerializedEngineState;
    /** Called (debounced) with a resumable snapshot after edits — persist it as a draft. */
    onAutosave?: (snapshot: SerializedEngineState) => void;
    /** Autosave debounce in ms (default 800). */
    autosaveDelay?: number;
    /** Submit button label (omit the button entirely with `null`). */
    submitLabel?: string | null;
    /** Theme tokens applied as CSS custom properties on the form root, e.g. `{ "--lf-primary": "#0a7" }`. */
    theme?: Record<string, string>;
    /**
     * Sanitize author-supplied HTML for the `content`/`html` field. Defaults to DOMPurify
     * (browser) / escape (SSR). Override to plug a DOM-backed sanitizer for SSR or a custom
     * allow-list policy. See {@link import("./render/sanitizeHtml").defaultSanitizeHtml}.
     */
    sanitizeHtml?: SanitizeHtmlFn;
    /**
     * Run author JS logic (`calculateValueJs` / `customConditionalJs` / …)? Defaults to `true`.
     * Set `false` to disable every JS path (only the safe expr-eval sandbox runs) — the valve for
     * forms authored by untrusted parties when JS isn't needed.
     */
    allowJs?: boolean;
    /**
     * Isolate author JS through a host-supplied evaluator (e.g. `createQuickJsEvaluator()` from
     * `@lukeflow/form-core/quickjs`) instead of the built-in `Function` evaluator — for untrusted
     * authors. Applied to BOTH the engine and the renderer's per-row grid-cell conditional logic.
     */
    jsEvaluator?: JsEvaluator;
    /** Observability hook — fires on submit / sync-invalid / async-invalid / render error. */
    onEvent?: (event: FormTelemetryEvent) => void;
    /** Fallback shown if a field/component throws while rendering. */
    errorFallback?: ReactNode;
    /** Called after every validate-submit attempt with the outcome (the "Test the form" flow). */
    onResult?: (result: {
        ok: boolean;
        errorCount: number;
        errorKeys: readonly string[];
    }) => void;
    /** Bump to programmatically validate + submit (auto-test). */
    autoSubmitSignal?: number;
    /** Animated playback: type each step's value (in form order), then validate. Bump `signal` to (re)play. */
    playback?: {
        steps: ReadonlyArray<{
            key: string;
            value: unknown;
        }>;
        signal: number;
        speed?: number;
    };
    className?: string;
}
/**
 * Props a CUSTOM field control receives. Register one per `type` via
 * {@link FormRendererProps.components} to add a new field type — or override a
 * built-in — without forking the renderer. The renderer still owns the label /
 * description / error wrapper and a11y ids; the component renders just the control.
 */
interface FieldComponentProps {
    /** The schema entity (read `attributes` for type-specific config). */
    entity: SchemaEntity;
    /** The engine-derived field state (value, isVisible/Disabled/Required, error). */
    field: FieldState;
    /** The current value (same as `field.value`, for convenience). */
    value: unknown;
    /** Commit a new value (coerced + re-settled by the engine). */
    setValue: (value: unknown) => void;
    /** Whether the control should be disabled (engine disabled or read-only). */
    disabled: boolean;
    /** The shown error message, or `null`. */
    error: string | null;
    /** The element id to wire to the label (`htmlFor`) and aria attributes. */
    id: string;
}
/** A custom field control component. */
type FieldComponent = (props: FieldComponentProps) => ReactNode;
declare function FormRenderer(props: FormRendererProps): react.JSX.Element;

/**
 * `<FormErrorBoundary>` — contains render-time crashes (a buggy custom component, a
 * malformed field) so a single broken form never takes down the host app. Reports
 * the error via `onError` (wired to telemetry) and shows a fallback. The renderer
 * wraps its own output in this; hosts can also use it directly.
 *
 * @packageDocumentation
 */

interface FormErrorBoundaryProps {
    children: ReactNode;
    /** Shown instead of the children after a caught error. */
    fallback?: ReactNode;
    /** Called once when an error is caught (telemetry / logging). */
    onError?: (error: Error, info: ErrorInfo) => void;
}
declare class FormErrorBoundary extends Component<FormErrorBoundaryProps, {
    error: Error | null;
}> {
    state: {
        error: Error | null;
    };
    static getDerivedStateFromError(error: Error): {
        error: Error;
    };
    componentDidCatch(error: Error, info: ErrorInfo): void;
    render(): ReactNode;
}

/** Provide the secure {@link MinionClient} to all data-source-bound fields below it. */
declare function MinionProvider({ client, children }: {
    client: MinionClient;
    children: ReactNode;
}): react.JSX.Element;
/** The client from the nearest {@link MinionProvider}, or `null` when none is set. */
declare function useMinionClient(): MinionClient | null;
/** The live state of a field's data source. */
interface MinionDataState {
    /** Shaped `{label,value}` options (empty when the field has no data source). */
    options: MinionOption[];
    /** The raw response (for custom live-data fields). */
    data: unknown;
    loading: boolean;
    error: string | null;
}
/**
 * Fetch a field's live data (when it declares a `dataSource`) through the provider's
 * {@link MinionClient}. Re-fetches whenever the resolved request params change and
 * cancels the in-flight request on change/unmount. No-ops (returns idle) when the
 * field has no data source or no provider is mounted.
 */
declare function useMinionData(entity: SchemaEntity, scope: Readonly<Record<string, unknown>>): MinionDataState;

/** Translate a source string to the active locale (returns it unchanged by default). */
type TranslateFn = (text: string) => string;
declare function LocaleProvider({ messages, t, children, }: {
    messages?: Record<string, string>;
    t?: TranslateFn;
    children: ReactNode;
}): react.JSX.Element;
/** The active translate function from the nearest {@link LocaleProvider}. */
declare function useTranslate(): TranslateFn;

/**
 * `printSubmission` — open a form submission's printable HTML in a new window and
 * trigger the browser print dialog (which offers "Save as PDF"). Thin wrapper over
 * {@link toPrintableHtml} from `@lukeflow/form-core`; returns `false` if the window
 * was blocked (e.g. a popup blocker).
 *
 * @packageDocumentation
 */

declare function printSubmission(schema: FormSchema, data: FormData, options?: PrintOptions): boolean;

/**
 * @lukeflow/form-react — React adapter + reference renderer for @lukeflow/form-core.
 *
 * Two entry points: the {@link useFormEngine} hook (drive the headless engine from
 * React) and the {@link FormRenderer} component (a complete, a11y-wired reference
 * renderer built on that hook). Both are thin over `@lukeflow/form-core` — the form
 * behavior is the engine's, not re-implemented here.
 */
declare const VERSION = "0.1.0-alpha.0";

export { type FieldComponent, type FieldComponentProps, FormErrorBoundary, type FormErrorBoundaryProps, FormRenderer, type FormRendererProps, type FormTelemetryEvent, LocaleProvider, type MinionDataState, MinionProvider, type SanitizeHtmlFn, type TranslateFn, type UseFormEngineResult, VERSION, defaultSanitizeHtml, printSubmission, useFormEngine, useMinionClient, useMinionData, useTranslate };
