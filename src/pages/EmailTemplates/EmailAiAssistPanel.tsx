import { useEffect, useRef, useState } from "react";
import LukeBuildsMark from "../../components/branding/LukeBuildsMark";
import Button from "../../components/ui/button/Button";
import { useAuth } from "../../context/AuthContext";
import { saveDraft } from "../../lib/emailTemplatesApi";
import { generateEmail, AgentCancelledError } from "../../lib/emailAgentApi";
import { repairEmailDoc, type EmailDoc } from "../../lib/emailDoc";

type Msg = { role: "you" | "ai"; text: string; error?: boolean; suggestions?: string[] };

const SUGGESTIONS = [
  "Make a welcome email with our logo and a blue Get Started button",
  "Add a heading that greets {{firstName}}",
  "Add a footer with an unsubscribe link",
  "Add a hero image and a short intro paragraph",
];

/**
 * Docked chat panel (a permanent right rail beside the live preview) that drives
 * the luke-agents email agent. It lives in the parent so its history survives the
 * preview re-renders each applied change triggers. On success it repairs the
 * returned EmailDoc, saveDrafts it, and hands it up via onApplied(doc, title),
 * which the parent applies locally (no page reload). onApplied is the signal that
 * an actual email change happened — off-topic chat never triggers it.
 */
export default function EmailAiAssistPanel({
  tenant,
  templateId,
  templateName,
  doc,
  subject,
  onApplied,
}: {
  tenant: string;
  templateId: string;
  templateName: string;
  doc: EmailDoc | null;
  subject: string;
  onApplied: (doc: EmailDoc, title: string) => void;
}) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [brain, setBrain] = useState<string | null>(null);
  const [coldHint, setColdHint] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setMessages((m) => [...m, { role: "you", text: msg }]);
    setInput("");
    setBusy(true);
    setColdHint(false);
    const controller = new AbortController();
    abortRef.current = controller;
    // After a few seconds, hint that the free-tier service may be waking up.
    const coldTimer = setTimeout(() => setColdHint(true), 5000);
    try {
      const result = await generateEmail(msg, doc, templateName, session?.tenant ?? undefined, controller.signal);
      setBrain(result.brain);
      const n = result.doc?.blocks?.length ?? 0;
      const text = result.reply?.trim() || `Done — the email now has ${n} block${n === 1 ? "" : "s"}.`;
      setMessages((m) => [...m, { role: "ai", text, suggestions: result.suggestions }]);
      // Only persist + re-render when the email actually changed; a question /
      // chit-chat leaves it untouched, so skip the apply.
      if (result.changed !== false && result.doc) {
        const { doc: clean } = repairEmailDoc(result.doc);
        await saveDraft(tenant, templateId, JSON.stringify(clean), clean.subject);
        onApplied(clean, result.title);
      }
    } catch (e) {
      // A user cancel isn't an error — note it quietly instead of a red banner.
      if (e instanceof AgentCancelledError) {
        setMessages((m) => [...m, { role: "ai", text: "Stopped." }]);
      } else {
        setMessages((m) => [...m, { role: "ai", error: true, text: (e as Error).message }]);
      }
    } finally {
      clearTimeout(coldTimer);
      setColdHint(false);
      abortRef.current = null;
      setBusy(false);
    }
  };

  const cancel = () => abortRef.current?.abort();

  void subject; // subject is edited inline in the toolbar; kept in the signature for parity.

  return (
    <div className="flex h-full min-h-[420px] w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 text-white shadow-sm">
          <LukeBuildsMark className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-gray-800 dark:text-white/90">
            Luke<span className="bg-gradient-to-r from-brand-500 to-purple-500 bg-clip-text text-transparent">Builds</span>
          </h2>
          <p className="truncate text-[11px] text-gray-400">
            Describe the email — I'll design it{brain ? ` · ${brain}` : ""}
          </p>
        </div>
      </div>

      {/* Log */}
      <div ref={logRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="px-1 pt-1 text-xs text-gray-400">Try one of these:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={busy}
                className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-600 transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i}>
              <div
                className={`max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "you"
                    ? "ml-auto bg-brand-500 text-white"
                    : m.error
                      ? "bg-error-50 text-error-600 ring-1 ring-error-200 dark:bg-error-500/10"
                      : "bg-gray-50 text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700"
                }`}
              >
                {m.error ? `⚠ ${m.text}` : m.text}
              </div>
              {/* Clickable suggestions under the most recent assistant reply. */}
              {m.role === "ai" && !m.error && m.suggestions && m.suggestions.length > 0 && i === messages.length - 1 && !busy && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="flex w-fit items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <span>{coldHint ? "Waking the assistant — this can take a few seconds…" : "Thinking…"}</span>
            <button
              type="button"
              onClick={cancel}
              className="text-xs font-medium text-brand-500 hover:text-brand-600"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-100 p-3 dark:border-gray-800">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="e.g. add a blue Get Started button linking to {{ctaUrl}}"
            disabled={busy}
            className="h-[58px] flex-1 resize-none rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:opacity-60 dark:border-gray-700 dark:text-white/90"
          />
          <Button size="sm" onClick={() => void send(input)} disabled={busy || !input.trim()}>
            Send
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-tight text-gray-400">
          Edits happen via chat. Keep <span className="font-mono">{"{{variables}}"}</span> for personalization.
        </p>
      </div>
    </div>
  );
}
