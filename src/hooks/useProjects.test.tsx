import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { queryKeys } from "@/lib/queryKeys";
import { createTestQueryClient } from "@/test/utils";
import { projectScopedKeys, useArchiveProject, useDeleteProject, useProjectList, useRestoreProject } from "@/hooks/useProjects";
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

  it("keeps everything when the server refuses (wrong name)", async () => {
    vi.mocked(api.deleteProject).mockRejectedValue(new ApiError("Mismatch", 400, "confirm_name_mismatch"));
    const { client, wrapper } = setup();
    seed(client);
    const { result } = renderHook(() => useDeleteProject(), { wrapper });
    await act(() => result.current.mutateAsync({ projectId: "p-1", confirmName: "gaza" }).catch(() => undefined));
    expect(client.getQueryData(queryKeys.project("p-1"))).toEqual(detail);
    expect(invalidated(client, queryKeys.projectList(false))).toBe(false);
  });
});
