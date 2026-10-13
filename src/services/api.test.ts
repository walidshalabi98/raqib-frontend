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

describe("api client: sign-in and passwords", () => {
  afterEach(() => api.clearToken());

  it("keeps a wrong sign-in on the page: a 401 is passed on, with no token refresh, sign-out or redirect", async () => {
    localStorage.setItem("raqib_refresh_token", "refresh-1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { message: "Invalid email or password" }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await api.login("sara@example.org", "wrong-password").catch((e: unknown) => e);
    expect(httpStatusOf(err)).toBe(401);
    expect((err as ApiError).message).toBe("Invalid email or password");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("raqib_refresh_token")).toBe("refresh-1");
  });

  it("resets a password with the link's token, without sending an access token, and passes an expired link on as 401", async () => {
    api.setToken("signed-in-token");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { message: "This reset link is invalid or has expired", code: "reset_link_invalid" }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await api.resetPassword("reset-token", "olive-grove-2026").catch((e: unknown) => e);
    expect(httpStatusOf(err)).toBe(401);
    expect((err as ApiError).code).toBe("reset_link_invalid");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/reset-password$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ token: "reset-token", newPassword: "olive-grove-2026" });
    expect(init.headers.Authorization).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(api.getToken()).toBe("signed-in-token");
  });

  it("asks for a reset link with POST /auth/forgot-password", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "If an account exists…" }));
    vi.stubGlobal("fetch", fetchMock);
    await api.forgotPassword("sara@example.org");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/forgot-password$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "sara@example.org" });
  });

  it("changes the signed-in user's password and keeps the new token pair, so this session continues (SR-1)", async () => {
    api.setToken("signed-in-token");
    localStorage.setItem("raqib_refresh_token", "refresh-old");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: "access-new", refreshToken: "refresh-new" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.changePassword("old-password-1", "olive-grove-2026")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/change-password$/);
    expect(init.headers.Authorization).toBe("Bearer signed-in-token");
    expect(JSON.parse(init.body)).toEqual({ currentPassword: "old-password-1", newPassword: "olive-grove-2026" });
    expect(api.getToken()).toBe("access-new");
    expect(localStorage.getItem("raqib_refresh_token")).toBe("refresh-new");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { message: "The current password is incorrect.", code: "current_password_incorrect" })));
    const err = await api.changePassword("wrong", "olive-grove-2026").catch((e: unknown) => e);
    expect(httpStatusOf(err)).toBe(400);
    expect((err as ApiError).code).toBe("current_password_incorrect");
    expect(api.getToken()).toBe("access-new");
  });

  it("invites a user and resets a member's password at the backend's paths, returning the one-time password", async () => {
    api.setToken("signed-in-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "u-9", email: "lina@example.org", fullName: "Lina", role: "donor_viewer", emailSent: false, temporaryPassword: "Temp-Pass-123" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "u/9", emailSent: false, temporaryPassword: "Temp-Pass-456" }));
    vi.stubGlobal("fetch", fetchMock);
    const invited = await api.inviteUser({ fullName: "Lina", email: "lina@example.org", role: "donor_viewer" });
    expect(invited.temporaryPassword).toBe("Temp-Pass-123");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/users\/invite$/);
    const reset = await api.resetUserPassword("u/9");
    expect(reset).toEqual({ id: "u/9", emailSent: false, temporaryPassword: "Temp-Pass-456" });
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/users\/u%2F9\/reset-password$/);
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  });
});

describe("api client: an expired access token (SR-7, SR-9)", () => {
  const locationHref = window.location.href;
  afterEach(() => {
    api.clearToken();
    window.history.replaceState(null, "", locationHref);
  });

  function signedIn() {
    api.setToken("expired-access");
    localStorage.setItem("raqib_refresh_token", "refresh-1");
  }

  it("refreshes, sends the request again and returns that answer's refusal (400 with its code), still signed in", async () => {
    signedIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Invalid or expired token" }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "access-2", refreshToken: "refresh-2" }))
      .mockResolvedValueOnce(jsonResponse(400, { message: "The current password is incorrect.", code: "current_password_incorrect" }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await api.changePassword("mistyped", "olive-grove-2026").catch((e: unknown) => e);
    expect(httpStatusOf(err)).toBe(400);
    expect((err as ApiError).code).toBe("current_password_incorrect");
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer access-2");
    expect(api.getToken()).toBe("access-2");
    expect(localStorage.getItem("raqib_refresh_token")).toBe("refresh-2");
  });

  it("returns a 409 after a refresh as a 409, still signed in", async () => {
    signedIn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, {}))
        .mockResolvedValueOnce(jsonResponse(200, { accessToken: "access-2", refreshToken: "refresh-2" }))
        .mockResolvedValueOnce(jsonResponse(409, { message: "A user with this email already exists" })),
    );
    const err = await api.inviteUser({ fullName: "Lina", email: "lina@example.org", role: "donor_viewer" }).catch((e: unknown) => e);
    expect(httpStatusOf(err)).toBe(409);
    expect(api.getToken()).toBe("access-2");
  });

  it("keeps the session when the refresh is rate limited (429) or Raqib cannot be reached, and says so", async () => {
    signedIn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(401, {})).mockResolvedValueOnce(jsonResponse(429, { message: "Too many requests." })));
    const limited = await api.getUsers().catch((e: unknown) => e);
    expect(httpStatusOf(limited)).toBe(429);
    expect(api.getToken()).toBe("expired-access");
    expect(localStorage.getItem("raqib_refresh_token")).toBe("refresh-1");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(401, {})).mockRejectedValueOnce(new TypeError("Failed to fetch")));
    const offline = await api.getUsers().catch((e: unknown) => e);
    expect(offline).toBeInstanceOf(Error);
    expect(httpStatusOf(offline)).toBeUndefined();
    expect(localStorage.getItem("raqib_refresh_token")).toBe("refresh-1");
  });

  it("signs out when the session has ended: the refresh is refused (the password changed), or the retry is still 401", async () => {
    signedIn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(401, {})).mockResolvedValueOnce(jsonResponse(401, { code: "session_ended" })));
    expect(httpStatusOf(await api.getUsers().catch((e: unknown) => e))).toBe(401);
    expect(api.getToken()).toBeNull();
    expect(localStorage.getItem("raqib_refresh_token")).toBeNull();

    signedIn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, {}))
        .mockResolvedValueOnce(jsonResponse(200, { accessToken: "access-2", refreshToken: "refresh-2" }))
        .mockResolvedValueOnce(jsonResponse(401, {})),
    );
    expect(httpStatusOf(await api.getUsers().catch((e: unknown) => e))).toBe(401);
    expect(api.getToken()).toBeNull();
  });
});
