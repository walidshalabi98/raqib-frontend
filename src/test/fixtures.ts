import type { KpiAssistantValue } from "@/hooks/useKpiAssistant";
import type {
  AuthUser,
  DisclosedCell,
  DonorBeneficiarySummary,
  DonorQualitativeEntry,
  DonorReport,
  Indicator,
  IndicatorDraft,
  IndicatorQuality,
  KpiAssistantStatus,
  KpiRun,
  KpiSuggestion,
  KpiSuggestionList,
  KpiSuggestionPayload,
  KpiWarning,
  KpiWarningCode,
  ProjectDashboard,
  Report,
  ResultNode,
  StaffBeneficiaryStats,
} from "@/types/api";

/** Test data shaped like API responses. */

export function makeIndicator(overrides: Partial<Indicator> = {}): Indicator {
  return {
    id: "ind-1",
    frameworkId: "fw-1",
    indicatorText: "% of households with acceptable FCS",
    indicatorTextAr: "نسبة الأسر ذات درجة استهلاك غذائي مقبولة",
    level: "outcome",
    dataCollectionMethod: "hh_survey",
    frequency: "biannual",
    baselineValue: "42%",
    targetValue: "55%",
    currentValue: null,
    unit: "percent",
    status: "on_track",
    aiRationale: null,
    phases: ["baseline", "endline"],
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2027-06-30T00:00:00.000Z",
    actualStartDate: null,
    actualEndDate: null,
    milestones: [{ label: "Baseline survey", date: "2026-02-15", completed: true }],
    responsibility: "M&E officer",
    sortOrder: 0,
    isApproved: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    resultId: "o1",
    definition: "Households with FCS above 35",
    calculation: { numerator: "Households with FCS > 35", denominator: "Surveyed households", formula: "n/d*100" },
    direction: "increase",
    disaggregation: ["sex_of_household_head", "location"],
    meansOfVerification: "Household survey, FCS module, n≈400",
    baselineDate: "2026-02-15T00:00:00.000Z",
    baselineMethod: "Baseline household survey",
    targetJustification: "Similar programmes reached +15 points",
    intermediateTargets: [{ date: "2026-12-31", value: "48%" }],
    assumptions: "Prices stay stable",
    libraryId: "FS-01",
    standardReferenceCode: "WFP CRF",
    provenance: "library",
    aiModel: null,
    promptVersion: null,
    result: { id: "o1", code: "O1", level: "outcome", text: "Improved food security" },
    ...overrides,
  };
}

export function makeResultNode(overrides: Partial<ResultNode> & Pick<ResultNode, "id" | "code" | "level">): ResultNode {
  return {
    frameworkId: "fw-1",
    parentId: null,
    text: `Result ${overrides.code}`,
    textAr: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    _count: { indicators: 0, children: 0 },
    ...overrides,
  };
}

/** Goal G → outcome O1 → output O1.1, plus outcome O2 without children. */
export function sampleResultNodes(): ResultNode[] {
  return [
    makeResultNode({ id: "g", code: "Goal", level: "impact", text: "Reduced food insecurity", textAr: "انخفاض انعدام الأمن الغذائي", _count: { indicators: 1, children: 2 } }),
    makeResultNode({ id: "o1", code: "O1", level: "outcome", parentId: "g", text: "Improved food consumption", _count: { indicators: 2, children: 1 } }),
    makeResultNode({ id: "o11", code: "O1.1", level: "output", parentId: "o1", text: "Households receive vouchers", _count: { indicators: 1, children: 0 } }),
    makeResultNode({ id: "o2", code: "O2", level: "outcome", parentId: "g", sortOrder: 1, text: "Better nutrition practices", _count: { indicators: 0, children: 0 } }),
  ];
}

// ------------------------------------------------------------ KPI Assistant (Phase 4)
// Made-up data shaped like the KPI routes' responses (raqib-backend design section 7.3). No personal data.

const TBC = "To be confirmed by the M&E officer";

/** A user of the given role (AuthProvider reads it through api.getUser()). */
export function makeAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    email: "officer@example.org",
    fullName: "M&E Officer",
    role: "me_officer",
    languagePref: "en",
    organization: { id: "org-1", name: "Example NGO" },
    ...overrides,
  };
}

