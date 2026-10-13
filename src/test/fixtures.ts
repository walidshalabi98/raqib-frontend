import type { KpiAssistantValue } from "@/hooks/useKpiAssistant";
import type {
  AuthUser,
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
  ResultNode,
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
