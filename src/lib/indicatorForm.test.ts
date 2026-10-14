import { describe, expect, it } from "vitest";
import {
  ACCEPT_EDITABLE_KEYS,
  ACCEPT_HIDDEN_FIELDS,
  acceptEdits,
  blockingErrors,
  buildCreatePayload,
  canApproveIndicator,
  buildUpdatePayload,
  changedFields,
  checkGroupKey,
  emptyIndicatorForm,
  formValuesToPayload,
  indicatorFormWarnings,
  indicatorToFormValues,
  inputToFormValues,
  isFrameworkApproved,
  isPercentUnit,
  needsAiReviewLabel,
  normaliseLibraryId,
  sectionOfField,
  suggestGroupKey,
  validateIndicatorForm,
} from "@/lib/indicatorForm";
import { isIsoDate, toDateInput } from "@/lib/dates";
import { makeIndicator, makeIndicatorDraft } from "@/test/fixtures";

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("turns API dates into date-input values", () => {
    expect(toDateInput("2026-02-15T00:00:00.000Z")).toBe("2026-02-15");
    expect(toDateInput("2026-02-15")).toBe("2026-02-15");
    expect(toDateInput(null)).toBe("");
    expect(toDateInput("Month 3")).toBe("");
  });
});

describe("isPercentUnit", () => {
  it.each(["%", "percent", "Percentage", "% of households", "٪", "نسبة مئوية"])("treats %s as a percentage", (unit) => {
    expect(isPercentUnit(unit)).toBe(true);
  });
  it.each(["", "number", "score", "litres_per_person_per_day"])("does not treat %s as a percentage", (unit) => {
    expect(isPercentUnit(unit)).toBe(false);
  });
});

describe("disaggregation keys", () => {
  it("accepts a new snake_case key", () => {
    expect(checkGroupKey("female_headed_household", ["sex"])).toBeNull();
  });

  it("rejects empty, malformed, duplicate and too many keys", () => {
    expect(checkGroupKey("  ", [])).toEqual({ key: "groupEmpty" });
    expect(checkGroupKey("Sex", [])?.key).toBe("groupKeyWithSuggestion");
    expect(checkGroupKey("Female head", [])).toEqual({
      key: "groupKeyWithSuggestion",
      values: { key: "Female head", suggestion: "female_head" },
    });
    expect(checkGroupKey("1st", [])).toEqual({ key: "groupKeyWithSuggestion", values: { key: "1st", suggestion: "st" } });
    expect(checkGroupKey("***", [])).toEqual({ key: "groupKey", values: { key: "***" } });
    expect(checkGroupKey("sex", ["sex"])).toEqual({ key: "groupDuplicate", values: { key: "sex" } });
    const twenty = Array.from({ length: 20 }, (_, i) => `g${i}`);
    expect(checkGroupKey("extra", twenty)?.key).toBe("groupMax");
    expect(checkGroupKey("a".repeat(51), [])?.key).toBe("tooLong");
  });

  it("suggests a usable key", () => {
    expect(suggestGroupKey(" Displacement-Status ")).toBe("displacement_status");
    expect(suggestGroupKey("حالة")).toBe("");
  });
});