/** A validation note; `message` defaults to a short English text and `severity` follows the backend's info codes. */
export function makeKpiWarning(code: KpiWarningCode, overrides: Partial<KpiWarning> = {}): KpiWarning {
  const info: KpiWarningCode[] = [
    "sex_keys_from_library", "sex_added", "target_method_default", "output_survey_method", "impact_not_secondary",
    "level_adjusted", "arabic_name_from_library", "keyword_fallback",
  ];
  const penalties: Partial<Record<KpiWarningCode, number>> = {
    custom_reason_missing: 10, target_in_name: 15, double_barrelled: 10, percent_without_calculation: 15,
  };
  return {
    code,
    severity: info.includes(code) ? "info" : "warning",
    message: `English text of ${code}`,
    params: {},
    penalty: penalties[code] ?? 0,
    ...overrides,
  };
}

/** What accepting the default suggestion creates (IndicatorInput-compatible). */
export function makeIndicatorDraft(overrides: Partial<IndicatorDraft> = {}): IndicatorDraft {
  return {
    indicatorText: "% of target households with an acceptable Food Consumption Score",
    indicatorTextAr: "نسبة الأسر المستهدفة ذات درجة استهلاك غذائي مقبولة",
    level: "outcome",
    resultId: "o1",
    libraryId: "FS-01",
    standardReferenceCode: "WFP CRF FCS",
    definition: "Households whose Food Consumption Score is above the acceptable threshold.",
    unit: "percent",
    calculation: {
      numerator: "Target households with an acceptable FCS",
      denominator: "Surveyed target households",
      formula: "numerator ÷ denominator × 100",
      rounding: TBC,
    },
    direction: "increase",
    disaggregation: ["sex_of_household_head", "location"],
    dataCollectionMethod: "hh_survey",
    frequency: "biannual",
    meansOfVerification: "Household survey, FCS module",
    baselineValue: "42%",
    baselineDate: null,
    baselineMethod: "Baseline taken from the project documents (source: proposal.pdf). Baseline date: to be confirmed.",
    targetValue: null,
    targetJustification: "Proposed method: set after the baseline — confirm after baseline. Intermediate targets: to be confirmed after the baseline.",
    intermediateTargets: [],
    assumptions: TBC,
    responsibility: TBC,
    startDate: "2026-01-01",
    endDate: "2027-06-30",
    aiRationale: "Standard food security outcome measure for voucher programmes.",
    ...overrides,
  };
}

/** The card fields of the default suggestion. */
export function makeKpiSuggestionPayload(overrides: Partial<KpiSuggestionPayload> = {}): KpiSuggestionPayload {
  return {
    customReason: "",
    name: "% of target households with an acceptable Food Consumption Score",
    nameAr: "نسبة الأسر المستهدفة ذات درجة استهلاك غذائي مقبولة",
    definition: "Households whose Food Consumption Score is above the acceptable threshold.",
    unit: "percent",
    numerator: "Target households with an acceptable FCS",
    denominator: "Surveyed target households",
    direction: "increase",
    disaggregation: ["sex_of_household_head", "location"],
    method: "hh_survey",
    frequency: "biannual",
    meansOfVerification: "Household survey, FCS module",
    baselineSuggestion: "42%",
    baselineBasis: "document",
    baselineMethod: "Baseline taken from the project documents (source: proposal.pdf). Baseline date: to be confirmed.",
    targetSuggestion: "Set the target after the baseline survey.",
    targetBasis: "method_only",
    targetJustification: "Proposed method: set after the baseline — confirm after baseline.",
    standardReferenceCode: "WFP CRF FCS",
    rationale: "Standard food security outcome measure for voucher programmes. It matches the result statement.",
    qualityNotes: ["Uses the standard FCS thresholds."],
    confidence: "high",
    sources: { baseline: "proposal.pdf", target: null },
    rank: 1,
    ...overrides,
  };
}

type KpiSuggestionOverrides = Partial<Omit<KpiSuggestion, "suggestion" | "draft">> & {
  suggestion?: Partial<KpiSuggestionPayload>;
  draft?: Partial<IndicatorDraft>;
};

