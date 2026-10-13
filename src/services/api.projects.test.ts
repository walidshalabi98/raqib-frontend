import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/services/api";
import { ApiError, errorCodeOf, httpStatusOf, isProjectArchived } from "@/lib/apiError";
import { onProjectArchivedRefusal } from "@/lib/projectEvents";

// The real API client against a stubbed fetch: the archive, restore and delete contract (backend
// DELETE /api/projects/:id and POST /api/projects/:id/archive and /restore; owner decision of 13 October 2026).

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

/** The URL (path and query), method and JSON body of the only request made. */
function onlyRequest() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
  const parsed = new URL(url);
  return {
    url: `${parsed.pathname}${parsed.search}`,
    method: init?.method ?? "GET",
    body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    headers: (init?.headers ?? {}) as Record<string, string>,
  };
}

beforeEach(() => {
  localStorage.setItem("raqib_token", "token");
  fetchMock = vi.fn(async () => json(200, []));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("project lists", () => {
  it("lists active projects from /api/projects (archived ones are left out by the server)", async () => {
    await api.getProjects();
    expect(onlyRequest()).toMatchObject({ url: "/api/projects", method: "GET" });
  });

  it("lists archived projects only with ?archived=true", async () => {
    await api.getProjects({ archived: true });
    expect(onlyRequest()).toMatchObject({ url: "/api/projects?archived=true", method: "GET" });
  });

  it("asks for the active list when archived is false", async () => {
    await api.getProjects({ archived: false });
    expect(onlyRequest().url).toBe("/api/projects");
  });
});

describe("archive and restore", () => {
  it("archives with POST /api/projects/:id/archive and returns the updated project", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: "p-1", name: "Gaza water trucking", status: "archived" }));
    const updated = await api.archiveProject("p-1");
    expect(onlyRequest()).toMatchObject({ url: "/api/projects/p-1/archive", method: "POST", body: undefined });
    expect(updated.status).toBe("archived");
  });

  it("restores with POST /api/projects/:id/restore", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: "p-1", status: "active" }));
    const updated = await api.restoreProject("p-1");
    expect(onlyRequest()).toMatchObject({ url: "/api/projects/p-1/restore", method: "POST" });
    expect(updated.status).toBe("active");
  });

  it("encodes the project id in the path", async () => {
    await api.archiveProject("a/b?c");
    expect(onlyRequest().url).toBe("/api/projects/a%2Fb%3Fc/archive");
  });

  it("passes on the server's reason when the project is archived already", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: "Project is already archived", code: "project_already_archived" }));
    const err = await api.archiveProject("p-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(httpStatusOf(err)).toBe(409);
    expect(errorCodeOf(err)).toBe("project_already_archived");
    expect(isProjectArchived(err)).toBe(false);
  });

  it("passes on project_not_archived from restore", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: "Project is not archived", code: "project_not_archived" }));
    const err = await api.restoreProject("p-1").catch((e: unknown) => e);
    expect(errorCodeOf(err)).toBe("project_not_archived");
  });
});

describe("delete permanently", () => {
  it("sends DELETE /api/projects/:id with the typed name as JSON", async () => {
    const removed = {
      frameworks: 1, resultNodes: 4, indicators: 6, assessments: 1, dataPoints: 30, qualitativeEntries: 2, beneficiaries: 12,
      beneficiaryServices: 20, reports: 2, documents: 3, notifications: 5, storageFilesRemoved: 3, storageFilesFailed: 0,
    };
    fetchMock.mockResolvedValueOnce(json(200, { deleted: true, removed }));
    const result = await api.deleteProject("p-1", "Gaza water trucking");
    const request = onlyRequest();
    expect(request).toMatchObject({ url: "/api/projects/p-1", method: "DELETE", body: { confirmName: "Gaza water trucking" } });
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(request.headers.Authorization).toBe("Bearer token");
    expect(result).toEqual({ deleted: true, removed });
  });

  it("sends the name exactly as typed (the server trims and compares)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { deleted: true, removed: {} }));
    await api.deleteProject("p-1", "  Gaza water trucking ");
    expect(onlyRequest().body).toEqual({ confirmName: "  Gaza water trucking " });
  });

  it("passes on confirm_name_mismatch (400) with its code", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: "The name does not match", code: "confirm_name_mismatch" }));
    const err = await api.deleteProject("p-1", "gaza water trucking").catch((e: unknown) => e);
    expect(httpStatusOf(err)).toBe(400);
    expect(errorCodeOf(err)).toBe("confirm_name_mismatch");
  });

  it("passes on a role refusal (403)", async () => {
    fetchMock.mockResolvedValueOnce(json(403, { message: "Insufficient permissions" }));
    const err = await api.deleteProject("p-1", "Gaza water trucking").catch((e: unknown) => e);
    expect(httpStatusOf(err)).toBe(403);
  });
});

describe("writes to an archived project (409 project_archived)", () => {
  const archivedAnswer = () => json(409, { message: "This project is archived. Restore it to make changes.", code: "project_archived" });

  it("is an ApiError the screens recognise, and it is announced to the open project page", async () => {
    const listener = vi.fn();
    const stop = onProjectArchivedRefusal(listener);
    fetchMock.mockResolvedValueOnce(archivedAnswer());
    const err = await api.updateProject("p-1", { name: "New name" }).catch((e: unknown) => e);
    stop();
    expect(isProjectArchived(err)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is recognised from the document and qualitative uploads too", async () => {
    const listener = vi.fn();
    const stop = onProjectArchivedRefusal(listener);
    const file = new File(["x"], "proposal.pdf", { type: "application/pdf" });
    fetchMock.mockResolvedValueOnce(archivedAnswer());
    const upload = await api.uploadDocument("p-1", file, "proposal").catch((e: unknown) => e);
    fetchMock.mockResolvedValueOnce(archivedAnswer());
    const transcript = await api.uploadQualitativeDocument("p-1", file, {}).catch((e: unknown) => e);
    stop();
    expect(isProjectArchived(upload)).toBe(true);
    expect(isProjectArchived(transcript)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("is not announced for other conflicts", async () => {
    const listener = vi.fn();
    const stop = onProjectArchivedRefusal(listener);
    fetchMock.mockResolvedValueOnce(json(409, { message: "Report not finished" }));
    await api.publishReport("r-1").catch(() => undefined);
    stop();
    expect(listener).not.toHaveBeenCalled();
  });
});
