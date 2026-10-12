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