describe("validateIndicatorForm", () => {
  it("requires the English name", () => {
    expect(validateIndicatorForm(emptyIndicatorForm())).toEqual({ indicatorText: { key: "indicatorTextRequired" } });
    expect(validateIndicatorForm(emptyIndicatorForm({ indicatorText: "Number of trainees" }))).toEqual({});
  });

  it("warns, without blocking, when a percentage has no numerator or denominator", () => {
    const values = emptyIndicatorForm({ indicatorText: "x", unit: "%" });
    expect(validateIndicatorForm(values)).toEqual({});
    expect(indicatorFormWarnings(values)).toEqual({ numerator: { key: "numerator" }, denominator: { key: "denominator" } });
    expect(indicatorFormWarnings({ ...values, numerator: "a", denominator: "b" })).toEqual({});
    expect(indicatorFormWarnings({ ...values, unit: "number" })).toEqual({});
  });

  it("checks dates and date order", () => {
    const errors = validateIndicatorForm(emptyIndicatorForm({
      indicatorText: "x",
      baselineDate: "2026-13-01",
      startDate: "2026-05-01",
      endDate: "2026-04-01",
      actualStartDate: "2026-05-01",
      actualEndDate: "2026-04-30",
    }));
    expect(errors.baselineDate).toEqual({ key: "date" });
    expect(errors.endDate).toEqual({ key: "endBeforeStart" });
    expect(errors.actualEndDate).toEqual({ key: "actualEndBeforeStart" });
  });

  it("checks intermediate targets and milestones row by row", () => {
    const errors = validateIndicatorForm(emptyIndicatorForm({
      indicatorText: "x",
      intermediateTargets: [
        { date: "2026-06-30", value: "10" },
        { date: "2026-06-30", value: "" },
        { date: "", value: "20" },
      ],
      milestones: [{ label: "", date: "2026-02-30", completed: false }],
    }));
    expect(errors["intermediateTargets.1.date"]).toEqual({ key: "targetDuplicate", values: { date: "2026-06-30" } });
    expect(errors["intermediateTargets.1.value"]).toEqual({ key: "targetValue", values: { n: 2 } });
    expect(errors["intermediateTargets.2.date"]).toEqual({ key: "targetDate", values: { n: 3 } });
    expect(errors["milestones.0.label"]).toEqual({ key: "milestoneLabel", values: { n: 1 } });
    expect(errors["milestones.0.date"]).toEqual({ key: "milestoneDate", values: { n: 1 } });
    expect(errors["intermediateTargets.0.date"]).toBeUndefined();
  });

  it("flags invalid stored disaggregation keys and over-long text", () => {
    const errors = validateIndicatorForm(emptyIndicatorForm({
      indicatorText: "x".repeat(1001),
      disaggregation: ["sex", "Bad Key"],
    }));
    expect(errors.indicatorText).toEqual({ key: "tooLong", values: { max: 1000 } });
    expect(errors.disaggregation).toEqual({ key: "groupKey", values: { key: "Bad Key" } });
  });

  it("blocks an edit only on fields the user changed", () => {
    const initial = emptyIndicatorForm({
      indicatorText: "x",
      disaggregation: ["Bad Key"],
      milestones: [{ label: "", date: "", completed: false }],
      startDate: "2026-01-01",
      endDate: "2026-06-30",
    });
    const stored = validateIndicatorForm(initial);
    expect(Object.keys(stored).sort()).toEqual(["disaggregation", "milestones.0.label"]);
    // Create: every problem blocks.
    expect(blockingErrors(stored, initial, null)).toEqual(stored);
    // Edit, nothing changed: stored problems do not block.
    expect(blockingErrors(stored, initial, initial)).toEqual({});
    // Edit, the list changed: its problems block.
    const withAge = { ...initial, disaggregation: ["Bad Key", "age"] };
    expect(blockingErrors(validateIndicatorForm(withAge), withAge, initial)).toEqual({ disaggregation: stored.disaggregation });
    // An end date error blocks when the start date moved past it.
    const later = { ...initial, startDate: "2026-07-01" };
    expect(blockingErrors(validateIndicatorForm(later), later, initial).endDate).toEqual({ key: "endBeforeStart" });
  });

  it("maps fields to their sections", () => {
    expect(sectionOfField("indicatorText")).toBe("basics");
    expect(sectionOfField("numerator")).toBe("definition");
    expect(sectionOfField("intermediateTargets.2.value")).toBe("baseline");
    expect(sectionOfField("milestones.0.label")).toBe("timeline");
    expect(sectionOfField("libraryId")).toBe("standard");
  });
});

