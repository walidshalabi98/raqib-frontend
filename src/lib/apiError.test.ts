import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { ApiError, apiErrorText, forbiddenText, isForbidden, setErrorTranslator } from "@/lib/apiError";
import { errorMessage } from "@/lib/utils";

const FORBIDDEN = "You don't have permission to do this. Ask your organisation's admin if you need access.";
const FORBIDDEN_AR = "ليست لديك صلاحية للقيام بهذا الإجراء. تواصل مع مسؤول مؤسستك إذا كنت بحاجة إلى هذه الصلاحية.";

describe("apiErrorText", () => {
  it("explains a 403 in the user's language instead of the server's text", () => {
    const err = new ApiError("Insufficient permissions", 403);
    expect(isForbidden(err)).toBe(true);
    expect(apiErrorText(i18n.getFixedT("en"), err, "exportPanel.failed")).toBe(FORBIDDEN);
    expect(apiErrorText(i18n.getFixedT("ar"), err, "exportPanel.failed")).toBe(FORBIDDEN_AR);
    // Any error object carrying the status counts.
    expect(apiErrorText(i18n.getFixedT("en"), { status: 403 }, "exportPanel.failed")).toBe(FORBIDDEN);
  });

  it("keeps other errors' messages and falls back to the key", () => {
    const t = i18n.getFixedT("en");
    expect(apiErrorText(t, new ApiError("Too many requests", 429), "exportPanel.failed")).toBe("Too many requests");
    expect(apiErrorText(t, new ApiError("", 500), "exportPanel.failed")).toBe("We couldn't export the data.");
    expect(apiErrorText(t, "boom", "exportPanel.failed")).toBe("We couldn't export the data.");
    expect(apiErrorText(t, undefined, "exportPanel.failed")).toBe("We couldn't export the data.");
    expect(isForbidden(new ApiError("Not found", 404))).toBe(false);
  });
});

describe("errorMessage", () => {
  it("maps a 403 to the forbidden message, in Arabic when asked", () => {
    const err = new ApiError("Insufficient permissions", 403);
    expect(errorMessage(err, "Failed")).toBe(FORBIDDEN);
    expect(errorMessage(err, "Failed", "en")).toBe(FORBIDDEN);
    expect(errorMessage(err, "Failed", "ar")).toBe(FORBIDDEN_AR);
    expect(forbiddenText("ar")).toBe(FORBIDDEN_AR);
  });

  it("falls back to the server's message while the translations are not loaded", () => {
    setErrorTranslator(null);
    try {
      expect(errorMessage(new ApiError("Insufficient permissions", 403), "Failed", "ar")).toBe("Insufficient permissions");
    } finally {
      setErrorTranslator((key, lng) => i18n.t(key, { lng }));
    }
    expect(errorMessage(new ApiError("Insufficient permissions", 403), "Failed")).toBe(FORBIDDEN);
  });

  it("keeps today's behaviour for every other error", () => {
    expect(errorMessage(new ApiError("Project not found", 404), "Failed")).toBe("Project not found");
    expect(errorMessage(new Error(""), "Failed")).toBe("Failed");
    expect(errorMessage("text", "Failed")).toBe("Failed");
  });
});
