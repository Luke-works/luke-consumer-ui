import { z } from "zod";
import { createEntity } from "@coltorapps/builder";
import {
  allowCalculateOverrideAttribute,
  autoExpandAttribute,
  autocompleteAttribute,
  autocompleteTokenAttribute,
  autofocusAttribute,
  blockedByValidationAttribute,
  buttonActionAttribute,
  calculateValueAttribute,
  clearableAttribute,
  clearOnHideAttribute,
  conditionalAttribute,
  contentAttribute,
  contentHtmlAttribute,
  contentLinkTextAttribute,
  customClassAttribute,
  customConditionalAttribute,
  customDefaultValueAttribute,
  customMessageAttribute,
  currencyCodeAttribute,
  customValidationAttribute,
  dayFirstAttribute,
  decimalLimitAttribute,
  defaultCheckedAttribute,
  defaultValueAttribute,
  delimiterAttribute,
  descriptionAttribute,
  disabledAttribute,
  editorAttribute,
  enableTimeAttribute,
  errorLabelAttribute,
  footerAttribute,
  hiddenAttribute,
  hideDayAttribute,
  hideLabelAttribute,
  hideMonthAttribute,
  hideYearAttribute,
  inlineAttribute,
  inputMaskAttribute,
  keyAttribute,
  acceptAttribute,
  labelAttribute,
  labelPositionAttribute,
  logicAttribute,
  maxFilesAttribute,
  maxRowsAttribute,
  maxSizeAttribute,
  maxTagsAttribute,
  maxTimeAttribute,
  minRowsAttribute,
  minTagsAttribute,
  minTimeAttribute,
  stepAttribute,
  maxAttribute,
  maxDateAttribute,
  maxLengthAttribute,
  maxSelectedAttribute,
  maxWordsAttribute,
  maxYearAttribute,
  minAttribute,
  minDateAttribute,
  minLengthAttribute,
  minSelectedAttribute,
  minWordsAttribute,
  minYearAttribute,
  multipleAttribute,
  numColumnsAttribute,
  optionsAttribute,
  patternAttribute,
  penColorAttribute,
  persistentAttribute,
  placeholderAttribute,
  prefixAttribute,
  requireDecimalAttribute,
  requiredAttribute,
  rowsAttribute,
  searchableAttribute,
  showCharCountAttribute,
  showWordCountAttribute,
  spellcheckAttribute,
  suffixAttribute,
  tabIndexAttribute,
  tagsAttribute,
  textCaseAttribute,
  tooltipAttribute,
  uniqueAttribute,
  validateOnAttribute,
} from "./attributes";

// Shared attribute groups (the union of property tabs each field type exposes).
const displayBase = [
  descriptionAttribute,
  tooltipAttribute,
  labelPositionAttribute,
  customClassAttribute,
  hiddenAttribute,
  disabledAttribute,
];
const api = [keyAttribute, tagsAttribute, conditionalAttribute, customConditionalAttribute, logicAttribute];
const logic = [calculateValueAttribute, customValidationAttribute];

const textAttrs = [
  labelAttribute,
  placeholderAttribute,
  prefixAttribute,
  suffixAttribute,
  ...displayBase,
  defaultValueAttribute,
  multipleAttribute,
  requiredAttribute,
  minLengthAttribute,
  maxLengthAttribute,
  patternAttribute,
  customMessageAttribute,
  validateOnAttribute,
  ...logic,
  ...api,
];

const numberAttrs = [
  labelAttribute,
  placeholderAttribute,
  prefixAttribute,
  suffixAttribute,
  ...displayBase,
  defaultValueAttribute,
  requiredAttribute,
  minAttribute,
  maxAttribute,
  customMessageAttribute,
  validateOnAttribute,
  ...logic,
  ...api,
];

const dateAttrs = [
  labelAttribute,
  ...displayBase,
  defaultValueAttribute,
  requiredAttribute,
  customMessageAttribute,
  validateOnAttribute,
  ...logic,
  ...api,
];

const str = (value: unknown) => z.string().optional().parse(value);
const num = (value: unknown) => z.coerce.number().optional().parse(value);
const passthrough = (value: unknown) => z.any().optional().parse(value);

// Full Form.io-parity attribute set for the Text Field.
const textFieldAttrs = [
  ...textAttrs,
  hideLabelAttribute, inputMaskAttribute, tabIndexAttribute, autocompleteAttribute, autocompleteTokenAttribute,
  autofocusAttribute, spellcheckAttribute, showCharCountAttribute, showWordCountAttribute, clearableAttribute,
  textCaseAttribute, persistentAttribute, clearOnHideAttribute, customDefaultValueAttribute,
  allowCalculateOverrideAttribute, minWordsAttribute, maxWordsAttribute, errorLabelAttribute, uniqueAttribute,
];

