import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/apiError";
import {
  COMMON_PASSWORDS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  changePasswordSchema,
  emailParts,
  normalizePassword,
  organisationNameParts,
  passwordFailure,
  passwordProblem,
  resetPasswordSchema,
} from "@/lib/passwordPolicy";

const issues = (result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) =>
  Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]));

describe("password policy", () => {
  it("asks for 10 to 200 characters, counted as the server counts them (code points)", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(MAX_PASSWORD_LENGTH).toBe(200);
    expect(passwordProblem("")).toBe("newRequired");
    expect(passwordProblem("a".repeat(9))).toBe("tooShort");
    expect(passwordProblem("Kq7mWx3pZr")).toBeUndefined();
    expect(passwordProblem("Kq7m".repeat(50))).toBeUndefined();
    expect(passwordProblem("a".repeat(201))).toBe("tooLong");
    // Nine emoji are 18 UTF-16 units but nine characters for the server.
    expect(passwordProblem("😀".repeat(9))).toBe("tooShort");
    expect(passwordProblem("كلمةمرورطويلة")).toBeUndefined();
  });

  it("refuses the current password and the email name, ignoring case", () => {
    expect(passwordProblem("olive-grove-2026", { currentPassword: "olive-grove-2026" })).toBe("sameAsCurrent");
    expect(passwordProblem("olive-grove-2027", { currentPassword: "olive-grove-2026" })).toBeUndefined();
    expect(passwordProblem("Sara.Haddad-2026", { email: "sara.haddad@example.org" })).toBe("containsEmailName");
    expect(passwordProblem("olive-grove-2026", { email: "sara.haddad@example.org" })).toBeUndefined();
    // Very short email names are not checked.
    expect(passwordProblem("ab-olive-grove", { email: "ab@example.org" })).toBeUndefined();
  });

  it("refuses only spaces, one repeated character or fewer than 4 different characters", () => {
    for (const password of [" ".repeat(10), "aaaaaaaaaa", "AaAaAaAaAa", "1212121212", "abcabcabca"]) {
      expect(passwordProblem(password), JSON.stringify(password)).toBe("tooSimple");
    }
    expect(passwordProblem("abcdabcdab")).toBeUndefined();
  });

  it("refuses common passwords (also with digits or symbols around them) and the product's or organisation's name", () => {
    for (const password of ["1234567890", "password12", "Password2026!", "qwertyuiop", "Momentum2026", "raqib12345", "فلسطين2026", "رقيب-2026-سري"]) {
      expect(passwordProblem(password), password).toBe("tooCommon");
    }
    expect(passwordProblem("my garden path 1984")).toBeUndefined();
    expect(passwordProblem("Nayzak-2026-pw", { organizationName: "Al Nayzak Foundation" })).toBe("tooCommon");
    expect(passwordProblem("foundation-garden-7", { organizationName: "Al Nayzak Foundation" })).toBeUndefined();
    expect(organisationNameParts("Al Nayzak Foundation")).toEqual(["alnayzakfoundation", "nayzak"]);
    expect(COMMON_PASSWORDS.has("رامالله")).toBe(true);
    // The same list as the server's (backend src/utils/passwordPolicy.ts): 118 entries.
    expect(COMMON_PASSWORDS.size).toBe(118);
  });

  it("compares the NFC form, as the server does: the same Arabic text composed differently is the same password", () => {
    const composed = "آمنة-حديقة-2026";
    const decomposed = "ا\u0653منة-حديقة-2026";
    expect(normalizePassword(decomposed)).toBe(composed);
    expect(passwordProblem(decomposed, { currentPassword: composed })).toBe("sameAsCurrent");
  });

  it("reads the parts of the email a password may not contain, as the server does", () => {
    expect(emailParts(" Sara.Haddad@Example.org")).toEqual(["sara.haddad"]);
    expect(emailParts("sara+raqib@example.org")).toEqual(["sara+raqib", "sara"]);
    expect(emailParts("al+x@example.org")).toEqual(["al+x"]);
    expect(emailParts("no-at-sign")).toEqual([]);
    expect(emailParts("@example.org")).toEqual([]);
    expect(emailParts(undefined)).toEqual([]);
    expect(passwordProblem("Olive-SARA-grove", { email: "sara+raqib@example.org" })).toBe("containsEmailName");
  });

  it("checks the change-password form: current, new and a matching confirmation", () => {
    const schema = changePasswordSchema({ email: "sara@example.org", organizationName: "Hebron Youth NGO" });
    expect(schema.safeParse({ currentPassword: "old-password-1", newPassword: "olive-grove-2026", confirmPassword: "olive-grove-2026" }).success).toBe(true);
    expect(issues(schema.safeParse({ currentPassword: "", newPassword: "short", confirmPassword: "" }))).toEqual({
      currentPassword: "currentRequired",
      newPassword: "tooShort",
      confirmPassword: "confirmRequired",
    });
    expect(issues(schema.safeParse({ currentPassword: "x", newPassword: "sara-olive-grove", confirmPassword: "other-password" }))).toEqual({
      newPassword: "containsEmailName",
      confirmPassword: "mismatch",
    });
  });

  it("checks the reset form without a current password or email", () => {
    expect(resetPasswordSchema.safeParse({ newPassword: "olive-grove-2026", confirmPassword: "olive-grove-2026" }).success).toBe(true);
    expect(issues(resetPasswordSchema.safeParse({ newPassword: "", confirmPassword: "x" }))).toEqual({
      newPassword: "newRequired",
      confirmPassword: "mismatch",
    });
  });
});

