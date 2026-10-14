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
  KpiErrorCode,
  KpiRequestErrorCode,
  KpiRunStep,
  KpiWarningCode,
  ParsingStatus,
  ProjectStatus,
  QualityBand,
  ReportType,
  Sector,
  SuggestableLevel,
  SuggestionRejectReason,
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

/** Project statuses in lifecycle order; `archived` projects are read-only and left out of the active list. */
export const PROJECT_STATUSES: readonly ProjectStatus[] = ["setup", "framework_review", "active", "completed", "archived"];

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

// ------------------------------------------------------- KPI Assistant (Phase 4)

/**
 * Reject reasons in chip order (Prisma enum SuggestionRejectReason; knowledge/kpi-assistant-spec.md §A5, §A7).
 * What each one excludes is REJECTION_SCOPE in src/lib/kpiSuggestions.ts (design D9).
 */
export const KPI_REJECT_REASONS = [
  "not_relevant",
  "too_costly_to_measure",
  "donor_not_required",
  "duplicate",
  "wording",
  "other",
] as const satisfies readonly SuggestionRejectReason[];

/** Quality bands, best first (spec §A4 step 3: ≥ 85 strong, 65–84 review, < 65 weak). */
export const QUALITY_BANDS = ["strong", "review", "weak"] as const satisfies readonly QualityBand[];

/** Run steps shown as named progress steps (design 9.4); `saving` and `done` show every step done. */
export const KPI_RUN_STEPS_SHOWN = ["context", "retrieval", "model", "validation"] as const satisfies readonly KpiRunStep[];

/** Result levels the KPI Assistant suggests indicators for (spec §A2: never activities). */
export const SUGGESTABLE_LEVELS = ["impact", "outcome", "output"] as const satisfies readonly SuggestableLevel[];

/** Model confidence of a suggestion, highest first (spec §A4 output schema). */
export const KPI_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

/**
 * Validation note codes, mirror of KPI_WARNING_CODES in raqib-backend src/services/kpi/types.ts (same order):
 * per suggestion, framework (run) level, then the accept response's donor_cap_exceeded. Translated as kpi.warnings.<code>.
 */
export const KPI_WARNING_CODES = [
  // per suggestion
  "library_id_unknown", "custom_reason_missing", "target_in_name", "double_barrelled", "percent_without_calculation",
  "sex_keys_from_library", "sex_added", "baseline_not_found", "target_not_found", "standard_threshold_not_found",
  "target_method_default", "output_survey_method", "impact_not_secondary", "arabic_name_missing",
  "generic_means_of_verification", "figures_unverified", "level_adjusted", "arabic_name_from_library", "level_mismatch_library",
  // framework (run) level
  "model_note", "unknown_result", "rejected_library_dropped", "duplicate_in_run", "near_duplicate", "result_cap",
  "accountability_added", "accountability_missing", "result_failed", "result_empty", "keyword_fallback",
  // accept response (not stored on a suggestion)
  "donor_cap_exceeded",
] as const satisfies readonly KpiWarningCode[];

/**
 * Error codes the KPI UI translates (kpi.errors.<code>; design 9.2): the run codes (KpiRun.errorCode) and the request
 * codes (ApiError.code of the KPI routes; rate_limited also for a 429 without a code; conflict from any write route
 * when a simultaneous change won). Never shown raw.
 */
export const KPI_ERROR_CODES_SHOWN = [
  // run (KpiRun.errorCode)
  "ai_not_configured", "ai_refused", "ai_unavailable", "ai_invalid_output", "interrupted", "stale", "internal",
  // request (ApiError.code / HTTP status)
  "run_in_progress", "rate_limited", "already_decided", "not_suggestable", "no_framework", "nothing_to_suggest",
  "too_many_results", "budget_reached", "project_archived", "duplicate", "source_has_data", "not_editable", "conflict",
] as const satisfies readonly (KpiErrorCode | KpiRequestErrorCode | "rate_limited" | "conflict")[];

export type KpiShownErrorCode = (typeof KPI_ERROR_CODES_SHOWN)[number];
