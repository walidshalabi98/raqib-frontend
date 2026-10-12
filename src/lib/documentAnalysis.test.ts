import { describe, expect, it } from "vitest";
import type { DocumentAiAnalysis, ProjectDocument } from "@/types/api";
import {
  ANALYSIS_WAIT_MS,
  LEGACY_ANALYSIS_MARKER,
  documentAnalysisOf,
  documentsNeedRefresh,
  isAnalysisPending,
  legacyAnalysisJson,
  parseDocumentAnalysis,
} from "@/lib/documentAnalysis";

const stored: DocumentAiAnalysis = {
  documentType: "proposal",
  summary: "  Three-year livelihoods project in Hebron.  ",
  keyFindings: ["Targets 1,200 youth", "", "Baseline survey planned for Q1 2026"],
  indicatorsMentioned: ["% of youth employed six months after training"],
  targetsMentioned: [{ indicator: "% of youth employed", target: "60%", timeline: "by end of 2027" }],
  recommendations: ["Add sex disaggregation"],
  model: "claude-haiku-5-5",
  promptVersion: "document-analysis-v2",
  analysedAt: "2026-10-12T08:00:00.000Z",
};

const legacyJson = {
  documentType: "logframe",
  summary: "Legacy summary.",
  keyFindings: ["Finding A"],
  indicators_mentioned: ["Number of trainees"],
  targets_mentioned: [{ indicator: "Number of trainees", target: "500", timeline: "2025" }],
  recommendations: ["Define the denominator"],
};

const legacyText = (json: string) => `Extracted text of the logframe.\n\n${LEGACY_ANALYSIS_MARKER}\n${json}`;

describe("documentAnalysisOf", () => {
  it("reads Document.aiAnalysis and tidies it for display", () => {
    const view = documentAnalysisOf({ aiAnalysis: stored, parsedText: "Plain text" });
    expect(view).toEqual({
      documentType: "proposal",
      summary: "Three-year livelihoods project in Hebron.",
      keyFindings: ["Targets 1,200 youth", "Baseline survey planned for Q1 2026"],
      indicatorsMentioned: ["% of youth employed six months after training"],
      targetsMentioned: [{ indicator: "% of youth employed", target: "60%", timeline: "by end of 2027" }],
      recommendations: ["Add sex disaggregation"],
      model: "claude-haiku-5-5",
      promptVersion: "document-analysis-v2",
      analysedAt: "2026-10-12T08:00:00.000Z",
      source: "aiAnalysis",
    });
  });

  it("prefers aiAnalysis over a legacy marker in parsedText", () => {
    const view = documentAnalysisOf({ aiAnalysis: stored, parsedText: legacyText(JSON.stringify(legacyJson)) });
    expect(view?.source).toBe("aiAnalysis");
    expect(view?.summary).toBe("Three-year livelihoods project in Hebron.");
  });

  it("falls back to the legacy marker with snake_case keys", () => {
    const view = documentAnalysisOf({ aiAnalysis: null, parsedText: legacyText(JSON.stringify(legacyJson)) });
    expect(view).toEqual({
      documentType: "logframe",
      summary: "Legacy summary.",
      keyFindings: ["Finding A"],
      indicatorsMentioned: ["Number of trainees"],
      targetsMentioned: [{ indicator: "Number of trainees", target: "500", timeline: "2025" }],
      recommendations: ["Define the denominator"],
      model: null,
      promptVersion: null,
      analysedAt: null,
      source: "legacy",
    });
  });

  it("accepts camelCase keys in legacy rows, and a marker at the very start", () => {
    const json = JSON.stringify({ summary: "S", indicatorsMentioned: ["I"], targetsMentioned: [] });
    const view = documentAnalysisOf({ parsedText: `${LEGACY_ANALYSIS_MARKER}\n${json}` });
    expect(view?.summary).toBe("S");
    expect(view?.indicatorsMentioned).toEqual(["I"]);
  });

  it("reads the last marker when the document text itself contains one", () => {
    const text = `Notes mention ${LEGACY_ANALYSIS_MARKER} in passing.\n\n${LEGACY_ANALYSIS_MARKER}\n${JSON.stringify({ summary: "Real" })}`;
    expect(documentAnalysisOf({ parsedText: text })?.summary).toBe("Real");
  });

  it("returns null for invalid legacy JSON", () => {
    expect(documentAnalysisOf({ parsedText: legacyText("{ not json") })).toBeNull();
    expect(documentAnalysisOf({ parsedText: legacyText("```json\n{\"summary\":\"x\"}\n```") })).toBeNull();
    expect(documentAnalysisOf({ parsedText: legacyText("") })).toBeNull();
  });

  it("returns null when there is no analysis at all", () => {
    expect(documentAnalysisOf({})).toBeNull();
    expect(documentAnalysisOf({ aiAnalysis: null, parsedText: null })).toBeNull();
    expect(documentAnalysisOf({ aiAnalysis: undefined, parsedText: "Text without any analysis" })).toBeNull();
  });

  it("ignores malformed aiAnalysis values and falls back to legacy", () => {
    for (const bad of ["a string", 42, true, ["summary"], {}]) {
      expect(documentAnalysisOf({ aiAnalysis: bad })).toBeNull();
    }
    const view = documentAnalysisOf({ aiAnalysis: "oops", parsedText: legacyText(JSON.stringify(legacyJson)) });
    expect(view?.source).toBe("legacy");
  });
});

