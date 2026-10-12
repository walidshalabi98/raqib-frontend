import { describe, expect, it } from "vitest";
import type { DocumentAiAnalysis, ProjectDocument } from "@/types/api";
import {
  ANALYSIS_MIN_TEXT_LENGTH,
  DOCUMENT_WAIT_MS,
  documentAnalysisOf,
  documentRowState,
  documentsNeedRefresh,
  nextWaitDeadline,
  parseDocumentAnalysis,
} from "@/lib/documentAnalysis";

const stored: DocumentAiAnalysis = {
  documentType: "proposal",
  summary: "  Three-year livelihoods project in Hebron.  ",
  keyFindings: ["Targets 1,200 youth", "", "Baseline survey planned for Q1 2026"],
  indicatorsMentioned: ["% of youth employed six months after training"],
  targetsMentioned: [
    { indicator: "% of youth employed", target: "60%", timeline: "by end of 2027", verified: true },
    { indicator: "Women in cooperatives", target: "75%", timeline: "2027", verified: false },
  ],
  recommendations: ["Add sex disaggregation"],
  unverifiedFigures: ["1,200", "1,200", " 40% "],
  model: "claude-haiku-5-5",
  promptVersion: "document-analysis-v2",
  analysedAt: "2026-10-12T08:00:00.000Z",
};

/** A legacy analysis as the Phase 3 migration moved it into aiAnalysis (snake_case keys, no checks). */
const legacyJson = {
  documentType: "logframe",
  summary: "Legacy summary.",
  keyFindings: ["Finding A"],
  indicators_mentioned: ["Number of trainees"],
  targets_mentioned: [{ indicator: "Number of trainees", target: "500", timeline: "2025" }],
  recommendations: ["Define the denominator"],
};

describe("documentAnalysisOf", () => {
  it("reads Document.aiAnalysis and tidies it for display", () => {
    expect(documentAnalysisOf({ aiAnalysis: stored })).toEqual({
      documentType: "proposal",
      summary: "Three-year livelihoods project in Hebron.",
      keyFindings: ["Targets 1,200 youth", "Baseline survey planned for Q1 2026"],
      indicatorsMentioned: ["% of youth employed six months after training"],
      targetsMentioned: [
        { indicator: "% of youth employed", target: "60%", timeline: "by end of 2027", verified: true },
        { indicator: "Women in cooperatives", target: "75%", timeline: "2027", verified: false },
      ],
      recommendations: ["Add sex disaggregation"],
      unverifiedFigures: ["1,200", "40%"],
      model: "claude-haiku-5-5",
      promptVersion: "document-analysis-v2",
      analysedAt: "2026-10-12T08:00:00.000Z",
    });
  });

  it("reads legacy rows with snake_case keys; their targets are not verified", () => {
    expect(documentAnalysisOf({ aiAnalysis: legacyJson })).toEqual({
      documentType: "logframe",
      summary: "Legacy summary.",
      keyFindings: ["Finding A"],
      indicatorsMentioned: ["Number of trainees"],
      targetsMentioned: [{ indicator: "Number of trainees", target: "500", timeline: "2025", verified: false }],
      recommendations: ["Define the denominator"],
      unverifiedFigures: [],
      model: null,
      promptVersion: null,
      analysedAt: null,
    });
  });

  it("keeps numeric targets and timelines of legacy rows as written", () => {
    const view = documentAnalysisOf({
      aiAnalysis: { summary: "S", targets_mentioned: [{ indicator: "Number of trainees", target: 500, timeline: 2025 }, 1200, Number.NaN] },
    });
    expect(view?.targetsMentioned).toEqual([
      { indicator: "Number of trainees", target: "500", timeline: "2025", verified: false },
      { indicator: "", target: "1200", timeline: "", verified: false },
    ]);
  });

  it("treats a missing or non-boolean verified flag as not verified", () => {
    const view = documentAnalysisOf({
      aiAnalysis: {
        summary: "S",
        targetsMentioned: [
          { indicator: "A", target: "1", timeline: "" },
          { indicator: "B", target: "2", timeline: "", verified: "true" },
          { indicator: "C", target: "3", timeline: "", verified: 1 },
          { indicator: "D", target: "4", timeline: "", verified: true },
        ],
      },
    });
    expect(view?.targetsMentioned.map((t) => t.verified)).toEqual([false, false, false, true]);
  });

  it("has nothing to show for { legacyText } (an old answer that was not valid JSON)", () => {
    expect(documentAnalysisOf({ aiAnalysis: { legacyText: '{"summary": "cut off' } })).toBeNull();
  });

  it("returns null when there is no analysis at all, or it is malformed", () => {
    expect(documentAnalysisOf({})).toBeNull();
    expect(documentAnalysisOf({ aiAnalysis: null })).toBeNull();
    for (const bad of ["a string", 42, true, ["summary"], {}]) {
      expect(documentAnalysisOf({ aiAnalysis: bad })).toBeNull();
    }
  });
});