/** A pending suggestion for outcome O1 (sampleResultNodes); nested `suggestion` and `draft` overrides are merged. */
export function makeKpiSuggestion(overrides: KpiSuggestionOverrides = {}): KpiSuggestion {
  const { suggestion, draft, ...rest } = overrides;
  const resultId = rest.resultId === undefined ? "o1" : rest.resultId;
  return {
    id: "s-1",
    runId: "run-1",
    projectId: "p-1",
    frameworkId: "fw-1",
    resultId,
    resultCode: "O1",
    level: "outcome",
    sortOrder: 1,
    status: "pending",
    qualityScore: 100,
    qualityBand: "strong",
    warnings: [],
    libraryId: "FS-01",
    isCustom: false,
    origin: "model",
    model: "claude-sonnet-5-5",
    promptVersion: "kpi-v1",
    alternativeOfIndicatorId: null,
    alternativeOfSuggestionId: null,
    indicatorId: null,
    createdAt: "2026-10-13T08:00:10.000Z",
    decidedAt: null,
    decidedBy: null,
    rejectReason: null,
    rejectNote: null,
    ...rest,
    suggestion: makeKpiSuggestionPayload(suggestion),
    draft: makeIndicatorDraft({ resultId: resultId ?? "o1", ...draft }),
  };
}

/** A run of the KPI Assistant; default a completed result-scope run for O1. */
export function makeKpiRun(overrides: Partial<KpiRun> = {}): KpiRun {
  return {
    id: "run-1",
    projectId: "p-1",
    frameworkId: "fw-1",
    scope: "result",
    resultId: "o1",
    sourceIndicatorId: null,
    sourceSuggestionId: null,
    status: "completed",
    step: "done",
    errorCode: null,
    message: null,
    frameworkWarnings: [],
    suggestionCount: 1,
    retrieval: "keyword",
    model: "claude-sonnet-5-5",
    promptVersion: "kpi-v1",
    createdAt: "2026-10-13T08:00:00.000Z",
    updatedAt: "2026-10-13T08:00:14.000Z",
    finishedAt: "2026-10-13T08:00:14.000Z",
    ...overrides,
  };
}

/** GET /api/projects/:id/kpi-suggestions. */
export function makeKpiSuggestionList(overrides: Partial<KpiSuggestionList> = {}): KpiSuggestionList {
  return { frameworkId: "fw-1", suggestions: [], activeRuns: [], latestFrameworkRun: null, ...overrides };
}

/** GET /api/kpi-assistant/status. */
export function makeKpiAssistantStatus(overrides: Partial<KpiAssistantStatus> = {}): KpiAssistantStatus {
  return { aiConfigured: true, embeddings: "none", promptVersion: "kpi-v1", ...overrides };
}

/** One row of GET /api/frameworks/:id/indicator-quality. */
export function makeIndicatorQuality(overrides: Partial<IndicatorQuality> = {}): IndicatorQuality {
  return { indicatorId: "ind-1", qualityScore: 100, qualityBand: "strong", warnings: [], needsAlternatives: false, ...overrides };
}

/**
 * A KPI Assistant context value for components tested without the provider: enabled, AI configured, nothing pending
 * and no run. Pass functions (e.g. vi.fn()) to observe calls.
 */
export function makeKpiAssistantValue(overrides: Partial<KpiAssistantValue> = {}): KpiAssistantValue {
  return {
    enabled: true,
    aiConfigured: true,
    lang: "en",
    projectId: "p-1",
    frameworkId: "fw-1",
    pendingFor: () => [],
    runFor: () => null,
    latestFrameworkRun: null,
    request: () => undefined,
    errorFor: () => null,
    ...overrides,
  };
}

// ------------------------------------------------------------ Donor viewers (donor-data-access PR)

const cell = (key: string | null, count: number | null): DisclosedCell => ({ key, count, suppressed: count === null });

/**
 * A donor beneficiary summary as the backend sends it for the people in makeStaffStats (12: 9 women,
 * 3 men; 11 adults; 10 in Hebron): counts from 1 to 4 hidden, every other figure rounded to the
 * nearest 5 on its own (12 → 10, 9 → 10, 11 → 10), zeros shown.
 */
