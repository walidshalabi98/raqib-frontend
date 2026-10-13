import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/apiError";
import { browserLanguage, forgotPasswordOutcome, isPlausibleResetToken, readAuthRouteState, signInErrorKey } from "@/lib/signIn";

describe("sign-in helpers", () => {
  it("reads only the known fields of the router state", () => {
    expect(readAuthRouteState(null)).toEqual({});
    expect(readAuthRouteState("forgot")).toEqual({});
    expect(readAuthRouteState({ lang: "ar", mode: "forgot", notice: "passwordReset", resetToken: "t", extra: 1 })).toEqual({
      lang: "ar",
      mode: "forgot",
      notice: "passwordReset",
      resetToken: "t",
    });
    expect(readAuthRouteState({ lang: "fr", mode: "delete", notice: "x", resetToken: 42 })).toEqual({});
  });

  it("follows the browser's first language: Arabic or English", () => {
    expect(browserLanguage(["ar-PS", "en"])).toBe("ar");
    expect(browserLanguage(["AR"])).toBe("ar");
    expect(browserLanguage(["en-GB", "ar"])).toBe("en");
    expect(browserLanguage(["fr"])).toBe("en");
  });

  it("accepts a reset token that is one piece of text of a sensible length", () => {
    expect(isPlausibleResetToken("eyJ.abc.def")).toBe(true);
    expect(isPlausibleResetToken("")).toBe(false);
    expect(isPlausibleResetToken(null)).toBe(false);
    expect(isPlausibleResetToken("a b")).toBe(false);
    expect(isPlausibleResetToken("x".repeat(4097))).toBe(false);
  });

  it("gives one message for a wrong email or password, and separate ones for waiting and being offline", () => {
    expect(signInErrorKey(new ApiError("Invalid email or password", 401))).toBe("auth.signIn.invalid");
    expect(signInErrorKey(new ApiError("Email and password are required", 400))).toBe("auth.signIn.invalid");
    expect(signInErrorKey(new ApiError("Too many", 429))).toBe("auth.signIn.tooManyAttempts");
    expect(signInErrorKey(new Error("Failed to fetch"))).toBe("auth.signIn.offline");
    expect(signInErrorKey(new ApiError("Boom", 500))).toBe("auth.signIn.failed");
  });

  it("answers a reset-link request the same way for any server answer", () => {
    for (const status of [400, 404, 500, 502]) expect(forgotPasswordOutcome(new ApiError("x", status))).toBe("sent");
    expect(forgotPasswordOutcome(new ApiError("Too many", 429))).toBe("tooManyAttempts");
    expect(forgotPasswordOutcome(new Error("Failed to fetch"))).toBe("offline");
  });
});
