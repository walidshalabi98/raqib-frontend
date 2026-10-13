import { describe, expect, it } from "vitest";
import { chartValue, indicatorProgress, isCountUnit, progressBarPercent, progressTowardTarget, trendChartRows, trendPoints } from "@/lib/trends";
import type { DonorSurveyAggregate } from "@/types/api";

const cell = (count: number | null) => ({ key: null, count, suppressed: count === null });
const aggregate = (period: string, value: number | null, overrides: Partial<DonorSurveyAggregate> = {}): DonorSurveyAggregate => ({
  indicatorId: "i-1",
  period,
  submissions: cell(value === null ? null : 25),
  aggregation: "mean",
  value,
  numericAnswers: cell(value === null ? null : 25),
  ...overrides,
});

describe("trendPoints", () => {
  it("keeps staff trends as they are", () => {
    const dataPoints = [
      { value: "3", date: "2026-02-10T00:00:00.000Z" },
      { value: "5", date: "2026-03-10T00:00:00.000Z" },
    ];
    expect(trendPoints({ dataPoints })).toEqual(dataPoints);
    expect(trendPoints({})).toEqual([]);
  });

  it("plots donor sums and means on the first of their month, in date order, and skips hidden values and yes counts", () => {
    const points = trendPoints({
      dataPoints: [{ value: "40", date: "2026-03-15T00:00:00.000Z" }],
      surveyAggregates: [
        aggregate("2026-04", 0.6),
        aggregate("2026-02", 0.4),
        aggregate("2026-05", null),
        aggregate("bad", 1),
        // A number of yes answers is not on the indicator's scale: never plotted.
        aggregate("2026-06", 20, { aggregation: "yes_count" }),
      ],
    });
    expect(points).toEqual([
      { value: 0.4, date: "2026-02-01" },
      { value: "40", date: "2026-03-15T00:00:00.000Z" },
      { value: 0.6, date: "2026-04-01" },
    ]);
  });
});

describe("chartValue", () => {
  it("reads numbers and typed numbers, never turning text into 0", () => {
    expect(chartValue(12)).toBe(12);
    expect(chartValue("25")).toBe(25);
    expect(chartValue("1,200")).toBe(1200);
    expect(chartValue("42%")).toBe(42);
    expect(chartValue("٤٢٪")).toBe(42);
    expect(chartValue("N/A")).toBeNull();
    expect(chartValue("12 people")).toBeNull();
    expect(chartValue(null)).toBeNull();
    expect(chartValue(Number.NaN)).toBeNull();
  });
});

describe("trendChartRows", () => {
  it("puts months in calendar order across years, with each trend's latest numeric value that month", () => {
    const rows = trendChartRows([
      {
        dataPoints: [
          { value: "30", date: "2026-01-20T00:00:00.000Z" },
          { value: "10", date: "2025-12-05T00:00:00.000Z" },
          { value: "12", date: "2025-12-28T00:00:00.000Z" },
          // Not a number: not drawn, and it does not hide the month's earlier value.
          { value: "pending", date: "2025-12-30T00:00:00.000Z" },
        ],
      },
      { dataPoints: [{ value: "5", date: "2026-02-01T00:00:00.000Z" }, { value: "7", date: "not a date" }] },
    ]);
    expect(rows).toEqual([
      { month: "2025-12", values: [12, null] },
      { month: "2026-01", values: [30, null] },
      { month: "2026-02", values: [null, 5] },
    ]);
  });

  it("charts the donor shape: staff-entered results plus monthly survey aggregates (sums and means only)", () => {
    const rows = trendChartRows([
      {
        dataPoints: [{ value: "20", date: "2026-06-15T00:00:00.000Z" }],
        surveyAggregates: [aggregate("2026-08", 4.5), aggregate("2026-09", 15, { aggregation: "yes_count" })],
      },
    ]);
    expect(rows).toEqual([
      { month: "2026-06", values: [20] },
      { month: "2026-08", values: [4.5] },
    ]);
  });

  it("is empty without points", () => {
    expect(trendChartRows([])).toEqual([]);
    expect(trendChartRows([{ dataPoints: [] }, {}])).toEqual([]);
  });
});

