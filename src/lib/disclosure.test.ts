import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import {
  OTHER_KEY,
  SUMMARY_DIMENSIONS,
  cellText,
  dimensionLabel,
  hiddenLegend,
  isDonorQualitativeEntry,
  isDonorSummary,
  summaryCsvRows,
  toSummaryView,
} from "@/lib/disclosure";
import { makeDonorEntry, makeDonorSummary, makeStaffStats } from "@/test/fixtures";
import type { QualitativeEntry } from "@/types/api";

const en = i18n.getFixedT("en");
const ar = i18n.getFixedT("ar");

describe("disclosure labels", () => {
  it("shows a count, or the Hidden text for a suppressed cell", () => {
    expect(cellText(en, { key: null, count: 1234, suppressed: false })).toBe("1,234");
    expect(cellText(en, { key: null, count: 0, suppressed: false })).toBe("0");
    expect(cellText(en, { key: null, count: null, suppressed: true })).toBe("Hidden");
    expect(cellText(ar, { key: null, count: null, suppressed: true })).toBe("مخفي");
    // Latin digits in both languages, as in the rest of the app.
    expect(cellText(ar, { key: null, count: 1234, suppressed: false })).toBe("1,234");
  });

  it("translates enum keys, keeps free text as typed, and names null and the merged row", () => {
    expect(dimensionLabel(en, "byGender", "female")).toBe("Female");
    expect(dimensionLabel(ar, "byGender", "female")).toBe("إناث");
    expect(dimensionLabel(en, "byAgeGroup", "elderly_60_plus")).toBe("Older people 60+");
    expect(dimensionLabel(en, "byStatus", "dropped_out")).toBe("Dropped out");
    expect(dimensionLabel(en, "byGovernorate", "Hebron")).toBe("Hebron");
    expect(dimensionLabel(en, "byVulnerabilityTag", "female_headed_household")).toBe("female_headed_household");
    expect(dimensionLabel(en, "byGovernorate", null)).toBe("Not recorded");
    expect(dimensionLabel(en, "byAgeGroup", null)).toBe("Not recorded");
    expect(dimensionLabel(en, "byGovernorate", OTHER_KEY)).toBe("Other (combined)");
    expect(dimensionLabel(ar, "byServiceType", OTHER_KEY)).toBe("أخرى (مجمَّعة)");
    // An enum value the UI does not know yet is shown as sent.
    expect(dimensionLabel(en, "byStatus", "paused")).toBe("paused");
  });

  it("labels every enum value in both languages", () => {
    const groups = {
      byGender: ["male", "female", "other"],
      byAgeGroup: ["child_0_5", "child_6_11", "adolescent_12_17", "youth_18_24", "adult_25_59", "elderly_60_plus"],
      byStatus: ["active", "completed", "dropped_out", "referred"],
    } as const;
    for (const [dimension, keys] of Object.entries(groups)) {
      for (const key of keys) {
        expect(dimensionLabel(en, dimension as keyof typeof groups, key)).not.toBe(key);
        expect(dimensionLabel(ar, dimension as keyof typeof groups, key)).not.toBe(key);
      }
    }
  });
});

describe("summary view", () => {
  it("tells the donor summary from staff counts", () => {
    expect(isDonorSummary(makeDonorSummary())).toBe(true);
    expect(isDonorSummary(makeStaffStats())).toBe(false);
    expect(isDonorSummary(undefined)).toBe(false);
  });

  it("keeps the donor summary as sent, in display order", () => {
    const view = toSummaryView(makeDonorSummary());
    expect(view.audience).toBe("donor");
    expect(view.minCell).toBe(5);
    expect(view.minCellSensitive).toBe(10);
    expect(view.tables.map((t) => t.dimension)).toEqual(SUMMARY_DIMENSIONS.map((d) => d.dimension));
    expect(view.tables[0].cells).toEqual(makeDonorSummary().byGender);
  });

  it("turns staff counts into cells with nothing hidden (also an older backend without audience)", () => {
    const { audience: _audience, ...older } = makeStaffStats();
    for (const stats of [makeStaffStats(), older]) {
      const view = toSummaryView(stats);
      expect(view.audience).toBe("staff");
      expect(view.total).toEqual({ key: null, count: 12, suppressed: false });
      expect(view.tables.map((t) => t.dimension)).toEqual(["byGender", "byAgeGroup", "byGovernorate", "byStatus"]);
      expect(view.tables[2].cells).toContainEqual({ key: "Beit Ummar", count: 1, suppressed: false });
    }
  });

  it("tells donor qualitative entries from full ones", () => {
    expect(isDonorQualitativeEntry(makeDonorEntry())).toBe(true);
    expect(isDonorQualitativeEntry({ id: "q", content: "notes" } as QualitativeEntry)).toBe(false);
  });
});

