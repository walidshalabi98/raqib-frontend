/**
 * Types for the Raqib REST API (raqib-backend). They mirror prisma/schema.prisma
 * as serialised to JSON: dates are ISO strings, Decimal columns are strings.
 * Keep the enum unions in sync with the backend schema.
 */

// ------------------------------------------------------------------ enums

export type Language = "en" | "ar";

export type UserRole = "platform_admin" | "org_admin" | "me_officer" | "donor_viewer";

export type Sector =
  | "education"
  | "livelihoods"
  | "health"
  | "wash"
  | "protection"
  | "food_security"
  | "governance"
  | "agriculture"
  | "gender"
  | "youth"
  | "other"
  | "mhpss"
  | "cash"
  | "shelter"
  | "climate_energy";

/** `usaid` is a legacy donor type: USAID stopped administering awards on 1 July 2025. */
export type DonorType =
  | "usaid"
  | "eu"
  | "giz"
  | "undp"
  | "unicef"
  | "sida"
  | "other"
  | "echo"
  | "wfp"
  | "unfpa"
  | "fcdo"
  | "un_women";

export type ProjectStatus = "setup" | "framework_review" | "active" | "completed" | "archived";

export type FrameworkStatus = "draft" | "expert_review" | "client_review" | "approved" | "active";

export type IndicatorLevel = "impact" | "outcome" | "output" | "activity";

export type CollectionMethod =
  | "hh_survey"
  | "fgd"
  | "kii"
  | "observation"
  | "document_review"
  | "participatory"
  | "secondary_data";

export type Frequency = "monthly" | "quarterly" | "biannual" | "annual" | "per_cohort" | "baseline_endline";

export type IndicatorDirection = "increase" | "decrease" | "maintain";

/** Where an indicator came from (knowledge/me-foundations.md §3). */
export type IndicatorProvenance = "library" | "ai_suggested" | "ai_generated" | "imported" | "manual";

/** Provenance values a client may set; ai_* values are set only by Raqib's AI features. */
export type ClientProvenance = "manual" | "library" | "imported";

export type IndicatorStatus = "on_track" | "at_risk" | "off_track" | "not_started" | "completed";

// ------------------------------------------------------------- auth/users

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  fullNameAr?: string | null;
  role: UserRole | string;
  languagePref: Language | string;
  organization: { id: string; name: string; nameAr?: string | null };
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// --------------------------------------------------------------- projects

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  /** The primary sector; always included in `sectors`. */
  sector: Sector;
  sectors: Sector[];
  humanitarian: boolean;
  donor: string;
  donorType: DonorType;
  budgetUsd: string | null;
  startDate: string;
  endDate: string;
  targetBeneficiaries: number | null;
  geographicScope: string | null;
  status: ProjectStatus;
  createdAt: string;
  _count?: Partial<Record<"documents" | "frameworks" | "assessments" | "dataPoints" | "qualitativeEntries" | "reports", number>>;
}

/** GET /api/projects/:id — the project with its documents and current framework. */
export interface ProjectDetail extends Project {
  documents: ProjectDocument[];
  frameworks: Array<Omit<Framework, "resultNodes"> & { resultNodes?: ResultNode[] }>;
}

/** Prisma enum DocumentType: what the uploader says the file is. */
export type DocumentFileType =
  | "proposal"
  | "logframe"
  | "theory_of_change"
  | "baseline_report"
  | "donor_guidelines"
  | "budget"
  | "other";

/** Prisma enum ParsingStatus: text extraction of an uploaded document. */
export type ParsingStatus = "pending" | "processing" | "completed" | "failed";

/** The kind of document the AI analysis recognised (a closed set in the backend schema). */
export type DocumentAnalysisType = "proposal" | "logframe" | "budget" | "report" | "guidelines" | "other";

/**
 * A target the AI analysis found in the document ("" for any part the document does not state).
 * `verified` is true only when the backend found the target in the document's redacted text by
 * string match; rows analysed before that check lack it and are treated as not verified.
 */
export interface DocumentTargetMention {
  indicator: string;
  target: string;
  timeline: string;
  verified?: boolean;
}

/**
 * Document.aiAnalysis as the backend stores it (document parser, Phase 3).
 * Read it with `documentAnalysisOf` (src/lib/documentAnalysis.ts), which also
 * accepts the legacy shapes the Phase 3 migration moved out of parsedText
 * (snake_case keys, or `{ legacyText }`, which has nothing to show) and malformed values.
 */
