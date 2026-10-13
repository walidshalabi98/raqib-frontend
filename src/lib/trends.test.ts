import { describe, expect, it } from "vitest";
import { trendPoints } from "@/lib/trends";
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
