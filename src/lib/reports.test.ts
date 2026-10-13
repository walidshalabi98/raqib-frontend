import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/apiError";
import { isFinishedReport, publicationErrorKey, REPORT_FRAME_CSP, reportFrameDocument, reportStatusOf } from "@/lib/reports";

describe("reportStatusOf", () => {
  it("reads published, and treats anything else as a draft", () => {
    expect(reportStatusOf({ status: "published" })).toBe("published");
    expect(reportStatusOf({ status: "draft" })).toBe("draft");
    // Older responses and unknown values: donors do not see the report, so it is a draft.
    expect(reportStatusOf({})).toBe("draft");
    expect(reportStatusOf({ status: "completed" })).toBe("draft");
  });
});

describe("isFinishedReport", () => {
  it("needs a file or a narrative, as the backend does", () => {
    expect(isFinishedReport({ aiNarrative: "<p>Progress</p>", fileUrl: null })).toBe(true);
    expect(isFinishedReport({ aiNarrative: null, fileUrl: "reports/r-1.pdf" })).toBe(true);
    expect(isFinishedReport({ aiNarrative: null, fileUrl: null })).toBe(false);
    expect(isFinishedReport({ aiNarrative: "   ", fileUrl: "" })).toBe(false);
    expect(isFinishedReport({})).toBe(false);
  });
});

describe("publicationErrorKey", () => {
  it("explains the server's answer in the user's language, never its English message", () => {
    expect(publicationErrorKey(new ApiError("Insufficient permissions", 403), true)).toBe("errors.forbidden");
    expect(publicationErrorKey(new ApiError("Report not found", 404), false)).toBe("reports.errors.notFound");
    expect(publicationErrorKey(new ApiError("Only a finished report can be published", 409), true)).toBe("reports.errors.notFinished");
    expect(publicationErrorKey(new ApiError("Internal server error", 500), true)).toBe("reports.errors.publishFailed");
    expect(publicationErrorKey(new Error("Failed to fetch"), false)).toBe("reports.errors.unpublishFailed");
  });
});

describe("reportFrameDocument", () => {
  it("puts a policy that blocks scripts and every request before the report's own HTML", () => {
    const narrative = '<!DOCTYPE html><html><head><style>h1{color:#1e3a5f}</style></head><body><h1>Q3</h1><img src="https://tracker.example/p.gif"></body></html>';
    const doc = reportFrameDocument(narrative);
    expect(doc.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:;')).toBe(true);
    expect(doc.endsWith(narrative)).toBe(true);

    // Parsed as the browser does: the policy is the first element of the head, and the report's head joins it.
    const parsed = new DOMParser().parseFromString(doc, "text/html");
    // (A parsed document's elements belong to another window: read them directly.)
    expect(parsed.head.firstElementChild?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(parsed.head.querySelector("style")).not.toBeNull();
    expect(parsed.body.querySelector("h1")?.textContent).toBe("Q3");
    expect(parsed.querySelectorAll("html")).toHaveLength(1);
  });

  it("allows no script source and no remote image", () => {
    expect(REPORT_FRAME_CSP).toContain("default-src 'none'");
    expect(REPORT_FRAME_CSP).not.toMatch(/script-src|https?:|\*/);
  });
});
