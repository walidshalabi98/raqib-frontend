import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiError } from "@/lib/apiError";
import { httpStatusOf } from "@/lib/apiError";
import { usePermissions } from "@/hooks/usePermissions";
import { invalidateFrameworkData } from "@/hooks/useFrameworkData";
import { kpiPollInterval, mergeRunIntoList, withoutSuggestion } from "@/lib/kpiSuggestions";
import type {
  AcceptKpiSuggestionResponse,
  IndicatorInput,
  IndicatorQuality,
  KpiAssistantStatus,
  KpiRun,
  KpiSuggestion,
  KpiSuggestionList,
  KpiSuggestionRunResponse,
  RequestKpiSuggestionsBody,
  RequestKpiSuggestionsResponse,
  SuggestionRejectReason,
} from "@/types/api";

/**
 * TanStack Query hooks of the KPI Assistant (knowledge/kpi-assistant-spec.md §A6–A7; design sections 7.4 and 9.3).
 * Every call goes through src/services/api.ts. Invalidations after a mutation are started, not awaited, so the
 * caller's own success handling (toast, focus) runs before the lists refetch and the decided card disappears.
 */

const STATUS_STALE_MS = 5 * 60_000;

/** Whether the AI is configured on the server (staleTime 5 min). Requested only for roles that use the assistant. */
export function useKpiAssistantStatus(): UseQueryResult<KpiAssistantStatus> {
  const { can } = usePermissions();
  return useQuery({
    queryKey: queryKeys.kpiAssistantStatus,
    queryFn: () => api.getKpiAssistantStatus(),
    staleTime: STATUS_STALE_MS,
    enabled: can("ai.run"),
  });
}

/** Pending suggestions of the project's current framework, its active runs and the latest framework run (design 7.1). */
export function usePendingKpiSuggestions(projectId: string, enabled: boolean): UseQueryResult<KpiSuggestionList> {
  return useQuery({
    queryKey: queryKeys.kpiSuggestions(projectId),
    queryFn: () => api.getKpiSuggestions(projectId),
    enabled: enabled && Boolean(projectId),
  });
}

/**
 * A run and its suggestions, polled while it runs with the back-off of design 7.4 (kpiPollInterval: 2 s or 3 s, then
 * 5 s after 20 s, then 10 s after a minute) until it finishes or passes the polling cap (2 min, framework 10 min),
 * counted from `startedAt`: the client time the run started (runStartedAtOnClient), never the server's createdAt.
 * `null`: no query.
 */
export function useKpiSuggestionRun(runId: string | null, startedAt: number): UseQueryResult<KpiSuggestionRunResponse> {
  return useQuery({
    queryKey: queryKeys.kpiSuggestionRun(runId ?? ""),
    queryFn: () => api.getKpiSuggestionRun(runId as string),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const run = query.state.data?.run;
      return run ? kpiPollInterval(run, startedAt, Date.now()) : false;
    },
  });
}

/**
 * Puts a finished run's suggestions into the project's list at once (mergeRunIntoList), then refetches the list so
 * the server's view (expired cards, other users' decisions) wins.
 */
export function applyFinishedRun(queryClient: QueryClient, projectId: string, run: KpiRun, suggestions: readonly KpiSuggestion[]): void {
  queryClient.setQueryData<KpiSuggestionList>(queryKeys.kpiSuggestions(projectId), (list) => mergeRunIntoList(list, run, suggestions));
  void invalidateKpiSuggestions(queryClient, projectId);
}

/**
 * POST /projects/:id/kpi-suggestions; the response's httpStatus is 200 (finished: its suggestions are shown at once)
 * or 202 (poll the run; the list refetch reports it in activeRuns).
 */
export function useRequestKpiSuggestions(
  projectId: string,
): UseMutationResult<RequestKpiSuggestionsResponse, ApiError, RequestKpiSuggestionsBody> {
  const queryClient = useQueryClient();
  return useMutation<RequestKpiSuggestionsResponse, ApiError, RequestKpiSuggestionsBody>({
    mutationFn: (body) => api.requestKpiSuggestions(projectId, body),
    onSuccess: (response) => {
      if (response.run.status !== "running") applyFinishedRun(queryClient, projectId, response.run, response.suggestions ?? []);
      else void invalidateKpiSuggestions(queryClient, projectId);
    },
    onError: (err) => {
      // 503: the key was removed since the status was read.
      if (httpStatusOf(err) === 503) void queryClient.invalidateQueries({ queryKey: queryKeys.kpiAssistantStatus });
    },
  });
}

/**
 * Accept (edits = only the changed fields; design 8.1). On success the card leaves the pending list at once and the
 * framework, the suggestions and the quality check are refetched; a 409 (already decided, stale, duplicate) refetches
 * the suggestions.
 */
export function useAcceptKpiSuggestion(
  projectId: string,
  frameworkId: string,
): UseMutationResult<AcceptKpiSuggestionResponse, ApiError, { id: string; edits?: IndicatorInput }> {
  const queryClient = useQueryClient();
  return useMutation<AcceptKpiSuggestionResponse, ApiError, { id: string; edits?: IndicatorInput }>({
    mutationFn: ({ id, edits }) => api.acceptKpiSuggestion(id, edits),
    onSuccess: (_response, { id }) => {
      queryClient.setQueryData<KpiSuggestionList>(queryKeys.kpiSuggestions(projectId), (list) => withoutSuggestion(list, id));
      // The framework data includes the quality check.
      void invalidateFrameworkData(queryClient, { projectId, frameworkId });
      void invalidateKpiSuggestions(queryClient, projectId);
    },
    onError: (err) => {
      if (httpStatusOf(err) === 409) void invalidateKpiSuggestions(queryClient, projectId);
    },
  });
}

/** Reject with a reason and an optional note without personal data (design 8.2); a 409 refetches the suggestions. */
export function useRejectKpiSuggestion(
  projectId: string,
): UseMutationResult<{ suggestion: KpiSuggestion }, ApiError, { id: string; reason: SuggestionRejectReason; note?: string }> {
  const queryClient = useQueryClient();
  return useMutation<{ suggestion: KpiSuggestion }, ApiError, { id: string; reason: SuggestionRejectReason; note?: string }>({
    mutationFn: ({ id, reason, note }) => {
      const trimmed = note?.trim();
      return api.rejectKpiSuggestion(id, trimmed ? { reason, note: trimmed } : { reason });
    },
    onSuccess: (_response, { id }) => {
      queryClient.setQueryData<KpiSuggestionList>(queryKeys.kpiSuggestions(projectId), (list) => withoutSuggestion(list, id));
      void invalidateKpiSuggestions(queryClient, projectId);
    },
    onError: (err) => {
      if (httpStatusOf(err) === 409) void invalidateKpiSuggestions(queryClient, projectId);
    },
  });
}

/**
 * Deterministic quality check of the framework's indicators (no AI call; spec §A2 trigger 3). Not requested for
 * donor viewers (the route is limited to the KPI roles).
 */
export function useIndicatorQuality(frameworkId: string | undefined): UseQueryResult<IndicatorQuality[]> {
  const { can } = usePermissions();
  return useQuery({
    queryKey: queryKeys.indicatorQuality(frameworkId ?? ""),
    queryFn: () => api.getIndicatorQuality(frameworkId as string),
    enabled: Boolean(frameworkId) && can("ai.run"),
  });
}

/** Refreshes the project's suggestion list (and with it the active runs and the latest framework run). */
export async function invalidateKpiSuggestions(queryClient: QueryClient, projectId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.kpiSuggestions(projectId) });
}