export function makeDonorSummary(overrides: Partial<DonorBeneficiarySummary> = {}): DonorBeneficiarySummary {
  return {
    audience: "donor",
    minCell: 5,
    minCellSensitive: 10,
    roundingBase: 5,
    otherKey: "__other__",
    suppressedAll: false,
    total: cell(null, 10),
    serviceCount: cell(null, null),
    byGender: [cell("male", null), cell("female", 10), cell("other", 0)],
    byAgeGroup: [
      cell("child_0_5", 0),
      cell("child_6_11", 0),
      cell("adolescent_12_17", 0),
      cell("youth_18_24", 0),
      cell("adult_25_59", 10),
      cell("elderly_60_plus", 0),
      cell(null, null),
    ],
    byGovernorate: [cell("Hebron", 10), cell(null, null), cell("__other__", null)],
    byStatus: [cell("active", 10), cell("completed", 0), cell("dropped_out", 0), cell("referred", 0)],
    byVulnerabilityTag: [cell("__other__", null)],
    byServiceType: [],
    ...overrides,
  };
}

/** Beneficiary stats as org staff receive them (exact counts). */
export function makeStaffStats(overrides: Partial<StaffBeneficiaryStats> = {}): StaffBeneficiaryStats {
  return {
    audience: "staff",
    total: 12,
    serviceCount: 1,
    byGender: [
      { gender: "female", _count: 9 },
      { gender: "male", _count: 3 },
    ],
    byAgeGroup: [
      { ageGroup: "adult_25_59", _count: 11 },
      { ageGroup: null, _count: 1 },
    ],
    byGovernorate: [
      { governorate: "Hebron", _count: 10 },
      { governorate: null, _count: 1 },
      { governorate: "Beit Ummar", _count: 1 },
    ],
    byStatus: [{ status: "active", _count: 12 }],
    ...overrides,
  };
}

/** A qualitative entry as donor viewers receive it (type, month and participants only). */
export function makeDonorEntry(overrides: Partial<DonorQualitativeEntry> = {}): DonorQualitativeEntry {
  return {
    id: "q-1",
    projectId: "p-1",
    assessmentId: null,
    entryType: "fgd_transcript",
    monthConducted: "2026-03",
    participants: 12,
    ...overrides,
  };
}

/** An unsigned JWT-shaped access token with these claims (the UI only decodes tokens; the server verifies them). */
export function makeAccessToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

/** A report as org staff receive it: a finished draft unless overridden. */
export function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "r-1",
    projectId: "p-1",
    type: "quarterly_summary",
    title: "Q3 summary",
    donorFormat: "echo",
    fileUrl: null,
    generatedAt: "2026-10-01T08:00:00.000Z",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    aiNarrative: "<p>Progress in the third quarter.</p>",
    status: "draft",
    ...overrides,
  };
}

/** A report as donor viewers receive it: published, never with a file location. */
export function makeDonorReport(overrides: Partial<DonorReport> = {}): DonorReport {
  return {
    id: "r-1",
    projectId: "p-1",
    type: "quarterly_summary",
    title: "Q3 summary",
    donorFormat: "echo",
    generatedAt: "2026-10-01T08:00:00.000Z",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    status: "published",
    aiNarrative: "<p>Progress in the third quarter.</p>",
    ...overrides,
  };
}

const DASHBOARD_PROJECT: ProjectDashboard["project"] = {
  id: "p-1",
  name: "Hebron Youth Employment",
  status: "active",
  sector: "livelihoods",
  donor: "EU",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2027-12-31T00:00:00.000Z",
  targetBeneficiaries: 1200,
};

/**
 * GET /api/dashboard/projects/:id/dashboard as org staff receive it: every data point (KoboToolbox rows
 * included), areas as typed (GPS too), recent activity with notes and the author.
 */