export interface DocumentAiAnalysis {
  documentType: DocumentAnalysisType;
  summary: string;
  keyFindings: string[];
  indicatorsMentioned: string[];
  targetsMentioned: DocumentTargetMention[];
  recommendations: string[];
  /** Numbers in the summary and key findings that the document text does not contain (absent on older rows). */
  unverifiedFigures?: string[];
  /** Served model id. */
  model: string;
  promptVersion: string;
  /** ISO date-time. */
  analysedAt: string;
}

/**
 * A document as GET /api/projects/:id/documents and the upload return it. The API never returns
 * the extracted text (parsedText) or the storage key (fileUrl); `textLength` says how much text
 * was extracted.
 */
export interface ProjectDocument {
  id: string;
  projectId: string;
  fileName: string;
  fileType: DocumentFileType;
  fileSizeBytes: string | number | null;
  parsingStatus: ParsingStatus;
  uploadedAt: string;
  /** Characters of extracted text (0 when none). Documents with 50 or fewer are never analysed. */
  textLength?: number;
  /**
   * The stored AI analysis; null until it is ready, and for documents that are never analysed
   * (too little text, an AI failure, or a qualitative transcript). Legacy rows hold older shapes.
   */
  aiAnalysis?: DocumentAiAnalysis | Record<string, unknown> | null;
  /** An FGD/KII transcript uploaded through the qualitative upload: coded there, never analysed as a document. */
  qualitativeSource?: boolean;
  uploader?: { fullName: string } | null;
}

/** POST /api/projects (PATCH accepts any subset plus `status`). */
export interface ProjectInput {
  name: string;
  nameAr?: string | null;
  description?: string | null;
  sector: Sector;
  /** All sectors; the backend always adds the primary `sector`. */
  sectors?: Sector[];
  humanitarian?: boolean;
  donor: string;
  donorType: DonorType;
  budgetUsd?: number | null;
  startDate: string;
  endDate: string;
  targetBeneficiaries?: number | null;
  geographicScope?: string | null;
}

/** PATCH /api/projects/:id: any subset of the create fields, plus `status`. */
export type ProjectUpdateInput = Partial<ProjectInput> & { status?: ProjectStatus };

// -------------------------------------------------- frameworks and results

/** A results-chain node: impact → outcome → output → activity. */
export interface ResultNode {
  id: string;
  frameworkId: string;
  parentId: string | null;
  level: IndicatorLevel;
  /** e.g. "Goal", "O1", "O1.1" */
  code: string;
  text: string;
  textAr: string | null;
  sortOrder: number;
  createdAt: string;
  _count?: { indicators: number; children: number };
}

/** POST /api/frameworks/:id/results (PATCH /api/results/:id accepts any subset). */
export interface ResultNodeInput {
  level: IndicatorLevel;
  code: string;
  text: string;
  textAr?: string | null;
  parentId?: string | null;
  sortOrder?: number;
}

/** PATCH /api/results/:id: the saved result plus how many linked indicators moved to its new level. */
export interface ResultUpdateResponse extends ResultNode {
  updatedIndicators: number;
}

/** DELETE /api/results/:id (409 while the result has child results). */
export interface ResultDeleteResponse {
  message: string;
  /** Indicators that were linked to the result; they are now unlinked (resultId null). */
  unlinkedIndicators: number;
}

/** The result an indicator measures, as returned with every indicator. */
export interface ResultSummary {
  id: string;
  code: string;
  level: IndicatorLevel;
  text: string;
}

export interface Framework {
  id: string;
  projectId: string;
  version: number;
  status: FrameworkStatus;
  name: string | null;
  aiModelUsed: string | null;
  generatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  /**
   * Why AI generation of this version failed (a safe message), or null. A version with a
   * generationError is never the project's current framework.
   */
  generationError?: string | null;
  /** Ordered by level (impact first), then sortOrder, then code. */
  resultNodes: ResultNode[];
  indicators: Indicator[];
}

// ------------------------------------------------------------- indicators

export interface IndicatorCalculation {
  numerator?: string;
  denominator?: string;
  formula?: string;
  rounding?: string;
}

export interface IntermediateTarget {
  /** YYYY-MM-DD */
  date: string;
  value: string;
}

export interface Milestone {
  label: string;
  date?: string | null;
  completed?: boolean;
}

