import { useEffect, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";

/** The results chain of a framework (each node with its indicator and child counts). */
export function useFrameworkResults(frameworkId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.frameworkResults(frameworkId ?? ""),
    queryFn: () => api.getFrameworkResults(frameworkId as string),
    enabled: Boolean(frameworkId),
  });
}

/**
 * Refreshes everything that shows a framework's results or indicators after a
 * change: the framework view, the results chain, the project page and its dashboard.
 */
export function invalidateFrameworkData(
  queryClient: QueryClient,
  ids: { projectId: string; frameworkId: string },
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.framework(ids.projectId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.frameworkResults(ids.frameworkId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.project(ids.projectId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(ids.projectId) }),
  ]);
}

/** `value`, updated only after it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
