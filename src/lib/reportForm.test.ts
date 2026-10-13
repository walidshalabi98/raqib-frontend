import { describe, expect, it } from "vitest";
import { emptyReportForm, MAX_REPORT_TITLE, reportFormSchema, reportFormToPayload } from "@/lib/reportForm";

const errorsOf = (values: Record<string, unknown>) => {
  const result = reportFormSchema.safeParse({ ...emptyReportForm(), ...values });
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
};

describe("reportFormSchema", () => {
  it("requires a title that is not blank, as the server does (400 otherwise)", () => {
    expect(errorsOf({ title: "" })).toEqual({ title: "titleRequired" });
    expect(errorsOf({ title: "   " })).toEqual({ title: "titleRequired" });
    expect(errorsOf({ title: "x".repeat(MAX_REPORT_TITLE + 1) })).toEqual({ title: "titleTooLong" });
    expect(errorsOf({ title: "Q3 2026" })).toEqual({});
  });

  it("accepts known report types and donor formats only", () => {
    expect(Object.keys(errorsOf({ title: "Q3", type: "weekly" }))).toEqual(["type"]);
    expect(errorsOf({ title: "Q3", donorFormat: "acme" })).toEqual({ donorFormat: "donorFormat" });
    expect(errorsOf({ title: "Q3", type: "annual_review", donorFormat: "usaid" })).toEqual({});
  });

  it("takes an optional period of real dates that does not end before it starts", () => {
    expect(errorsOf({ title: "Q3", periodStart: "2026-02-30" })).toEqual({ periodStart: "invalidDate" });
    expect(errorsOf({ title: "Q3", periodStart: "2026-09-30", periodEnd: "2026-07-01" })).toEqual({ periodEnd: "endBeforeStart" });
    expect(errorsOf({ title: "Q3", periodStart: "2026-07-01", periodEnd: "2026-07-01" })).toEqual({});
    expect(errorsOf({ title: "Q3", periodEnd: "2026-07-01" })).toEqual({});
  });
});

describe("reportFormToPayload", () => {
  it("sends the title trimmed and leaves an empty period out", () => {
    expect(reportFormToPayload({ ...emptyReportForm(), title: "  Q3 2026  " })).toEqual({ type: "quarterly_summary", title: "Q3 2026", donorFormat: "eu" });
    expect(reportFormToPayload({ title: "Q3", type: "monthly_progress", donorFormat: "giz", periodStart: "2026-07-01", periodEnd: "2026-09-30" })).toEqual({
      type: "monthly_progress", title: "Q3", donorFormat: "giz", periodStart: "2026-07-01", periodEnd: "2026-09-30",
    });
  });
});
