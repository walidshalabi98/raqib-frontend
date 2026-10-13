import type {
  ClientProvenance,
  CollectionMethod,
  DocumentFileType,
  DonorType,
  Frequency,
  IndicatorDirection,
  IndicatorLevel,
  IndicatorProvenance,
  IndicatorStatus,
  ParsingStatus,
  ReportType,
  Sector,
} from "@/types/api";
import en from "@/i18n/en.json";

/**
 * Enum values (in display order) and label constants shared by the UI.
 * Values mirror the backend Prisma enums. Labels for translated screens come
 * from src/i18n; the English label maps below serve screens not yet
 * translated (Phase 6) and are read from en.json so each string exists once.
 */

export const SECTORS: readonly Sector[] = [
  "education",
  "livelihoods",
  "health",
  "wash",
  "protection",
  "food_security",
  "mhpss",
  "cash",
  "shelter",
  "climate_energy",
  "governance",
  "agriculture",
  "gender",
  "youth",
  "other",
];

/** Donor types; `usaid` is legacy (USAID stopped administering awards on 1 July 2025) and listed last. */
export const DONOR_TYPES: readonly DonorType[] = [
  "eu",
  "echo",
  "giz",
  "undp",
  "unicef",
  "wfp",
  "unfpa",
  "un_women",
  "fcdo",
  "sida",
  "other",
  "usaid",
];

/** Report types (backend enum ReportType), in the order the Generate Report form offers them. */
export const REPORT_TYPES = ["quarterly_summary", "monthly_progress", "annual_review", "assessment_report", "donor_export"] as const satisfies readonly ReportType[];

export const INDICATOR_LEVELS: readonly IndicatorLevel[] = ["impact", "outcome", "output", "activity"];

export const COLLECTION_METHODS: readonly CollectionMethod[] = [
  "hh_survey",
  "fgd",
  "kii",
  "observation",
  "document_review",
  "participatory",
  "secondary_data",
];

export const FREQUENCIES: readonly Frequency[] = [
  "monthly",
  "quarterly",
  "biannual",
  "annual",
  "per_cohort",
  "baseline_endline",
];

export const DIRECTIONS: readonly IndicatorDirection[] = ["increase", "decrease", "maintain"];

export const INDICATOR_STATUSES: readonly IndicatorStatus[] = [
  "not_started",
  "on_track",
  "at_risk",
  "off_track",
  "completed",
];

export const PROVENANCES: readonly IndicatorProvenance[] = ["library", "ai_suggested", "ai_generated", "imported", "manual"];

/** Provenance values a client may send; ai_* are set only by Raqib's AI features. */
export const CLIENT_PROVENANCES: readonly ClientProvenance[] = ["manual", "library", "imported"];

/** Document types offered on upload (Prisma enum DocumentType). */
export const DOCUMENT_FILE_TYPES: readonly DocumentFileType[] = [
  "proposal",
  "logframe",
  "theory_of_change",
  "baseline_report",
  "donor_guidelines",
  "budget",
  "other",
];

export const PARSING_STATUSES: readonly ParsingStatus[] = ["pending", "processing", "completed", "failed"];

/** Disaggregation groups offered as one-click chips (knowledge/me-foundations.md §4). */
export const DISAGGREGATION_SUGGESTIONS = [
  "sex",
  "age",
  "disability",
  "location",
  "displacement_status",
  "sex_of_household_head",
] as const;

/**
 * Indicator units offered as suggestions: the shared unit list of the backend
 * (raqib-backend src/services/ai/prompts/framework.ts, the framework schema's unit
 * enum). Only "number" is a count unit (breakdown groups must add up to the value);
 * ratio, index, score, currency, time and distance units are not.
 */
export const UNIT_SUGGESTIONS = [
  "number",
  "percent",
  "score",
  "ratio",
  "index",
  "litres_per_person_per_day",
  "hectares",
  "dunums",
  "megawatts",
  "tonnes_co2eq",
  "currency_ils",
  "currency_usd",
  "currency_eur",
  "currency_jod",
  "kg_per_dunum",
  "days",
  "hours",
  "minutes",
  "km",
  "yes_no",
] as const;

export const ASSESSMENT_STAGES = [
  "requested", "scoping", "in_field", "data_cleaning", "analysis", "reporting", "delivered",
] as const;

/** Collection method, as used by method pills. */
export type Method = CollectionMethod;

/** Short English method labels for pills on untranslated screens. */
export const METHOD_LABELS: Record<CollectionMethod, string> = en.methodShort;

/** English sector labels for untranslated screens. */
export const SECTOR_LABELS: Record<Sector, string> = en.sector;