describe("payloads", () => {
  it("turns empty inputs into null and keeps only filled calculation parts", () => {
    const payload = formValuesToPayload(emptyIndicatorForm({ indicatorText: "  Trainees  ", numerator: " a ", formula: "" }));
    expect(payload.indicatorText).toBe("Trainees");
    expect(payload.indicatorTextAr).toBeNull();
    expect(payload.calculation).toEqual({ numerator: "a" });
    expect(payload.disaggregation).toBeNull();
    expect(payload.intermediateTargets).toBeNull();
    expect(payload.baselineDate).toBeNull();
    expect(payload.resultId).toBeNull();
    expect(payload.direction).toBeNull();
    expect(payload.milestones).toBeNull();
    expect(payload).not.toHaveProperty("provenance");
  });

  it("sets provenance on create from the library id", () => {
    expect(buildCreatePayload(emptyIndicatorForm({ indicatorText: "x" })).provenance).toBe("manual");
    expect(buildCreatePayload(emptyIndicatorForm({ indicatorText: "x", libraryId: "FS-01" })).provenance).toBe("library");
  });

  it("round-trips an indicator without reporting changes", () => {
    const indicator = makeIndicator();
    expect(buildUpdatePayload(indicator, indicatorToFormValues(indicator))).toEqual({});
  });

  it("sends library ids trimmed and upper-case", () => {
    expect(normaliseLibraryId(" fs-01 ")).toBe("FS-01");
    expect(formValuesToPayload(emptyIndicatorForm({ indicatorText: "x", libraryId: " wash-03 " })).libraryId).toBe("WASH-03");
    expect(formValuesToPayload(emptyIndicatorForm({ indicatorText: "x", libraryId: "  " })).libraryId).toBeNull();
    // A stored id differing only in case is not a change.
    const indicator = makeIndicator({ libraryId: "fs-01" });
    expect(buildUpdatePayload(indicator, { ...indicatorToFormValues(indicator), libraryId: "FS-01" })).toEqual({});
    expect(buildUpdatePayload(makeIndicator(), { ...indicatorToFormValues(makeIndicator()), libraryId: "fs-02" })).toEqual({ libraryId: "FS-02" });
  });

  it("sends only the changed fields on edit", () => {
    const indicator = makeIndicator();
    const values = indicatorToFormValues(indicator);
    const payload = buildUpdatePayload(indicator, {
      ...values,
      targetValue: "60%",
      definition: "",
      disaggregation: [...values.disaggregation, "sex"],
      denominator: "All surveyed households",
    });
    expect(payload).toEqual({
      targetValue: "60%",
      definition: null,
      disaggregation: ["sex_of_household_head", "location", "sex"],
      calculation: { numerator: "Households with FCS > 35", denominator: "All surveyed households", formula: "n/d*100" },
    });
  });

  it("compares nested values deeply", () => {
    expect(changedFields({ calculation: { numerator: "a" } }, { calculation: { numerator: "a" } })).toEqual({});
    expect(changedFields({ resultId: null }, { resultId: "r1" })).toEqual({ resultId: "r1" });
  });
});

describe("needsAiReviewLabel (design D18)", () => {
  it("labels AI-made indicators until the indicator itself is approved", () => {
    expect(needsAiReviewLabel("ai_suggested", false)).toBe(true);
    expect(needsAiReviewLabel("ai_generated", false)).toBe(true);
    expect(needsAiReviewLabel("ai_generated", undefined)).toBe(true);
    expect(needsAiReviewLabel("ai_suggested", null)).toBe(true);
    expect(needsAiReviewLabel("ai_suggested", true)).toBe(false);
    expect(needsAiReviewLabel("ai_generated", true)).toBe(false);
  });

  it("never labels indicators people made or took from the library", () => {
    for (const provenance of ["manual", "library", "imported", null, undefined] as const) {
      expect(needsAiReviewLabel(provenance, false)).toBe(false);
    }
  });

  it("treats approved and active frameworks as approved (when indicator approval is offered)", () => {
    expect(["draft", "expert_review", "client_review", "approved", "active"].map((s) => isFrameworkApproved(s as never)))
      .toEqual([false, false, false, true, true]);
    expect(isFrameworkApproved(null)).toBe(false);
  });
});

