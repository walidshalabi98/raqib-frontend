import { describe, expect, it } from "vitest";
import { UNIT_SUGGESTIONS } from "@/lib/constants";
import { isPercentUnit } from "@/lib/indicatorForm";

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
