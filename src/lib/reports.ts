import type { TFunction } from "i18next";
import { httpStatusOf } from "@/lib/apiError";
import type { ReportStatus } from "@/types/api";

/**
 * Publishing reports to donor viewers (backend src/routes/reports.ts and src/services/reports/publication.ts).
 * Every report starts as a draft; org admins and platform admins publish a finished report after reviewing it,
 * and can take it back to draft. Donor viewers receive published reports only. Pure functions only.
 */

const hasText = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;

/** A title kept in its own direction inside a translated sentence (Unicode first-strong isolate). */
export const isolate = (text: string): string => `\u2068${text}\u2069`;

/** The report's title as written, or "Untitled report" in the UI language. */
export function reportTitle(report: { title?: unknown }, t: TFunction): string {
  return typeof report.title === "string" && report.title.trim() ? report.title.trim() : t("reports.untitled");
}

/** The report's status; anything but "published" counts as a draft (donor viewers do not see it). */
export function reportStatusOf(report: { status?: unknown }): ReportStatus {
  return report.status === "published" ? "published" : "draft";
}

/**
 * A finished report: its file or its narrative exists (as the backend decides it). A report that is still
 * being generated, or whose generation failed, is not finished, and the server refuses to publish it (409).
 */
export function isFinishedReport(report: { fileUrl?: unknown; aiNarrative?: unknown }): boolean {
  return hasText(report.fileUrl) || hasText(report.aiNarrative);
}

/**
 * The translation key for a failed publish or unpublish: the server's answer in the user's language, never
 * its English message. 403 (the role changed), 404 (the report was deleted), 409 (not finished).
 */
export function publicationErrorKey(err: unknown, publish: boolean): string {
  switch (httpStatusOf(err)) {
    case 403:
      return "errors.forbidden";
    case 404:
      return "reports.errors.notFound";
    case 409:
      return "reports.errors.notFinished";
    default:
      return publish ? "reports.errors.publishFailed" : "reports.errors.unpublishFailed";
  }
}

/**
 * The Content-Security-Policy of the report frame: no scripts, no requests of any kind (no remote images, fonts
 * or styles that would tell a server who read the report), inline styles and data: images only.
 */
export const REPORT_FRAME_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

/**
 * Fits the report page (written for print, with 40 px margins) into a narrow frame: smaller margins on phones,
 * wide tables scroll on their own. The report's own styles come after and win, except for the margin.
 */
const REPORT_FRAME_STYLE =
  "body{overflow-wrap:anywhere}img{max-width:100%;height:auto}table{display:block;max-width:100%;overflow-x:auto}@media (max-width:480px){body{margin:16px!important}}";

/**
 * The `srcdoc` of the sandboxed frame that shows a report's narrative (HTML written by the backend from AI
 * output). The policy comes first, so the browser applies it before anything in the report; the report's own
 * doctype and <html>/<head> tags then merge into this document. The frame is also sandboxed without
 * allow-scripts (ReportReader), so nothing in the report can run.
 */
export function reportFrameDocument(narrative: string): string {
  return `<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="${REPORT_FRAME_CSP}"><meta charset="utf-8"><style>${REPORT_FRAME_STYLE}</style>${narrative}`;
}