describe("progressTowardTarget", () => {
  it("measures from the baseline, for indicators to increase and to reduce", () => {
    expect(progressTowardTarget("20%", "60%", "45%")).toBe(63);
    // Reduce: baseline 40%, target 20%, current 38% is a tenth of the way, never a full bar.
    expect(progressTowardTarget("40%", "20%", "38%")).toBe(10);
    // No change from a baseline of 60 is no progress, never 75%.
    expect(progressTowardTarget("60", "80", "60")).toBe(0);
    expect(progressTowardTarget("60", "80", "50")).toBe(-50);
    expect(progressTowardTarget("٤٠٪", "٢٠٪", "٣٠٪")).toBe(50);
  });

  it("is null when it cannot be computed honestly", () => {
    expect(progressTowardTarget("50", "50", "60")).toBeNull();
    expect(progressTowardTarget(null, "60", "45")).toBeNull();
    expect(progressTowardTarget("20", "about 60", "45")).toBeNull();
    // A proportion with percentages.
    expect(progressTowardTarget("0.35", "50%", "40%")).toBeNull();
  });
});

describe("indicatorProgress", () => {
  it("follows the backend: from baseline to target when there is a baseline", () => {
    expect(indicatorProgress({ level: "outcome", unit: "%", baselineValue: "40%", targetValue: "20%", currentValue: "38%" })).toEqual({ percent: 10, noBaseline: false });
    expect(indicatorProgress({ level: "outcome", unit: "number", baselineValue: "60", targetValue: "80", currentValue: "60" })).toEqual({ percent: 0, noBaseline: false });
  });

  it("uses current / target only for an output or activity count with no baseline", () => {
    expect(indicatorProgress({ level: "output", unit: "people", baselineValue: null, targetValue: "400", currentValue: "100" })).toEqual({ percent: 25, noBaseline: true });
    expect(indicatorProgress({ level: "activity", unit: "number of sessions", baselineValue: "", targetValue: "20", currentValue: "5" })).toEqual({ percent: 25, noBaseline: true });
  });

  it("shows no progress for an outcome, a percentage or a rate without a baseline, or a target of 0", () => {
    expect(indicatorProgress({ level: "outcome", unit: "number", baselineValue: null, targetValue: "400", currentValue: "100" })).toBeNull();
    expect(indicatorProgress({ level: "output", unit: "%", baselineValue: null, targetValue: "60%", currentValue: "45%" })).toBeNull();
    expect(indicatorProgress({ level: "output", unit: "number per 1,000", baselineValue: null, targetValue: "4", currentValue: "2" })).toBeNull();
    expect(indicatorProgress({ level: "output", unit: undefined, baselineValue: null, targetValue: "4", currentValue: "2" })).toBeNull();
    expect(indicatorProgress({ level: "output", unit: "people", baselineValue: null, targetValue: "0", currentValue: "2" })).toBeNull();
    expect(indicatorProgress({ level: "output", unit: "people", baselineValue: "n/a", targetValue: "40", currentValue: "2" })).toBeNull();
  });
});

describe("progressBarPercent", () => {
  it("is the progress between 0 and 100", () => {
    expect(progressBarPercent({ level: "outcome", baselineValue: "20%", targetValue: "60%", currentValue: "45%" })).toBe(63);
    expect(progressBarPercent({ level: "outcome", baselineValue: "40%", targetValue: "20%", currentValue: "38%" })).toBe(10);
    expect(progressBarPercent({ level: "outcome", baselineValue: "60", targetValue: "80", currentValue: "50" })).toBe(0);
    expect(progressBarPercent({ level: "output", unit: "people", baselineValue: null, targetValue: "100", currentValue: "120" })).toBe(100);
  });

  it("draws nothing rather than guessing", () => {
    expect(progressBarPercent({ level: "outcome", baselineValue: null, targetValue: "55%", currentValue: "44%" })).toBeNull();
    expect(progressBarPercent({ level: "outcome", baselineValue: "20", targetValue: null, currentValue: "40" })).toBeNull();
    expect(progressBarPercent({ level: "outcome", baselineValue: "20", targetValue: "100", currentValue: "about half" })).toBeNull();
  });
});

describe("isCountUnit", () => {
  it("knows counts from rates", () => {
    for (const unit of ["number", "People", "households", "number of sessions", "#"]) expect(isCountUnit(unit)).toBe(true);
    for (const unit of ["%", "ILS", "number per 1,000 live births", "number/km2", "ratio", "", null]) expect(isCountUnit(unit)).toBe(false);
  });
});
