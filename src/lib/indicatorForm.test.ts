import { describe, expect, it } from "vitest";
import {
  buildCreatePayload,
  buildUpdatePayload,
  changedFields,
  checkGroupKey,
  emptyIndicatorForm,
  formValuesToPayload,
  indicatorToFormValues,
  isPercentUnit,
  needsAiReviewLabel,
  sectionOfField,
  suggestGroupKey,
  validateIndicatorForm,
} from "@/lib/indicatorForm";
import { isIsoDate, toDateInput } from "@/lib/dates";
import { makeIndicator } from "@/test/fixtures";

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

  it("requires numerator and denominator for percentages", () => {
    const errors = validateIndicatorForm(emptyIndicatorForm({ indicatorText: "x", unit: "%" }));
    expect(errors.numerator).toEqual({ key: "numeratorRequired" });
    expect(errors.denominator).toEqual({ key: "denominatorRequired" });
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

describe("needsAiReviewLabel", () => {
  it("labels AI-made indicators until they are approved", () => {
    expect(needsAiReviewLabel("ai_suggested", false)).toBe(true);
    expect(needsAiReviewLabel("ai_generated", false)).toBe(true);
    expect(needsAiReviewLabel("ai_suggested", true)).toBe(false);
    expect(needsAiReviewLabel("manual", false)).toBe(false);
    expect(needsAiReviewLabel("library", false)).toBe(false);
  });
});
