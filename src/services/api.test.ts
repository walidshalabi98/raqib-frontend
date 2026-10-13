import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/services/api";
import { ApiError, httpStatusOf } from "@/lib/apiError";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("api client errors", () => {
  it("carries the HTTP status and the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { message: "Library entry not found" })));
    const err = await api.getLibraryEntry("XX-99").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect((err as ApiError).message).toBe("Library entry not found");
    expect(httpStatusOf(err)).toBe(404);
  });

  it("reports server errors with their status, and no status when offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    expect(httpStatusOf(await api.getLibraryEntry("FS-01").catch((e: unknown) => e))).toBe(500);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(httpStatusOf(await api.getLibraryEntry("FS-01").catch((e: unknown) => e))).toBeUndefined();
    expect(httpStatusOf(new Error("plain"))).toBeUndefined();
  });

  it("reports a failed document upload as an ApiError with its status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(413, { message: "File too large" })));
    const file = new File(["x"], "proposal.pdf", { type: "application/pdf" });
    const err = await api.uploadDocument("p-1", file, "proposal").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("File too large");
    expect(httpStatusOf(err)).toBe(413);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 500 })));
    const fallback = await api.uploadDocument("p-1", file, "proposal").catch((e: unknown) => e);
    expect((fallback as ApiError).message).toBe("Upload failed");
    expect(httpStatusOf(fallback)).toBe(500);
  });
});

describe("api client: exports and role refusals", () => {
  it("fetches the whole project from /projects/:id/export (the path the backend serves)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { audience: "donor", personalData: "excluded", project: { name: "P" } }));
    vi.stubGlobal("fetch", fetchMock);
    const data = await api.exportProject("p-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/projects\/p-1\/export$/);
    expect(data.audience).toBe("donor");
  });

  it("fetches beneficiary stats from /projects/:id/beneficiaries/stats", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { audience: "donor" }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getBeneficiaryStats("p-1");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/projects\/p-1\/beneficiaries\/stats$/);
  });

  it("reports a refused qualitative upload as an ApiError with status 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { message: "Insufficient permissions" })));
    const file = new File(["x"], "kii.docx");
    const err = await api.uploadQualitativeDocument("p-1", file, { entryType: "kii_notes" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(httpStatusOf(err)).toBe(403);
    expect((err as ApiError).message).toBe("Insufficient permissions");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 502 })));
    const fallback = await api.uploadQualitativeDocument("p-1", file, {}).catch((e: unknown) => e);
    expect((fallback as ApiError).message).toBe("Upload failed");
    expect(httpStatusOf(fallback)).toBe(502);
  });

  it("passes a 403 from any JSON endpoint on with its status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { message: "Insufficient permissions" })));
    expect(httpStatusOf(await api.exportBeneficiaries("p-1").catch((e: unknown) => e))).toBe(403);
  });
});

