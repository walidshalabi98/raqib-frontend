import { describe, expect, it } from "vitest";
import {
  KPI_CONFIDENCE_LEVELS,
  KPI_ERROR_CODES_SHOWN,
  KPI_REJECT_REASONS,
  KPI_RUN_STEPS_SHOWN,
  KPI_WARNING_CODES,
  QUALITY_BANDS,
  SUGGESTABLE_LEVELS,
  UNIT_SUGGESTIONS,
} from "@/lib/constants";
import { isPercentUnit } from "@/lib/indicatorForm";
import type { KpiErrorCode, KpiRequestErrorCode, KpiWarningCode, SuggestionRejectReason } from "@/types/api";

describe("UNIT_SUGGESTIONS", () => {
  it("is the shared unit list of the backend framework schema, in its order", () => {
    // raqib-backend src/services/ai/prompts/framework.ts INDICATOR_UNITS
    expect(UNIT_SUGGESTIONS).toEqual([
      "number", "percent", "score", "ratio", "index", "litres_per_person_per_day", "hectares", "dunums", "megawatts", "tonnes_co2eq",
      "currency_ils", "currency_usd", "currency_eur", "currency_jod", "kg_per_dunum", "days", "hours", "minutes", "km", "yes_no",
    ]);
  });

  it("has exactly one percentage unit", () => {
    expect(UNIT_SUGGESTIONS.filter((unit) => isPercentUnit(unit))).toEqual(["percent"]);
  });
});

// ------------------------------------------------------- KPI Assistant (Phase 4)

// Compile-time: every union member is listed (a missing one makes these lines fail typecheck).
type Missing<Union, Listed> = Exclude<Union, Listed>;
const everyWarningCode: [Missing<KpiWarningCode, (typeof KPI_WARNING_CODES)[number]>] extends [never] ? true : false = true;
const everyRejectReason: [Missing<SuggestionRejectReason, (typeof KPI_REJECT_REASONS)[number]>] extends [never] ? true : false = true;
const everyRunError: [Missing<KpiErrorCode, (typeof KPI_ERROR_CODES_SHOWN)[number]>] extends [never] ? true : false = true;
const everyRequestError: [Missing<KpiRequestErrorCode, (typeof KPI_ERROR_CODES_SHOWN)[number]>] extends [never] ? true : false = true;

describe("KPI Assistant constants", () => {
  it("mirror the backend lists (raqib-backend src/services/kpi/types.ts, prisma enums)", () => {
    expect([everyWarningCode, everyRejectReason, everyRunError, everyRequestError]).toEqual([true, true, true, true]);
    expect(KPI_WARNING_CODES).toHaveLength(31);
    expect(new Set(KPI_WARNING_CODES).size).toBe(KPI_WARNING_CODES.length);
    expect(KPI_WARNING_CODES).toEqual(expect.arrayContaining([
      "arabic_name_from_library", "donor_cap_exceeded", "keyword_fallback", "level_mismatch_library", "result_empty",
    ]));
    expect(KPI_REJECT_REASONS).toEqual(["not_relevant", "too_costly_to_measure", "donor_not_required", "duplicate", "wording", "other"]);
    expect(QUALITY_BANDS).toEqual(["strong", "review", "weak"]);
    expect(KPI_CONFIDENCE_LEVELS).toEqual(["high", "medium", "low"]);
  });

  it("show four named steps and never suggest for activities", () => {
    expect(KPI_RUN_STEPS_SHOWN).toEqual(["context", "retrieval", "model", "validation"]);
    expect(SUGGESTABLE_LEVELS).toEqual(["impact", "outcome", "output"]);
  });

  it("list the run and request error codes the UI translates, rate_limited and conflict included", () => {
    expect(KPI_ERROR_CODES_SHOWN).toHaveLength(20);
    expect(new Set(KPI_ERROR_CODES_SHOWN).size).toBe(20);
    expect(KPI_ERROR_CODES_SHOWN).toEqual(expect.arrayContaining(["rate_limited", "conflict", "source_has_data", "not_editable"]));
  });
});
