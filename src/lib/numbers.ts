/**
 * Numbers typed by users. Same rules as the backend's parseNumeric
 * (raqib-backend src/services/dataPoints/breakdown.ts), so the forms accept
 * exactly what the API accepts. Pure functions only.
 */

const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const WITH_THOUSANDS = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;

/**
 * Parses a number typed by a user, including Arabic-Indic digits (١٢٠٠),
 * Extended Arabic-Indic digits (۱۲۰۰), the Arabic decimal and thousands
 * separators (٫ ٬) and thousands separators ("1,200"). Returns null for
 * anything else ("", "12 people", "N/A", "0x10").
 */
export function parseNumeric(input: string): number | null {
  let s = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
  if (WITH_THOUSANDS.test(s)) s = s.replace(/,/g, "");
  if (!NUMERIC.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A number ≥ 0 and ≤ max (whole when `integer`), or null when the text is not one. */
export function parseNonNegative(input: string, opts: { max: number; integer?: boolean }): number | null {
  const n = parseNumeric(input);
  if (n === null || n < 0 || n > opts.max) return null;
  if (opts.integer && !Number.isInteger(n)) return null;
  return n;
}
