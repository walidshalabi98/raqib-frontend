import { afterEach, describe, expect, it, vi } from "vitest";
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