describe("parseDocumentAnalysis", () => {
  it("drops wrong-typed entries instead of failing", () => {
    const view = parseDocumentAnalysis({
      documentType: "memo",
      summary: 12,
      keyFindings: ["Kept", 3, null, "  "],
      indicatorsMentioned: "not a list",
      targetsMentioned: ["500 trainees", { indicator: "", target: "", timeline: "2026" }, { target: true }, null, { indicator: "Only indicator" }],
      recommendations: [{}],
      unverifiedFigures: "75%",
      model: "",
      analysedAt: "not a date",
    });
    expect(view).toEqual({
      documentType: null,
      summary: "12",
      keyFindings: ["Kept", "3"],
      indicatorsMentioned: [],
      targetsMentioned: [
        { indicator: "", target: "500 trainees", timeline: "", verified: false },
        { indicator: "Only indicator", target: "", timeline: "", verified: false },
      ],
      recommendations: [],
      unverifiedFigures: [],
      model: null,
      promptVersion: null,
      analysedAt: null,
    });
  });

  it("returns null when nothing is left to show", () => {
    expect(parseDocumentAnalysis({ documentType: "report", summary: " ", keyFindings: [], model: "m" })).toBeNull();
  });

  it("uses the camelCase key when both spellings are present, and snake_case when camelCase is null", () => {
    const view = parseDocumentAnalysis({
      summary: "x",
      indicatorsMentioned: ["camel"],
      indicators_mentioned: ["snake"],
      targetsMentioned: null,
      targets_mentioned: [{ indicator: "i", target: "t", timeline: "" }],
    });
    expect(view?.indicatorsMentioned).toEqual(["camel"]);
    expect(view?.targetsMentioned).toEqual([{ indicator: "i", target: "t", timeline: "", verified: false }]);
  });
});

describe("documentRowState", () => {
  const uploadedAt = "2026-10-12T08:00:00.000Z";
  const uploaded = Date.parse(uploadedAt);
  const doc = (overrides: Partial<ProjectDocument> = {}): ProjectDocument => ({
    id: "d1",
    projectId: "p1",
    fileName: "proposal.pdf",
    fileType: "proposal",
    fileSizeBytes: 1000,
    parsingStatus: "completed",
    uploadedAt,
    textLength: 5000,
    aiAnalysis: null,
    qualitativeSource: false,
    ...overrides,
  });
  const soon = uploaded + 30_000;
  const late = uploaded + DOCUMENT_WAIT_MS;

  it("waits for reading for at most DOCUMENT_WAIT_MS after upload, then reports it as stalled", () => {
    expect(documentRowState(doc({ parsingStatus: "pending", textLength: 0 }), soon)).toBe("pending");
    expect(documentRowState(doc({ parsingStatus: "processing", textLength: 0 }), soon)).toBe("processing");
    expect(documentRowState(doc({ parsingStatus: "pending" }), late)).toBe("stalled");
    // A document stuck in processing for a week (e.g. the API restarted mid-parse).
    expect(documentRowState(doc({ parsingStatus: "processing" }), uploaded + 7 * 24 * 3_600_000)).toBe("stalled");
    expect(documentRowState(doc({ parsingStatus: "processing", uploadedAt: "not a date" }), soon)).toBe("stalled");
  });

  it("reports a failed read", () => {
    expect(documentRowState(doc({ parsingStatus: "failed" }), soon)).toBe("failed");
  });

  it("does not wait for an analysis when the document has 50 characters of text or fewer", () => {
    expect(documentRowState(doc({ textLength: 0 }), soon)).toBe("noText");
    expect(documentRowState(doc({ textLength: ANALYSIS_MIN_TEXT_LENGTH }), soon)).toBe("noText");
    expect(documentRowState(doc({ textLength: ANALYSIS_MIN_TEXT_LENGTH + 1 }), soon)).toBe("analysing");
    // An older API without textLength: unknown, so the analysis may still come.
    expect(documentRowState(doc({ textLength: undefined }), soon)).toBe("analysing");
  });

  it("waits for the analysis of a processed document, then says there is none", () => {
    expect(documentRowState(doc(), soon)).toBe("analysing");
    expect(documentRowState(doc(), late - 1)).toBe("analysing");
    expect(documentRowState(doc(), late)).toBe("noAnalysis");
    expect(documentRowState(doc({ uploadedAt: "not a date" }), soon)).toBe("noAnalysis");
  });

  it("shows a stored analysis, and stops waiting for a stored value with nothing to show", () => {
    expect(documentRowState(doc({ aiAnalysis: stored }), soon)).toBe("analysed");
    expect(documentRowState(doc({ aiAnalysis: legacyJson }), late)).toBe("analysed");
    expect(documentRowState(doc({ aiAnalysis: { legacyText: "cut off" } }), soon)).toBe("noAnalysis");
  });

  it("never waits for the analysis of a qualitative transcript", () => {
    expect(documentRowState(doc({ qualitativeSource: true }), soon)).toBe("transcript");
    expect(documentRowState(doc({ qualitativeSource: true, textLength: 10 }), soon)).toBe("noText");
    expect(documentRowState(doc({ qualitativeSource: true, parsingStatus: "processing" }), soon)).toBe("processing");
  });
});

