import type { Indicator, ResultNode } from "@/types/api";

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
