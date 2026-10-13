import type { TFunction } from "i18next";
import type { BeneficiaryStats, DisclosedCell, DonorBeneficiarySummary, DonorQualitativeEntry, QualitativeEntry } from "@/types/api";
import type { CsvRow } from "@/lib/csv";

/**
 * Display helpers for the donor beneficiary summary (backend disclosure control,
 * docs/SECURITY_SETUP.md §8): the backend hides small counts and rounds every other donor figure,
 * totals included, to the nearest 5. It decides what is hidden and rounded; these functions only
 * label it. Pure functions only.
 */

/** Key of the merged "Other (combined)" row in free-text tables. */
export const OTHER_KEY = "__other__";

/** Donor figures are rounded to a multiple of this (when the response does not say). */
export const DONOR_ROUNDING_BASE = 5;

export type SummaryDimension = "byGender" | "byAgeGroup" | "byGovernorate" | "byStatus" | "byVulnerabilityTag" | "byServiceType";

export interface DimensionInfo {
  dimension: SummaryDimension;
  /** Translation key of the table caption. */
  captionKey: string;
  /** Values typed by users (shown as typed, with their own text direction). */
  freeText: boolean;
  /** Every person is in exactly one row, so a table of people always has rows unless it is hidden whole. */
  exclusive: boolean;
}

/** The tables in display order. */
export const SUMMARY_DIMENSIONS: readonly DimensionInfo[] = [
  { dimension: "byGender", captionKey: "beneficiarySummary.bySex", freeText: false, exclusive: true },
  { dimension: "byAgeGroup", captionKey: "beneficiarySummary.byAgeGroup", freeText: false, exclusive: true },
  { dimension: "byGovernorate", captionKey: "beneficiarySummary.byGovernorate", freeText: true, exclusive: true },
  { dimension: "byStatus", captionKey: "beneficiarySummary.byStatus", freeText: false, exclusive: true },
  { dimension: "byVulnerabilityTag", captionKey: "beneficiarySummary.byVulnerability", freeText: true, exclusive: false },
  { dimension: "byServiceType", captionKey: "beneficiarySummary.byService", freeText: true, exclusive: false },
];

/** Translation group of the enum dimensions. */
const ENUM_LABELS: Partial<Record<SummaryDimension, string>> = {
  byGender: "beneficiary.sex",
  byAgeGroup: "beneficiary.ageGroup",
  byStatus: "beneficiary.status",
};

export interface SummaryTable extends DimensionInfo {
  cells: DisclosedCell[];
  /** What an empty table says (translation key): nothing recorded, or hidden whole by the backend. */
  emptyKey: string;
}

/**
 * Why a donor table has no rows. The backend sends a free-text table it hides whole (a hidden count could
 * otherwise be worked out) with no rows. A table of people that each sit in one row is then certainly hidden;
 * for tags and services, "no rows" can also mean nothing was recorded.
 */
function donorEmptyKey(info: DimensionInfo, total: DisclosedCell): string {
  if (!isHidden(total) && total.count === 0) return "beneficiarySummary.dimensionEmpty";
  return info.exclusive ? "beneficiarySummary.tableHidden" : "beneficiarySummary.dimensionEmptyOrHidden";
}

/** Both response shapes of the stats endpoint as one view. */
export interface SummaryView {
  audience: "staff" | "donor";
  /** Counts below these are hidden (null for staff: nothing is hidden). */
  minCell: number | null;
  minCellSensitive: number | null;
  /** Shown counts are rounded to a multiple of this (null for staff: exact counts). */
  roundingBase: number | null;
  suppressedAll: boolean;
  total: DisclosedCell;
  serviceCount: DisclosedCell;
  tables: SummaryTable[];
}

export function isDonorSummary(stats: BeneficiaryStats | null | undefined): stats is DonorBeneficiarySummary {
  return !!stats && stats.audience === "donor";
}

/** True for a qualitative entry as donor viewers receive it (coded findings, no notes). */
export function isDonorQualitativeEntry(entry: QualitativeEntry | DonorQualitativeEntry): entry is DonorQualitativeEntry {
  return !("content" in entry);
}

const shown = (key: string | null, count: number): DisclosedCell => ({ key, count, suppressed: false });