describe("refresh while a document is read or analysed", () => {
  const uploadedAt = "2026-10-12T08:00:00.000Z";
  const uploaded = Date.parse(uploadedAt);
  const doc = (overrides: Partial<ProjectDocument> = {}): ProjectDocument => ({
    id: "d1",
    projectId: "p1",
    fileName: "proposal.pdf",
    fileType: "proposal",
    fileSizeBytes: 1000,
    parsingStatus: "completed",
    uploadedAt,
    textLength: 5000,
    aiAnalysis: null,
    ...overrides,
  });
  const later = uploaded + DOCUMENT_WAIT_MS + 1;

  it("refreshes while any document is pending, processing or awaiting its analysis, within the wait", () => {
    expect(documentsNeedRefresh([], uploaded)).toBe(false);
    expect(documentsNeedRefresh([doc({ parsingStatus: "pending" })], uploaded + 5000)).toBe(true);
    expect(documentsNeedRefresh([doc({ parsingStatus: "processing" })], uploaded + 5000)).toBe(true);
    expect(documentsNeedRefresh([doc(), doc({ id: "d2", parsingStatus: "failed" })], uploaded + 5000)).toBe(true);
  });

  it("stops once nothing can change on its own", () => {
    expect(documentsNeedRefresh([doc({ parsingStatus: "pending" })], later)).toBe(false);
    expect(documentsNeedRefresh([doc({ parsingStatus: "processing" })], later)).toBe(false);
    expect(documentsNeedRefresh([doc()], later)).toBe(false);
    expect(documentsNeedRefresh([doc({ aiAnalysis: stored }), doc({ id: "d2", parsingStatus: "failed" })], uploaded + 5000)).toBe(false);
    expect(documentsNeedRefresh([doc({ textLength: 12 })], uploaded + 5000)).toBe(false);
    expect(documentsNeedRefresh([doc({ qualitativeSource: true })], uploaded + 5000)).toBe(false);
  });

  it("gives the time the next waiting row stops waiting", () => {
    const second = "2026-10-12T08:05:00.000Z";
    expect(nextWaitDeadline([doc({ aiAnalysis: stored })], uploaded)).toBeNull();
    expect(nextWaitDeadline([doc({ id: "d2", uploadedAt: second, parsingStatus: "processing" }), doc()], uploaded + 1000)).toBe(
      uploaded + DOCUMENT_WAIT_MS,
    );
    expect(nextWaitDeadline([doc({ id: "d2", uploadedAt: second }), doc()], uploaded + DOCUMENT_WAIT_MS)).toBe(
      Date.parse(second) + DOCUMENT_WAIT_MS,
    );
  });
});
