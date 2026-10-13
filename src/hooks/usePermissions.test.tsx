import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { AuthProvider } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { api } from "@/services/api";
import type { AuthUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

function userWithRole(role: string): AuthUser {
  return { id: "u1", email: "u@example.org", fullName: "User", role, languagePref: "en", organization: { id: "org-1", name: "Org" } };
}

function renderAs(role: string | null) {
  vi.mocked(api.getUser).mockReturnValue(role === null ? null : userWithRole(role));
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
  return renderHook(() => usePermissions(), { wrapper }).result.current;
}

beforeEach(() => vi.clearAllMocks());

describe("usePermissions", () => {
  it("lets org staff change project data and run AI features", () => {
    for (const role of ["org_admin", "platform_admin", "me_officer"]) {
      const perms = renderAs(role);
      expect(perms.role).toBe(role);
      expect(perms.readOnly).toBe(false);
      expect(perms.can("project.edit")).toBe(true);
      expect(perms.can("ai.run")).toBe(true);
      expect(perms.can("beneficiary.records")).toBe(true);
    }
    expect(renderAs("me_officer").can("users.manage")).toBe(false);
    expect(renderAs("org_admin").can("users.manage")).toBe(true);
  });

  it("makes donor viewers read-only", () => {
    const perms = renderAs("donor_viewer");
    expect(perms.role).toBe("donor_viewer");
    expect(perms.readOnly).toBe(true);
    expect(perms.can("project.edit")).toBe(false);
    expect(perms.can("beneficiary.records")).toBe(false);
    expect(perms.can("export.personalData")).toBe(false);
    expect(perms.can("ai.run")).toBe(false);
  });

  it("denies everything for an unknown role or when signed out", () => {
    for (const role of ["admin", "", null]) {
      const perms = renderAs(role);
      expect(perms.role).toBeUndefined();
      expect(perms.readOnly).toBe(true);
      expect(perms.can("project.edit")).toBe(false);
    }
  });

  it("denies everything outside AuthProvider", () => {
    const perms = renderHook(() => usePermissions()).result.current;
    expect(perms.role).toBeUndefined();
    expect(perms.readOnly).toBe(true);
    expect(perms.can("data.enter")).toBe(false);
  });
});
