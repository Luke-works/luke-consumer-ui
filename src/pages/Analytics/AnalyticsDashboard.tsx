/**
 * Analytics — the first surface built on @lukeflow/analytics-core + analytics-react.
 *
 * It charts the tenant's form submissions: the engine runs real group-by/aggregate queries over
 * rows derived from the instance list (see lib/analyticsDataset), and analytics-react draws the
 * result. There is no ANALYTICS capability server-side yet, so nothing is persisted and the page
 * is gated on FORMS — the data it reads — rather than on a capability that doesn't exist.
 *
 * Chart choices follow the data's job, not decoration: headline numbers are stat tiles (not
 * one-bar charts), trend-over-time is an area, and "how many per X" is a bar. Every chart is a
 * single series, so each uses one hue and needs no legend — its title says what is plotted.
 * Colours are validated against these exact card surfaces in both modes (see lib/analyticsTheme).
 */
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Clock, FileCheck2, Layers, RefreshCw } from "lucide-react";
import { createAnalyticsEngine, type ChartSpec } from "@lukeflow/analytics-core";
import { EngineChart } from "@lukeflow/analytics-react";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { isAbortError } from "../../lib/abort";
import { INSTANCE_PAGE_MAX, listInstances, type FormInstance } from "../../lib/formInstancesApi";
import {
  SUBMISSIONS_SCHEMA,
  SUBMISSION_FIELDS,
  summarizeSubmissions,
  toSubmissionRows,
} from "../../lib/analyticsDataset";
import {
  areaOptions,
  barOptions,
  barPadding,
  CARD_WIDTH,
  chartPalette,
  integerTicks,
} from "../../lib/analyticsTheme";

const card =
  "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";

