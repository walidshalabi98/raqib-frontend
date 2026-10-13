import { parseNumeric } from "@/lib/numbers";
import type { DonorSurveyAggregate } from "@/types/api";

/**
 * Points of a dashboard trend (GET /api/dashboard/projects/:id/dashboard `trends`). Pure functions only.
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

/**
 * A trend value as a number for charts: numbers as they are; text read like a typed number (src/lib/numbers.ts),
 * with a trailing "%" allowed ("42%" is 42); null for anything else ("N/A", "12 people"), so a value that is not
 * a number is never drawn as 0.
 */
export function chartValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  return parseNumeric(value.trim().replace(/\s*[%٪]$/, ""));
}

/** One month of the trend chart: "YYYY-MM" (UTC) and each trend's value that month, in the order of the trends. */
export interface TrendChartRow {
  month: string;
  values: (number | null)[];
}

/**
 * The trend chart's rows: one per month (UTC) that has a point in any of `trends`, oldest first. A trend's value
 * for a month is its latest numeric point that month (null when it has none). Donor aggregates count as points
 * (trendPoints). Points whose date cannot be read are left out, and months are compared as "YYYY-MM" text, so
 * years never mix (December 2025 comes before January 2026).
 */
export function trendChartRows(trends: readonly TrendLike[]): TrendChartRow[] {
  const byMonth = new Map<string, (number | null)[]>();
  trends.forEach((trend, index) => {
    for (const point of trendPoints(trend)) {
      const time = Date.parse(point.date);
      const value = chartValue(point.value);
      if (Number.isNaN(time)) continue;
      const month = new Date(time).toISOString().slice(0, 7);
      const values = byMonth.get(month) ?? trends.map(() => null);
      // Points come oldest first, so the latest numeric point of the month wins.
      if (value !== null) values[index] = value;
      byMonth.set(month, values);
    }
  });
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, values]) => ({ month, values }));
}

// ------------------------------------------------------------------ progress
// Same rules as the backend's indicatorProgress (raqib-backend src/services/ai/indicatorFigures.ts and
// isCountUnit in src/services/dataPoints/breakdown.ts), so the scorecard never contradicts the reports.

const COUNT_UNITS = new Set(["number", "count", "#", "people", "persons", "individuals", "households", "beneficiaries", "participants"]);
/** A rate or ratio written as a number: "number per 1,000 live births", "number/km2", "number_per_100k". */
const RATE_WORDS = /(^|[\s_])(per|ratio|rate|index)([\s_]|$)|\//;
/** Levels whose count indicators start from zero when no baseline is recorded (the project delivers them). */
const ZERO_START_LEVELS = new Set(["output", "activity"]);
const PERCENT_SUFFIX = /\s*[%\u066A]$/;

/** True when the unit says the indicator counts something ("number", "people", "households"…), never a rate. */
export function isCountUnit(unit: unknown): boolean {
  const u = typeof unit === "string" ? unit.trim().toLowerCase() : "";
  if (u === "" || RATE_WORDS.test(u)) return false;
  return COUNT_UNITS.has(u) || u.startsWith("number");
}

interface Figure {
  value: number;
  percent: boolean;
}

function readFigure(value: unknown): Figure | null {
  if (typeof value === "number") return Number.isFinite(value) ? { value, percent: false } : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  const percent = PERCENT_SUFFIX.test(text);
  const number = parseNumeric(percent ? text.replace(PERCENT_SUFFIX, "") : text);
  return number === null ? null : { value: number, percent };
}

/** "50%" with "0.35": a percentage and a proportion cannot be compared, so no progress is shown. */
function mixesPercentAndProportion(figures: readonly Figure[]): boolean {
  return figures.some((f) => f.percent) && figures.some((f) => !f.percent && f.value !== 0 && Math.abs(f.value) < 1);
}

/**
 * Progress from baseline to target in percent, rounded: (current − baseline) / (target − baseline). It works for
 * indicators to reduce as well (baseline 40%, target 20%, current 38% is 10%). Null unless all three values are
 * plain numbers, the target differs from the baseline and the values do not mix percentages and proportions.
 */
export function progressTowardTarget(baseline: unknown, target: unknown, current: unknown): number | null {
  const b = readFigure(baseline);
  const t = readFigure(target);
  const c = readFigure(current);
  if (b === null || t === null || c === null || t.value === b.value) return null;
  if (mixesPercentAndProportion([b, t, c])) return null;
  return Math.round(((c.value - b.value) / (t.value - b.value)) * 100);
}

export interface IndicatorProgressInput {
  level?: unknown;
  unit?: unknown;
  baselineValue?: unknown;
  targetValue?: unknown;
  currentValue?: unknown;
}

export interface IndicatorProgress {
  /** Rounded percent; below 0 when the value moved away from the target, above 100 past it. */
  percent: number;
  /** No baseline recorded: current / target of an output or activity count, which starts from zero. */
  noBaseline: boolean;
}

/**
 * Progress of an indicator, as the backend computes it: from baseline to target; or, for an output or activity
 * count with no baseline recorded, current / target. Null otherwise (outcome and impact levels, percentages,
 * ratios and amounts without a baseline, values that are not plain numbers, a target of 0 or less): no progress
 * is then shown rather than a guessed one.
 */
export function indicatorProgress(indicator: IndicatorProgressInput): IndicatorProgress | null {
  const fromBaseline = progressTowardTarget(indicator.baselineValue, indicator.targetValue, indicator.currentValue);
  if (fromBaseline !== null) return { percent: fromBaseline, noBaseline: false };
  const baseline = typeof indicator.baselineValue === "number" ? String(indicator.baselineValue) : indicator.baselineValue;
  const hasBaseline = typeof baseline === "string" && baseline.trim() !== "";
  if (hasBaseline || typeof indicator.level !== "string" || !ZERO_START_LEVELS.has(indicator.level) || !isCountUnit(indicator.unit)) return null;
  const t = readFigure(indicator.targetValue);
  const c = readFigure(indicator.currentValue);
  if (t === null || c === null || t.percent || c.percent || t.value <= 0) return null;
  return { percent: Math.round((c.value / t.value) * 100), noBaseline: true };
}

/** The scorecard bar's width, 0 to 100 (indicatorProgress, clamped); null when no progress can be computed. */
export function progressBarPercent(indicator: IndicatorProgressInput): number | null {
  const progress = indicatorProgress(indicator);
  return progress === null ? null : Math.min(100, Math.max(0, progress.percent));
}
