import type { DocumentAnalysisType, DocumentTargetMention, ProjectDocument } from "@/types/api";

/**
 * Reads a document's AI analysis for display. Since Phase 3 the backend stores
 * it in Document.aiAnalysis; older rows hold it in parsedText after the marker
 * below, with the snake_case keys indicators_mentioned and targets_mentioned.
 * Pure functions only: malformed values give null or are dropped, never thrown.
 */

export const LEGACY_ANALYSIS_MARKER = "---AI_ANALYSIS---";

export const DOCUMENT_ANALYSIS_TYPES: readonly DocumentAnalysisType[] = [
  "proposal",
  "logframe",
  "budget",
  "report",
  "guidelines",
  "other",
];

/** The analysis as the UI shows it: every list present, unknown values null. */
export interface DocumentAnalysisView {
  documentType: DocumentAnalysisType | null;
  summary: string;
  keyFindings: string[];
  indicatorsMentioned: string[];
  targetsMentioned: DocumentTargetMention[];
  recommendations: string[];
  /** Served model id; null for legacy rows. */
  model: string | null;
  promptVersion: string | null;
  /** ISO date-time; null for legacy rows. */
  analysedAt: string | null;
  /** Where it was read from: Document.aiAnalysis, or the legacy marker in parsedText. */
  source: "aiAnalysis" | "legacy";
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const textList = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

/** The first of `keys` with a value (camelCase first, then the legacy snake_case spelling). */
const pick = (obj: JsonObject, ...keys: string[]): unknown =>
  keys.map((key) => obj[key]).find((value) => value !== undefined && value !== null);

function targetList(value: unknown): DocumentTargetMention[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): DocumentTargetMention[] => {
    // Legacy answers sometimes listed targets as plain strings.
    if (typeof item === "string") {
      const target = item.trim();
      return target ? [{ indicator: "", target, timeline: "" }] : [];
    }
    if (!isObject(item)) return [];
    const mention = { indicator: text(item.indicator), target: text(item.target), timeline: text(item.timeline) };
    return mention.indicator || mention.target ? [mention] : [];
  });
}

function isoDateTime(value: unknown): string | null {
  const raw = text(value);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

/**
 * The analysis from a stored JSON value (either spelling of the keys), or null
 * when it is not an object or holds nothing to show.
 */
export function parseDocumentAnalysis(value: unknown, source: DocumentAnalysisView["source"]): DocumentAnalysisView | null {
  if (!isObject(value)) return null;
  const documentType = pick(value, "documentType", "document_type");
  const view: DocumentAnalysisView = {
    documentType: DOCUMENT_ANALYSIS_TYPES.find((type) => type === documentType) ?? null,
    summary: text(value.summary),
    keyFindings: textList(pick(value, "keyFindings", "key_findings")),
    indicatorsMentioned: textList(pick(value, "indicatorsMentioned", "indicators_mentioned")),
    targetsMentioned: targetList(pick(value, "targetsMentioned", "targets_mentioned")),
    recommendations: textList(value.recommendations),
    model: text(value.model) || null,
    promptVersion: text(pick(value, "promptVersion", "prompt_version")) || null,
    analysedAt: isoDateTime(pick(value, "analysedAt", "analyzedAt")),
    source,
  };
  const hasContent =
    view.summary !== "" ||
    view.keyFindings.length > 0 ||
    view.indicatorsMentioned.length > 0 ||
    view.targetsMentioned.length > 0 ||
    view.recommendations.length > 0;
  return hasContent ? view : null;
}

/**
 * The JSON a legacy row appended to parsedText after LEGACY_ANALYSIS_MARKER
 * (the last marker, since the analysis was appended at the end), or undefined
 * when there is no marker or the JSON does not parse.
 */
export function legacyAnalysisJson(parsedText: string | null | undefined): unknown {
  if (typeof parsedText !== "string") return undefined;
  const index = parsedText.lastIndexOf(LEGACY_ANALYSIS_MARKER);
  if (index === -1) return undefined;
  const raw = parsedText.slice(index + LEGACY_ANALYSIS_MARKER.length).trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** A document's AI analysis: Document.aiAnalysis first, then the legacy marker in parsedText; null when neither is usable. */
export function documentAnalysisOf(doc: { aiAnalysis?: unknown; parsedText?: string | null }): DocumentAnalysisView | null {
  return parseDocumentAnalysis(doc.aiAnalysis, "aiAnalysis") ?? parseDocumentAnalysis(legacyAnalysisJson(doc.parsedText), "legacy");
}

/**
 * How long after upload a processed document without an analysis may still get
 * one. The parser marks the document completed first and stores the analysis
 * when the model answers; documents it does not analyse (very short text, or an
 * AI failure) never get one, so the wait is bounded.
 */
export const ANALYSIS_WAIT_MS = 10 * 60_000;

type DocumentState = Pick<ProjectDocument, "parsingStatus" | "uploadedAt" | "parsedText"> & { aiAnalysis?: unknown };

/** True while the AI analysis of a processed document may still arrive. `now` is a timestamp in ms. */
export function isAnalysisPending(doc: DocumentState, now: number): boolean {
  if (doc.parsingStatus !== "completed" || documentAnalysisOf(doc)) return false;
  const uploaded = Date.parse(doc.uploadedAt);
  return !Number.isNaN(uploaded) && now - uploaded < ANALYSIS_WAIT_MS;
}

/** True while the document list should refresh on its own: a file is waiting, being read, or awaiting its analysis. */
export function documentsNeedRefresh(docs: readonly DocumentState[], now: number): boolean {
  return docs.some(
    (doc) => doc.parsingStatus === "pending" || doc.parsingStatus === "processing" || isAnalysisPending(doc, now),
  );
}
