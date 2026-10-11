import type {
  ClientProvenance,
  CollectionMethod,
  DonorType,
  Frequency,
  IndicatorDirection,
  IndicatorLevel,
  IndicatorProvenance,
  IndicatorStatus,
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

/** Disaggregation groups offered as one-click chips (knowledge/me-foundations.md §4). */
export const DISAGGREGATION_SUGGESTIONS = [
  "sex",
  "age",
  "disability",
  "location",
  "displacement_status",
  "sex_of_household_head",
] as const;

/** Units used by the indicator library (knowledge/indicator-library.json meta.enums.unit). */
export const UNIT_SUGGESTIONS = [
  "number",
  "percent",
  "score",
  "litres_per_person_per_day",
  "hectares",
  "dunums",
  "megawatts",
  "tonnes_co2eq",
  "currency_ils",
  "kg_per_dunum",
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
