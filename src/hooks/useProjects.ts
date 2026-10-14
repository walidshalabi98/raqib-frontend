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

/** Newest first, the order of GET /api/projects (createdAt descending). */
const newestFirst = (a: Project, b: Project) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

/**
 * Moves a project whose status changed (archived or restored) from one cached list to the other, so the list a
 * screen shows next is right at once: the Projects page (either view) and the project pickers of the Reports,
 * Assessments and Beneficiaries pages render cached data first and only then fetch again. A list that is not
 * cached is left alone (it loads when shown). The entry keeps what the list held (the server's answer carries
 * the project without its counts).
 */
export function moveBetweenProjectLists(queryClient: QueryClient, updated: Project): void {
  const archived = updated.status === "archived";
  const from = queryKeys.projectList(!archived);
  const to = queryKeys.projectList(archived);
  const listed = queryClient.getQueryData<Project[]>(from)?.find((p) => p.id === updated.id)
    ?? queryClient.getQueryData<Project[]>(to)?.find((p) => p.id === updated.id);
  queryClient.setQueryData<Project[]>(from, (list) => list?.filter((p) => p.id !== updated.id));
  queryClient.setQueryData<Project[]>(to, (list) =>
    list ? [...list.filter((p) => p.id !== updated.id), { ...listed, ...updated }].sort(newestFirst) : list,
  );
}

/** Takes a deleted project out of every cached list (active and archived) at once. */
export function removeFromProjectLists(queryClient: QueryClient, projectId: string): void {
  queryClient.setQueriesData<Project[]>({ queryKey: queryKeys.projects }, (list) =>
    Array.isArray(list) ? list.filter((p) => p.id !== projectId) : list,
  );
}

/**
 * The project page shows the new status at once, and the project changes list; the server's answer carries the
 * project without its relations.
 */
function showStatus(queryClient: QueryClient, updated: Project) {
  queryClient.setQueryData<ProjectDetail>(queryKeys.project(updated.id), (old) => (old ? { ...old, ...updated } : old));
  moveBetweenProjectLists(queryClient, updated);
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
 * On success, before the caller leaves the project page: the project's cached responses are dropped, it is
 * taken out of the cached lists (the Projects page the caller goes to shows the cached list first, and must not
 * offer a link to a project that is gone), and the lists, the organisation dashboard and the notifications (the
 * server deleted the project's notifications too) are fetched again.
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
      removeFromProjectLists(queryClient, projectId);
      // The bell is always on screen: its refetch runs in the background (the caller does not wait for it).
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orgOverview }),
      ]);
    },
  });
}