describe("summary CSV rows", () => {
  it("lists totals, every table and the legend, with hidden counts as text", () => {
    const rows = summaryCsvRows(en, makeDonorSummary());
    expect(rows[0]).toEqual({ Breakdown: "Total beneficiaries", Category: "", People: 10 });
    expect(rows[1]).toEqual({ Breakdown: "Services delivered", Category: "", People: "Hidden" });
    expect(rows).toContainEqual({ Breakdown: "By sex", Category: "Male", People: "Hidden" });
    expect(rows).toContainEqual({ Breakdown: "By sex", Category: "Female", People: 10 });
    expect(rows).toContainEqual({ Breakdown: "By sex", Category: "Other", People: 0 });
    expect(rows).toContainEqual({ Breakdown: "By age group", Category: "Not recorded", People: "Hidden" });
    expect(rows).toContainEqual({ Breakdown: "By governorate", Category: "Other (combined)", People: "Hidden" });
    expect(rows).toContainEqual({ Breakdown: "By status", Category: "Active", People: 10 });
    // The file carries the same legend as the screen: hidden counts and rounding.
    const legend = rows[rows.length - 1];
    expect(legend).toEqual({ Breakdown: hiddenLegend(en, toSummaryView(makeDonorSummary())), Category: "", People: "" });
    expect(legend.Breakdown).toContain("counts from 1 to 4 are hidden");
    expect(legend.Breakdown).toContain("counts from 1 to 9 are hidden");
    expect(legend.Breakdown).toContain("rounded to the nearest 5");
    // Nothing that is hidden on screen appears as a number in the file.
    expect(rows.filter((r) => r.People === "Hidden")).toHaveLength(6);
  });

  it("says why a table is empty, in the file as on screen", () => {
    const rows = summaryCsvRows(en, makeDonorSummary({ byGovernorate: [] }));
    expect(rows).toContainEqual({ Breakdown: "By governorate", Category: "This breakdown is hidden to protect people's privacy.", People: "" });
    expect(rows).toContainEqual({
      Breakdown: "People reached, by service type (one person can count in several rows)",
      Category: "Nothing to show: nothing was recorded, or the counts are hidden to protect people's privacy.",
      People: "",
    });
    const staff = toSummaryView(makeStaffStats({ byStatus: [] }));
    expect(staff.tables.find((table) => table.dimension === "byStatus")?.emptyKey).toBe("beneficiarySummary.dimensionEmpty");
  });

  it("writes the rows in Arabic for an Arabic-speaking donor", () => {
    const rows = summaryCsvRows(ar, makeDonorSummary());
    expect(Object.keys(rows[0])).toEqual(["التصنيف", "الفئة", "عدد الأشخاص"]);
    expect(rows).toContainEqual({ "التصنيف": "حسب الجنس", "الفئة": "ذكور", "عدد الأشخاص": "مخفي" });
    expect(rows).toContainEqual({ "التصنيف": "حسب الجنس", "الفئة": "إناث", "عدد الأشخاص": 10 });
  });

  it("writes only the totals and the explanation when everything is hidden", () => {
    const rows = summaryCsvRows(
      en,
      makeDonorSummary({
        suppressedAll: true,
        total: { key: null, count: null, suppressed: true },
        serviceCount: { key: null, count: null, suppressed: true },
        byGender: [],
        byAgeGroup: [],
        byGovernorate: [],
        byStatus: [],
        byVulnerabilityTag: [],
        byServiceType: [],
      }),
    );
    expect(rows).toEqual([
      { Breakdown: "Total beneficiaries", Category: "", People: "Hidden" },
      { Breakdown: "Services delivered", Category: "", People: "Hidden" },
      { Breakdown: "The figures for this project are hidden to protect people's privacy: it has fewer than 5 beneficiaries, or a small count could otherwise be worked out from them.", Category: "", People: "" },
    ]);
  });

  it("writes exact counts and no legend for staff stats", () => {
    const rows = summaryCsvRows(en, makeStaffStats());
    expect(rows).toContainEqual({ Breakdown: "By sex", Category: "Female", People: 9 });
    expect(rows.some((r) => String(r.Breakdown).startsWith("Hidden:"))).toBe(false);
    expect(hiddenLegend(en, toSummaryView(makeStaffStats()))).toBe("");
  });

  it("explains hiding and rounding in the legend, in both languages", () => {
    const view = toSummaryView(makeDonorSummary());
    expect(view.roundingBase).toBe(5);
    expect(hiddenLegend(ar, view)).toBe(
      "مخفي: تُخفى الأعداد من 1 إلى 4 حمايةً لخصوصية الأشخاص. وفي جدولَي عوامل الهشاشة والخدمات تُخفى الأعداد من 1 إلى 9، ويُخفى كذلك العدد الذي يشترك فيه الجميع تقريبًا (حين يبقى خارجه أقل من 10 أشخاص). وتُقرَّب سائر الأرقام، بما فيها المجاميع، إلى أقرب مضاعف للعدد 5 (ويبقى الصفر صفرًا)، لذا قد لا يساوي مجموعُ الصفوف الإجماليَّ. وإذا ظلّ ممكنًا استنتاج عدد مخفي من الأرقام المقرَّبة، يُخفى الجدول كله.",
    );
    // An older response without roundingBase, or a nonsense value, falls back to 5.
    const { roundingBase: _roundingBase, ...older } = makeDonorSummary();
    expect(toSummaryView(older).roundingBase).toBe(5);
    expect(toSummaryView(makeDonorSummary({ roundingBase: 0 })).roundingBase).toBe(5);
    expect(toSummaryView(makeStaffStats()).roundingBase).toBeNull();
  });
});
