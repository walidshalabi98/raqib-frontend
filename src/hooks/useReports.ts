import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";

/** The project's reports: every report for org staff, published ones only for donor viewers. */
export function useReports(projectId: string) {
  return useQuery({
    queryKey: queryKeys.reports(projectId),
    queryFn: () => api.getReports(projectId),
    enabled: !!projectId,
  });
}

/** One report with its narrative, for the reading view; loaded only while `enabled` (the view is open). */
export function useReport(reportId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.report(reportId),
    queryFn: () => api.getReport(reportId),
    enabled: enabled && !!reportId,
  });
}

export interface ReportPublicationChange {
  reportId: string;
  /** true publishes the report to donor viewers; false takes it back to draft. */
  publish: boolean;
}

/**
 * Publishes a report to donor viewers or takes it back to draft (org admins and platform admins; the server
 * enforces it). The project's report list and the report itself are refetched afterwards, whatever the outcome,
 * so they show the status the server holds. Callers show the toasts (they know the language).
 */
export function useReportPublication(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, publish }: ReportPublicationChange) =>
      publish ? api.publishReport(reportId) : api.unpublishReport(reportId),
    onSettled: (_data, _error, { reportId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reports(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.report(reportId) }),
      ]),
  });
}
