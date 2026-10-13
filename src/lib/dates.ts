import type { AppLanguage } from "@/i18n";

/**
 * Calendar-date helpers shared by the forms and screens. The API stores ISO
 * dates; date inputs use "YYYY-MM-DD". Pure functions only.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in "YYYY-MM-DD" format (2026-02-30 is false), as the backend checks it. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * The "YYYY-MM-DD" value for a date input from an API date ("YYYY-MM-DD" or a
 * full ISO date-time); "" when missing or unreadable.
 */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const head = value.slice(0, 10);
  return isIsoDate(head) ? head : "";
}

/**
 * An API date for display in the UI language: "11 Oct 2026" / "11 أكتوبر 2026"
 * (Western digits, the default until the digit setting arrives in Phase 6);
 * "" when missing or unreadable.
 */
export function formatDisplayDate(value: string | null | undefined, lang: AppLanguage): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/**
 * A month for display: "2026-03" (or an ISO date) as "March 2026" / "مارس 2026" (Western
 * digits); "" when missing or unreadable. Read from the text, so time zones never shift the month.
 */
export function formatMonthYear(value: string | null | undefined, lang: AppLanguage): string {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? "");
  if (!match) return "";
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  const date = new Date(Date.UTC(Number(match[1]), month - 1, 1));
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
