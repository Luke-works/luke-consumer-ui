import { describe, it, expect } from "vitest";
import { createAnalyticsEngine } from "@lukeflow/analytics-core";
import {
  SUBMISSIONS_SCHEMA,
  SUBMISSION_FIELDS,
  summarizeSubmissions,
  toSubmissionRows,
} from "./analyticsDataset";
import type { FormInstance } from "./formInstancesApi";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 5, 1, 9, 0, 0);

const instance = (over: Partial<FormInstance> = {}): FormInstance =>
  ({
    id: "i1",
    token: "t1",
    definitionCode: "CONTACT",
    version: 1,
    state: "SUBMITTED",
    createdAt: T0,
    submittedAt: T0 + 2 * HOUR,
    ...over,
  }) as FormInstance;

describe("toSubmissionRows", () => {
  it("derives turnaround in hours from created → submitted", () => {
    const [row] = toSubmissionRows([instance()]);
    expect(row[SUBMISSION_FIELDS.turnaroundHours]).toBe(2);
    expect(row[SUBMISSION_FIELDS.submitted]).toBe(true);
  });

  it("leaves turnaround NULL for an unsubmitted instance, never 0", () => {
    // A 0 would be averaged in as "instant", making the tenant look faster than it is.
    // (Null, not undefined: DataRow values are ScalarValue, and `avg` skips nulls — pinned below.)
    const [row] = toSubmissionRows([instance({ state: "OPEN", submittedAt: undefined })]);
    expect(row[SUBMISSION_FIELDS.turnaroundHours]).toBeNull();
    expect(row[SUBMISSION_FIELDS.submittedAt]).toBeNull();
    expect(row[SUBMISSION_FIELDS.submitted]).toBe(false);
  });

  it("drops a negative turnaround rather than averaging clock skew in", () => {
    const [row] = toSubmissionRows([instance({ submittedAt: T0 - HOUR })]);
    expect(row[SUBMISSION_FIELDS.turnaroundHours]).toBeNull();
  });

  it("emits dates as ISO strings so the engine buckets them as dates, not numbers", () => {
    const [row] = toSubmissionRows([instance()]);
    expect(row[SUBMISSION_FIELDS.createdAt]).toBe(new Date(T0).toISOString());
  });
});

describe("summarizeSubmissions", () => {
  it("reports completion, distinct forms, and mean turnaround over submitted rows only", () => {
    const rows = toSubmissionRows([
      instance({ submittedAt: T0 + 2 * HOUR }),
      instance({ definitionCode: "SIGNUP", submittedAt: T0 + 4 * HOUR }),
      instance({ definitionCode: "SIGNUP", state: "OPEN", submittedAt: undefined }),
    ]);
    const s = summarizeSubmissions(rows);
    expect(s.instances).toBe(3);
    expect(s.submitted).toBe(2);
    expect(s.completionRate).toBe(66.7);
    expect(s.forms).toBe(2);
    expect(s.avgTurnaroundHours).toBe(3); // (2 + 4) / 2 — the unsubmitted row is not a 0
  });

  it("is safe on an empty tenant", () => {
    const s = summarizeSubmissions([]);
    expect(s).toMatchObject({ instances: 0, submitted: 0, completionRate: 0, avgTurnaroundHours: null });
  });
});

describe("the dataset actually answers the dashboard's queries", () => {
  const rows = toSubmissionRows([
    instance({ definitionCode: "CONTACT", state: "SUBMITTED", submittedAt: T0 + 2 * HOUR }),
    instance({ definitionCode: "CONTACT", state: "SUBMITTED", submittedAt: T0 + 6 * HOUR }),
    instance({ definitionCode: "SIGNUP", state: "OPEN", submittedAt: undefined }),
  ]);
  const engine = createAnalyticsEngine(SUBMISSIONS_SCHEMA, { rows });

  it("counts submissions per form", () => {
    const result = engine.run({
      dimensions: [{ key: "form", field: SUBMISSION_FIELDS.form }],
      measures: [{ key: "value", agg: "count" }],
    });
    const byForm = Object.fromEntries(result.rows.map((r) => [r.form, r.value]));
    expect(byForm).toEqual({ CONTACT: 2, SIGNUP: 1 });
  });

  it("averages turnaround per form, skipping rows that have none", () => {
    const result = engine.run({
      dimensions: [{ key: "form", field: SUBMISSION_FIELDS.form }],
      measures: [{ key: "value", agg: "avg", field: SUBMISSION_FIELDS.turnaroundHours }],
    });
    const byForm = Object.fromEntries(result.rows.map((r) => [r.form, r.value]));
    expect(byForm.CONTACT).toBe(4); // (2 + 6) / 2
  });

  it("buckets submissions by day", () => {
    const result = engine.run({
      dimensions: [{ key: "day", field: SUBMISSION_FIELDS.createdAt, granularity: "day" }],
      measures: [{ key: "value", agg: "count" }],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].value).toBe(3);
  });
});
