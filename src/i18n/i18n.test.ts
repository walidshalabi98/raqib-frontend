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
  PARSING_STATUSES,
  PROJECT_STATUSES,
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
      ["projectStatus", PROJECT_STATUSES],
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

  it("calls project documents وثيقة / وثائق in Arabic, as the Documents screens do (never مستند)", () => {
    const entries = (obj: Record<string, unknown>, prefix = ""): Array<[string, string]> =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object" ? entries(v as Record<string, unknown>, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)] as [string, string]],
      );
    const arabic = new Map(entries(ar));
    // A generic shared file (where to share a password), not a project document.
    const generic = new Set(["settings.tempPassword.warningPrivate"]);
    const aboutDocuments = entries(en).filter(([key, text]) => /document/i.test(text) && !generic.has(key));
    expect(aboutDocuments.length).toBeGreaterThan(10);
    for (const [key] of aboutDocuments) expect(arabic.get(key), key).not.toMatch(/مستند/);
    expect(ar.projectDetail.tab.documents).toBe("الوثائق");
    expect(ar.projectActions.deleteDialog.item.documents).toMatch(/^الوثائق/);
  });

  it("uses Arabic plural forms", () => {
    const t = i18n.getFixedT("ar");
    expect(t("results.indicatorCount", { count: 0 })).toBe("لا توجد مؤشرات");
    expect(t("results.indicatorCount", { count: 2 })).toBe("مؤشران");
    expect(t("results.indicatorCount", { count: 5 })).toBe("5 مؤشرات");
    expect(i18n.getFixedT("en")("results.indicatorCount", { count: 1 })).toBe("1 indicator");
  });

  it("maps preferences to a language and direction", () => {
    expect(toAppLanguage("ar")).toBe("ar");
    expect(toAppLanguage("fr")).toBe("en");
    expect(toAppLanguage(undefined)).toBe("en");
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });
});
