import { describe, expect, it } from "vitest";
import i18n, { dirFor, toAppLanguage } from "@/i18n";
import en from "@/i18n/en.json";
import ar from "@/i18n/ar.json";
import {
  COLLECTION_METHODS,
  DIRECTIONS,
  DISAGGREGATION_SUGGESTIONS,
  DOCUMENT_FILE_TYPES,
  DONOR_TYPES,
  FREQUENCIES,
  INDICATOR_LEVELS,
  INDICATOR_STATUSES,
  KPI_CONFIDENCE_LEVELS,
  KPI_ERROR_CODES_SHOWN,
  KPI_REJECT_REASONS,
  KPI_RUN_STEPS_SHOWN,
  KPI_WARNING_CODES,
  PARSING_STATUSES,
  QUALITY_BANDS,
  PROVENANCES,
  SECTORS,
} from "@/lib/constants";

const PLURAL = /_(zero|one|two|few|many|other)$/;

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`.replace(PLURAL, "")],
  );
}

describe("translations", () => {
  it("has the same keys in English and Arabic", () => {
    expect([...new Set(keys(ar))].sort()).toEqual([...new Set(keys(en))].sort());
  });

  it("labels every enum value in both languages", () => {
    const groups: Array<[string, readonly string[]]> = [
      ["sector", SECTORS],
      ["donorType", DONOR_TYPES],
      ["level", INDICATOR_LEVELS],
      ["method", COLLECTION_METHODS],
      ["frequency", FREQUENCIES],
      ["direction", DIRECTIONS],
      ["status", INDICATOR_STATUSES],
      ["provenance", PROVENANCES],
      ["disaggregation", DISAGGREGATION_SUGGESTIONS],
      ["documentType", DOCUMENT_FILE_TYPES],
      ["parsingStatus", PARSING_STATUSES],
      ["kpi.reject.reasons", KPI_REJECT_REASONS],
      ["kpi.quality", QUALITY_BANDS],
      ["kpi.progress.steps", KPI_RUN_STEPS_SHOWN],
      ["kpi.warnings", KPI_WARNING_CODES],
      ["kpi.errors", KPI_ERROR_CODES_SHOWN],
      ["kpi.confidence", KPI_CONFIDENCE_LEVELS],
    ];
    for (const [group, values] of groups) {
      for (const value of values) {
        const enLabel = i18n.getFixedT("en")(`${group}.${value}`);
        const arLabel = i18n.getFixedT("ar")(`${group}.${value}`);
        expect(enLabel, `${group}.${value}`).not.toBe(`${group}.${value}`);
        expect(arLabel, `${group}.${value}`).not.toBe(`${group}.${value}`);
      }
    }
  });

  it("labels USAID as legacy and includes the new donors", () => {
    expect(en.donorType.usaid).toBe("USAID (legacy)");
    expect(DONOR_TYPES).toEqual(expect.arrayContaining(["echo", "wfp", "unfpa", "fcdo", "un_women"]));
    expect(DONOR_TYPES[DONOR_TYPES.length - 1]).toBe("usaid");
  });

  it("uses Arabic plural forms", () => {
    const t = i18n.getFixedT("ar");
    expect(t("results.indicatorCount", { count: 0 })).toBe("لا توجد مؤشرات");
    expect(t("results.indicatorCount", { count: 2 })).toBe("مؤشران");
    expect(t("results.indicatorCount", { count: 5 })).toBe("5 مؤشرات");
    expect(i18n.getFixedT("en")("results.indicatorCount", { count: 1 })).toBe("1 indicator");
  });

  it("uses Arabic plural forms for the KPI announcement", () => {
    const t = i18n.getFixedT("ar");
    expect(t("kpi.ready", { count: 0, code: "O1" })).toBe("لا توجد اقتراحات جاهزة للنتيجة O1");
    expect(t("kpi.ready", { count: 1, code: "O1" })).toBe("اقتراح واحد جاهز للنتيجة O1");
    expect(t("kpi.ready", { count: 2, code: "O1" })).toBe("اقتراحان جاهزان للنتيجة O1");
    expect(t("kpi.ready", { count: 3, code: "O1" })).toBe("3 اقتراحات جاهزة للنتيجة O1");
    expect(t("kpi.ready", { count: 11, code: "O1" })).toBe("11 اقتراحًا جاهزًا للنتيجة O1");
    expect(t("kpi.ready", { count: 100, code: "O1" })).toBe("100 اقتراح جاهز للنتيجة O1");
    expect(i18n.getFixedT("en")("kpi.ready", { count: 1, code: "O1" })).toBe("1 suggestion ready for O1");
    expect(i18n.getFixedT("en")("kpi.ready", { count: 3, code: "O1" })).toBe("3 suggestions ready for O1");
  });

  it("keeps the KPI warning texts the backend sends as the English fallback (design 9.6)", () => {
    // The backend message of each warning equals these English texts (raqib-backend validate.ts WARNING_TEXTS).
    expect(en.kpi.warnings.result_cap).toBe("{{code}}: kept {{cap}} indicators per result (donor or level limit); {{dropped}} more dropped.");
    expect(en.kpi.warnings.model_note).toBe("AI note: {{message}}");
    expect(Object.keys(en.kpi.warnings)).toHaveLength(KPI_WARNING_CODES.length);
  });

  it("puts the visible action label inside each named action (WCAG 2.5.3 label in name)", () => {
    for (const lng of ["en", "ar"] as const) {
      const t = i18n.getFixedT(lng);
      for (const action of ["accept", "editAccept", "reject", "alternatives"]) {
        expect(t(`kpi.actions.${action}Named`, { name: "X" }), `${lng} ${action}`).toContain(t(`kpi.actions.${action}`));
      }
    }
  });

  it("maps preferences to a language and direction", () => {
    expect(toAppLanguage("ar")).toBe("ar");
    expect(toAppLanguage("fr")).toBe("en");
    expect(toAppLanguage(undefined)).toBe("en");
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });
});