describe("parseDocumentAnalysis", () => {
  it("drops wrong-typed entries instead of failing", () => {
    const view = parseDocumentAnalysis(
      {
        documentType: "memo",
        summary: 12,
        keyFindings: ["Kept", 3, null, "  "],
        indicatorsMentioned: "not a list",
        targetsMentioned: ["500 trainees", { indicator: "", target: "", timeline: "2026" }, { target: 7 }, null, { indicator: "Only indicator" }],
        recommendations: [{}],
        model: "",
        analysedAt: "not a date",
      },
      "aiAnalysis",
    );
    expect(view).toEqual({
      documentType: null,
      summary: "",
      keyFindings: ["Kept"],
      indicatorsMentioned: [],
      targetsMentioned: [
        { indicator: "", target: "500 trainees", timeline: "" },
        { indicator: "Only indicator", target: "", timeline: "" },
      ],
      recommendations: [],
      model: null,
      promptVersion: null,
      analysedAt: null,
      source: "aiAnalysis",
    });
  });

  it("returns null when nothing is left to show", () => {
    expect(parseDocumentAnalysis({ documentType: "report", summary: " ", keyFindings: [], model: "m" }, "aiAnalysis")).toBeNull();
  });

  it("uses the camelCase key when both spellings are present, and snake_case when camelCase is null", () => {
    const view = parseDocumentAnalysis(
      { summary: "x", indicatorsMentioned: ["camel"], indicators_mentioned: ["snake"], targetsMentioned: null, targets_mentioned: [{ indicator: "i", target: "t", timeline: "" }] },
      "legacy",
    );
    expect(view?.indicatorsMentioned).toEqual(["camel"]);
    expect(view?.targetsMentioned).toEqual([{ indicator: "i", target: "t", timeline: "" }]);
  });
});

describe("legacyAnalysisJson", () => {
  it("returns the parsed JSON after the marker, or undefined", () => {
    expect(legacyAnalysisJson(legacyText('{"summary":"x"}'))).toEqual({ summary: "x" });
    expect(legacyAnalysisJson("no marker here")).toBeUndefined();
    expect(legacyAnalysisJson(undefined)).toBeUndefined();
    expect(legacyAnalysisJson(legacyText("{broken"))).toBeUndefined();
  });
});

describe("refresh while the analysis may still arrive", () => {
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
    parsedText: "Text",
    aiAnalysis: null,
    ...overrides,
  });

  it("waits for the analysis of a recently processed document", () => {
    expect(isAnalysisPending(doc(), uploaded + 30_000)).toBe(true);
    expect(isAnalysisPending(doc(), uploaded + ANALYSIS_WAIT_MS)).toBe(false);
  });

  it("does not wait once the analysis is there, or for documents that are not processed", () => {
    expect(isAnalysisPending(doc({ aiAnalysis: stored }), uploaded + 1000)).toBe(false);
    expect(isAnalysisPending(doc({ aiAnalysis: null, parsedText: legacyText(JSON.stringify(legacyJson)) }), uploaded + 1000)).toBe(false);
    expect(isAnalysisPending(doc({ parsingStatus: "failed" }), uploaded + 1000)).toBe(false);
    expect(isAnalysisPending(doc({ uploadedAt: "not a date" }), uploaded + 1000)).toBe(false);
  });

  it("refreshes while any document is pending, processing or awaiting its analysis", () => {
    const later = uploaded + ANALYSIS_WAIT_MS + 1;
    expect(documentsNeedRefresh([], later)).toBe(false);
    expect(documentsNeedRefresh([doc({ parsingStatus: "pending" })], later)).toBe(true);
    expect(documentsNeedRefresh([doc({ parsingStatus: "processing" })], later)).toBe(true);
    expect(documentsNeedRefresh([doc(), doc({ id: "d2", parsingStatus: "failed" })], uploaded + 5000)).toBe(true);
    expect(documentsNeedRefresh([doc(), doc({ id: "d2", aiAnalysis: stored })], later)).toBe(false);
  });
});
