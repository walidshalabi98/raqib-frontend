import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";

/** The project's beneficiary figures: exact for org staff, with small counts hidden for donor viewers. */
export function useBeneficiaryStats(projectId: string) {
  return useQuery({
    queryKey: queryKeys.beneficiaryStats(projectId),
    queryFn: () => api.getBeneficiaryStats(projectId),
    enabled: !!projectId,
  });
}
