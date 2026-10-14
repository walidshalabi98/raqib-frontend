import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/apiError";
import { archiveErrorKey, confirmsProjectName, deleteErrorKey, deletionSummary, restoreErrorKey } from "@/lib/projectLifecycle";
import { makeIndicator } from "@/test/fixtures";
import type { ProjectDetail } from "@/types/api";

type Counted = Pick<ProjectDetail, "documents" | "frameworks" | "_count">;

const framework = (indicators: number) =>
  ({ id: "fw-1", indicators: Array.from({ length: indicators }, (_, i) => makeIndicator({ id: `i-${i}` })) }) as unknown as ProjectDetail["frameworks"][number];

describe("deletionSummary", () => {
  it("lists what will be deleted with the counts the page has", () => {
    const project: Counted = {
      frameworks: [framework(6)],
      documents: [{ id: "d1" }, { id: "d2" }, { id: "d3" }] as ProjectDetail["documents"],
      _count: { dataPoints: 30, qualitativeEntries: 2, assessments: 1, reports: 4 },
    };
    expect(deletionSummary(project)).toEqual([
      { key: "framework", count: null },
      { key: "indicators", count: 6 },
      { key: "dataPoints", count: 30 },
      { key: "qualitativeEntries", count: 2 },
      { key: "assessments", count: 1 },
      { key: "reports", count: 4 },
      { key: "documents", count: 3 },
      { key: "beneficiaries", count: null },
      { key: "notifications", count: null },
    ]);
  });

  it("leaves out what is known to be empty and always lists beneficiaries and notifications", () => {
    const project: Counted = { frameworks: [], documents: [], _count: { dataPoints: 0, qualitativeEntries: 0, assessments: 0, reports: 0 } };
    expect(deletionSummary(project)).toEqual([
      { key: "beneficiaries", count: null },
      { key: "notifications", count: null },
    ]);
  });

  it("lists a framework without indicators, and unknown counts without a number", () => {
    const project = { frameworks: [framework(0)], documents: undefined, _count: undefined } as unknown as Counted;
    expect(deletionSummary(project)).toEqual([
      { key: "framework", count: null },
      { key: "dataPoints", count: null },
      { key: "qualitativeEntries", count: null },
      { key: "assessments", count: null },
      { key: "reports", count: null },
      { key: "documents", count: null },
      { key: "beneficiaries", count: null },
      { key: "notifications", count: null },
    ]);
  });
});

describe("confirmsProjectName", () => {
  const name = "Hebron Youth Employment";

  it("accepts the exact name only, capitals included", () => {
    expect(confirmsProjectName("Hebron Youth Employment", name)).toBe(true);
    expect(confirmsProjectName("hebron youth employment", name)).toBe(false);
    expect(confirmsProjectName("HEBRON YOUTH EMPLOYMENT", name)).toBe(false);
    expect(confirmsProjectName("Hebron Youth", name)).toBe(false);
    expect(confirmsProjectName("Hebron  Youth Employment", name)).toBe(false);
    expect(confirmsProjectName("", name)).toBe(false);
  });

  it("ignores spaces around the name, as the server does", () => {
    expect(confirmsProjectName("  Hebron Youth Employment ", name)).toBe(true);
    expect(confirmsProjectName("Hebron Youth Employment", ` ${name} `)).toBe(true);
  });

  it("works for Arabic names and never confirms an empty name", () => {
    expect(confirmsProjectName("مشروع المياه في غزة", "مشروع المياه في غزة")).toBe(true);
    expect(confirmsProjectName("مشروع المياه", "مشروع المياه في غزة")).toBe(false);
    expect(confirmsProjectName("", "   ")).toBe(false);
    expect(confirmsProjectName("   ", "   ")).toBe(false);
  });
});

describe("error keys", () => {
  it("explains each refusal in the user's language, never with the server's text", () => {
    expect(archiveErrorKey(new ApiError("Insufficient permissions", 403))).toBe("errors.forbidden");
    expect(archiveErrorKey(new ApiError("Already", 409, "project_already_archived"))).toBe("projectActions.archiveDialog.errors.alreadyArchived");
    expect(archiveErrorKey(new ApiError("Project not found", 404))).toBe("projectActions.errors.notFound");
    expect(archiveErrorKey(new Error("Network error"))).toBe("projectActions.archiveDialog.errors.failed");

    expect(restoreErrorKey(new ApiError("Insufficient permissions", 403))).toBe("errors.forbidden");
    expect(restoreErrorKey(new ApiError("Not archived", 409, "project_not_archived"))).toBe("projectActions.errors.notArchived");
    expect(restoreErrorKey(new ApiError("Project not found", 404))).toBe("projectActions.errors.notFound");
    expect(restoreErrorKey(new ApiError("Boom", 500))).toBe("projectActions.errors.restoreFailed");

    expect(deleteErrorKey(new ApiError("Insufficient permissions", 403))).toBe("errors.forbidden");
    expect(deleteErrorKey(new ApiError("Mismatch", 400, "confirm_name_mismatch"))).toBe("projectActions.deleteDialog.errors.mismatch");
    expect(deleteErrorKey(new ApiError("Project not found", 404))).toBe("projectActions.errors.notFound");
    expect(deleteErrorKey(new ApiError("Boom", 500))).toBe("projectActions.deleteDialog.errors.failed");
  });
});
