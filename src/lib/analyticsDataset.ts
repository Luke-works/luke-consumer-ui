// Turns tenant data into the shape @lukeflow/analytics-core queries: a typed DatasetSchema plus
// plain DataRows. Pure and framework-free on purpose — the page just renders what this returns,
// and the interesting logic (what counts as a submission, how turnaround is derived) is unit
// tested rather than hidden inside a component.
import type { DataRow, DatasetSchema } from "@lukeflow/analytics-core";
import type { FormInstance } from "./formInstancesApi";

/** Field keys the dashboard's queries group and aggregate by. */
export const SUBMISSION_FIELDS = {
  form: "form",
  state: "state",
  createdAt: "createdAt",
  submittedAt: "submittedAt",
  turnaroundHours: "turnaroundHours",
  submitted: "submitted",
} as const;

/**
 * The dataset a form-submission dashboard queries.
 *
 * `turnaroundHours` is derived rather than stored: it is the only NUMERIC measure this data has,
 * so without it every widget could only ever count rows. It is NULL (not 0) for an instance that
 * was never submitted — averaging a 0 for "not finished yet" would quietly drag the average toward
 * zero and read as "we're fast", which is the opposite of the truth. `avg` skips nulls, which the
 * tests pin.
 */
export const SUBMISSIONS_SCHEMA: DatasetSchema = {
  name: "Form submissions",
  fields: [
    { key: SUBMISSION_FIELDS.form, label: "Form", type: "string" },
    { key: SUBMISSION_FIELDS.state, label: "State", type: "string" },
    { key: SUBMISSION_FIELDS.createdAt, label: "Created", type: "date" },
    { key: SUBMISSION_FIELDS.submittedAt, label: "Submitted", type: "date" },
    { key: SUBMISSION_FIELDS.turnaroundHours, label: "Turnaround (hours)", type: "number" },
    { key: SUBMISSION_FIELDS.submitted, label: "Was submitted", type: "boolean" },
  ],
};

const HOUR_MS = 3_600_000;

/** Round to 2dp so an average doesn't render 14 decimal places of float noise. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Map form instances onto dataset rows.
 *
 * Dates are emitted as ISO strings because that is what the engine's date bucketing parses; a
 * raw epoch number would be bucketed as a *number*, silently producing one group per millisecond.
 */
export function toSubmissionRows(instances: readonly FormInstance[]): DataRow[] {
  return instances.map((i) => {
    const submitted = typeof i.submittedAt === "number" && i.submittedAt > 0;
    // Guard against a submittedAt that precedes createdAt (clock skew across nodes, or a
    // back-dated import): a negative turnaround is not a real measurement, so drop it rather
    // than let it cancel out real ones in an average.
    const elapsed = submitted ? (i.submittedAt as number) - i.createdAt : -1;
    return {
      [SUBMISSION_FIELDS.form]: i.definitionCode,
      [SUBMISSION_FIELDS.state]: i.state,
      [SUBMISSION_FIELDS.createdAt]: new Date(i.createdAt).toISOString(),
      [SUBMISSION_FIELDS.submittedAt]: submitted
        ? new Date(i.submittedAt as number).toISOString()
        : null,
      [SUBMISSION_FIELDS.turnaroundHours]: elapsed >= 0 ? round2(elapsed / HOUR_MS) : null,
      [SUBMISSION_FIELDS.submitted]: submitted,
    } satisfies DataRow;
  });
}

/** Headline numbers shown above the charts (computed over the rows actually charted). */
export type SubmissionTotals = {
  instances: number;
  submitted: number;
  /** Submitted ÷ instances, 0–100, rounded to 1dp. 0 when there are no instances. */
  completionRate: number;
  /** Mean turnaround over submitted rows only, or null when nothing has been submitted. */
  avgTurnaroundHours: number | null;
  /** Distinct forms represented in the rows. */
  forms: number;
};

export function summarizeSubmissions(rows: readonly DataRow[]): SubmissionTotals {
  const submittedRows = rows.filter((r) => r[SUBMISSION_FIELDS.submitted] === true);
  const turnarounds = rows
    .map((r) => r[SUBMISSION_FIELDS.turnaroundHours])
    .filter((v): v is number => typeof v === "number");
  const forms = new Set(rows.map((r) => r[SUBMISSION_FIELDS.form])).size;
  return {
    instances: rows.length,
    submitted: submittedRows.length,
    completionRate: rows.length === 0 ? 0 : Math.round((submittedRows.length / rows.length) * 1000) / 10,
    avgTurnaroundHours:
      turnarounds.length === 0
        ? null
        : round2(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length),
    forms,
  };
}
