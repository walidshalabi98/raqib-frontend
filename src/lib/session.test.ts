import { describe, expect, it } from "vitest";
import { accessTokenClaims, sessionUser } from "@/lib/session";
import { makeAccessToken } from "@/test/fixtures";
import type { AuthUser } from "@/types/api";

const profile: AuthUser = {
  id: "u-1",
  email: "sara@example.org",
  fullName: "سارة",
  role: "donor_viewer",
  languagePref: "ar",
  organization: { id: "org-1", name: "Org" },
};

const token = (claims: Record<string, unknown>) => makeAccessToken({ id: "u-1", email: "sara@example.org", organizationId: "org-1", fullName: "سارة", ...claims });

describe("accessTokenClaims", () => {
  it("reads the id and role of an access token, Arabic names included", () => {
    expect(accessTokenClaims(token({ role: "me_officer" }))).toEqual({ id: "u-1", role: "me_officer" });
  });

  it("gives no role for an unknown or missing role", () => {
    expect(accessTokenClaims(token({ role: "admin" }))).toEqual({ id: "u-1", role: undefined });
    expect(accessTokenClaims(token({}))).toEqual({ id: "u-1", role: undefined });
  });

  it("refuses anything that is not an access token", () => {
    for (const value of [null, undefined, "", "token", "a.b", "a.b.c.d", "a.!!!.c", `x.${btoa("[1]")}.y`, `x.${btoa('{"role":"org_admin"}')}.y`]) {
      expect(accessTokenClaims(value)).toBeNull();
    }
    // A password-reset token is not an access token.
    expect(accessTokenClaims(makeAccessToken({ id: "u-1", purpose: "reset" }))).toBeNull();
  });
});

describe("sessionUser", () => {
  it("takes the role from the current access token, not from the profile saved at sign-in", () => {
    expect(sessionUser(profile, token({ role: "me_officer" }))?.role).toBe("me_officer");
    const officer = { ...profile, role: "me_officer" };
    expect(sessionUser(officer, token({ role: "donor_viewer" }))?.role).toBe("donor_viewer");
  });

  it("keeps the rest of the profile", () => {
    const user = sessionUser(profile, token({ role: "org_admin" }));
    expect(user).toEqual({ ...profile, role: "org_admin" });
    expect(sessionUser(profile, token({ role: "donor_viewer" }))).toBe(profile);
  });

  it("denies by default: no token, another user's token or no known role gives role ''", () => {
    expect(sessionUser(profile, null)?.role).toBe("");
    expect(sessionUser(profile, "not-a-jwt")?.role).toBe("");
    expect(sessionUser(profile, makeAccessToken({ id: "u-2", role: "org_admin" }))?.role).toBe("");
    expect(sessionUser(profile, token({ role: "superuser" }))?.role).toBe("");
    expect(sessionUser(null, token({ role: "org_admin" }))).toBeNull();
  });
});
