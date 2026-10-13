import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createTestQueryClient } from "@/test/utils";
import { AuthProvider } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { api } from "@/services/api";
import { makeAccessToken } from "@/test/fixtures";
import type { AuthUser } from "@/types/api";

// The real API client: the role must follow the access token the server reads, so a role an admin
// changes reaches the UI with the next token refresh, without signing in again.

const sara: AuthUser = { id: "u-1", email: "sara@example.org", fullName: "Sara", role: "donor_viewer", languagePref: "en", organization: { id: "org-1", name: "Org" } };
const accessToken = (role: string) => makeAccessToken({ id: "u-1", email: sara.email, organizationId: "org-1", role, fullName: "Sara" });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Signs Sara in with `role` (as api.login stores it) and renders usePermissions inside AuthProvider. */
function signedInAs(role: string) {
  localStorage.setItem("raqib_user", JSON.stringify({ ...sara, role }));
  localStorage.setItem("raqib_refresh_token", "refresh-1");
  api.setToken(accessToken(role));
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
  return renderHook(() => usePermissions(), { wrapper });
}

/** The next request finds the access token expired; the refresh returns a token with `newRole`. */
function expireTokenAndRefreshAs(newRole: string) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json(401, { message: "Token expired" }))
    .mockResolvedValueOnce(json(200, { accessToken: accessToken(newRole), refreshToken: "refresh-2" }))
    .mockResolvedValueOnce(json(200, []));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => api.clearToken());
});

describe("usePermissions after a role change", () => {
  it("gives a promoted donor viewer the officer's screens at the next token refresh", async () => {
    const { result } = signedInAs("donor_viewer");
    expect(result.current.role).toBe("donor_viewer");
    expect(result.current.readOnly).toBe(true);
    expect(result.current.can("export.personalData")).toBe(false);

    const fetchMock = expireTokenAndRefreshAs("me_officer");
    await act(async () => {
      await api.getProjects();
    });

    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/auth\/refresh$/);
    expect(result.current.role).toBe("me_officer");
    expect(result.current.readOnly).toBe(false);
    expect(result.current.can("beneficiary.records")).toBe(true);
    expect(result.current.can("export.personalData")).toBe(true);
    expect(JSON.parse(localStorage.getItem("raqib_user") ?? "{}").role).toBe("me_officer");
    expect(localStorage.getItem("raqib_refresh_token")).toBe("refresh-2");
  });

  it("makes a demoted officer read-only at the next token refresh", async () => {
    const { result } = signedInAs("me_officer");
    expect(result.current.can("document.manage")).toBe(true);

    expireTokenAndRefreshAs("donor_viewer");
    await act(async () => {
      await api.getProjects();
    });

    expect(result.current.role).toBe("donor_viewer");
    expect(result.current.readOnly).toBe(true);
    expect(result.current.can("document.manage")).toBe(false);
    expect(result.current.can("beneficiary.records")).toBe(false);
  });

  it("denies everything when the new token carries no known role", async () => {
    const { result } = signedInAs("org_admin");
    expireTokenAndRefreshAs("superuser");
    await act(async () => {
      await api.getProjects();
    });
    expect(result.current.role).toBeUndefined();
    expect(result.current.readOnly).toBe(true);
    expect(result.current.can("project.edit")).toBe(false);
  });

  it("follows the token rather than the role saved at sign-in", () => {
    localStorage.setItem("raqib_user", JSON.stringify({ ...sara, role: "org_admin" }));
    api.setToken(accessToken("donor_viewer"));
    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => usePermissions(), { wrapper });
    expect(result.current.role).toBe("donor_viewer");
    expect(result.current.can("users.manage")).toBe(false);
  });

  it("drops data cached under the old role, so a promoted donor never sees donor-shaped data in the staff screens", async () => {
    localStorage.setItem("raqib_user", JSON.stringify(sara));
    localStorage.setItem("raqib_refresh_token", "refresh-1");
    api.setToken(accessToken("donor_viewer"));
    const client = createTestQueryClient();
    let served = 0;
    // What the server sends for the current role: the donor projection, then the staff shape.
    const loadEntries = vi.fn(async () => (api.getUser()?.role === "donor_viewer" ? { shape: "donor", n: ++served } : { shape: "staff", n: ++served }));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
    );
    const { result } = renderHook(() => ({ permissions: usePermissions(), entries: useQuery({ queryKey: ["qualitative", "p-1"], queryFn: loadEntries, staleTime: Infinity }) }), { wrapper });
    await waitFor(() => expect(result.current.entries.data).toEqual({ shape: "donor", n: 1 }));

    expireTokenAndRefreshAs("me_officer");
    await act(async () => {
      await api.getProjects();
    });

    expect(result.current.permissions.role).toBe("me_officer");
    await waitFor(() => expect(result.current.entries.data).toEqual({ shape: "staff", n: 2 }));
    expect(loadEntries).toHaveBeenCalledTimes(2);
  });
});
