/**
 * consumer-ui's APP-SPECIFIC attribute editors, layered over @lukeflow/form-builder's
 * defaults via the `attributeEditors` plugin slot.
 *
 * The standard field attributes (input mask, clear button, char/word count, button
 * action, table columns, min/max words & dates, spellcheck/autofocus, …) now ship in
 * the PACKAGE defaults, so this is intentionally empty — it's the extension point for
 * editors that are truly specific to this app (e.g. a custom field type's settings).
 * Add `AttributeEditor` entries here and they merge over the package defaults by `id`.
 */
import type { AttributeEditor } from "@lukeflow/form-builder";

export const lukeAttributeEditors: AttributeEditor[] = [];