// Text Area: shares Text Field's extras (minus input mask) and adds rows /
// auto-expand / rich-text editor.
const textareaAttrs = [
  ...textAttrs,
  hideLabelAttribute, tabIndexAttribute, autocompleteAttribute, autocompleteTokenAttribute, autofocusAttribute,
  spellcheckAttribute, showCharCountAttribute, showWordCountAttribute, textCaseAttribute,
  persistentAttribute, clearOnHideAttribute, customDefaultValueAttribute, allowCalculateOverrideAttribute,
  minWordsAttribute, maxWordsAttribute, errorLabelAttribute, uniqueAttribute,
  rowsAttribute, autoExpandAttribute, editorAttribute,
];

/* ---- Basic ---- */
export const textFieldEntity = createEntity({ name: "textField", attributes: textFieldAttrs, validate: str });
export const textareaEntity = createEntity({ name: "textarea", attributes: textareaAttrs, validate: str });
// Full Form.io-parity Number field (adds formatting + shared extras).
const numberFieldAttrs = [
  ...numberAttrs,
  delimiterAttribute, decimalLimitAttribute, requireDecimalAttribute, multipleAttribute,
  hideLabelAttribute, tabIndexAttribute, autofocusAttribute, persistentAttribute, clearOnHideAttribute,
  customDefaultValueAttribute, allowCalculateOverrideAttribute, errorLabelAttribute, uniqueAttribute,
];
export const numberEntity = createEntity({ name: "number", attributes: numberFieldAttrs, validate: num });
const passwordFieldAttrs = [
  labelAttribute, hideLabelAttribute, placeholderAttribute, prefixAttribute, suffixAttribute, ...displayBase, tabIndexAttribute, autofocusAttribute, autocompleteTokenAttribute,
  persistentAttribute, clearOnHideAttribute, customDefaultValueAttribute, multipleAttribute, clearableAttribute,
  requiredAttribute, minLengthAttribute, maxLengthAttribute, patternAttribute, errorLabelAttribute, customMessageAttribute, validateOnAttribute, uniqueAttribute,
  calculateValueAttribute, allowCalculateOverrideAttribute, customValidationAttribute, ...api,
];
export const passwordEntity = createEntity({ name: "password", attributes: passwordFieldAttrs, validate: str });

const checkboxFieldAttrs = [
  labelAttribute, hideLabelAttribute, descriptionAttribute, tooltipAttribute, contentLinkTextAttribute, contentHtmlAttribute, customClassAttribute, tabIndexAttribute, hiddenAttribute, disabledAttribute,
  defaultCheckedAttribute, persistentAttribute, clearOnHideAttribute, customDefaultValueAttribute,
  requiredAttribute, errorLabelAttribute, customMessageAttribute,
  calculateValueAttribute, allowCalculateOverrideAttribute, customValidationAttribute, ...api,
];
export const checkboxEntity = createEntity({ name: "checkbox", attributes: checkboxFieldAttrs, validate: (value) => z.boolean().optional().parse(value) });

// Shared base for Select / Radio / Select Boxes.
const choiceFieldAttrs = [
  labelAttribute, hideLabelAttribute, contentLinkTextAttribute, contentHtmlAttribute, ...displayBase, tabIndexAttribute,
  optionsAttribute, defaultValueAttribute, persistentAttribute, clearOnHideAttribute, customDefaultValueAttribute,
  requiredAttribute, errorLabelAttribute, customMessageAttribute, validateOnAttribute, uniqueAttribute,
  calculateValueAttribute, allowCalculateOverrideAttribute, customValidationAttribute, ...api,
];
export const selectEntity = createEntity({ name: "select", attributes: [...choiceFieldAttrs, placeholderAttribute, multipleAttribute, searchableAttribute], validate: str });
export const radioEntity = createEntity({ name: "radio", attributes: [...choiceFieldAttrs, inlineAttribute], validate: str });
export const selectBoxesEntity = createEntity({ name: "selectBoxes", attributes: [...choiceFieldAttrs, inlineAttribute, minSelectedAttribute, maxSelectedAttribute], validate: (v) => z.array(z.string()).optional().parse(v) });
export const buttonEntity = createEntity({
  name: "button",
  attributes: [labelAttribute, buttonActionAttribute, customClassAttribute, hiddenAttribute, disabledAttribute, keyAttribute],
  validate: passthrough,
});