export function makeStaffDashboard(overrides: Partial<ProjectDashboard> = {}): ProjectDashboard {
  return {
    project: DASHBOARD_PROJECT,
    framework: { id: "fw-1", version: 2, status: "approved", totalIndicators: 2 },
    indicatorStatus: { on_track: 1, at_risk: 1, off_track: 0, not_started: 0, completed: 0 },
    indicatorLevels: { impact: 0, outcome: 1, output: 1, activity: 0 },
    trends: [
      {
        indicatorId: "ind-1",
        indicatorText: "% of youth employed six months after training",
        level: "outcome",
        unit: "%",
        status: "on_track",
        baselineValue: "20%",
        targetValue: "60%",
        currentValue: "45%",
        dataPoints: [
          { value: "45", date: "2026-08-15T00:00:00.000Z" },
          { value: "30", date: "2026-05-15T00:00:00.000Z" },
        ],
      },
      {
        indicatorId: "ind-2",
        indicatorText: "Number of youth trained",
        level: "output",
        unit: "people",
        status: "at_risk",
        baselineValue: "0",
        targetValue: "500",
        currentValue: "180",
        dataPoints: [
          { value: "180", date: "2026-08-20T00:00:00.000Z" },
          { value: "7", date: "2026-08-02T00:00:00.000Z" },
        ],
      },
    ],
    geographic: [
      { area: "Hebron", dataPointCount: 3 },
      { area: "31.5326,35.0998", dataPointCount: 1 },
    ],
    recentActivity: [
      {
        id: "dp-1",
        indicatorId: "ind-2",
        assessmentId: null,
        projectId: "p-1",
        value: "180",
        collectionDate: "2026-08-20T00:00:00.000Z",
        collectionMethod: "secondary_data",
        dataSource: "Training attendance",
        geographicArea: "Hebron",
        notes: "Two trainees left early",
        attachments: null,
        breakdown: null,
        createdAt: "2026-08-21T09:00:00.000Z",
        createdBy: "u-1",
        indicator: { indicatorText: "Number of youth trained" },
        creator: { fullName: "Officer One" },
      },
    ],
    assessments: [{ id: "a-1", type: "baseline", status: "delivered", requestedAt: "2026-01-15T00:00:00.000Z" }],
    ...overrides,
  };
}

/**
 * The same dashboard as donor viewers receive it: no KoboToolbox rows one by one (monthly aggregates in
 * `surveyAggregates` instead, small counts hidden), listed places only (others in one `area: null` group, with
 * the Arabic name beside the English one), and recent activity without notes, attachments or author.
 */
export function makeDonorDashboard(overrides: Partial<ProjectDashboard> = {}): ProjectDashboard {
  const hidden: DisclosedCell = { key: null, count: null, suppressed: true };
  const shown = (count: number): DisclosedCell => ({ key: null, count, suppressed: false });
  return {
    ...makeStaffDashboard(),
    trends: [
      {
        indicatorId: "ind-1",
        indicatorText: "% of youth employed six months after training",
        level: "outcome",
        unit: "%",
        status: "on_track",
        baselineValue: "20%",
        targetValue: "60%",
        currentValue: "45%",
        dataPoints: [],
        surveyAggregates: [
          { indicatorId: "ind-1", period: "2026-05", submissions: shown(25), aggregation: "mean", value: 30, numericAnswers: shown(25) },
          { indicatorId: "ind-1", period: "2026-08", submissions: shown(40), aggregation: "mean", value: 45.5, numericAnswers: shown(40) },
          // Too few answers: hidden, never plotted.
          { indicatorId: "ind-1", period: "2026-09", submissions: hidden, aggregation: "mean", value: null, numericAnswers: hidden },
        ],
      },
      {
        indicatorId: "ind-2",
        indicatorText: "Number of youth trained",
        level: "output",
        unit: "people",
        status: "at_risk",
        baselineValue: "0",
        targetValue: "500",
        currentValue: "180",
        dataPoints: [{ value: "180", date: "2026-08-20T00:00:00.000Z" }],
        surveyAggregates: [],
      },
    ],
    geographic: [
      { area: "Hebron", areaAr: "الخليل", dataPointCount: 2 },
      { area: null, areaAr: null, dataPointCount: 2 },
    ],
    recentActivity: [
      {
        id: "dp-1",
        indicatorId: "ind-2",
        assessmentId: null,
        value: "180",
        collectionDate: "2026-08-20T00:00:00.000Z",
        collectionMethod: "secondary_data",
        dataSource: "Training attendance",
        geographicArea: "Hebron",
        breakdown: null,
        createdAt: "2026-08-21T09:00:00.000Z",
        indicator: { indicatorText: "Number of youth trained" },
      },
    ],
    ...overrides,
  };
}