describe("api client: an expired access token", () => {
  const ACCEPT_PATH = /\/kpi-suggestions\/s-1\/accept$/;

  /** An unsigned JWT-shaped token (the client only decodes it to read the role). */
  function token(id: string): string {
    const payload = btoa(JSON.stringify({ id, role: "me_officer", organizationId: "org-1" }))
      .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    return `h.${payload}.s`;
  }

  /** fetch that answers the refresh with `refresh` and the requests in turn with `answers`. */
  function stubFetch(refresh: Response, answers: Response[]) {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/auth/refresh")) return refresh;
      const next = answers.shift();
      if (!next) throw new Error("unexpected request");
      return next;
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    api.clearToken();
    localStorage.setItem("raqib_token", token("u-1"));
    localStorage.setItem("raqib_refresh_token", "refresh-1");
    localStorage.setItem("raqib_user", JSON.stringify({ id: "u-1", email: "o@example.org", name: "Officer", role: "me_officer", organizationId: "org-1" }));
  });

  it("after a refresh, passes a 409 of the repeated request on with its code and details, and keeps the session", async () => {
    const fetchMock = stubFetch(
      jsonResponse(200, { accessToken: token("u-1"), refreshToken: "refresh-2" }),
      [
        jsonResponse(401, { message: "Token expired" }),
        jsonResponse(409, { message: "Already decided", code: "already_decided", details: { status: "accepted" } }),
      ],
    );
    const err = await api.acceptKpiSuggestion("s-1").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(httpStatusOf(err)).toBe(409);
    expect((err as ApiError).code).toBe("already_decided");
    expect((err as ApiError).details).toEqual({ status: "accepted" });
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.filter((u) => ACCEPT_PATH.test(u))).toHaveLength(2);
    expect(calls.filter((u) => u.endsWith("/auth/refresh"))).toHaveLength(1);
    // Still signed in, with the renewed tokens.
    expect(localStorage.getItem("raqib_refresh_token")).toBe("refresh-2");
    expect(localStorage.getItem("raqib_token")).toBe(token("u-1"));
    expect(api.getUser()?.id).toBe("u-1");
  });

  it("after a refresh, returns the repeated request's answer", async () => {
    stubFetch(
      jsonResponse(200, { accessToken: token("u-1"), refreshToken: "refresh-2" }),
      [jsonResponse(401, {}), jsonResponse(200, { id: "ok" })],
    );
    await expect(api.getLibraryEntry("FS-01")).resolves.toEqual({ id: "ok" });
  });

  it("signs out when the repeated request is refused with 401 again", async () => {
    stubFetch(
      jsonResponse(200, { accessToken: token("u-1"), refreshToken: "refresh-2" }),
      [jsonResponse(401, { message: "Token expired" }), jsonResponse(401, { message: "Invalid token" })],
    );
    const err = await api.acceptKpiSuggestion("s-1").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(httpStatusOf(err)).toBe(401);
    expect((err as ApiError).code).toBeUndefined();
    expect(localStorage.getItem("raqib_token")).toBeNull();
    expect(localStorage.getItem("raqib_refresh_token")).toBeNull();
    expect(localStorage.getItem("raqib_user")).toBeNull();
  });

  it("shares one refresh between requests that expire together", async () => {
    const fetchMock = stubFetch(
      jsonResponse(200, { accessToken: token("u-1"), refreshToken: "refresh-2" }),
      [jsonResponse(401, {}), jsonResponse(401, {}), jsonResponse(200, { id: "a" }), jsonResponse(200, { id: "b" })],
    );
    const answers = await Promise.all([api.getLibraryEntry("FS-01"), api.getLibraryEntry("FS-02")]);

    expect(answers).toEqual([{ id: "a" }, { id: "b" }]);
    expect(fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.endsWith("/auth/refresh"))).toHaveLength(1);
    expect(localStorage.getItem("raqib_refresh_token")).toBe("refresh-2");
  });

  it("signs out without repeating the request when the refresh fails", async () => {
    const fetchMock = stubFetch(jsonResponse(401, { message: "Invalid refresh token" }), [jsonResponse(401, {})]);
    const err = await api.acceptKpiSuggestion("s-1").catch((e: unknown) => e);

    expect(httpStatusOf(err)).toBe(401);
    expect(fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => ACCEPT_PATH.test(u))).toHaveLength(1);
    expect(localStorage.getItem("raqib_token")).toBeNull();
  });
});

describe("api client: accepting a KPI suggestion (SPEC-8)", () => {
  it("sends the edits and replaceSource only when given", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { indicator: { id: "i" }, suggestion: { id: "s-1" }, warnings: [], replacedIndicatorId: "ind-old" }));
    vi.stubGlobal("fetch", fetchMock);
    const body = (index: number) => JSON.parse(String((fetchMock.mock.calls[index] as unknown as [string, RequestInit])[1].body));

    await api.acceptKpiSuggestion("s-1");
    await api.acceptKpiSuggestion("s-1", { targetValue: "60%" } as never);
    const replaced = await api.acceptKpiSuggestion("s-1", undefined, { replaceSource: true });
    await api.acceptKpiSuggestion("s-1", undefined, { replaceSource: false });

    expect([body(0), body(1), body(2), body(3)]).toEqual([{}, { edits: { targetValue: "60%" } }, { replaceSource: true }, {}]);
    expect(replaced.replacedIndicatorId).toBe("ind-old");
  });
});
