import * as react from 'react';
import { EmailDoc } from '@lukeflow/email-core';
export * from '@lukeflow/email-core';

declare function Email({ doc }: {
    doc: EmailDoc;
}): react.JSX.Element;
/**
 * Compile an EmailDoc to inlined, table-based HTML + a plain-text alternative —
 * the artifacts you hand to Postmark at check-in/publish. Works in the browser
 * and in Node. {{vars}} are preserved literally for Postmark's merge.
 */
declare function compileEmail(doc: EmailDoc): Promise<{
    html: string;
    text: string;
}>;
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

export { Email, EmailRenderer, compileEmail };