/** The donor summary as is, or staff counts (today's shape) as cells with nothing hidden. */
export function toSummaryView(stats: BeneficiaryStats): SummaryView {
  if (isDonorSummary(stats)) {
    return {
      audience: "donor",
      minCell: stats.minCell,
      minCellSensitive: stats.minCellSensitive,
      roundingBase: typeof stats.roundingBase === "number" && stats.roundingBase > 0 ? stats.roundingBase : DONOR_ROUNDING_BASE,
      suppressedAll: stats.suppressedAll,
      total: stats.total,
      serviceCount: stats.serviceCount,
      tables: SUMMARY_DIMENSIONS.map((info) => ({
        ...info,
        cells: Array.isArray(stats[info.dimension]) ? stats[info.dimension] : [],
        emptyKey: donorEmptyKey(info, stats.total),
      })),
    };
  }
  const staffCells: Partial<Record<SummaryDimension, DisclosedCell[]>> = {
    byGender: (stats.byGender ?? []).map((row) => shown(row.gender, row._count)),
    byAgeGroup: (stats.byAgeGroup ?? []).map((row) => shown(row.ageGroup, row._count)),
    byGovernorate: (stats.byGovernorate ?? []).map((row) => shown(row.governorate, row._count)),
    byStatus: (stats.byStatus ?? []).map((row) => shown(row.status, row._count)),
  };
  return {
    audience: "staff",
    minCell: null,
    minCellSensitive: null,
    roundingBase: null,
    suppressedAll: false,
    total: shown(null, stats.total ?? 0),
    serviceCount: shown(null, stats.serviceCount ?? 0),
    tables: SUMMARY_DIMENSIONS.filter((info) => staffCells[info.dimension]).map((info) => ({
      ...info,
      cells: staffCells[info.dimension] ?? [],
      emptyKey: "beneficiarySummary.dimensionEmpty",
    })),
  };
}

const NUMBER_FORMAT = new Intl.NumberFormat("en");

/** A count for display (Latin digits, as in the rest of the app). */
export function formatCount(count: number): string {
  return NUMBER_FORMAT.format(count);
}

export function isHidden(cell: DisclosedCell): boolean {
  return cell.suppressed || cell.count === null;
}

/** The figure of a cell: the formatted count, or the "Hidden" text for a suppressed one. */
export function cellText(t: TFunction, cell: DisclosedCell): string {
  return isHidden(cell) ? t("beneficiarySummary.hidden") : formatCount(cell.count as number);
}

/** The row label: translated for sex, age group and status; as typed for free text; null is "Not recorded". */
export function dimensionLabel(t: TFunction, dimension: SummaryDimension, key: string | null): string {
  if (key === null || key === "") return t("beneficiarySummary.notRecorded");
  if (key === OTHER_KEY) return t("beneficiarySummary.other");
  const group = ENUM_LABELS[dimension];
  return group ? t(`${group}.${key}`, { defaultValue: key }) : key;
}

/**
 * The legend under a donor summary, and the last row of its CSV: what "Hidden" means, the higher
 * threshold of the sensitive tables, and that every other figure is rounded (so rows may not add
 * up to the total). Empty for staff stats.
 */
export function hiddenLegend(t: TFunction, view: SummaryView): string {
  if (view.audience !== "donor" || view.minCell === null || view.minCellSensitive === null) return "";
  return t("beneficiarySummary.hiddenLegend", {
    maxHidden: view.minCell - 1,
    maxHiddenSensitive: view.minCellSensitive - 1,
    minSensitive: view.minCellSensitive,
    roundingBase: view.roundingBase ?? DONOR_ROUNDING_BASE,
  });
}

/**
 * The summary as CSV rows (columns: breakdown, category, people), starting with the total and
 * services delivered. Hidden counts carry the "Hidden" text; a donor file ends with the legend.
 */
export function summaryCsvRows(t: TFunction, stats: BeneficiaryStats): CsvRow[] {
  const view = toSummaryView(stats);
  const dimensionCol = t("beneficiarySummary.dimension");
  const categoryCol = t("beneficiarySummary.category");
  const peopleCol = t("beneficiarySummary.people");
  const figure = (cell: DisclosedCell) => (isHidden(cell) ? t("beneficiarySummary.hidden") : (cell.count as number));
  const row = (dimension: string, category: string, people: string | number): CsvRow => ({
    [dimensionCol]: dimension,
    [categoryCol]: category,
    [peopleCol]: people,
  });

  const rows: CsvRow[] = [row(t("beneficiarySummary.total"), "", figure(view.total)), row(t("beneficiarySummary.services"), "", figure(view.serviceCount))];
  if (view.suppressedAll) {
    rows.push(row(t("beneficiarySummary.allHidden", { min: view.minCell }), "", ""));
    return rows;
  }
  for (const table of view.tables) {
    const caption = t(table.captionKey);
    // An empty table says why, as on screen, instead of disappearing from the file.
    if (table.cells.length === 0) rows.push(row(caption, t(table.emptyKey), ""));
    for (const cell of table.cells) rows.push(row(caption, dimensionLabel(t, table.dimension, cell.key), figure(cell)));
  }
  const legend = hiddenLegend(t, view);
  if (legend) rows.push(row(legend, "", ""));
  return rows;
}