/** An indicator with its full reference sheet (knowledge/me-foundations.md §3). */
export interface Indicator {
  id: string;
  frameworkId: string;
  indicatorText: string;
  indicatorTextAr: string | null;
  level: IndicatorLevel;
  dataCollectionMethod: CollectionMethod;
  frequency: Frequency;
  baselineValue: string | null;
  targetValue: string | null;
  currentValue: string | null;
  unit: string | null;
  status: IndicatorStatus;
  aiRationale: string | null;
  phases: string[] | null;
  startDate: string | null;
  endDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  milestones: Milestone[] | null;
  responsibility: string | null;
  sortOrder: number;
  isApproved: boolean;
  createdAt: string;

  // Reference sheet
  resultId: string | null;
  definition: string | null;
  calculation: IndicatorCalculation | null;
  direction: IndicatorDirection | null;
  /** Snake_case group keys, e.g. ["sex", "age", "disability"]. */
  disaggregation: string[] | null;
  meansOfVerification: string | null;
  /** Date only; the API may return "YYYY-MM-DD" or a full ISO date-time. */
  baselineDate: string | null;
  baselineMethod: string | null;
  targetJustification: string | null;
  intermediateTargets: IntermediateTarget[] | null;
  assumptions: string | null;
  libraryId: string | null;
  standardReferenceCode: string | null;
  provenance: IndicatorProvenance;
  aiModel: string | null;
  promptVersion: string | null;

  result?: ResultSummary | null;
  _count?: { dataPoints: number };
}

/**
 * Body of POST /api/frameworks/:id/indicators and PATCH /api/indicators/:id.
 * null clears a nullable field. A linked indicator's level must be its result's
 * level (400 otherwise; without a level the result's is used). Provenance is
 * accepted on create only (manual, library or imported); on PATCH the server
 * ignores it and sets it from libraryId. libraryId is matched in upper case.
 */
export interface IndicatorInput {
  indicatorText?: string;
  indicatorTextAr?: string | null;
  level?: IndicatorLevel;
  dataCollectionMethod?: CollectionMethod;
  frequency?: Frequency;
  baselineValue?: string | null;
  targetValue?: string | null;
  currentValue?: string | null;
  unit?: string | null;
  status?: IndicatorStatus;
  phases?: string[];
  sortOrder?: number;
  startDate?: string | null;
  endDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  milestones?: Milestone[] | null;
  responsibility?: string | null;
  aiRationale?: string | null;
  resultId?: string | null;
  definition?: string | null;
  calculation?: IndicatorCalculation | null;
  direction?: IndicatorDirection | null;
  disaggregation?: string[] | null;
  meansOfVerification?: string | null;
  baselineDate?: string | null;
  baselineMethod?: string | null;
  targetJustification?: string | null;
  intermediateTargets?: IntermediateTarget[] | null;
  assumptions?: string | null;
  libraryId?: string | null;
  standardReferenceCode?: string | null;
  provenance?: ClientProvenance;
}

// ------------------------------------------------------------ data points

/** Disaggregated values: { dimension: { category: number } }, e.g. { sex: { female: 120, male: 98 } }. */
export type Breakdown = Record<string, Record<string, number>>;

export interface DataPoint {
  id: string;
  indicatorId: string;
  assessmentId: string | null;
  projectId: string;
  value: string;
  collectionDate: string;
  collectionMethod: CollectionMethod;
  dataSource: string | null;
  geographicArea: string | null;
  notes: string | null;
  attachments: unknown;
  breakdown: Breakdown | null;
  createdAt: string;
  createdBy: string;
}

/** GET /api/indicators/:id/data */
export interface IndicatorDataResponse {
  indicator: {
    id: string;
    text: string;
    baselineValue: string | null;
    targetValue: string | null;
    currentValue: string | null;
    unit: string | null;
    disaggregation: string[] | null;
  };
  dataPoints: Array<DataPoint & { creator?: { fullName: string } }>;
  trend: "increasing" | "decreasing" | "stable" | "insufficient_data";
  count: number;
}

/**
 * POST /api/indicators/:id/data (org admins and M&E officers; donor viewers get 403).
 * Numeric values are stored in canonical form ("١٬٢٠٠" and "1,200" become "1200").
 * Breakdown rules follow the indicator's unit: a count ("number" and aliases such
 * as people or households) needs a numeric value and groups that add up to it; a
 * percentage takes 0–100 per group with no sum; ratio, index, score, currency,
 * time and distance units are not counts (no sum check); a blank unit is checked
 * as a percentage only when the indicator text reads as one.
 */
