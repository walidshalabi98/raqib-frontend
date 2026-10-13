import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";
import type { Project, ProjectDetail } from "@/types/api";

/** The organisation's active projects, or its archived ones (`archived`). Both views share the `projects` prefix. */
export function useProjectList(archived = false) {
  return useQuery({
    queryKey: queryKeys.projectList(archived),
    queryFn: () => (archived ? api.getProjects({ archived: true }) : api.getProjects()),
  });
}

/** One project with its documents and current framework (archived projects too: they stay readable). */
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(projectId ?? ""),
    queryFn: () => api.getProject(projectId as string),
    enabled: Boolean(projectId),
  });
}

/**
 * Everything that shows a project after its status changed (archived or restored): both project lists (active
 * and archived), the project page, the organisation dashboard and the project dashboard.
 */
export function invalidateProjectViews(queryClient: QueryClient, projectId: string): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
    queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.orgOverview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(projectId) }),
  ]);
}

/** The cached responses that belong to one project (removed once it is deleted, so nothing shows it again). */
export function projectScopedKeys(projectId: string): ReadonlyArray<readonly unknown[]> {
  return [
    queryKeys.project(projectId),
    queryKeys.dashboard(projectId),
    queryKeys.framework(projectId),
    queryKeys.documents(projectId),
    queryKeys.reports(projectId),
    queryKeys.beneficiaryStats(projectId),
    ["beneficiaries", projectId],
    ["qualitative", projectId],
    ["assessments", projectId],
    ["risk-analysis", projectId],
  ];
}

/** The project page shows the new status at once; the server's answer carries the project without its relations. */
function showStatus(queryClient: QueryClient, updated: Project) {
  queryClient.setQueryData<ProjectDetail>(queryKeys.project(updated.id), (old) => (old ? { ...old, ...updated } : old));
}

/**
 * Archives a project (org admins and platform admins; the server enforces it): it leaves the active list and
 * becomes read-only; nothing is deleted. Whatever the answer (a 409 means someone archived it meanwhile), the
 * views that show the project are fetched again so they show the status the server holds. Callers show the
 * messages (they know the language).
 */
export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.archiveProject(projectId),
    onSuccess: (updated) => showStatus(queryClient, updated),
    onSettled: (_data, _error, projectId) => invalidateProjectViews(queryClient, projectId),
  });
}

/** Restores an archived project with the status it had before (org admins and platform admins). */
export function useRestoreProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.restoreProject(projectId),
    onSuccess: (updated) => showStatus(queryClient, updated),
    onSettled: (_data, _error, projectId) => invalidateProjectViews(queryClient, projectId),
  });
}

export interface ProjectDeletion {
  projectId: string;
  /** What the user typed: the server deletes only when it is the project's exact name. */
  confirmName: string;
}

/**
 * Deletes a project and everything in it for good (org admins and platform admins, after typing its name).
 * On success the project's cached responses are dropped and the lists and the organisation dashboard are
 * fetched again; the caller leaves the project page.
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, confirmName }: ProjectDeletion) => api.deleteProject(projectId, confirmName),
    onSuccess: (_data, { projectId }) => {
      for (const queryKey of projectScopedKeys(projectId)) {
        void queryClient.cancelQueries({ queryKey, exact: true });
        queryClient.removeQueries({ queryKey, exact: true });
      }
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orgOverview }),
      ]);
    },
  });
}
