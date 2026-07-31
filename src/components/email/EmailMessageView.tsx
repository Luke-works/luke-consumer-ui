import { useMemo, useState } from "react";
import { Paperclip } from "lucide-react";
import { parseAttachments, parseHeaders, type InboundEmail } from "../../lib/emailIntakeApi";

/**
 * Read-only view of a received email — the thing a reviewer is actually being asked to review.
 *
 * <b>The HTML body is deliberately NOT rendered.</b> It is attacker-supplied markup from an
 * unauthenticated sender: anyone who can email the box chooses it. Injecting it into this page,
 * even sanitised, puts remote images (tracking pixels that confirm a human read the mail),
 * arbitrary CSS, and one sanitiser bug between a stranger and an authenticated session. The
 * plain-text body says the same thing without any of that, and mail that is HTML-only falls back
 * to text extracted from the markup rather than to nothing.
 */
export default function EmailMessageView({ email, from }: { email: InboundEmail; from?: string | null }) {
  const [showHeaders, setShowHeaders] = useState(false);
  const attachments = useMemo(() => parseAttachments(email.attachments), [email.attachments]);
  const headers = useMemo(() => parseHeaders(email.headers), [email.headers]);
  const body = useMemo(() => readableBody(email), [email]);

  return (
    <div className="space-y-4" data-testid="email-message">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {/* The address lives on the task (the envelope); only the display name is stored here. */}
        <Row label="From" value={formatSender(from, email.fromName)} />
        <Row label="To" value={email.toFull ?? email.boxAddress} />
        {email.ccAddresses ? <Row label="Cc" value={email.ccAddresses} /> : null}
        {email.replyTo ? <Row label="Reply-To" value={email.replyTo} /> : null}
      </dl>

      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        {body ? (
          // whitespace-pre-wrap + break-words: plain text keeps its line breaks, and a long
          // unbroken URL wraps instead of stretching the pane.
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {body}
          </p>
        ) : (
          <p className="text-sm italic text-gray-400">This message had no readable text.</p>
        )}
      </div>

      {attachments.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <Paperclip className="size-3.5" />
            {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
          </h4>
          <ul className="space-y-1">
            {attachments.map((a, i) => (
              <li
                key={`${a.name ?? "file"}-${i}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"
              >
                <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">{a.name ?? "Untitled"}</span>
                <span className="ml-3 shrink-0 text-xs text-gray-400">
                  {a.contentType ?? "unknown"} · {formatBytes(a.contentLength)}
                </span>
              </li>
            ))}
          </ul>
          {/* Says plainly why there is no download, rather than showing a link that 404s. */}
          <p className="mt-2 text-xs text-gray-400">
            Attachment contents are not stored — only what arrived is recorded.
          </p>
        </div>
      )}

      {headers.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHeaders((v) => !v)}
            aria-expanded={showHeaders}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            {showHeaders ? "Hide" : "Show"} original headers
          </button>
          {showHeaders && (
            <dl className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 p-3 text-xs dark:border-gray-800">
              {headers.map((h, i) => (
                <div key={`${h.name}-${i}`} className="grid grid-cols-[minmax(90px,auto)_1fr] gap-3 py-0.5">
                  <dt className="truncate font-mono text-gray-400">{h.name}</dt>
                  <dd className="break-words font-mono text-gray-600 dark:text-gray-400">{h.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

/** `Jo Bloggs <jo@example.com>`, degrading to whichever half we actually have. */
export function formatSender(address?: string | null, name?: string | null): string | null {
  const a = address?.trim() || null;
  const n = name?.trim() || null;
  if (a && n) return `${n} <${a}>`;
  return a ?? n;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-gray-400">{label}</dt>
      <dd className="min-w-0 break-words text-gray-700 dark:text-gray-300">{value}</dd>
    </>
  );
}

/**
 * The best plain text available: the stripped reply (just the new part) if the provider worked
 * it out, else the full text body, else text recovered from the HTML.
 */
export function readableBody(email: Pick<InboundEmail, "strippedTextReply" | "textBody" | "htmlBody">): string {
  const stripped = email.strippedTextReply?.trim();
  if (stripped) return stripped;
  const text = email.textBody?.trim();
  if (text) return text;
  return htmlToText(email.htmlBody ?? "");
}

/**
 * Recover readable text from an HTML-only message.
 *
 * Regex, not a DOM parse, on purpose: building a document from attacker markup — even a detached
 * one — is exactly the step this component exists to avoid, and `innerHTML` on a detached node
 * still resolves external references in some browsers. Script and style CONTENT is dropped
 * first, so their bodies don't survive as visible text once the tags are stripped.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    // Stripping tags leaves a space where each one stood, so without this every recovered line
    // starts and ends with padding — visible as a ragged left edge in the rendered body.
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}
