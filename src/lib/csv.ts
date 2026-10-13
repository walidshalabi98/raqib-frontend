/**
 * CSV and JSON downloads for the export screen. The CSV text is built by pure functions
 * (`csvField`, `toCsv`); `downloadCSV` and `downloadJSON` only hand the file to the browser.
 */

export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;

/** Characters that make a spreadsheet read a cell as a formula (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * A text value that starts like a formula ("=SUM(A1)", "@cmd", "+1+2") gets a leading
 * apostrophe so spreadsheets show it as text; plain numbers ("-5", "+3.2") stay as they are.
 * Free text typed by users (governorates, tags, service types, indicator text) reaches these files.
 */
export function neutraliseFormula(value: string): string {
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

/** One CSV field: empty for null/undefined; quoted when it contains a comma, quote, CR or LF. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? neutraliseFormula(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV text (RFC 4180 line endings) with the first row's keys as the header; "" for no rows. */
export function toCsv(rows: readonly CsvRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [headers.map(csvField).join(","), ...rows.map((row) => headers.map((h) => csvField(row[h])).join(","))].join("\r\n");
}

/** A file name without path separators or characters that Windows refuses. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  const cleaned = name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_").trim();
  return cleaned || "export";
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(filename);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked a moment later: some browsers cancel a download whose URL is revoked during the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves the rows as a UTF-8 CSV (with a byte-order mark, so Excel reads Arabic); false when there are no rows. */
export function downloadCSV(rows: readonly CsvRow[], filename: string): boolean {
  if (rows.length === 0) return false;
  saveBlob(new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8;" }), filename);
  return true;
}

/** Saves `data` as indented JSON. */
export function downloadJSON(data: unknown, filename: string): void {
  saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}