describe("passwordFailure", () => {
  it("maps the server's reason codes to the screen's own messages", () => {
    expect(passwordFailure(new ApiError("This reset link is invalid…", 401, "reset_link_invalid"), "reset")).toBe("invalidLink");
    expect(passwordFailure(new ApiError("The current password is incorrect.", 400, "current_password_incorrect"), "change")).toBe("currentWrong");
    expect(passwordFailure(new ApiError("x", 400, "password_too_short"), "change")).toBe("tooShort");
    expect(passwordFailure(new ApiError("x", 400, "password_too_long"), "reset")).toBe("tooLong");
    expect(passwordFailure(new ApiError("x", 400, "password_same_as_current"), "reset")).toBe("sameAsCurrent");
    expect(passwordFailure(new ApiError("x", 400, "password_contains_email"), "change")).toBe("containsEmailName");
    expect(passwordFailure(new ApiError("x", 400, "password_too_simple"), "change")).toBe("tooSimple");
    expect(passwordFailure(new ApiError("x", 400, "password_too_common"), "reset")).toBe("tooCommon");
    expect(passwordFailure(new ApiError("x", 409, "password_changed_meanwhile"), "change")).toBe("changedMeanwhile");
  });

  it("treats any 401 on the reset page as an invalid link, and ignores codes that do not fit the screen", () => {
    expect(passwordFailure(new ApiError("Invalid or expired token", 401), "reset")).toBe("invalidLink");
    expect(passwordFailure(new ApiError("x", 400, "reset_link_invalid"), "change")).toBe("failed");
    expect(passwordFailure(new ApiError("x", 400, "current_password_incorrect"), "reset")).toBe("failed");
    expect(passwordFailure(new ApiError("Some English text", 400), "change")).toBe("failed");
    expect(passwordFailure(new ApiError("x", 400, "toString"), "change")).toBe("failed");
  });

  it("says when to wait, when the server could not be reached, and otherwise that it failed", () => {
    expect(passwordFailure(new ApiError("Too many sign-in attempts", 429), "reset")).toBe("tooManyAttempts");
    expect(passwordFailure(new Error("Failed to fetch"), "change")).toBe("offline");
    expect(passwordFailure(new ApiError("Internal server error", 500), "change")).toBe("failed");
    expect(passwordFailure("weird", "change")).toBe("failed");
  });
});