export interface DataPointInput {
  value: string | number;
  /** YYYY-MM-DD */
  collectionDate: string;
  /** Required by the backend (400 when missing). */
  collectionMethod: CollectionMethod;
  dataSource?: string | null;
  geographicArea?: string | null;
  notes?: string | null;
  assessmentId?: string | null;
  breakdown?: Breakdown | null;
}

/** One row of POST /api/projects/:id/data/bulk (same roles and rules as DataPointInput). */
export interface BulkDataPointInput extends DataPointInput {
  indicatorId: string;
}

/** 201 body of POST /api/projects/:id/data/bulk. Errors (400) name rows from 1: "Row 3: sex: ...". */
export interface BulkDataPointResponse {
  count: number;
}

// ---------------------------------------------------------- qualitative

export type QualitativeType =
  | "fgd_transcript"
  | "kii_notes"
  | "observation_checklist"
  | "community_scorecard"
  | "msc_story"
  | "field_notes";

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";

/**
 * A qualitative entry (FGD or KII notes, observations, MSC stories). The title, content,
 * location and facilitator are stored without phone numbers, ID numbers or email addresses.
 */
export interface QualitativeEntry {
  id: string;
  projectId: string;
  assessmentId: string | null;
  entryType: QualitativeType;
  title: string;
  content: string;
  participants: number | null;
  location: string | null;
  /** ISO date. */
  dateConducted: string | null;
  facilitator: string | null;
  /** Set by AI thematic coding (a list of theme names); null until coded. Legacy rows hold other shapes. */
  themes: unknown;
  sentiment: Sentiment | null;
  linkedIndicators: unknown;
  attachments: unknown;
  createdAt: string;
}

/** How many phone numbers, ID numbers and email addresses were removed from a text (counts only). */
export interface RedactionCounts {
  phone: number;
  idNumber: number;
  email: number;
}

/** 201 body of POST /api/projects/:id/qualitative: the saved entry and what was removed from its text. */
export interface QualitativeEntryCreateResponse extends QualitativeEntry {
  /** Absent from backends that do not redact typed notes when they are saved. */
  redactions?: RedactionCounts;
}

// --------------------------------------------------------------- library

export interface StandardReference {
  framework?: string;
  code?: string;
  url?: string;
}

/** An entry of the indicator library (knowledge/indicator-library.json). The embedding is never returned. */
export interface LibraryEntry {
  id: string;
  sector: Sector;
  tags: string[];
  level: IndicatorLevel;
  name: string;
  nameAr: string;
  definition: string;
  unit: string;
  calculation: (IndicatorCalculation & { aggregation?: string }) | null;
  direction: IndicatorDirection;
  disaggregation: string[];
  methods: CollectionMethod[];
  frequency: Frequency;
  meansOfVerification: string;
  standardReference: StandardReference | null;
  standardFramework: string | null;
  isStandard: boolean;
  notes: string | null;
  version: string;
  createdAt: string;
  updatedAt: string;
}

/** Query of GET /api/indicator-library. */
export interface LibraryFilters {
  sector?: Sector;
  level?: IndicatorLevel;
  framework?: string;
  q?: string;
  isStandard?: boolean;
}

// ---------------------------------------------------- framework generation

export interface GenerateFrameworkResponse {
  frameworkId: string;
  status: string;
  /** Older responses returned the framework itself. */
  id?: string;
}

/** GET /api/frameworks/:id/status */
export type GenerationStatus =
  | { frameworkId: string; status: "processing"; progress?: string }
  | { frameworkId: string; status: "completed"; progress?: string; framework?: Framework }
  /** The run failed or was interrupted; `message` is safe to show and says what to do. */
  | { frameworkId: string; status: "failed"; message: string };

// ------------------------------------------------------- KPI Assistant (Phase 4)
// Mirrors raqib-backend src/services/kpi/types.ts (API DTOs) and the Prisma enums of the KPI tables
// (knowledge/kpi-assistant-spec.md §A5–A7). Keep in sync with the backend.

/** Prisma enum SuggestionStatus. */
export type SuggestionStatus = "pending" | "accepted" | "edited_accepted" | "rejected" | "expired";

/** Prisma enum SuggestionRejectReason (the reject chips). */
export type SuggestionRejectReason =
  | "not_relevant"
  | "too_costly_to_measure"
  | "donor_not_required"
  | "duplicate"
  | "wording"
  | "other";

/** Results the KPI Assistant suggests indicators for (never activities). */
export type SuggestableLevel = "impact" | "outcome" | "output";

export type KpiScopeType = "framework" | "result" | "alternatives";