export default function AnalyticsDashboard() {
  const { session } = useAuth();
  const { theme } = useTheme();
  const tenant = session?.tenant ?? null;

  const [items, setItems] = useState<FormInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!tenant) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    listInstances(tenant, { maxResults: INSTANCE_PAGE_MAX, sort: "createdAt", order: "desc" }, ctl.signal)
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (isAbortError(e)) return;
        setError(e instanceof Error ? e.message : "Couldn't load submissions.");
        setLoading(false);
      });
    return () => ctl.abort();
  }, [tenant, reloadKey]);

  const rows = useMemo(() => toSubmissionRows(items), [items]);
  const engine = useMemo(() => createAnalyticsEngine(SUBMISSIONS_SCHEMA, { rows }), [rows]);
  const totals = useMemo(() => summarizeSubmissions(rows), [rows]);
  const palette = useMemo(() => chartPalette(theme), [theme]);

  const specs = useMemo(() => {
    // Running a query here is cheap (in-memory) and lets the axis ticks and bar widths be derived
    // from the real data instead of guessed: integer ticks for counts, thin marks for few bars.
    const countFor = (field: string, filters?: object[]) =>
      engine.run({
        dimensions: [{ key: "k", field }],
        measures: [{ key: "v", agg: "count" }],
        ...(filters ? { filters } : {}),
      } as Parameters<typeof engine.run>[0]).rows;
    const maxOf = (rows: { v?: unknown }[]) =>
      rows.reduce((m, r) => Math.max(m, typeof r.v === "number" ? r.v : 0), 0);

    const formRows = countFor(SUBMISSION_FIELDS.form);
    const stateRows = countFor(SUBMISSION_FIELDS.state);
    const turnaroundRows = countFor(SUBMISSION_FIELDS.form, [
      { field: SUBMISSION_FIELDS.submitted, operator: "eq", value: true },
    ]);
    const dayRows = engine.run({
      dimensions: [{ key: "k", field: SUBMISSION_FIELDS.createdAt, granularity: "day" }],
      measures: [{ key: "v", agg: "count" }],
    }).rows;

    const countAxis = (max: number) => ({
      axisLeft: { tickValues: integerTicks(max) },
      gridYValues: integerTicks(max),
    });
    return {
      overTime: {
        type: "area",
        query: {
          dimensions: [{ key: "day", field: SUBMISSION_FIELDS.createdAt, granularity: "day" }],
          measures: [{ key: "submissions", agg: "count", label: "Submissions" }],
          sort: { key: "day", direction: "asc" },
        },
        encoding: { index: "day", values: ["submissions"] },
        options: {
          ...areaOptions(palette, palette.series1),
          axisBottom: { tickRotation: -35, tickPadding: 6 },
          ...countAxis(maxOf(dayRows)),
        },
      },
      byForm: {
        type: "bar",
        query: {
          dimensions: [{ key: "form", field: SUBMISSION_FIELDS.form }],
          measures: [{ key: "submissions", agg: "count", label: "Submissions" }],
          sort: { key: "submissions", direction: "desc" },
          limit: 8,
        },
        encoding: { index: "form", values: ["submissions"] },
        options: {
          ...barOptions(palette, palette.series1),
          padding: barPadding(formRows.length, CARD_WIDTH.half),
          axisBottom: { tickRotation: -35, tickPadding: 6 },
          ...countAxis(maxOf(formRows)),
        },
      },
      byState: {
        type: "bar",
        query: {
          dimensions: [{ key: "state", field: SUBMISSION_FIELDS.state }],
          measures: [{ key: "submissions", agg: "count", label: "Submissions" }],
          sort: { key: "submissions", direction: "desc" },
        },
        // Horizontal: state names are long, and a horizontal bar keeps them readable
        // instead of rotating every label 35 degrees.
        encoding: { index: "state", values: ["submissions"] },
        options: {
          ...barOptions(palette, palette.series1, true),
          padding: barPadding(stateRows.length, 240), // vertical band on a horizontal chart
          margin: { top: 16, right: 24, bottom: 40, left: 104 },
          // Horizontal bars put the count on the BOTTOM axis, so that is the one to keep whole.
          axisBottom: { tickValues: integerTicks(maxOf(stateRows)) },
          gridXValues: integerTicks(maxOf(stateRows)),
        },
      },
      turnaround: {
        type: "bar",
        query: {
          dimensions: [{ key: "form", field: SUBMISSION_FIELDS.form }],
          measures: [
            { key: "hours", agg: "avg", field: SUBMISSION_FIELDS.turnaroundHours, label: "Avg hours" },
          ],
          // Only completed submissions have a turnaround. Without this filter a form with none
          // still gets a category slot and draws NO bar — which reads as "zero hours", the most
          // flattering possible misreading, rather than "nothing has been completed yet".
          filters: [{ field: SUBMISSION_FIELDS.submitted, operator: "eq", value: true }],
          sort: { key: "hours", direction: "desc" },
          limit: 8,
        },
        encoding: { index: "form", values: ["hours"] },
        // A different measure family (duration, not counts) gets the second hue so it can
        // never be misread as "more submissions".
        options: {
          ...barOptions(palette, palette.series2),
          padding: barPadding(turnaroundRows.length, CARD_WIDTH.full),
          axisBottom: { tickRotation: -35, tickPadding: 6 },
          // Hours are continuous, so fractions are legitimate here — but d3's default ~10 ticks
          // over a small range prints a ladder of 0.2 steps. Ask for a handful instead.
          axisLeft: { tickValues: 5 },
          gridYValues: 5,
        },
      },
    } satisfies Record<string, ChartSpec>;
  }, [palette, engine]);

  const truncated = items.length < total;
  const empty = !loading && !error && rows.length === 0;

  return (
    <>
      <PageMeta title="Analytics | Lukeflow" description="Submission analytics for your forms." />

      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10">
              <BarChart3 className="size-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Analytics</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                How your forms are performing — volume over time, where submissions come from, and
                how long they take to complete.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {!tenant ? (
          <div className={card}>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Join or create an organization to see analytics.
            </p>
          </div>
        ) : error ? (
          <div className={card}>
            <p className="text-sm text-error-500">{error}</p>
          </div>
        ) : loading ? (
          <p className="py-16 text-center text-sm text-gray-400">Loading…</p>
        ) : empty ? (
          <div className={`${card} py-12 text-center`}>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              No submissions yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
              Once people start filling in your forms, this page charts how many arrive, which
              forms they come from, and how long they take to complete.
            </p>
          </div>
        ) : (
          <>
            {/* Headline numbers are stat tiles, not one-bar charts. */}
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Submissions" value={String(totals.instances)} icon={Layers} />
              <StatTile label="Completed" value={String(totals.submitted)} icon={FileCheck2} />
              <StatTile label="Completion rate" value={`${totals.completionRate}%`} icon={BarChart3} />
              <StatTile
                label="Avg turnaround"
                value={totals.avgTurnaroundHours === null ? "—" : `${totals.avgTurnaroundHours} h`}
                icon={Clock}
              />
            </div>

            {truncated && (
              /* Never let a capped page read as the whole picture: the endpoint returns at most
                 INSTANCE_PAGE_MAX rows, so say plainly what is being charted. */
              <p className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                Charting the most recent {items.length.toLocaleString()} of{" "}
                {total.toLocaleString()} submissions — the API returns at most{" "}
                {INSTANCE_PAGE_MAX} per read, so these figures describe that sample, not the full
                history.
              </p>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <ChartCard
                title="Submissions over time"
                subtitle="Instances created per day"
                className="lg:col-span-2"
              >
                <EngineChart spec={specs.overTime} engine={engine} />
              </ChartCard>

              <ChartCard title="Busiest forms" subtitle="Submissions per form (top 8)">
                <EngineChart spec={specs.byForm} engine={engine} />
              </ChartCard>

              <ChartCard title="Where submissions sit" subtitle="Instances by state">
                <EngineChart spec={specs.byState} engine={engine} />
              </ChartCard>

              <ChartCard
                title="Average turnaround"
                subtitle="Mean hours from created to submitted (completed only)"
                className="lg:col-span-2"
              >
                <EngineChart spec={specs.turnaround} engine={engine} />
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof BarChart3;
}) {
  return (
    <div className={card}>
      <div className="flex items-center gap-2 text-gray-400">
        <Icon className="size-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${card} ${className ?? ""}`}>
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      {/* Nivo's responsive wrapper needs a sized parent. */}
      <div className="mt-4 h-64">{children}</div>
    </div>
  );
}
