/**
 * Calendar-date helpers shared by the forms. The API stores ISO dates; date
 * inputs use "YYYY-MM-DD". Pure functions only.
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
