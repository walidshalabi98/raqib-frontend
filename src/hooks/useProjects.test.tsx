import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { queryKeys } from "@/lib/queryKeys";
import { createTestQueryClient } from "@/test/utils";
import { moveBetweenProjectLists, projectScopedKeys, useArchiveProject, useDeleteProject, useProjectList, useRestoreProject } from "@/hooks/useProjects";
import type { Project, ProjectDetail } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getProjects: vi.fn(),
    getProject: vi.fn(),
    archiveProject: vi.fn(),
    restoreProject: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

function setup() {
  // Cached data stays while a test runs (no observers), as it does on screen.
  const client = createTestQueryClient();
  client.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

const detail = { id: "p-1", name: "Gaza water trucking", status: "active", documents: [{ id: "d1" }], frameworks: [], _count: { dataPoints: 3 } } as unknown as ProjectDetail;

/** Fills the cache the way the screens do before an archive, restore or delete. */
function seed(client: ReturnType<typeof setup>["client"]) {
  client.setQueryData(queryKeys.projectList(false), [detail]);
  client.setQueryData(queryKeys.projectList(true), []);
  client.setQueryData(queryKeys.project("p-1"), detail);
  client.setQueryData(queryKeys.orgOverview, { projects: [] });
  client.setQueryData(queryKeys.dashboard("p-1"), { trends: [] });
  client.setQueryData(queryKeys.documents("p-1"), []);
  client.setQueryData(queryKeys.reports("p-1"), []);
  client.setQueryData(queryKeys.project("p-2"), { id: "p-2" });
  client.setQueryData(queryKeys.dashboard("p-2"), { trends: [] });
}

const invalidated = (client: ReturnType<typeof setup>["client"], key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
const ids = (client: ReturnType<typeof setup>["client"], archived: boolean) =>
  client.getQueryData<Project[]>(queryKeys.projectList(archived))?.map((p) => p.id);

/** List entries as GET /api/projects sends them (newest first, with counts). */
const listed = (id: string, createdAt: string, status: Project["status"] = "active") =>
  ({ id, name: `Project ${id}`, status, createdAt, _count: { documents: 2 } }) as Project;

beforeEach(() => vi.clearAllMocks());

describe("useProjectList", () => {
  it("loads active projects by default and archived ones on request, under separate keys", async () => {
    vi.mocked(api.getProjects).mockResolvedValueOnce([{ id: "p-1" } as Project]).mockResolvedValueOnce([{ id: "p-9" } as Project]);
    const { wrapper, client } = setup();
    const active = renderHook(() => useProjectList(), { wrapper });
    await waitFor(() => expect(active.result.current.isSuccess).toBe(true));
    const archived = renderHook(() => useProjectList(true), { wrapper });
    await waitFor(() => expect(archived.result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.getProjects).mock.calls).toEqual([[], [{ archived: true }]]);
    expect(client.getQueryData(["projects", "active"])).toEqual([{ id: "p-1" }]);
    expect(client.getQueryData(["projects", "archived"])).toEqual([{ id: "p-9" }]);
  });
});

describe("useArchiveProject", () => {
  it("shows the new status at once and refreshes both lists, the project, and both dashboards", async () => {
    vi.mocked(api.archiveProject).mockResolvedValue({ id: "p-1", name: "Gaza water trucking", status: "archived" } as Project);
    const { client, wrapper } = setup();
    seed(client);
    const { result } = renderHook(() => useArchiveProject(), { wrapper });
    await act(() => result.current.mutateAsync("p-1"));

    expect(api.archiveProject).toHaveBeenCalledWith("p-1");
    // The page keeps its documents and counts; only the status (and other returned fields) change.
    expect(client.getQueryData<ProjectDetail>(queryKeys.project("p-1"))).toMatchObject({ status: "archived", documents: [{ id: "d1" }], _count: { dataPoints: 3 } });
    for (const key of [queryKeys.projectList(false), queryKeys.projectList(true), queryKeys.project("p-1"), queryKeys.orgOverview, queryKeys.dashboard("p-1")]) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    // Other projects are left alone.
    expect(invalidated(client, queryKeys.project("p-2"))).toBe(false);
    expect(invalidated(client, queryKeys.dashboard("p-2"))).toBe(false);
  });

  it("moves the project to the archived list at once, so a list shown next is right before it is fetched again", async () => {
    vi.mocked(api.archiveProject).mockResolvedValue({ id: "p-1", name: "Gaza water trucking", status: "archived", createdAt: "2026-02-01" } as Project);
    const { client, wrapper } = setup();
    seed(client);
    client.setQueryData(queryKeys.projectList(false), [listed("p-3", "2026-03-01"), listed("p-1", "2026-02-01")]);
    client.setQueryData(queryKeys.projectList(true), [listed("p-9", "2026-05-01", "archived"), listed("p-8", "2025-01-01", "archived")]);
    const { result } = renderHook(() => useArchiveProject(), { wrapper });
    await act(() => result.current.mutateAsync("p-1"));

    expect(ids(client, false)).toEqual(["p-3"]);
    // Newest first, as the server orders them; the entry keeps the list's counts.
    expect(ids(client, true)).toEqual(["p-9", "p-1", "p-8"]);
    expect(client.getQueryData<Project[]>(queryKeys.projectList(true))?.[1]).toMatchObject({ status: "archived", _count: { documents: 2 } });
    // Still fetched again when shown (exact counts and order).
    expect(invalidated(client, queryKeys.projectList(true))).toBe(true);

    // A list shown now renders the cached data while it refetches: the archived project is not offered as active.
    vi.mocked(api.getProjects).mockReturnValue(new Promise(() => {}));
    const active = renderHook(() => useProjectList(), { wrapper });
    expect(active.result.current.data?.map((p) => p.id)).toEqual(["p-3"]);
    expect(active.result.current.isFetching).toBe(true);
  });

  it("leaves the lists alone when the server refuses", async () => {
    vi.mocked(api.archiveProject).mockRejectedValue(new ApiError("Insufficient permissions", 403));
    const { client, wrapper } = setup();
    seed(client);
    const { result } = renderHook(() => useArchiveProject(), { wrapper });
    await act(() => result.current.mutateAsync("p-1").catch(() => undefined));
    expect(ids(client, false)).toEqual(["p-1"]);
    expect(ids(client, true)).toEqual([]);
  });

  it("refreshes the views when the server refuses too (someone archived it meanwhile)", async () => {
    vi.mocked(api.archiveProject).mockRejectedValue(new ApiError("Already archived", 409, "project_already_archived"));
    const { client, wrapper } = setup();
    seed(client);
    const { result } = renderHook(() => useArchiveProject(), { wrapper });
    await act(() => result.current.mutateAsync("p-1").catch(() => undefined));
    expect(client.getQueryData<ProjectDetail>(queryKeys.project("p-1"))?.status).toBe("active");
    expect(invalidated(client, queryKeys.project("p-1"))).toBe(true);
    expect(invalidated(client, queryKeys.projectList(true))).toBe(true);
  });
});

describe("useRestoreProject", () => {
  it("shows the restored status and refreshes the same views", async () => {
    vi.mocked(api.restoreProject).mockResolvedValue({ id: "p-1", status: "framework_review" } as Project);
    const { client, wrapper } = setup();
    seed(client);
    client.setQueryData(queryKeys.project("p-1"), { ...detail, status: "archived" });
    const { result } = renderHook(() => useRestoreProject(), { wrapper });
    await act(() => result.current.mutateAsync("p-1"));
    expect(api.restoreProject).toHaveBeenCalledWith("p-1");
    expect(client.getQueryData<ProjectDetail>(queryKeys.project("p-1"))?.status).toBe("framework_review");
    for (const key of [queryKeys.projectList(false), queryKeys.projectList(true), queryKeys.orgOverview, queryKeys.dashboard("p-1")]) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(true);
    }
  });

  it("moves the project back to the active list at once", async () => {
    vi.mocked(api.restoreProject).mockResolvedValue({ id: "p-1", status: "active", createdAt: "2026-02-01" } as Project);
    const { client, wrapper } = setup();
    seed(client);
    client.setQueryData(queryKeys.projectList(false), [listed("p-3", "2026-03-01"), listed("p-2", "2026-01-01")]);
    client.setQueryData(queryKeys.projectList(true), [listed("p-1", "2026-02-01", "archived")]);
    const { result } = renderHook(() => useRestoreProject(), { wrapper });
    await act(() => result.current.mutateAsync("p-1"));
    expect(ids(client, true)).toEqual([]);
    expect(ids(client, false)).toEqual(["p-3", "p-1", "p-2"]);
    expect(client.getQueryData<Project[]>(queryKeys.projectList(false))?.[1]).toMatchObject({ status: "active", name: "Project p-1" });
  });
});

describe("useDeleteProject", () => {
  it("sends the typed name, drops everything cached for the project and refreshes the lists and the overview", async () => {
    vi.mocked(api.deleteProject).mockResolvedValue({ deleted: true, removed: {} as never });
    const { client, wrapper } = setup();
    seed(client);
    const { result } = renderHook(() => useDeleteProject(), { wrapper });
    await act(() => result.current.mutateAsync({ projectId: "p-1", confirmName: "Gaza water trucking" }));

    expect(api.deleteProject).toHaveBeenCalledWith("p-1", "Gaza water trucking");
    for (const key of projectScopedKeys("p-1")) expect(client.getQueryState(key), JSON.stringify(key)).toBeUndefined();
    expect(invalidated(client, queryKeys.projectList(false))).toBe(true);
    expect(invalidated(client, queryKeys.projectList(true))).toBe(true);
    expect(invalidated(client, queryKeys.orgOverview)).toBe(true);
    // Another project's cache stays.
    expect(client.getQueryData(queryKeys.project("p-2"))).toEqual({ id: "p-2" });
    expect(invalidated(client, queryKeys.dashboard("p-2"))).toBe(false);
  });

  it("takes the project out of every cached list before the caller leaves, and refreshes the notifications", async () => {
    vi.mocked(api.deleteProject).mockResolvedValue({ deleted: true, removed: {} as never });
    const { client, wrapper } = setup();
    seed(client);
    client.setQueryData(queryKeys.projectList(false), [listed("p-3", "2026-03-01"), listed("p-1", "2026-02-01")]);
    client.setQueryData(queryKeys.projectList(true), [listed("p-9", "2026-01-01", "archived")]);
    client.setQueryData(queryKeys.notifications, [{ id: "n1", isRead: false, link: "/projects/p-1" }]);
    const { result } = renderHook(() => useDeleteProject(), { wrapper });
    let listsWhenDone: Array<string[] | undefined> = [];
    await act(() =>
      result.current.mutateAsync(
        { projectId: "p-1", confirmName: "Gaza water trucking" },
        // What the caller sees when it navigates (its onSuccess runs after the hook's).
        { onSuccess: () => { listsWhenDone = [ids(client, false), ids(client, true)]; } },
      ),
    );
    expect(listsWhenDone).toEqual([["p-3"], ["p-9"]]);
    // The server deleted the project's notifications: the bell and the activity feed fetch them again.
    expect(invalidated(client, queryKeys.notifications)).toBe(true);

    // The Projects page renders the cached list while it refetches: no link to the deleted project.
    vi.mocked(api.getProjects).mockReturnValue(new Promise(() => {}));
    const list = renderHook(() => useProjectList(), { wrapper });
    expect(list.result.current.data?.map((p) => p.id)).toEqual(["p-3"]);
    expect(list.result.current.isFetching).toBe(true);
  });

  it("keeps everything when the server refuses (wrong name)", async () => {
    vi.mocked(api.deleteProject).mockRejectedValue(new ApiError("Mismatch", 400, "confirm_name_mismatch"));
    const { client, wrapper } = setup();
    seed(client);
    const { result } = renderHook(() => useDeleteProject(), { wrapper });
    await act(() => result.current.mutateAsync({ projectId: "p-1", confirmName: "gaza" }).catch(() => undefined));
    expect(client.getQueryData(queryKeys.project("p-1"))).toEqual(detail);
    expect(invalidated(client, queryKeys.projectList(false))).toBe(false);
    expect(ids(client, false)).toEqual(["p-1"]);
  });
});

describe("moveBetweenProjectLists", () => {
  it("leaves a list that is not cached alone (it loads when shown)", () => {
    const { client } = setup();
    client.setQueryData(queryKeys.projectList(false), [listed("p-1", "2026-02-01")]);
    moveBetweenProjectLists(client, { id: "p-1", status: "archived", createdAt: "2026-02-01" } as Project);
    expect(ids(client, false)).toEqual([]);
    expect(client.getQueryState(queryKeys.projectList(true))).toBeUndefined();
  });

  it("does not list a project twice when it is in the target list already", () => {
    const { client } = setup();
    client.setQueryData(queryKeys.projectList(true), [listed("p-1", "2026-02-01", "archived")]);
    moveBetweenProjectLists(client, { id: "p-1", status: "archived", createdAt: "2026-02-01" } as Project);
    expect(ids(client, true)).toEqual(["p-1"]);
  });
});