describe("canApproveIndicator (design D18, 9.5)", () => {
  it("offers approval to org and platform admins for unapproved indicators of an approved or active framework", () => {
    for (const role of ["org_admin", "platform_admin"]) {
      expect(canApproveIndicator(role, { isApproved: false }, "approved")).toBe(true);
      expect(canApproveIndicator(role, { isApproved: false }, "active")).toBe(true);
    }
  });

  it("not to other roles, not twice, and not for manual or library indicators before the framework is approved", () => {
    for (const role of ["me_officer", "donor_viewer", "", null, undefined]) {
      expect(canApproveIndicator(role, { isApproved: false }, "approved")).toBe(false);
      expect(canApproveIndicator(role, { isApproved: false, provenance: "ai_suggested" }, "draft")).toBe(false);
    }
    expect(canApproveIndicator("org_admin", { isApproved: true }, "approved")).toBe(false);
    expect(canApproveIndicator("org_admin", { isApproved: true, provenance: "ai_suggested" }, "draft")).toBe(false);
    for (const status of ["draft", "expert_review", "client_review", null, undefined] as const) {
      expect(canApproveIndicator("org_admin", { isApproved: false }, status)).toBe(false);
      expect(canApproveIndicator("org_admin", { isApproved: false, provenance: "manual" }, status)).toBe(false);
      expect(canApproveIndicator("org_admin", { isApproved: false, provenance: "library" }, status)).toBe(false);
    }
  });

  it("offers approval of an AI-made indicator whatever the framework status (review UX-03: no framework approval on the tab)", () => {
    for (const status of ["draft", "expert_review", "client_review", "approved", "active", null] as const) {
      expect(canApproveIndicator("org_admin", { isApproved: false, provenance: "ai_suggested" }, status)).toBe(true);
      expect(canApproveIndicator("platform_admin", { isApproved: false, provenance: "ai_generated" }, status)).toBe(true);
    }
  });
});

describe("inputToFormValues", () => {
  it("fills the form from a KPI suggestion's draft", () => {
    const values = inputToFormValues(makeIndicatorDraft());
    expect(values).toMatchObject({
      indicatorText: "% of target households with an acceptable Food Consumption Score",
      indicatorTextAr: "نسبة الأسر المستهدفة ذات درجة استهلاك غذائي مقبولة",
      level: "outcome",
      resultId: "o1",
      status: "not_started",
      unit: "percent",
      direction: "increase",
      numerator: "Target households with an acceptable FCS",
      denominator: "Surveyed target households",
      formula: "numerator ÷ denominator × 100",
      disaggregation: ["sex_of_household_head", "location"],
      dataCollectionMethod: "hh_survey",
      frequency: "biannual",
      baselineValue: "42%",
      baselineDate: "",
      targetValue: "",
      intermediateTargets: [],
      libraryId: "FS-01",
      standardReferenceCode: "WFP CRF FCS",
      startDate: "2026-01-01",
      endDate: "2027-06-30",
      milestones: [],
    });
  });

  it("uses the form defaults for missing fields and turns date-times into dates", () => {
    expect(inputToFormValues({})).toEqual(emptyIndicatorForm());
    const values = inputToFormValues({
      indicatorText: "Trainees",
      baselineDate: "2026-02-15T00:00:00.000Z",
      intermediateTargets: [{ date: "2026-12-31T00:00:00.000Z", value: "48%" }],
      milestones: [{ label: "Survey", date: null }],
      calculation: null,
      disaggregation: null,
    });
    expect(values.baselineDate).toBe("2026-02-15");
    expect(values.intermediateTargets).toEqual([{ date: "2026-12-31", value: "48%" }]);
    expect(values.milestones).toEqual([{ label: "Survey", date: "", completed: false }]);
    expect(values.numerator).toBe("");
    expect(values.disaggregation).toEqual([]);
  });

  it("gives the same values for a stored indicator as indicatorToFormValues", () => {
    const indicator = makeIndicator();
    expect(inputToFormValues(indicator)).toEqual(indicatorToFormValues(indicator));
  });
});

