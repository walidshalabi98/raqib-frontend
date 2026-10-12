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

/** GET /api/projects/:id — the project with its documents and latest framework. */
export interface ProjectDetail extends Project {
  documents: ProjectDocument[];
  frameworks: Array<Omit<Framework, "resultNodes"> & { resultNodes?: ResultNode[] }>;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: string | number | null;
  parsingStatus: "pending" | "processing" | "completed" | "failed";
  uploadedAt: string;
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
 * Breakdown rules follow the indicator's unit: a count needs a numeric value and
 * groups that add up to it; a percentage takes 0–100 per group with no sum; a
 * blank unit is checked as a percentage only when the indicator text reads as one.
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

export interface GenerationStatus {
  frameworkId: string;
  status: string;
  progress?: string;
  framework?: Framework;
}
