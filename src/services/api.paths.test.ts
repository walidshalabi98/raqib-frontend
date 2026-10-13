import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/services/api";

// The real API client against a stubbed fetch: the paths and methods the backend serves. The backend mounts
// the dashboard routes at /api/dashboard (raqib-backend src/app.ts and src/routes/dashboard.ts) and the report
// routes at /api (src/routes/reports.ts). A wrong path answers 404 for everyone.

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

/** The path (after the API base, which ends in /api) and method of the only request made. */
function lastRequest() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
  return { path: new URL(url).pathname, method: init?.method ?? "GET" };
}

beforeEach(() => {
  // A new Response for every call: a body can be read once.
  fetchMock = vi.fn(async () => json(200, {}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API paths", () => {
  it("loads a project dashboard from /api/dashboard/projects/:id/dashboard", async () => {
    await api.getDashboard("p-1");
    expect(lastRequest()).toEqual({ path: "/api/dashboard/projects/p-1/dashboard", method: "GET" });
  });

  it("loads the organisation overview from /api/dashboard/overview", async () => {
    await api.getOrgOverview();
    expect(lastRequest()).toEqual({ path: "/api/dashboard/overview", method: "GET" });
  });

  it("runs the risk analysis at /api/dashboard/projects/:id/risks", async () => {
    await api.getRiskAnalysis("p-1");
    expect(lastRequest()).toEqual({ path: "/api/dashboard/projects/p-1/risks", method: "GET" });
  });

  it("lists a project's reports at /api/projects/:id/reports", async () => {
    fetchMock.mockImplementation(async () => json(200, []));
    await api.getReports("p-1");
    expect(lastRequest()).toEqual({ path: "/api/projects/p-1/reports", method: "GET" });
  });

  it("reads one report at /api/reports/:id and generates one with POST /api/projects/:id/reports/generate (title included)", async () => {
    await api.getReport("r-1");
    expect(lastRequest()).toEqual({ path: "/api/reports/r-1", method: "GET" });

    fetchMock.mockClear();
    await api.generateReport("p-1", { type: "quarterly_summary", title: "Q3 2026" });
    expect(lastRequest()).toEqual({ path: "/api/projects/p-1/reports/generate", method: "POST" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ type: "quarterly_summary", title: "Q3 2026" });
  });

  it("publishes and unpublishes a report with PATCH /api/reports/:id/publish and /unpublish", async () => {
    await api.publishReport("r-1");
    expect(lastRequest()).toEqual({ path: "/api/reports/r-1/publish", method: "PATCH" });

    fetchMock.mockClear();
    await api.unpublishReport("r-1");
    expect(lastRequest()).toEqual({ path: "/api/reports/r-1/unpublish", method: "PATCH" });
  });

  it("passes the server's refusal on with its status (409: the report is not finished)", async () => {
    fetchMock.mockImplementation(async () => json(409, { message: "Only a finished report can be published" }));
    await expect(api.publishReport("r-1")).rejects.toMatchObject({ status: 409 });
  });
});