/** Progress step of a run; the UI shows context, retrieval, model and validation. */
export type KpiRunStep = "context" | "retrieval" | "model" | "validation" | "saving" | "done";

/** Why a run failed (KpiRun.errorCode). `interrupted` also covers a run that stopped sending heartbeats. */
export type KpiErrorCode =
  | "ai_not_configured"
  | "ai_refused"
  | "ai_unavailable"
  | "ai_invalid_output"
  | "interrupted"
  | "stale"
  | "internal";

/** Request-level error codes of the KPI routes (ApiError.code). */
export type KpiRequestErrorCode =
  | "ai_not_configured"
  | "run_in_progress"
  | "no_framework"
  | "not_suggestable"
  | "already_decided"
  | "stale"
  | "nothing_to_suggest"
  | "too_many_results"
  | "budget_reached"
  | "project_archived"
  | "duplicate";

/** Quality badge: score ≥ 85 strong, 65–84 review, < 65 weak. */
export type QualityBand = "strong" | "review" | "weak";

/** Where a suggestion came from: the model, or appended by Raqib (accountability indicator for humanitarian projects). */
export type SuggestionOrigin = "model" | "appended_accountability";

export type KpiWarningCode =
  // per suggestion
  | "library_id_unknown"
  | "custom_reason_missing"
  | "target_in_name"
  | "double_barrelled"
  | "percent_without_calculation"
  | "sex_keys_from_library"
  | "sex_added"
  | "baseline_not_found"
  | "target_not_found"
  | "standard_threshold_not_found"
  | "target_method_default"
  | "output_survey_method"
  | "impact_not_secondary"
  | "arabic_name_missing"
  | "generic_means_of_verification"
  | "figures_unverified"
  | "level_adjusted"
  | "arabic_name_from_library"
  // framework (run) level
  | "model_note"
  | "unknown_result"
  | "rejected_library_dropped"
  | "duplicate_in_run"
  | "near_duplicate"
  | "result_cap"
  | "accountability_added"
  | "accountability_missing"
  | "result_failed"
  | "keyword_fallback"
  // accept response
  | "donor_cap_exceeded";

/** A validation note. Translate by `code` with `params`; `message` is the English fallback (model_note holds model text). */
export interface KpiWarning {
  code: KpiWarningCode;
  severity: "warning" | "info";
  message: string;
  params: Record<string, string | number>;
  /** Points taken off the quality score (0 for notes). */
  penalty: number;
}

/**
 * What accepting a suggestion creates, before edits (IndicatorInput-compatible; dates YYYY-MM-DD). Fields the AI
 * does not propose hold "To be confirmed by the M&E officer"; baselineDate is null and intermediateTargets [].
 */
export interface IndicatorDraft extends IndicatorInput {
  indicatorText: string;
  indicatorTextAr: string | null;
  level: SuggestableLevel;
  resultId: string;
  libraryId: string | null;
  standardReferenceCode: string | null;
  definition: string;
  unit: string;
  calculation: IndicatorCalculation | null;
  direction: IndicatorDirection;
  disaggregation: string[];
  dataCollectionMethod: CollectionMethod;
  frequency: Frequency;
  meansOfVerification: string;
  baselineValue: string | null;
  baselineDate: string | null;
  baselineMethod: string;
  targetValue: string | null;
  targetJustification: string;
  intermediateTargets: IntermediateTarget[];
  assumptions: string;
  responsibility: string;
  /** Project start date; editable on accept. */
  startDate: string | null;
  /** Project end date (the date the target refers to); editable on accept. */
  endDate: string | null;
  aiRationale: string | null;
}

/** The validated suggestion as shown on a card (KpiSuggestion.suggestion). Model free text is English. */
export interface KpiSuggestionPayload {
  customReason: string;
  name: string;
  nameAr: string;
  definition: string;
  unit: string;
  numerator: string;
  denominator: string;
  direction: IndicatorDirection;
  disaggregation: string[];
  method: CollectionMethod;
  frequency: Frequency;
  meansOfVerification: string;
  /** A value found in the documents, or "" (pending baseline). */
  baselineSuggestion: string;
  baselineBasis: "document" | "none";
  baselineMethod: string;
  /** A document or standard value, or the proposed target-setting method sentence. */
  targetSuggestion: string;
  targetBasis: "document" | "standard_threshold" | "method_only" | "none";
  targetJustification: string;
  standardReferenceCode: string | null;
  rationale: string;
  qualityNotes: string[];
  confidence: "high" | "medium" | "low";
  /** File names the baseline and target were found in. */
  sources: { baseline: string | null; target: string | null };
  /** 1-based rank within its result. */
  rank: number;
}

