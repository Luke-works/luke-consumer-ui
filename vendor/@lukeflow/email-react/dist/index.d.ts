import * as react from 'react';
import { EmailVariable, EmailDoc, EmailTemplate } from '@lukeflow/email-core';
export * from '@lukeflow/email-core';

declare function Email({ doc: input }: {
    doc: EmailDoc;
}): react.JSX.Element;
/** The published template artifact: what gets stored/versioned and handed to a
 *  Camunda outbound task (which pushes html+alias to Postmark and validates the
 *  TemplateModel against `variables`). {{vars}} stay literal in html/text. */
type CompiledEmail = {
    subject: string;
    html: string;
    text: string;
    variables: EmailVariable[];
};
/**
 * Compile a template to the published artifact — inlined, table-based HTML + a
 * plain-text alternative + subject + the reconciled variable contract. Works in
 * the browser and in Node. Self-repairing: never throws on a stored/AI draft
 * (missing blocks, bad level, absent theme). Deterministic — same input → same
 * output. {{vars}} are preserved literally for Postmark's merge. This package does
 * NOT send; a Camunda outbound task consumes this artifact.
 */
declare function compileEmail(input: EmailDoc | EmailTemplate): Promise<CompiledEmail>;
/**
 * Live preview. Accepts an EmailDoc or its JSON string (tolerant — a corrupted
 * draft is repaired, never thrown). Compiles the doc to HTML and shows it inside
 * an isolated iframe (srcDoc) so the email's inlined, table-based markup renders
 * exactly as Postmark will deliver it, and its styles can't leak into (or inherit
 * from) the host stylesheet.
 */
declare function EmailRenderer({ doc, className, height, }: {
    doc: EmailDoc | string;
    className?: string;
    height?: number;
}): react.JSX.Element;

export { type CompiledEmail, Email, EmailRenderer, compileEmail };
