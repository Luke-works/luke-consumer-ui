import { Children, createContext, useContext, useState } from "react";
import { z } from "zod";
import DOMPurify from "dompurify";
import {
  createAttributeComponent,
  createEntityComponent,
} from "@coltorapps/builder-react";
import * as A from "./attributes";
import * as E from "./entities";
import FieldTooltip from "./FieldTooltip";
import RichTextEditor from "./RichTextEditor";

/* ------------------------------------------------------------------ */
/* Styling + small inputs                                              */
/* ------------------------------------------------------------------ */

const previewClass =
  "pointer-events-none h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-white/5";
const editorInputClass =
  "h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90";

function errorText(error: unknown): string | null {
  return error instanceof z.ZodError ? error.issues[0]?.message ?? null : null;
}

function Row({ label, error, children }: { label?: string; error?: unknown; children: React.ReactNode }) {
  const msg = errorText(error);
  return (
    <div className="mb-4">
      {label ? (
        <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      ) : null}
      {children}
      {msg ? <p className="mt-1 text-xs text-error-500">{msg}</p> : null}
    </div>
  );
}

function TextInput(props: { label: string; value: string; onChange: (v: string) => void; error?: unknown; type?: string }) {
  return (
    <Row label={props.label} error={props.error}>
      <input type={props.type ?? "text"} className={editorInputClass} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </Row>
  );
}

function NumberInput(props: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; error?: unknown }) {
  return (
    <Row label={props.label} error={props.error}>
      <input
        type="number"
        className={editorInputClass}
        value={props.value === undefined ? "" : String(props.value)}
        onChange={(e) => props.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </Row>
  );
}

function Toggle(props: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <input
        type="checkbox"
        className="size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/30"
        checked={Boolean(props.value)}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  );
}

