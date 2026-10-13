import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";

/**
 * A project's dashboard (GET /api/dashboard/projects/:id/dashboard). Org staff and donor viewers get the same
 * keys; donor rows differ (ProjectDashboard in src/types/api.ts). Saving indicators or results invalidates it
 * (src/hooks/useFrameworkData.ts). Fresh for 30 seconds, as docs/UX_STANDARDS.md §9 asks of dashboards.
 */
export function useProjectDashboard(projectId: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(projectId),
    queryFn: () => api.getDashboard(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}
