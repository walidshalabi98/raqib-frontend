import { errorCodeOf, httpStatusOf, isForbidden } from "@/lib/apiError";
import type { ProjectDetail } from "@/types/api";

/**
 * Archiving, restoring and deleting a project (owner decision of 13 October 2026; backend
 * POST /api/projects/:id/archive and /restore, DELETE /api/projects/:id). Archive real projects: donors may
 * audit them for years, and nothing is lost. Delete only test projects or projects created by mistake.
 * Pure functions only.
 */

/** One line of what deleting removes. `count` is null when the page does not know the number (shown without it). */
export interface DeletionItem {
  key:
    | "framework"
    | "indicators"
    | "dataPoints"
    | "qualitativeEntries"
    | "assessments"
    | "reports"
    | "documents"
    | "beneficiaries"
    | "notifications";
  count: number | null;
}

const countOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

/**
 * What deleting the project removes, from what the project page already holds (GET /api/projects/:id): no
 * extra request. Known zero counts are left out; the beneficiary records and the project's notifications are
 * always listed (the page has no count for them).
 */
export function deletionSummary(project: Pick<ProjectDetail, "documents" | "frameworks" | "_count">): DeletionItem[] {
  const items: DeletionItem[] = [];
  const add = (key: DeletionItem["key"], value: unknown) => {
    const count = countOf(value);
    if (count !== 0) items.push({ key, count });
  };
  const framework = project.frameworks?.[0];
  if (framework) {
    items.push({ key: "framework", count: null });
    add("indicators", Array.isArray(framework.indicators) ? framework.indicators.length : undefined);
  }
  const counts = project._count ?? {};
  add("dataPoints", counts.dataPoints);
  add("qualitativeEntries", counts.qualitativeEntries);
  add("assessments", counts.assessments);
  add("reports", counts.reports);
  add("documents", Array.isArray(project.documents) ? project.documents.length : counts.documents);
  items.push({ key: "beneficiaries", count: null });
  items.push({ key: "notifications", count: null });
  return items;
}

/**
 * Whether what the admin typed confirms the deletion: the project's exact name, capitals included. Spaces
 * around either are ignored, as the server does (`confirmName.trim() === project.name.trim()`).
 */
export function confirmsProjectName(typed: string, name: string): boolean {
  const expected = name.trim();
  return expected.length > 0 && typed.trim() === expected;
}

/** The translation key for a failed archive: the server's reason in the user's language, never its English text. */
export function archiveErrorKey(err: unknown): string {
  if (isForbidden(err)) return "errors.forbidden";
  if (errorCodeOf(err) === "project_already_archived") return "projectActions.archiveDialog.errors.alreadyArchived";
  if (httpStatusOf(err) === 404) return "projectActions.errors.notFound";
  return "projectActions.archiveDialog.errors.failed";
}

/** The translation key for a failed restore. */
export function restoreErrorKey(err: unknown): string {
  if (isForbidden(err)) return "errors.forbidden";
  if (errorCodeOf(err) === "project_not_archived") return "projectActions.errors.notArchived";
  if (httpStatusOf(err) === 404) return "projectActions.errors.notFound";
  return "projectActions.errors.restoreFailed";
}

/** The translation key for a failed deletion. */
export function deleteErrorKey(err: unknown): string {
  if (isForbidden(err)) return "errors.forbidden";
  if (errorCodeOf(err) === "confirm_name_mismatch") return "projectActions.deleteDialog.errors.mismatch";
  if (httpStatusOf(err) === 404) return "projectActions.errors.notFound";
  return "projectActions.deleteDialog.errors.failed";
}
