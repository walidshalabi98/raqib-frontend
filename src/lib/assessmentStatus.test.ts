import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_WAIT_MS,
  assessmentFailure,
  assessmentsNeedRefresh,
  isAssessmentInProgress,
} from "@/lib/assessmentStatus";

const requestedAt = "2026-10-12T08:00:00.000Z";
const requested = Date.parse(requestedAt);
const declined = "AI generation failed: the AI model declined the request. Try again or write the assessment manually.";

describe("assessmentFailure", () => {
  it("reads the backend's failure message from an assessment back in analysis", () => {
    expect(assessmentFailure({ status: "analysis", scopeDescription: declined })).toBe(
      "The AI model declined the request. Try again or write the assessment manually.",
    );
    expect(assessmentFailure({ status: "analysis", scopeDescription: "AI generation failed" })).toBe("");
  });

  it("is null for anything else", () => {
    expect(assessmentFailure({ status: "analysis", scopeDescription: "AI-generated midterm assessment" })).toBeNull();
    expect(assessmentFailure({ status: "analysis", scopeDescription: null })).toBeNull();
    expect(assessmentFailure({ status: "analysis" })).toBeNull();
    expect(assessmentFailure({ status: "delivered", scopeDescription: declined })).toBeNull();
    expect(assessmentFailure({ status: "analysis", scopeDescription: "Notes: AI generation failed once" })).toBeNull();
  });
});

describe("isAssessmentInProgress", () => {
  it("is false for a failed AI step", () => {
    expect(isAssessmentInProgress({ status: "analysis", scopeDescription: "{}" })).toBe(true);
    expect(isAssessmentInProgress({ status: "analysis", scopeDescription: declined })).toBe(false);
    expect(isAssessmentInProgress({ status: "in_field" })).toBe(true);
    expect(isAssessmentInProgress({ status: "requested" })).toBe(false);
    expect(isAssessmentInProgress({ status: "delivered" })).toBe(false);
  });
});

describe("assessmentsNeedRefresh", () => {
  const soon = requested + 30_000;

  it("refreshes while an AI report is being generated, within the wait", () => {
    for (const status of ["requested", "scoping", "analysis"]) {
      expect(assessmentsNeedRefresh([{ status, scopeDescription: "x", requestedAt }], soon)).toBe(true);
      expect(assessmentsNeedRefresh([{ status, scopeDescription: "x", requestedAt }], requested + ASSESSMENT_WAIT_MS)).toBe(false);
    }
  });

  it("does not refresh for a failed, delivered or staff-managed assessment", () => {
    expect(assessmentsNeedRefresh([], soon)).toBe(false);
    expect(assessmentsNeedRefresh([{ status: "analysis", scopeDescription: declined, requestedAt }], soon)).toBe(false);
    expect(assessmentsNeedRefresh([{ status: "delivered", requestedAt }], soon)).toBe(false);
    expect(assessmentsNeedRefresh([{ status: "in_field", requestedAt }], soon)).toBe(false);
    expect(assessmentsNeedRefresh([{ status: "scoping", requestedAt: "not a date" }], soon)).toBe(false);
    expect(assessmentsNeedRefresh([{ status: "scoping" }], soon)).toBe(false);
  });
});