/** A suggested indicator (backend KpiSuggestionDto). */
export interface KpiSuggestion {
  id: string;
  runId: string;
  projectId: string;
  frameworkId: string;
  /** null when the result was deleted. */
  resultId: string | null;
  resultCode: string;
  level: SuggestableLevel;
  sortOrder: number;
  status: SuggestionStatus;
  qualityScore: number;
  qualityBand: QualityBand;
  warnings: KpiWarning[];
  libraryId: string | null;
  isCustom: boolean;
  origin: SuggestionOrigin;
  /** Served model id. */
  model: string;
  promptVersion: string;
  alternativeOfIndicatorId: string | null;
  alternativeOfSuggestionId: string | null;
  /** The indicator created on accept. */
  indicatorId: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  rejectReason: SuggestionRejectReason | null;
  rejectNote: string | null;
  suggestion: KpiSuggestionPayload;
  draft: IndicatorDraft;
}

/** One "Suggest KPIs" request (backend KpiRunDto), polled while running. */
export interface KpiRun {
  id: string;
  projectId: string;
  frameworkId: string;
  scope: KpiScopeType;
  resultId: string | null;
  sourceIndicatorId: string | null;
  sourceSuggestionId: string | null;
  /** 'failed' also for a run that stopped sending heartbeats (errorCode 'interrupted'). */
  status: "running" | "completed" | "failed";
  step: KpiRunStep;
  errorCode: KpiErrorCode | null;
  /** Safe English message of a failed run. */
  message: string | null;
  /** Run-level notes ("Gaps Raqib noticed"). */
  frameworkWarnings: KpiWarning[];
  suggestionCount: number;
  retrieval: "vector" | "keyword" | null;
  model: string | null;
  promptVersion: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

/** Body of POST /api/projects/:id/kpi-suggestions. */
export type RequestKpiSuggestionsBody =
  | { scope: "framework" }
  | { scope: "result"; resultId: string }
  | { scope: "alternatives"; indicatorId: string }
  | { scope: "alternatives"; suggestionId: string };

/**
 * POST /api/projects/:id/kpi-suggestions (and POST /api/indicators/:id/alternative): 200 with the finished run and
 * its suggestions, or 202 with the running run (poll GET /api/kpi-suggestion-runs/:id). `httpStatus` is added by
 * the API client.
 */
export interface RequestKpiSuggestionsResponse {
  run: KpiRun;
  suggestions?: KpiSuggestion[];
  httpStatus: number;
}

/** GET /api/kpi-suggestion-runs/:id: the run and all its suggestions (any status). */
export interface KpiSuggestionRunResponse {
  run: KpiRun;
  suggestions: KpiSuggestion[];
}

/** Query of GET /api/projects/:id/kpi-suggestions (status default pending; "all" for every status). */
export interface KpiSuggestionFilters {
  status?: SuggestionStatus | "all";
  resultId?: string;
  runId?: string;
}

/** GET /api/projects/:id/kpi-suggestions. */
export interface KpiSuggestionList {
  /** The framework version listed (default: the current one). */
  frameworkId: string | null;
  suggestions: KpiSuggestion[];
  /** Runs still running, so progress resumes after a reload. */
  activeRuns: KpiRun[];
  latestFrameworkRun: KpiRun | null;
}

/** 201 body of POST /api/kpi-suggestions/:id/accept (warnings: donor_cap_exceeded only, today). */
export interface AcceptKpiSuggestionResponse {
  indicator: Indicator;
  suggestion: KpiSuggestion;
  warnings: KpiWarning[];
}

/** Body of POST /api/kpi-suggestions/:id/reject. The note must not contain personal data; it is stored redacted. */
export interface RejectKpiSuggestionBody {
  reason: SuggestionRejectReason;
  note?: string;
}

/** Deterministic quality check of an existing indicator (GET /api/frameworks/:id/indicator-quality). */
export interface IndicatorQuality {
  indicatorId: string;
  qualityScore: number;
  qualityBand: QualityBand;
  warnings: KpiWarning[];
  /** Some warning costs points: the row offers "Show alternatives". */
  needsAlternatives: boolean;
}

/** GET /api/kpi-assistant/status. */
export interface KpiAssistantStatus {
  /** False until the server has a real Anthropic API key (POST then answers 503 ai_not_configured). */
  aiConfigured: boolean;
  embeddings: "voyage" | "none";
  promptVersion: string;
}
