/**
 * FormActivityTimeline — a form's audit trail, as a readable timeline.
 *
 * The feed used to be a flat list of raw slugs (`checked_in`, `embed_version_set`) with the
 * underscores swapped for spaces, every row weighted the same. With twenty-odd events that reads as
 * noise: you cannot see at a glance which entries are the ones that mattered (published, signed off)
 * versus the routine checkouts around them.
 *
 * So: events are grouped by day, each gets an icon and colour keyed to what KIND of change it was,
 * versions render as chips, and the raw action slug never reaches the screen. The lifecycle
 * milestones — published, signed off — are the ones that carry colour; everything else is quiet.
 */
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  CodeXml,
  FilePlus2,
  History,
  LockOpen,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { AuditEvent } from "../../lib/formsApi";

type Tone = "brand" | "success" | "amber" | "error" | "muted";

type Entry = {
  /** What a person would call this, sentence-style. */
  label: string;
  icon: LucideIcon;
  tone: Tone;
};

/**
 * The action vocabulary written by core-engine's `FormAuditService`. An unknown action falls back to
 * a de-slugged label rather than being hidden — an audit trail that silently drops entries it doesn't
 * recognise is worse than one showing a slug, because you can't tell the difference from nothing
 * having happened.
 */
const ENTRIES: Record<string, Entry> = {
  created: { label: "Created", icon: FilePlus2, tone: "brand" },
  checked_out: { label: "Checked out", icon: LockOpen, tone: "muted" },
  checked_in: { label: "Checked in", icon: Save, tone: "muted" },
  tested: { label: "Signed off", icon: BadgeCheck, tone: "success" },
  published: { label: "Published", icon: Rocket, tone: "success" },
  discarded: { label: "Changes discarded", icon: Undo2, tone: "muted" },
  restored: { label: "Restored", icon: History, tone: "muted" },
  restored_to_draft: { label: "Restored to draft", icon: History, tone: "muted" },
  archived: { label: "Archived", icon: Archive, tone: "amber" },
  unarchived: { label: "Unarchived", icon: ArchiveRestore, tone: "muted" },
  deleted: { label: "Deleted", icon: Trash2, tone: "error" },
  embed_version_set: { label: "Embed version changed", icon: CodeXml, tone: "brand" },
  branding_shown: { label: "Lukeflow tag shown", icon: Sparkles, tone: "brand" },
  branding_hidden: { label: "Lukeflow tag hidden", icon: Sparkles, tone: "muted" },
};

const TONE_STYLES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-400 dark:ring-brand-500/20",
  success:
    "bg-success-50 text-success-600 ring-success-100 dark:bg-success-500/15 dark:text-success-400 dark:ring-success-500/20",
  amber: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/20",
  error: "bg-error-50 text-error-500 ring-error-100 dark:bg-error-500/15 dark:text-error-400 dark:ring-error-500/20",
  muted: "bg-gray-100 text-gray-500 ring-gray-100 dark:bg-white/10 dark:text-gray-400 dark:ring-white/10",
};

function entryFor(action: string): Entry {
  return ENTRIES[action] ?? { label: action.replace(/_/g, " "), icon: History, tone: "muted" };
}

/**
 * Split a detail string into an optional version chip and the remaining words.
 * `"v7"` → chip only; `"Signed off v7"` → chip + "Signed off"; `"PINNED v4"` → chip + "PINNED".
 * A version is the single most scannable thing in the feed, so it earns the chip.
 */
function splitDetail(detail?: string): { version?: string; rest?: string } {
  if (!detail) return {};
  const m = detail.match(/\bv(\d+)\b/);
  if (!m) return { rest: detail };
  const rest = detail.replace(m[0], "").replace(/\s+/g, " ").trim();
  return { version: m[0], rest: rest || undefined };
}

const DAY = 24 * 60 * 60 * 1000;

/** "Today" / "Yesterday" / "Mon 28 Jul 2026" — a heading you can scan without parsing a date. */
function dayLabel(at: number): string {
  const d = new Date(at);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Consecutive events on the same calendar day, newest first (the API already returns newest-first). */
function groupByDay(events: AuditEvent[]): { day: string; events: AuditEvent[] }[] {
  const out: { day: string; events: AuditEvent[] }[] = [];
  for (const ev of events) {
    const day = dayLabel(ev.at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.events.push(ev);
    else out.push({ day, events: [ev] });
  }
  return out;
}

export default function FormActivityTimeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center">
        <History className="mx-auto size-8 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Nothing has happened to this form yet.</p>
        <p className="mt-1 text-xs text-gray-400">
          Check-ins, sign-offs and publishes will appear here as you work on it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groupByDay(events).map(({ day, events: dayEvents }) => (
        <section key={day}>
          {/* Sticky so the day you're reading stays named while you scroll a long trail. */}
          <h3 className="sticky top-0 z-10 -mx-1 bg-white/95 px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 backdrop-blur dark:bg-gray-900/95">
            {day}
          </h3>
          <ol className="relative mt-1">
            {/* The rail. Inset to pass through the centre of the 28px icons. */}
            <span
              aria-hidden
              className="absolute bottom-4 left-[13px] top-4 w-px bg-gray-200 dark:bg-gray-700"
            />
            {dayEvents.map((ev, i) => {
              const { label, icon: Icon, tone } = entryFor(ev.action);
              const { version, rest } = splitDetail(ev.detail);
              // `tested` carries detail "Signed off v7", whose leftover words are the label again —
              // rendering both gave "Signed off · v7 · Signed off". Show the remainder only when it
              // actually adds something (e.g. "PINNED" on an embed-version change).
              const extra = rest && rest.toLowerCase() !== label.toLowerCase() ? rest : undefined;
              return (
                <li key={`${ev.at}-${i}`} className="relative flex gap-3 py-2">
                  <span
                    className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-gray-900 ${TONE_STYLES[tone]}`}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-gray-800 dark:text-white/90">{label}</span>
                      {version && (
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
                          {version}
                        </span>
                      )}
                      {extra && <span className="text-xs text-gray-500 dark:text-gray-400">{extra}</span>}
                      {/* Pushed right on a wide row, wraps under on a narrow one — the absolute
                          timestamp stays available on hover for anything needing a precise record. */}
                      <time
                        dateTime={new Date(ev.at).toISOString()}
                        title={new Date(ev.at).toLocaleString()}
                        className="ms-auto shrink-0 text-xs tabular-nums text-gray-400"
                      >
                        {time(ev.at)}
                      </time>
                    </div>
                    {(ev.actorName || ev.actor) && (
                      <p className="truncate text-xs text-gray-400">
                        {ev.actorName ?? ev.actor?.replace(/^workos:/, "")}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