function SelectInput(props: { label: string; value: string | undefined; onChange: (v: string) => void; options: string[] }) {
  return (
    <Row label={props.label}>
      <select className={editorInputClass} value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Default</option>
        {props.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Attribute editors                                                   */
/* ------------------------------------------------------------------ */

export const LabelAttribute = createAttributeComponent(A.labelAttribute, (p) => (
  <TextInput label="Label" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const PlaceholderAttribute = createAttributeComponent(A.placeholderAttribute, (p) => (
  <TextInput label="Placeholder" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const DescriptionAttribute = createAttributeComponent(A.descriptionAttribute, (p) => (
  <TextInput label="Description" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const TooltipAttribute = createAttributeComponent(A.tooltipAttribute, (p) => (
  <TextInput label="Tooltip" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const PrefixAttribute = createAttributeComponent(A.prefixAttribute, (p) => (
  <TextInput label="Prefix" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const SuffixAttribute = createAttributeComponent(A.suffixAttribute, (p) => (
  <TextInput label="Suffix" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const LabelPositionAttribute = createAttributeComponent(A.labelPositionAttribute, (p) => (
  <SelectInput label="Label Position" value={p.attribute.value} onChange={(v) => p.setValue(v ? (v as "top" | "left" | "right") : undefined)} options={["top", "left", "right"]} />
));
export const CustomClassAttribute = createAttributeComponent(A.customClassAttribute, (p) => (
  <TextInput label="Custom CSS Class" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const HiddenAttribute = createAttributeComponent(A.hiddenAttribute, (p) => (
  <Toggle label="Hidden" value={p.attribute.value} onChange={p.setValue} />
));
export const DisabledAttribute = createAttributeComponent(A.disabledAttribute, (p) => (
  <Toggle label="Disabled" value={p.attribute.value} onChange={p.setValue} />
));
export const ContentAttribute = createAttributeComponent(A.contentAttribute, (p) => (
  <Row label="Content (rich text)" error={p.attribute.error}>
    <RichTextEditor value={p.attribute.value ?? ""} onChange={(html) => p.setValue(html)} minHeightClass="min-h-[8rem]" />
  </Row>
));
export const DefaultValueAttribute = createAttributeComponent(A.defaultValueAttribute, (p) => (
  <TextInput label="Default Value" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const MultipleAttribute = createAttributeComponent(A.multipleAttribute, (p) => (
  <Toggle label="Allow multiple values" value={p.attribute.value} onChange={p.setValue} />
));
export const RequiredAttribute = createAttributeComponent(A.requiredAttribute, (p) => (
  <Toggle label="Required" value={p.attribute.value} onChange={p.setValue} />
));
export const MinLengthAttribute = createAttributeComponent(A.minLengthAttribute, (p) => (
  <NumberInput label="Minimum Length" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const MaxLengthAttribute = createAttributeComponent(A.maxLengthAttribute, (p) => (
  <NumberInput label="Maximum Length" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const MinAttribute = createAttributeComponent(A.minAttribute, (p) => (
  <NumberInput label="Minimum" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const MaxAttribute = createAttributeComponent(A.maxAttribute, (p) => (
  <NumberInput label="Maximum" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const PatternAttribute = createAttributeComponent(A.patternAttribute, (p) => (
  <TextInput label="Regular Expression Pattern" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const CustomMessageAttribute = createAttributeComponent(A.customMessageAttribute, (p) => (
  <TextInput label="Custom Error Message" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const ValidateOnAttribute = createAttributeComponent(A.validateOnAttribute, (p) => (
  <SelectInput label="Validate On" value={p.attribute.value} onChange={(v) => p.setValue(v ? (v as "change" | "blur") : undefined)} options={["change", "blur"]} />
));
export const KeyAttribute = createAttributeComponent(A.keyAttribute, (p) => (
  <TextInput label="Property Name (key)" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const TagsAttribute = createAttributeComponent(A.tagsAttribute, (p) => (
  <TextInput label="Field Tags (comma separated)" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const ContentLinkTextAttribute = createAttributeComponent(A.contentLinkTextAttribute, (p) => (
  <TextInput label="Help link text (e.g. Terms and Conditions)" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const ContentHtmlAttribute = createAttributeComponent(A.contentHtmlAttribute, (p) => (
  <Row label="Help content (opens in a modal when the link is clicked)" error={p.attribute.error}>
    <RichTextEditor value={p.attribute.value ?? ""} onChange={(html) => p.setValue(html)} minHeightClass="min-h-[8rem]" />
  </Row>
));
type Opt = { label: string; value: string };
export const normOpt = (o: unknown): Opt =>
  typeof o === "string"
    ? { label: o, value: o }
    : { label: String((o as Opt)?.label ?? ""), value: String((o as Opt)?.value ?? "") };

export const OptionsAttribute = createAttributeComponent(A.optionsAttribute, (p) => {
  const options = (p.attribute.value ?? []).map(normOpt);
  const update = (next: Opt[]) => p.setValue(next);
  return (
    <Row label="Options (label / stored value)" error={p.attribute.error}>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex gap-1.5">
            <input className={editorInputClass} placeholder="Label" value={opt.label} onChange={(e) => { const n = [...options]; n[i] = { ...n[i], label: e.target.value }; update(n); }} />
            <input className={editorInputClass} placeholder="Value" value={opt.value} onChange={(e) => { const n = [...options]; n[i] = { ...n[i], value: e.target.value }; update(n); }} />
            <button type="button" onClick={() => update(options.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-2 text-sm text-gray-400 hover:bg-gray-100 hover:text-error-500 dark:hover:bg-white/5" aria-label="Remove option">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => update([...options, { label: `Option ${options.length + 1}`, value: `option${options.length + 1}` }])} className="text-xs font-medium text-brand-500 hover:text-brand-600">+ Add option</button>
      </div>
    </Row>
  );
});
export const ConditionalAttribute = createAttributeComponent(A.conditionalAttribute, (p) => {
  const c = p.attribute.value ?? {};
  const set = (patch: Partial<typeof c>) => p.setValue({ ...c, ...patch });
  return (
    <Row label="Conditional display">
      <SelectInput label="This field should" value={c.show === undefined ? "" : c.show ? "show" : "hide"} onChange={(v) => set({ show: v === "" ? undefined : v === "show" })} options={["show", "hide"]} />
      <TextInput label="When the field (key)" value={c.when ?? ""} onChange={(v) => set({ when: v })} />
      <TextInput label="Has the value" value={c.eq ?? ""} onChange={(v) => set({ eq: v })} />
    </Row>
  );
});

function ExprInput(props: { label: string; hint: string; value: string; onChange: (v: string) => void; error?: unknown }) {
  return (
    <Row label={props.label} error={props.error}>
      <textarea
        className={`${editorInputClass} h-16 py-2 font-mono text-xs`}
        placeholder={props.hint}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <p className="mt-1 text-[11px] text-gray-400">{props.hint}</p>
    </Row>
  );
}
export const CalculateValueAttribute = createAttributeComponent(A.calculateValueAttribute, (p) => (
  <ExprInput label="Calculated Value" hint="e.g. price * quantity" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const CustomConditionalAttribute = createAttributeComponent(A.customConditionalAttribute, (p) => (
  <ExprInput label="Advanced condition — show when" hint={'e.g. age >= 18 and country == "US"'} value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const CustomValidationAttribute = createAttributeComponent(A.customValidationAttribute, (p) => (
  <ExprInput label="Custom validation — valid when" hint="e.g. value > 0" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
type LogicRule = { when: string; action: (typeof A.LOGIC_ACTIONS)[number]; value?: string };
export const LogicAttribute = createAttributeComponent(A.logicAttribute, (p) => {
  const rules = (p.attribute.value ?? []) as LogicRule[];
  const update = (next: LogicRule[]) => p.setValue(next);
  const exprCls = `${editorInputClass} h-12 py-1.5 font-mono text-xs`;
  return (
    <Row label="Logic rules — when condition, then action">
      <div className="space-y-3">
        {rules.map((r, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
            <textarea className={exprCls} placeholder='When (expression), e.g. country == "US"' value={r.when} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], when: e.target.value }; update(n); }} />
            <select className={editorInputClass} value={r.action} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], action: e.target.value as LogicRule["action"] }; update(n); }}>
              {A.LOGIC_ACTIONS.map((act) => <option key={act} value={act}>{act}</option>)}
            </select>
            {r.action === "setValue" ? <textarea className={exprCls} placeholder="Value expression" value={r.value ?? ""} onChange={(e) => { const n = [...rules]; n[i] = { ...n[i], value: e.target.value }; update(n); }} /> : null}
            <button type="button" onClick={() => update(rules.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-error-500">Remove rule</button>
          </div>
        ))}
        <button type="button" onClick={() => update([...rules, { when: "", action: "hide" }])} className="text-xs font-medium text-brand-500 hover:text-brand-600">+ Add rule</button>
      </div>
    </Row>
  );
});
export const BlockedByValidationAttribute = createAttributeComponent(A.blockedByValidationAttribute, (p) => (
  <Toggle label="Block until this step's fields are valid" value={p.attribute.value} onChange={p.setValue} />
));
export const ButtonActionAttribute = createAttributeComponent(A.buttonActionAttribute, (p) => (
  <SelectInput label="Action" value={p.attribute.value} onChange={(v) => p.setValue(v ? (v as (typeof A.BUTTON_ACTIONS)[number]) : undefined)} options={[...A.BUTTON_ACTIONS]} />
));

/* ---- Text Field extras ---- */
export const HideLabelAttribute = createAttributeComponent(A.hideLabelAttribute, (p) => (
  <Toggle label="Hide label" value={p.attribute.value} onChange={p.setValue} />
));
export const InputMaskAttribute = createAttributeComponent(A.inputMaskAttribute, (p) => (
  <Row label="Input Mask" error={p.attribute.error}>
    <input className={editorInputClass} placeholder="(999) 999-9999" value={p.attribute.value ?? ""} onChange={(e) => p.setValue(e.target.value)} />
    <p className="mt-1 text-[11px] text-gray-400">9 = digit, a = letter, * = alphanumeric; other characters are literal.</p>
  </Row>
));
export const TabIndexAttribute = createAttributeComponent(A.tabIndexAttribute, (p) => (
  <NumberInput label="Tab Index" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const AutocompleteAttribute = createAttributeComponent(A.autocompleteAttribute, (p) => (
  <Toggle label="Autocomplete" value={p.attribute.value} onChange={p.setValue} />
));
export const AutocompleteTokenAttribute = createAttributeComponent(A.autocompleteTokenAttribute, (p) => (
  <SelectInput label="Autocomplete (browser autofill)" value={p.attribute.value} onChange={(v) => p.setValue(v ? (v as (typeof A.AUTOCOMPLETE_TOKENS)[number]) : undefined)} options={[...A.AUTOCOMPLETE_TOKENS]} />
));
export const AutofocusAttribute = createAttributeComponent(A.autofocusAttribute, (p) => (
  <Toggle label="Initial focus" value={p.attribute.value} onChange={p.setValue} />
));
export const SpellcheckAttribute = createAttributeComponent(A.spellcheckAttribute, (p) => (
  <Toggle label="Allow spellcheck" value={p.attribute.value} onChange={p.setValue} />
));
export const ShowCharCountAttribute = createAttributeComponent(A.showCharCountAttribute, (p) => (
  <Toggle label="Show character counter" value={p.attribute.value} onChange={p.setValue} />
));
export const ShowWordCountAttribute = createAttributeComponent(A.showWordCountAttribute, (p) => (
  <Toggle label="Show word counter" value={p.attribute.value} onChange={p.setValue} />
));
export const ClearableAttribute = createAttributeComponent(A.clearableAttribute, (p) => (
  <Toggle label="Show clear (✕) button" value={p.attribute.value} onChange={p.setValue} />
));
export const TextCaseAttribute = createAttributeComponent(A.textCaseAttribute, (p) => (
  <SelectInput label="Text Case" value={p.attribute.value} onChange={(v) => p.setValue(v ? (v as "uppercase" | "lowercase") : undefined)} options={["uppercase", "lowercase"]} />
));
export const PersistentAttribute = createAttributeComponent(A.persistentAttribute, (p) => (
  <Toggle label="Persistent (include in submission)" value={p.attribute.value === undefined ? true : p.attribute.value} onChange={p.setValue} />
));
export const ClearOnHideAttribute = createAttributeComponent(A.clearOnHideAttribute, (p) => (
  <Toggle label="Clear value when hidden" value={p.attribute.value} onChange={p.setValue} />
));
export const CustomDefaultValueAttribute = createAttributeComponent(A.customDefaultValueAttribute, (p) => (
  <ExprInput label="Custom default value" hint="e.g. firstName + ' ' + lastName" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const AllowCalculateOverrideAttribute = createAttributeComponent(A.allowCalculateOverrideAttribute, (p) => (
  <Toggle label="Allow manual override of calculated value" value={p.attribute.value} onChange={p.setValue} />
));
export const MinWordsAttribute = createAttributeComponent(A.minWordsAttribute, (p) => (
  <NumberInput label="Minimum Word Length" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const MaxWordsAttribute = createAttributeComponent(A.maxWordsAttribute, (p) => (
  <NumberInput label="Maximum Word Length" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const ErrorLabelAttribute = createAttributeComponent(A.errorLabelAttribute, (p) => (
  <TextInput label="Error Label" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const UniqueAttribute = createAttributeComponent(A.uniqueAttribute, (p) => (
  <Toggle label="Unique" value={p.attribute.value} onChange={p.setValue} />
));

/* ---- Choice / Date extras ---- */
export const DefaultCheckedAttribute = createAttributeComponent(A.defaultCheckedAttribute, (p) => (
  <Toggle label="Checked by default" value={p.attribute.value} onChange={p.setValue} />
));
export const InlineAttribute = createAttributeComponent(A.inlineAttribute, (p) => (
  <Toggle label="Display options inline" value={p.attribute.value} onChange={p.setValue} />
));
export const MinSelectedAttribute = createAttributeComponent(A.minSelectedAttribute, (p) => (
  <NumberInput label="Minimum checked" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const MaxSelectedAttribute = createAttributeComponent(A.maxSelectedAttribute, (p) => (
  <NumberInput label="Maximum checked" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const EnableTimeAttribute = createAttributeComponent(A.enableTimeAttribute, (p) => (
  <Toggle label="Enable time input" value={p.attribute.value} onChange={p.setValue} />
));
export const MinDateAttribute = createAttributeComponent(A.minDateAttribute, (p) => (
  <Row label="Minimum Date" error={p.attribute.error}>
    <input type="date" className={editorInputClass} value={p.attribute.value ?? ""} onChange={(e) => p.setValue(e.target.value || undefined)} />
  </Row>
));
export const MaxDateAttribute = createAttributeComponent(A.maxDateAttribute, (p) => (
  <Row label="Maximum Date" error={p.attribute.error}>
    <input type="date" className={editorInputClass} value={p.attribute.value ?? ""} onChange={(e) => p.setValue(e.target.value || undefined)} />
  </Row>
));

/* ---- Signature ---- */
export const FooterAttribute = createAttributeComponent(A.footerAttribute, (p) => (
  <TextInput label="Footer text" value={p.attribute.value ?? ""} onChange={p.setValue} error={p.attribute.error} />
));
export const PenColorAttribute = createAttributeComponent(A.penColorAttribute, (p) => (
  <Row label="Pen Color">
    <input type="color" className="h-9 w-16 cursor-pointer rounded border border-gray-300 dark:border-gray-700" value={p.attribute.value ?? "#000000"} onChange={(e) => p.setValue(e.target.value)} />
  </Row>
));

/* ---- Day / Select / Table extras ---- */
export const HideDayAttribute = createAttributeComponent(A.hideDayAttribute, (p) => <Toggle label="Hide day" value={p.attribute.value} onChange={p.setValue} />);
export const HideMonthAttribute = createAttributeComponent(A.hideMonthAttribute, (p) => <Toggle label="Hide month" value={p.attribute.value} onChange={p.setValue} />);
export const HideYearAttribute = createAttributeComponent(A.hideYearAttribute, (p) => <Toggle label="Hide year" value={p.attribute.value} onChange={p.setValue} />);
export const DayFirstAttribute = createAttributeComponent(A.dayFirstAttribute, (p) => <Toggle label="Day before month" value={p.attribute.value} onChange={p.setValue} />);
export const MinYearAttribute = createAttributeComponent(A.minYearAttribute, (p) => <NumberInput label="Minimum year" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />);
export const MaxYearAttribute = createAttributeComponent(A.maxYearAttribute, (p) => <NumberInput label="Maximum year" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />);
export const SearchableAttribute = createAttributeComponent(A.searchableAttribute, (p) => <Toggle label="Enable search (typeahead)" value={p.attribute.value} onChange={p.setValue} />);
export const NumColumnsAttribute = createAttributeComponent(A.numColumnsAttribute, (p) => <NumberInput label="Number of columns" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />);
export const MinRowsAttribute = createAttributeComponent(A.minRowsAttribute, (p) => <NumberInput label="Minimum rows" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />);
export const MaxRowsAttribute = createAttributeComponent(A.maxRowsAttribute, (p) => <NumberInput label="Maximum rows" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />);

/* ---- Number extras ---- */
export const CurrencyCodeAttribute = createAttributeComponent(A.currencyCodeAttribute, (p) => (
  <SelectInput label="Currency" value={p.attribute.value} onChange={(v) => p.setValue(v ? (v as (typeof A.CURRENCY_CODES)[number]) : undefined)} options={[...A.CURRENCY_CODES]} />
));
export const DelimiterAttribute = createAttributeComponent(A.delimiterAttribute, (p) => (
  <Toggle label="Use thousands separator (1,000,000)" value={p.attribute.value} onChange={p.setValue} />
));
export const DecimalLimitAttribute = createAttributeComponent(A.decimalLimitAttribute, (p) => (
  <NumberInput label="Decimal Places" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const RequireDecimalAttribute = createAttributeComponent(A.requireDecimalAttribute, (p) => (
  <Toggle label="Always show decimals" value={p.attribute.value} onChange={p.setValue} />
));

/* ---- Time extras ---- */
export const MinTimeAttribute = createAttributeComponent(A.minTimeAttribute, (p) => (
  <Row label="Minimum time" error={p.attribute.error}>
    <input type="time" className={editorInputClass} value={p.attribute.value ?? ""} onChange={(e) => p.setValue(e.target.value || undefined)} />
  </Row>
));
export const MaxTimeAttribute = createAttributeComponent(A.maxTimeAttribute, (p) => (
  <Row label="Maximum time" error={p.attribute.error}>
    <input type="time" className={editorInputClass} value={p.attribute.value ?? ""} onChange={(e) => p.setValue(e.target.value || undefined)} />
  </Row>
));
export const StepAttribute = createAttributeComponent(A.stepAttribute, (p) => (
  <NumberInput label="Step (seconds)" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));

/* ---- Tags extras ---- */
export const MinTagsAttribute = createAttributeComponent(A.minTagsAttribute, (p) => (
  <NumberInput label="Minimum tags" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const MaxTagsAttribute = createAttributeComponent(A.maxTagsAttribute, (p) => (
  <NumberInput label="Maximum tags" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));

/* ---- File extras ---- */
export const AcceptAttribute = createAttributeComponent(A.acceptAttribute, (p) => (
  <Row label="Accepted file types" error={p.attribute.error}>
    <input className={editorInputClass} placeholder="image/*,.pdf" value={p.attribute.value ?? ""} onChange={(e) => p.setValue(e.target.value || undefined)} />
    <p className="mt-1 text-[11px] text-gray-400">Comma-separated MIME types and/or extensions.</p>
  </Row>
));
export const MaxSizeAttribute = createAttributeComponent(A.maxSizeAttribute, (p) => (
  <NumberInput label="Max file size (MB)" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const MaxFilesAttribute = createAttributeComponent(A.maxFilesAttribute, (p) => (
  <NumberInput label="Max number of files" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));

/* ---- Text Area extras ---- */
export const RowsAttribute = createAttributeComponent(A.rowsAttribute, (p) => (
  <NumberInput label="Rows" value={p.attribute.value} onChange={p.setValue} error={p.attribute.error} />
));
export const AutoExpandAttribute = createAttributeComponent(A.autoExpandAttribute, (p) => (
  <Toggle label="Auto-expand height" value={p.attribute.value} onChange={p.setValue} />
));
export const EditorAttribute = createAttributeComponent(A.editorAttribute, (p) => (
  <SelectInput label="Editor" value={p.attribute.value} onChange={(v) => p.setValue(v ? (v as "richtext") : undefined)} options={["richtext"]} />
));

/* ------------------------------------------------------------------ */
/* Field previews                                                      */
/* ------------------------------------------------------------------ */

function FieldPreview({ label, required, description, tooltip, children }: { label?: string; required?: boolean; description?: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div>
      {label ? (
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required ? <span className="text-error-500"> *</span> : null}
          <FieldTooltip text={tooltip} />
        </label>
      ) : null}
      {children}
      {description ? <p className="mt-1 text-xs text-gray-400">{description}</p> : null}
    </div>
  );
}

const text = (entity: { attributes: { label: string; placeholder?: string; required?: boolean; description?: string; tooltip?: string; prefix?: string; suffix?: string } }, type = "text") => (
  <FieldPreview label={entity.attributes.label} required={entity.attributes.required} description={entity.attributes.description} tooltip={entity.attributes.tooltip}>
    <div className="flex items-center gap-1">
      {entity.attributes.prefix ? <span className="text-sm text-gray-400">{entity.attributes.prefix}</span> : null}
      <input readOnly tabIndex={-1} type={type} placeholder={entity.attributes.placeholder} className={previewClass} />
      {entity.attributes.suffix ? <span className="text-sm text-gray-400">{entity.attributes.suffix}</span> : null}
    </div>
  </FieldPreview>
);

export const TextFieldEntity = createEntityComponent(E.textFieldEntity, (p) => text(p.entity));
export const TextareaEntity = createEntityComponent(E.textareaEntity, (p) => (
  <FieldPreview label={p.entity.attributes.label} required={p.entity.attributes.required} description={p.entity.attributes.description} tooltip={p.entity.attributes.tooltip}>
    <textarea readOnly tabIndex={-1} placeholder={p.entity.attributes.placeholder} className={`${previewClass} h-20 py-2`} />
  </FieldPreview>
));
export const NumberEntity = createEntityComponent(E.numberEntity, (p) => text(p.entity, "number"));
export const PasswordEntity = createEntityComponent(E.passwordEntity, (p) => text(p.entity, "password"));
export const EmailEntity = createEntityComponent(E.emailEntity, (p) => text(p.entity, "email"));
export const UrlEntity = createEntityComponent(E.urlEntity, (p) => text(p.entity, "url"));
export const PhoneEntity = createEntityComponent(E.phoneEntity, (p) => text(p.entity, "tel"));
export const CurrencyEntity = createEntityComponent(E.currencyEntity, (p) => text(p.entity, "number"));
export const DatetimeEntity = createEntityComponent(E.datetimeEntity, (p) => (
  <FieldPreview label={p.entity.attributes.label} required={p.entity.attributes.required} description={p.entity.attributes.description} tooltip={p.entity.attributes.tooltip}>
    <input readOnly tabIndex={-1} type="datetime-local" className={previewClass} />
  </FieldPreview>
));
export const TimeEntity = createEntityComponent(E.timeEntity, (p) => (
  <FieldPreview label={p.entity.attributes.label} required={p.entity.attributes.required} description={p.entity.attributes.description} tooltip={p.entity.attributes.tooltip}>
    <input readOnly tabIndex={-1} type="time" className={previewClass} />
  </FieldPreview>
));
export const DayEntity = createEntityComponent(E.dayEntity, (p) => {
  const a = p.entity.attributes;
  const parts = [
    !a.hideMonth ? "Month" : null,
    !a.hideDay ? "Day" : null,
    !a.hideYear ? "Year" : null,
  ].filter(Boolean) as string[];
  if (a.dayFirst) { const m = parts.indexOf("Month"), d = parts.indexOf("Day"); if (m > -1 && d > -1) [parts[m], parts[d]] = [parts[d], parts[m]]; }
  return (
    <FieldPreview label={a.label} required={a.required} description={a.description}>
      <div className="pointer-events-none grid gap-2" style={{ gridTemplateColumns: `repeat(${parts.length || 1}, 1fr)` }}>
        {parts.map((pt) => <div key={pt} className={`${previewClass} flex items-center`}>{pt}</div>)}
      </div>
    </FieldPreview>
  );
});
export const TagsFieldEntity = createEntityComponent(E.tagsFieldEntity, (p) => (
  <FieldPreview label={p.entity.attributes.label} required={p.entity.attributes.required} description={p.entity.attributes.description} tooltip={p.entity.attributes.tooltip}>
    <input readOnly tabIndex={-1} placeholder={p.entity.attributes.placeholder ?? "Add tags…"} className={previewClass} />
  </FieldPreview>
));
export const SelectEntity = createEntityComponent(E.selectEntity, (p) => (
  <FieldPreview label={p.entity.attributes.label} required={p.entity.attributes.required} description={p.entity.attributes.description} tooltip={p.entity.attributes.tooltip}>
    <select disabled tabIndex={-1} className={previewClass}>
      {(p.entity.attributes.options ?? []).map((o, i) => <option key={i}>{normOpt(o).label}</option>)}
    </select>
  </FieldPreview>
));
export const RadioEntity = createEntityComponent(E.radioEntity, (p) => (
  <FieldPreview label={p.entity.attributes.label} required={p.entity.attributes.required} description={p.entity.attributes.description} tooltip={p.entity.attributes.tooltip}>
    <div className={`pointer-events-none ${p.entity.attributes.inline ? "flex flex-wrap gap-4" : "space-y-2"}`}>
      {(p.entity.attributes.options ?? []).map((o, i) => (
        <span key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="size-4 rounded-full border border-gray-300 dark:border-gray-600" />{normOpt(o).label}
        </span>
      ))}
    </div>
  </FieldPreview>
));
export const SelectBoxesEntity = createEntityComponent(E.selectBoxesEntity, (p) => (
  <FieldPreview label={p.entity.attributes.label} required={p.entity.attributes.required} description={p.entity.attributes.description} tooltip={p.entity.attributes.tooltip}>
    <div className={`pointer-events-none ${p.entity.attributes.inline ? "flex flex-wrap gap-4" : "space-y-2"}`}>
      {(p.entity.attributes.options ?? []).map((o, i) => (
        <span key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="size-4 rounded border border-gray-300 dark:border-gray-600" />{normOpt(o).label}
        </span>
      ))}
    </div>
  </FieldPreview>
));
export const CheckboxEntity = createEntityComponent(E.checkboxEntity, (p) => (
  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
    <span className="pointer-events-none size-4 rounded border border-gray-300 dark:border-gray-600" />
    {p.entity.attributes.label}
    {p.entity.attributes.required ? <span className="text-error-500"> *</span> : null}
    <FieldTooltip text={p.entity.attributes.tooltip} />
  </label>
));
export const ButtonEntity = createEntityComponent(E.buttonEntity, (p) => (
  <button type="button" tabIndex={-1} className="pointer-events-none rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white">
    {p.entity.attributes.label}
  </button>
));
export const FileEntity = createEntityComponent(E.fileEntity, (p) => (
  <FieldPreview label={p.entity.attributes.label} required={p.entity.attributes.required} description={p.entity.attributes.description} tooltip={p.entity.attributes.tooltip}>
    <div className="pointer-events-none flex h-20 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400 dark:border-gray-600">
      Click or drop files to upload
    </div>
  </FieldPreview>
));
export const SignatureEntity = createEntityComponent(E.signatureEntity, (p) => (
  <FieldPreview label={p.entity.attributes.label} required={p.entity.attributes.required} description={p.entity.attributes.description} tooltip={p.entity.attributes.tooltip}>
    <div className="pointer-events-none flex h-24 items-center justify-center rounded-lg border border-gray-300 bg-gray-50 text-sm italic text-gray-400 dark:border-gray-600 dark:bg-white/5">
      ✍︎ Sign here
    </div>
    {p.entity.attributes.footer ? <p className="mt-1 text-center text-xs text-gray-400">{p.entity.attributes.footer}</p> : null}
  </FieldPreview>
));
function ContainerBox({ children, empty }: { children: React.ReactNode; empty?: string }) {
  return Children.count(children) > 0 ? (
    <div className="space-y-3 rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">{children}</div>
  ) : (
    <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-xs text-gray-400 dark:border-gray-600">{empty ?? "Drop fields here"}</div>
  );
}

export const PanelEntity = createEntityComponent(E.panelEntity, (p) => (
  <div>
    <div className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{p.entity.attributes.label || "Panel"}</div>
    <ContainerBox>{p.children}</ContainerBox>
  </div>
));
export const FieldsetEntity = createEntityComponent(E.fieldsetEntity, (p) => (
  <div>
    <div className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{p.entity.attributes.label || "Field Set"}</div>
    <ContainerBox>{p.children}</ContainerBox>
  </div>
));
export const ColumnsEntity = createEntityComponent(E.columnsEntity, (p) => (
  Children.count(p.children) > 0 ? (
    <div className="grid gap-3 rounded-lg border border-dashed border-gray-300 p-3 sm:grid-cols-2 dark:border-gray-600">{p.children}</div>
  ) : (
    <ContainerBox empty="Drop fields into columns">{null}</ContainerBox>
  )
));
export const WellEntity = createEntityComponent(E.wellEntity, (p) => (
  <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/5">
    {Children.count(p.children) > 0 ? <div className="space-y-3">{p.children}</div> : <p className="py-4 text-center text-xs text-gray-400">Drop fields into this well</p>}
  </div>
));
export const TableEntity = createEntityComponent(E.tableEntity, (p) => {
  const cols = typeof p.entity.attributes.numColumns === "number" ? p.entity.attributes.numColumns : 2;
  return Children.count(p.children) > 0 ? (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{p.children}</div>
  ) : (
    <ContainerBox empty="Add a row from field settings">{null}</ContainerBox>
  );
});
export const CellEntity = createEntityComponent(E.cellEntity, (p) => (
  <ContainerBox empty="Drop a field">{p.children}</ContainerBox>
));
export const DataGridEntity = createEntityComponent(E.dataGridEntity, (p) => (
  <div>
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
      {p.entity.attributes.label || "Data Grid"}
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-500 dark:bg-white/10">repeating rows</span>
    </div>
    <ContainerBox empty="Drop fields to define a row">{p.children}</ContainerBox>
  </div>
));
export const EditGridEntity = createEntityComponent(E.editGridEntity, (p) => (
  <div>
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
      {p.entity.attributes.label || "Edit Grid"}
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-500 dark:bg-white/10">repeating rows</span>
    </div>
    <ContainerBox empty="Drop fields to define a row">{p.children}</ContainerBox>
  </div>
));

// Builder-only context: gives container components access to the schema so
// Tabs can render real, label-bearing tab headers.
export const BuilderEntitiesContext = createContext<Record<string, { type: string; attributes: Record<string, unknown>; children?: string[] }>>({});

export const TabsEntity = createEntityComponent(E.tabsEntity, (p) => {
  const map = useContext(BuilderEntitiesContext);
  const tabIds = ((p.entity as { children?: string[] }).children) ?? [];
  const [active, setActive] = useState(0);
  const cur = Math.min(active, Math.max(0, tabIds.length - 1));
  const rendered = Children.toArray(p.children);
  if (tabIds.length === 0) {
    return <div className="rounded-lg border border-dashed border-gray-300 py-4 text-center text-xs text-gray-400 dark:border-gray-600">Select Tabs and use “+ Add tab”</div>;
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabIds.map((tid, i) => (
          <button
            key={tid}
            type="button"
            onClick={(e) => { e.stopPropagation(); setActive(i); }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${cur === i ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}
          >
            {(map[tid]?.attributes.label as string) || `Tab ${i + 1}`}
          </button>
        ))}
      </div>
      <div className="pt-4">{rendered[cur] ?? null}</div>
    </div>
  );
});
export const TabEntity = createEntityComponent(E.tabEntity, (p) => (
  <ContainerBox empty="Drop fields into this tab">{p.children}</ContainerBox>
));

const navButtonClass = "pointer-events-none rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-600";
export const NextEntity = createEntityComponent(E.nextEntity, (p) => (
  <div className="flex items-center gap-2">
    <span className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white">{p.entity.attributes.label || "Next"}</span>
    {p.entity.attributes.blockedByValidation ? <span className="text-[11px] text-gray-400">blocked by validation</span> : null}
  </div>
));
export const PreviousEntity = createEntityComponent(E.previousEntity, (p) => (
  <span className={navButtonClass}>{p.entity.attributes.label || "Previous"}</span>
));

export const ContentEntity = createEntityComponent(E.contentEntity, (p) => {
  const html = String(p.entity.attributes.content ?? "");
  return html
    ? <div className="text-sm text-gray-600 dark:text-gray-400" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
    : <div className="text-sm text-gray-400">Content</div>;
});
export const HeadingEntity = createEntityComponent(E.headingEntity, (p) => (
  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{p.entity.attributes.label}</h3>
));
export const DividerEntity = createEntityComponent(E.dividerEntity, () => (
  <hr className="border-gray-200 dark:border-gray-700" />
));

export const entityComponents = {
  textField: TextFieldEntity, textarea: TextareaEntity, number: NumberEntity, password: PasswordEntity,
  checkbox: CheckboxEntity, selectBoxes: SelectBoxesEntity, select: SelectEntity, radio: RadioEntity, button: ButtonEntity,
  email: EmailEntity, url: UrlEntity, phoneNumber: PhoneEntity, currency: CurrencyEntity,
  datetime: DatetimeEntity, time: TimeEntity, day: DayEntity, tagsField: TagsFieldEntity, file: FileEntity, signature: SignatureEntity,
  content: ContentEntity, heading: HeadingEntity, divider: DividerEntity,
  panel: PanelEntity, fieldset: FieldsetEntity, columns: ColumnsEntity, well: WellEntity, table: TableEntity, cell: CellEntity, dataGrid: DataGridEntity, editGrid: EditGridEntity,
  tabs: TabsEntity, tab: TabEntity,
  next: NextEntity, previous: PreviousEntity,
};

/* ------------------------------------------------------------------ */
/* Tabbed property panels                                              */
/* ------------------------------------------------------------------ */

type Tabs = Partial<Record<"Display" | "Data" | "Validation" | "API" | "Conditional" | "Logic", React.ComponentType[]>>;
const TAB_ORDER = ["Display", "Data", "Validation", "API", "Conditional", "Logic"] as const;

function makePanel(tabs: Tabs) {
  return function Panel() {
    const names = TAB_ORDER.filter((t) => (tabs[t]?.length ?? 0) > 0);
    const [active, setActive] = useState<string>("Display");
    const current = (tabs[active as keyof Tabs]?.length ? active : names[0]) as keyof Tabs;
    return (
      <div>
        <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
          {names.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setActive(n)}
              className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs font-medium transition ${
                current === n
                  ? "border-brand-500 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div>
          {(tabs[current] ?? []).map((C, i) => <C key={i} />)}
        </div>
      </div>
    );
  };
}

const displayCommon: React.ComponentType[] = [DescriptionAttribute, TooltipAttribute, LabelPositionAttribute, CustomClassAttribute, HiddenAttribute, DisabledAttribute];
const logicFull: React.ComponentType[] = [CalculateValueAttribute, CustomValidationAttribute, CustomConditionalAttribute, LogicAttribute];
const logicCond: React.ComponentType[] = [CustomConditionalAttribute];

const textareaPanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, PlaceholderAttribute, PrefixAttribute, SuffixAttribute, DescriptionAttribute, TooltipAttribute, LabelPositionAttribute, CustomClassAttribute, EditorAttribute, RowsAttribute, AutoExpandAttribute, TabIndexAttribute, AutocompleteTokenAttribute, AutofocusAttribute, SpellcheckAttribute, ShowCharCountAttribute, ShowWordCountAttribute, HiddenAttribute, DisabledAttribute],
  Data: [DefaultValueAttribute, CustomDefaultValueAttribute, MultipleAttribute, TextCaseAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: [RequiredAttribute, MinLengthAttribute, MaxLengthAttribute, MinWordsAttribute, MaxWordsAttribute, PatternAttribute, UniqueAttribute, ErrorLabelAttribute, CustomMessageAttribute, ValidateOnAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: [CalculateValueAttribute, AllowCalculateOverrideAttribute, CustomValidationAttribute, CustomConditionalAttribute, LogicAttribute],
});
// Full Form.io-parity Text Field panel.
const textFieldPanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, PlaceholderAttribute, PrefixAttribute, SuffixAttribute, InputMaskAttribute, DescriptionAttribute, TooltipAttribute, LabelPositionAttribute, CustomClassAttribute, TabIndexAttribute, AutocompleteTokenAttribute, AutofocusAttribute, SpellcheckAttribute, ShowCharCountAttribute, ShowWordCountAttribute, HiddenAttribute, DisabledAttribute],
  Data: [DefaultValueAttribute, CustomDefaultValueAttribute, MultipleAttribute, ClearableAttribute, TextCaseAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: [RequiredAttribute, MinLengthAttribute, MaxLengthAttribute, MinWordsAttribute, MaxWordsAttribute, PatternAttribute, UniqueAttribute, ErrorLabelAttribute, CustomMessageAttribute, ValidateOnAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: [CalculateValueAttribute, AllowCalculateOverrideAttribute, CustomValidationAttribute, CustomConditionalAttribute, LogicAttribute],
});
// Full Form.io-parity Number panel.
const numberFieldPanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, PlaceholderAttribute, PrefixAttribute, SuffixAttribute, DescriptionAttribute, TooltipAttribute, LabelPositionAttribute, CustomClassAttribute, TabIndexAttribute, AutofocusAttribute, HiddenAttribute, DisabledAttribute],
  Data: [DefaultValueAttribute, CustomDefaultValueAttribute, MultipleAttribute, DelimiterAttribute, DecimalLimitAttribute, RequireDecimalAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: [RequiredAttribute, MinAttribute, MaxAttribute, UniqueAttribute, ErrorLabelAttribute, CustomMessageAttribute, ValidateOnAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: [CalculateValueAttribute, AllowCalculateOverrideAttribute, CustomValidationAttribute, CustomConditionalAttribute, LogicAttribute],
});
const currencyPanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, PlaceholderAttribute, DescriptionAttribute, TooltipAttribute, LabelPositionAttribute, CustomClassAttribute, TabIndexAttribute, AutofocusAttribute, HiddenAttribute, DisabledAttribute],
  Data: [CurrencyCodeAttribute, DefaultValueAttribute, CustomDefaultValueAttribute, MultipleAttribute, DelimiterAttribute, DecimalLimitAttribute, RequireDecimalAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: [RequiredAttribute, MinAttribute, MaxAttribute, UniqueAttribute, ErrorLabelAttribute, CustomMessageAttribute, ValidateOnAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: [CalculateValueAttribute, AllowCalculateOverrideAttribute, CustomValidationAttribute, CustomConditionalAttribute, LogicAttribute],
});
const choiceLogic = [CalculateValueAttribute, AllowCalculateOverrideAttribute, CustomValidationAttribute, CustomConditionalAttribute, LogicAttribute];
const passwordPanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, PlaceholderAttribute, PrefixAttribute, SuffixAttribute, ...displayCommon, TabIndexAttribute, AutofocusAttribute, AutocompleteTokenAttribute],
  Data: [CustomDefaultValueAttribute, MultipleAttribute, ClearableAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: [RequiredAttribute, MinLengthAttribute, MaxLengthAttribute, PatternAttribute, UniqueAttribute, ErrorLabelAttribute, CustomMessageAttribute, ValidateOnAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: choiceLogic,
});
const checkboxPanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, ContentLinkTextAttribute, ContentHtmlAttribute, DescriptionAttribute, TooltipAttribute, CustomClassAttribute, TabIndexAttribute, HiddenAttribute, DisabledAttribute],
  Data: [DefaultCheckedAttribute, CustomDefaultValueAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: [RequiredAttribute, ErrorLabelAttribute, CustomMessageAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: choiceLogic,
});
const choiceDisplay = [LabelAttribute, HideLabelAttribute, ContentLinkTextAttribute, ContentHtmlAttribute, ...displayCommon, TabIndexAttribute];
const choiceValidation = [RequiredAttribute, ErrorLabelAttribute, CustomMessageAttribute, ValidateOnAttribute, UniqueAttribute];
const selectPanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, PlaceholderAttribute, SearchableAttribute, ContentLinkTextAttribute, ContentHtmlAttribute, ...displayCommon, TabIndexAttribute],
  Data: [OptionsAttribute, DefaultValueAttribute, MultipleAttribute, CustomDefaultValueAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: choiceValidation,
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: choiceLogic,
});
const radioPanel = makePanel({
  Display: [...choiceDisplay, InlineAttribute],
  Data: [OptionsAttribute, DefaultValueAttribute, CustomDefaultValueAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: choiceValidation,
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: choiceLogic,
});
const selectBoxesPanel = makePanel({
  Display: [...choiceDisplay, InlineAttribute],
  Data: [OptionsAttribute, CustomDefaultValueAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: [RequiredAttribute, MinSelectedAttribute, MaxSelectedAttribute, ErrorLabelAttribute, CustomMessageAttribute, ValidateOnAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: choiceLogic,
});
const dayPanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, ...displayCommon, HideDayAttribute, HideMonthAttribute, HideYearAttribute, DayFirstAttribute, MinYearAttribute, MaxYearAttribute],
  Data: [DefaultValueAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: [RequiredAttribute, ErrorLabelAttribute, CustomMessageAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: logicCond,
});
// Time field.
const timePanel = makePanel({
  Display: [LabelAttribute, ...displayCommon, StepAttribute],
  Data: [DefaultValueAttribute],
  Validation: [RequiredAttribute, MinTimeAttribute, MaxTimeAttribute, CustomMessageAttribute, ValidateOnAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: logicFull,
});
// Date / Time field (full).
const dateFieldPanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, ...displayCommon, TabIndexAttribute, EnableTimeAttribute],
  Data: [DefaultValueAttribute, CustomDefaultValueAttribute, PersistentAttribute, ClearOnHideAttribute],
  Validation: [RequiredAttribute, MinDateAttribute, MaxDateAttribute, ErrorLabelAttribute, CustomMessageAttribute, ValidateOnAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: choiceLogic,
});
const tagsPanel = makePanel({
  Display: [LabelAttribute, PlaceholderAttribute, ...displayCommon],
  Validation: [RequiredAttribute, MinTagsAttribute, MaxTagsAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: logicCond,
});
const signaturePanel = makePanel({
  Display: [LabelAttribute, HideLabelAttribute, DescriptionAttribute, TooltipAttribute, FooterAttribute, PenColorAttribute, CustomClassAttribute, HiddenAttribute, DisabledAttribute],
  Validation: [RequiredAttribute, ErrorLabelAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: logicCond,
});
const filePanel = makePanel({
  Display: [LabelAttribute, DescriptionAttribute, TooltipAttribute, LabelPositionAttribute, CustomClassAttribute, HiddenAttribute, DisabledAttribute],
  Data: [MultipleAttribute, AcceptAttribute],
  Validation: [RequiredAttribute, MaxFilesAttribute, MaxSizeAttribute],
  API: [KeyAttribute, TagsAttribute],
  Conditional: [ConditionalAttribute],
  Logic: logicCond,
});
const buttonPanel = makePanel({
  Display: [LabelAttribute, ButtonActionAttribute, CustomClassAttribute, HiddenAttribute, DisabledAttribute],
  API: [KeyAttribute],
});
const contentPanel = makePanel({
  Display: [ContentAttribute, CustomClassAttribute, HiddenAttribute],
  API: [KeyAttribute],
});
const headingPanel = makePanel({ Display: [LabelAttribute, CustomClassAttribute, HiddenAttribute] });
const dividerPanel = makePanel({ Display: [CustomClassAttribute, HiddenAttribute] });
const containerPanel = makePanel({ Display: [LabelAttribute, CustomClassAttribute, HiddenAttribute], Conditional: [ConditionalAttribute], Logic: logicCond });
const columnsPanelDef = makePanel({ Display: [CustomClassAttribute, HiddenAttribute], Conditional: [ConditionalAttribute], Logic: logicCond });
const tablePanel = makePanel({ Display: [NumColumnsAttribute, CustomClassAttribute, HiddenAttribute], Conditional: [ConditionalAttribute], Logic: logicCond });
const gridPanel = makePanel({ Display: [LabelAttribute, CustomClassAttribute, HiddenAttribute], Validation: [RequiredAttribute, MinRowsAttribute, MaxRowsAttribute], API: [KeyAttribute], Conditional: [ConditionalAttribute], Logic: logicCond });
const tabPanel = makePanel({ Display: [LabelAttribute, HiddenAttribute], Conditional: [ConditionalAttribute], Logic: logicCond });
const nextPanel = makePanel({ Display: [LabelAttribute, CustomClassAttribute, HiddenAttribute], Validation: [BlockedByValidationAttribute], Conditional: [ConditionalAttribute], Logic: logicCond });
const previousPanel = makePanel({ Display: [LabelAttribute, CustomClassAttribute, HiddenAttribute], Conditional: [ConditionalAttribute], Logic: logicCond });

export const attributesComponents = {
  textField: textFieldPanel, textarea: textareaPanel, email: textFieldPanel, url: textFieldPanel, phoneNumber: textFieldPanel,
  number: numberFieldPanel, currency: currencyPanel,
  password: passwordPanel,
  checkbox: checkboxPanel,
  selectBoxes: selectBoxesPanel, radio: radioPanel,
  select: selectPanel,
  datetime: dateFieldPanel, time: timePanel, day: dayPanel,
  tagsField: tagsPanel,
  file: filePanel,
  signature: signaturePanel,
  button: buttonPanel,
  content: contentPanel, heading: headingPanel, divider: dividerPanel,
  panel: containerPanel, fieldset: containerPanel, columns: columnsPanelDef, well: columnsPanelDef, table: tablePanel, cell: columnsPanelDef, dataGrid: gridPanel, editGrid: gridPanel,
  tabs: columnsPanelDef, tab: tabPanel,
  next: nextPanel, previous: previousPanel,
};