/* ---- Advanced ---- */
export const emailEntity = createEntity({ name: "email", attributes: textFieldAttrs, validate: str });
export const urlEntity = createEntity({ name: "url", attributes: textFieldAttrs, validate: str });
export const phoneEntity = createEntity({ name: "phoneNumber", attributes: textFieldAttrs, validate: str });
export const currencyEntity = createEntity({ name: "currency", attributes: [...numberFieldAttrs, currencyCodeAttribute], validate: num });
const dateFieldAttrs = [
  labelAttribute, hideLabelAttribute, ...displayBase, tabIndexAttribute,
  enableTimeAttribute, minDateAttribute, maxDateAttribute,
  defaultValueAttribute, persistentAttribute, clearOnHideAttribute, customDefaultValueAttribute,
  requiredAttribute, errorLabelAttribute, customMessageAttribute, validateOnAttribute,
  calculateValueAttribute, allowCalculateOverrideAttribute, customValidationAttribute, ...api,
];
export const datetimeEntity = createEntity({ name: "datetime", attributes: dateFieldAttrs, validate: str });
export const timeEntity = createEntity({ name: "time", attributes: [...dateAttrs, minTimeAttribute, maxTimeAttribute, stepAttribute], validate: str });
export const dayEntity = createEntity({
  name: "day",
  attributes: [
    labelAttribute, hideLabelAttribute, ...displayBase,
    hideDayAttribute, hideMonthAttribute, hideYearAttribute, dayFirstAttribute, minYearAttribute, maxYearAttribute,
    defaultValueAttribute, persistentAttribute, clearOnHideAttribute,
    requiredAttribute, errorLabelAttribute, customMessageAttribute, ...api,
  ],
  validate: str,
});
export const tagsFieldEntity = createEntity({
  name: "tagsField",
  attributes: [labelAttribute, placeholderAttribute, ...displayBase, requiredAttribute, minTagsAttribute, maxTagsAttribute, ...api],
  validate: (v) => z.array(z.string()).optional().parse(v),
});
export const fileEntity = createEntity({
  name: "file",
  attributes: [labelAttribute, ...displayBase, multipleAttribute, acceptAttribute, requiredAttribute, maxFilesAttribute, maxSizeAttribute, ...api],
  validate: passthrough,
});
export const signatureEntity = createEntity({
  name: "signature",
  attributes: [
    labelAttribute, hideLabelAttribute, descriptionAttribute, tooltipAttribute, footerAttribute, penColorAttribute,
    customClassAttribute, hiddenAttribute, disabledAttribute,
    requiredAttribute, errorLabelAttribute, persistentAttribute, clearOnHideAttribute, ...api,
  ],
  validate: str,
});

/* ---- Containers (nesting) ---- */
const containerApi = [conditionalAttribute, customConditionalAttribute];
export const panelEntity = createEntity({
  name: "panel",
  attributes: [labelAttribute, customClassAttribute, hiddenAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});
export const fieldsetEntity = createEntity({
  name: "fieldset",
  attributes: [labelAttribute, customClassAttribute, hiddenAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});
export const columnsEntity = createEntity({
  name: "columns",
  attributes: [customClassAttribute, hiddenAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});
export const wellEntity = createEntity({
  name: "well",
  attributes: [customClassAttribute, hiddenAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});
export const tableEntity = createEntity({
  name: "table",
  attributes: [numColumnsAttribute, customClassAttribute, hiddenAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});
export const cellEntity = createEntity({
  name: "cell",
  attributes: [customClassAttribute, hiddenAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});
export const dataGridEntity = createEntity({
  name: "dataGrid",
  attributes: [labelAttribute, keyAttribute, customClassAttribute, hiddenAttribute, requiredAttribute, minRowsAttribute, maxRowsAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});
export const editGridEntity = createEntity({
  name: "editGrid",
  attributes: [labelAttribute, keyAttribute, customClassAttribute, hiddenAttribute, requiredAttribute, minRowsAttribute, maxRowsAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});
export const tabsEntity = createEntity({
  name: "tabs",
  attributes: [customClassAttribute, hiddenAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});
export const tabEntity = createEntity({
  name: "tab",
  attributes: [labelAttribute, hiddenAttribute, ...containerApi],
  childrenAllowed: true,
  validate: passthrough,
});

/* ---- Wizard navigation ---- */
export const nextEntity = createEntity({
  name: "next",
  attributes: [labelAttribute, blockedByValidationAttribute, customClassAttribute, hiddenAttribute, ...containerApi],
  validate: passthrough,
});
export const previousEntity = createEntity({
  name: "previous",
  attributes: [labelAttribute, customClassAttribute, hiddenAttribute, ...containerApi],
  validate: passthrough,
});

/* ---- Layout / Content (non-nesting) ---- */
export const contentEntity = createEntity({
  name: "content",
  attributes: [contentAttribute, customClassAttribute, hiddenAttribute, keyAttribute],
  validate: passthrough,
});
export const headingEntity = createEntity({
  name: "heading",
  attributes: [labelAttribute, customClassAttribute, hiddenAttribute],
  validate: passthrough,
});
export const dividerEntity = createEntity({
  name: "divider",
  attributes: [customClassAttribute, hiddenAttribute],
  validate: passthrough,
});
