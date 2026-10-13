import type {
  DisclosedCell,
  DonorBeneficiarySummary,
  DonorQualitativeEntry,
  DonorReport,
  Indicator,
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
