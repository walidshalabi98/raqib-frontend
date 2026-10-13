import { describe, expect, it } from "vitest";
import { formatDisplayDate, formatMonthYear, isIsoDate, toDateInput } from "@/lib/dates";

describe("formatDisplayDate", () => {
  it("formats a date in the UI language with Western digits", () => {
    expect(formatDisplayDate("2026-10-11T12:00:00.000Z", "en")).toBe("11 Oct 2026");
    const ar = formatDisplayDate("2026-10-11T12:00:00.000Z", "ar");
    expect(ar).toContain("أكتوبر");
    expect(ar).toMatch(/11/);
    expect(ar).toMatch(/2026/);
  });

  it("returns an empty string for missing or unreadable dates", () => {
    expect(formatDisplayDate(null, "en")).toBe("");
    expect(formatDisplayDate(undefined, "ar")).toBe("");
    expect(formatDisplayDate("", "en")).toBe("");
    expect(formatDisplayDate("not a date", "en")).toBe("");
  });
});

describe("date input helpers", () => {
  it("checks real calendar dates and converts API dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(toDateInput("2026-10-11T00:00:00.000Z")).toBe("2026-10-11");
    expect(toDateInput(null)).toBe("");
  });
});

describe("formatMonthYear", () => {
  it("formats a month in the UI language with Western digits, without time-zone shifts", () => {
    expect(formatMonthYear("2026-03", "en")).toBe("March 2026");
    expect(formatMonthYear("2026-03-01T00:00:00.000Z", "en")).toBe("March 2026");
    expect(formatMonthYear("2026-12-31T23:30:00.000-05:00", "en")).toBe("December 2026");
    const ar = formatMonthYear("2026-03", "ar");
    expect(ar).toContain("مارس");
    expect(ar).toMatch(/2026/);
  });

  it("returns an empty string for missing or unreadable months", () => {
    expect(formatMonthYear(null, "en")).toBe("");
    expect(formatMonthYear(undefined, "ar")).toBe("");
    expect(formatMonthYear("2026-13", "en")).toBe("");
    expect(formatMonthYear("March", "en")).toBe("");
  });
});
