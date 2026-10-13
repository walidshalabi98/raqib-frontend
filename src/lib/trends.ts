import type { DonorSurveyAggregate } from "@/types/api";

/**
 * Points of a dashboard trend (GET /projects/:id/dashboard `trends`). Pure functions only.
 * Donor viewers never receive respondent-level rows (KoboToolbox submissions); they get one aggregate per
 * published month instead (`surveyAggregates`, small counts hidden), plotted on the first day of its month. Only sums and means are plotted: a number of yes answers is not on the indicator's scale (a
 * percent indicator would show a count), and both it and the number of answers are rounded, so no reliable
 * percentage can be worked out from them. Staff responses have no aggregates, so their trends are unchanged.
 */

export interface TrendPoint {
  value: string | number;
  /** An ISO date or date-time. */
  date: string;
}

export interface TrendLike {
  dataPoints?: readonly TrendPoint[] | null;
  surveyAggregates?: readonly DonorSurveyAggregate[] | null;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The data points plus every monthly aggregate that has a value, oldest first. */
export function trendPoints(trend: TrendLike): TrendPoint[] {
  const points: TrendPoint[] = [...(trend.dataPoints ?? [])];
  for (const aggregate of trend.surveyAggregates ?? []) {
    if (aggregate.aggregation === "yes_count" || typeof aggregate.value !== "number" || !MONTH.test(aggregate.period)) continue;
    points.push({ value: aggregate.value, date: `${aggregate.period}-01` });
  }
  const time = (point: TrendPoint) => {
    const parsed = Date.parse(point.date);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
  };
  return points.map((point, index) => ({ point, index })).sort((a, b) => time(a.point) - time(b.point) || a.index - b.index).map(({ point }) => point);
}