describe("acceptEdits (design 8.1, 9.5)", () => {
  it("sends no edits when the draft is accepted unchanged", () => {
    const draft = makeIndicatorDraft();
    expect(acceptEdits(draft, inputToFormValues(draft))).toBeUndefined();
  });

  it("does not count formatting as an edit", () => {
    const draft = makeIndicatorDraft({ libraryId: "fs-01", startDate: "2026-01-01T00:00:00.000Z" });
    const values = { ...inputToFormValues(draft), libraryId: " FS-01 ", indicatorText: `  ${draft.indicatorText} ` };
    expect(acceptEdits(draft, values)).toBeUndefined();
  });

  it("sends only the changed fields, with cleared fields as null", () => {
    const draft = makeIndicatorDraft();
    const values = {
      ...inputToFormValues(draft),
      indicatorText: "% of target households with an acceptable FCS",
      baselineValue: "",
      targetValue: "60%",
      endDate: "2027-12-31",
      disaggregation: ["sex_of_household_head", "location", "disability"],
    };
    expect(acceptEdits(draft, values)).toEqual({
      indicatorText: "% of target households with an acceptable FCS",
      baselineValue: null,
      targetValue: "60%",
      endDate: "2027-12-31",
      disaggregation: ["sex_of_household_head", "location", "disability"],
    });
  });

  it("sends the whole calculation when one part changes, and never a provenance", () => {
    const draft = makeIndicatorDraft();
    const edits = acceptEdits(draft, { ...inputToFormValues(draft), denominator: "All surveyed households" });
    expect(edits).toEqual({
      calculation: {
        numerator: "Target households with an acceptable FCS",
        denominator: "All surveyed households",
        formula: "numerator ÷ denominator × 100",
        rounding: "To be confirmed by the M&E officer",
      },
    });
    expect(edits).not.toHaveProperty("provenance");
  });

  it("sends a new result with its level", () => {
    const draft = makeIndicatorDraft();
    expect(acceptEdits(draft, { ...inputToFormValues(draft), resultId: "o2" })).toEqual({ resultId: "o2" });
    expect(acceptEdits(draft, { ...inputToFormValues(draft), resultId: "o11", level: "output" }))
      .toEqual({ resultId: "o11", level: "output" });
  });

  it("never sends a field the server would refuse with 400 not_editable: status, current value, actual dates, milestones (TQ-02)", () => {
    const draft = makeIndicatorDraft();
    const values = {
      ...inputToFormValues(draft),
      status: "at_risk" as const,
      currentValue: "12",
      actualStartDate: "2026-02-01",
      actualEndDate: "2026-03-01",
      milestones: [{ label: "Baseline survey done", date: "2026-05-01", completed: false }],
    };
    expect(acceptEdits(draft, values)).toBeUndefined();
    const edits = acceptEdits(draft, { ...values, targetValue: "60%" });
    expect(edits).toEqual({ targetValue: "60%" });
    // Only ACCEPT_EDITABLE_KEYS go out: the server answers 400 not_editable to any other key (not a silent drop).
    expect(Object.keys(edits ?? {}).every((key) => (ACCEPT_EDITABLE_KEYS as readonly string[]).includes(key))).toBe(true);
  });
});

describe("the accept contract (mirror of the backend DRAFT_EDITABLE_KEYS, TQ-02)", () => {
  it("lists the keys the backend accepts as edits (raqib-backend src/services/kpi/draft.ts EDITABLE_KEYS)", () => {
    expect([...ACCEPT_EDITABLE_KEYS].sort()).toEqual([
      "aiRationale", "assumptions", "baselineDate", "baselineMethod", "baselineValue", "calculation", "dataCollectionMethod",
      "definition", "direction", "disaggregation", "endDate", "frequency", "indicatorText", "indicatorTextAr",
      "intermediateTargets", "level", "libraryId", "meansOfVerification", "responsibility", "resultId",
      "standardReferenceCode", "startDate", "targetJustification", "targetValue", "unit",
    ]);
  });

  it("every field the accept form shows is a key the backend keeps; the others are hidden in accept mode", () => {
    const formKeys = Object.keys(formValuesToPayload(emptyIndicatorForm()));
    const hidden = new Set<string>(ACCEPT_HIDDEN_FIELDS);
    const editable = new Set<string>(ACCEPT_EDITABLE_KEYS);
    expect(formKeys.filter((key) => !hidden.has(key) && !editable.has(key))).toEqual([]);
    expect([...hidden].every((key) => formKeys.includes(key) && !editable.has(key))).toBe(true);
  });
});
