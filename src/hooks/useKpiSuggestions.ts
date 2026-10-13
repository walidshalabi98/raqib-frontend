import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiError } from "@/lib/apiError";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { invalidateFrameworkData } from "@/hooks/useFrameworkData";
import type {
  AcceptKpiSuggestionResponse,
  IndicatorInput,
  IndicatorQuality,
  KpiAssistantStatus,
  KpiSuggestion,
  KpiSuggestionList,
  KpiSuggestionRunResponse,
  RequestKpiSuggestionsBody,
  RequestKpiSuggestionsResponse,
  SuggestionRejectReason,
} from "@/types/api";

/**
 * TanStack Query hooks of the KPI Assistant (knowledge/kpi-assistant-spec.md §A6–A7; design sections 7.4 and 9.3).
 * Every call goes through src/services/api.ts.
 *
 * Step 0 (Phase 4 contracts): the signatures are final. The bodies are thin working versions; E7 adds the polling
 * back-off and caps (kpiPollInterval) and the role helper (canSuggestKpis) from src/lib/kpiSuggestions.ts.
 */

const STATUS_STALE_MS = 5 * 60_000;
/** TODO(E7): replace with kpiPollInterval(run, now) (back-off 2/3 s → 5 s → 10 s, stops at the caps). */
const PROVISIONAL_POLL_MS = 3_000;

/** Whether the AI is configured on the server (staleTime 5 min). Not requested for donor viewers. */
export function useKpiAssistantStatus(): UseQueryResult<KpiAssistantStatus> {
  const role = useOptionalAuth()?.user?.role;
  return useQuery({
    queryKey: queryKeys.kpiAssistantStatus,
    queryFn: () => api.getKpiAssistantStatus(),
    staleTime: STATUS_STALE_MS,
    enabled: role !== "donor_viewer",
  });
}

/** Pending suggestions of the project's current framework, its active runs and the latest framework run. */
export function usePendingKpiSuggestions(projectId: string, enabled: boolean): UseQueryResult<KpiSuggestionList> {
  return useQuery({
    queryKey: queryKeys.kpiSuggestions(projectId),
    queryFn: () => api.getKpiSuggestions(projectId),
    enabled: enabled && Boolean(projectId),
  });
}

/** A run and its suggestions, polled while it runs (design 7.4). null: no query. */
export function useKpiSuggestionRun(runId: string | null): UseQueryResult<KpiSuggestionRunResponse> {
  return useQuery({
    queryKey: queryKeys.kpiSuggestionRun(runId ?? ""),
    queryFn: () => api.getKpiSuggestionRun(runId as string),
    enabled: Boolean(runId),
    refetchInterval: (query) => (query.state.data?.run.status === "running" ? PROVISIONAL_POLL_MS : false),
  });
}

/** POST /projects/:id/kpi-suggestions; the response's httpStatus is 200 (finished) or 202 (poll the run). */
export function useRequestKpiSuggestions(
  projectId: string,
): UseMutationResult<RequestKpiSuggestionsResponse, ApiError, RequestKpiSuggestionsBody> {
  const queryClient = useQueryClient();
  return useMutation<RequestKpiSuggestionsResponse, ApiError, RequestKpiSuggestionsBody>({
    mutationFn: (body) => api.requestKpiSuggestions(projectId, body),
    onSuccess: () => invalidateKpiSuggestions(queryClient, projectId),
  });
}

/** Accept (edits = only the changed fields); refreshes the framework, the suggestions and the quality check. */
export function useAcceptKpiSuggestion(
  projectId: string,
  frameworkId: string,
): UseMutationResult<AcceptKpiSuggestionResponse, ApiError, { id: string; edits?: IndicatorInput }> {
  const queryClient = useQueryClient();
  return useMutation<AcceptKpiSuggestionResponse, ApiError, { id: string; edits?: IndicatorInput }>({
    mutationFn: ({ id, edits }) => api.acceptKpiSuggestion(id, edits),
    onSuccess: () => Promise.all([
      invalidateFrameworkData(queryClient, { projectId, frameworkId }),
      invalidateKpiSuggestions(queryClient, projectId),
      queryClient.invalidateQueries({ queryKey: queryKeys.indicatorQuality(frameworkId) }),
    ]).then(() => undefined),
  });
}

/** Reject with a reason (and an optional note without personal data). */
export function useRejectKpiSuggestion(
  projectId: string,
): UseMutationResult<{ suggestion: KpiSuggestion }, ApiError, { id: string; reason: SuggestionRejectReason; note?: string }> {
  const queryClient = useQueryClient();
  return useMutation<{ suggestion: KpiSuggestion }, ApiError, { id: string; reason: SuggestionRejectReason; note?: string }>({
    mutationFn: ({ id, reason, note }) => api.rejectKpiSuggestion(id, note ? { reason, note } : { reason }),
    onSuccess: () => invalidateKpiSuggestions(queryClient, projectId),
  });
}

/** Deterministic quality check of the framework's indicators (no AI call). */
export function useIndicatorQuality(frameworkId: string | undefined): UseQueryResult<IndicatorQuality[]> {
  return useQuery({
    queryKey: queryKeys.indicatorQuality(frameworkId ?? ""),
    queryFn: () => api.getIndicatorQuality(frameworkId as string),
    enabled: Boolean(frameworkId),
  });
}

/** Refreshes the project's suggestion list (and with it the active runs). */
export async function invalidateKpiSuggestions(queryClient: QueryClient, projectId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.kpiSuggestions(projectId) });
}
