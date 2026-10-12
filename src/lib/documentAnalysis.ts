import type { DocumentAnalysisType, ProjectDocument } from "@/types/api";

/**
 * Reads a document's AI analysis for display and decides what each document row
 * shows while Raqib reads and analyses it. The analysis comes from
 * Document.aiAnalysis only: the API no longer returns the extracted text. Rows
 * the Phase 3 migration moved out of the old text keep their legacy shape
 * (snake_case keys indicators_mentioned and targets_mentioned, or
 * `{ legacyText }`, which has nothing to show).
 * Pure functions only: malformed values give null or are dropped, never thrown.
 */

export const DOCUMENT_ANALYSIS_TYPES: readonly DocumentAnalysisType[] = [
  "proposal",
  "logframe",
  "budget",
  "report",
  "guidelines",
  "other",
];

/** A target as the UI shows it. `verified` is true only when the backend found it in the document text. */
export interface TargetMentionView {
  indicator: string;
  target: string;
  timeline: string;
  verified: boolean;
}

/** The analysis as the UI shows it: every list present, unknown values null. */
export interface DocumentAnalysisView {
  documentType: DocumentAnalysisType | null;
  summary: string;
  keyFindings: string[];
  indicatorsMentioned: string[];
  targetsMentioned: TargetMentionView[];
  recommendations: string[];
  /** Numbers in the summary and key findings that the document text does not contain ([] for older rows). */
  unverifiedFigures: string[];
  /** Served model id; null for legacy rows. */
  model: string | null;
  promptVersion: string | null;
  /** ISO date-time; null for legacy rows. */
  analysedAt: string | null;
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Trimmed text; legacy answers sometimes stored targets and years as JSON numbers, which are kept as written. */
const text = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const textList = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

/** The first of `keys` with a value (camelCase first, then the legacy snake_case spelling). */
const pick = (obj: JsonObject, ...keys: string[]): unknown =>
  keys.map((key) => obj[key]).find((value) => value !== undefined && value !== null);

function targetList(value: unknown): TargetMentionView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TargetMentionView[] => {
    // Legacy answers sometimes listed targets as plain strings (or numbers); none of them was checked.
    if (typeof item === "string" || typeof item === "number") {
      const target = text(item);
      return target ? [{ indicator: "", target, timeline: "", verified: false }] : [];
    }
    if (!isObject(item)) return [];
    const mention = {
      indicator: text(item.indicator),
      target: text(item.target),
      timeline: text(item.timeline),
      // Only an explicit true counts: rows analysed before the check have no flag.
      verified: item.verified === true,
    };
    return mention.indicator || mention.target ? [mention] : [];
  });
}

function isoDateTime(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

/**
 * The analysis from a stored JSON value (either spelling of the keys), or null
 * when it is not an object or holds nothing to show (e.g. `{ legacyText }`).
 */
export function parseDocumentAnalysis(value: unknown): DocumentAnalysisView | null {
  if (!isObject(value)) return null;
  const documentType = pick(value, "documentType", "document_type");
  const view: DocumentAnalysisView = {
    documentType: DOCUMENT_ANALYSIS_TYPES.find((type) => type === documentType) ?? null,
    summary: text(value.summary),
    keyFindings: textList(pick(value, "keyFindings", "key_findings")),
    indicatorsMentioned: textList(pick(value, "indicatorsMentioned", "indicators_mentioned")),
    targetsMentioned: targetList(pick(value, "targetsMentioned", "targets_mentioned")),
    recommendations: textList(value.recommendations),
    unverifiedFigures: [...new Set(textList(value.unverifiedFigures))],
    model: text(value.model) || null,
    promptVersion: text(pick(value, "promptVersion", "prompt_version")) || null,
    analysedAt: isoDateTime(pick(value, "analysedAt", "analyzedAt")),
  };
  const hasContent =
    view.summary !== "" ||
    view.keyFindings.length > 0 ||
    view.indicatorsMentioned.length > 0 ||
    view.targetsMentioned.length > 0 ||
    view.recommendations.length > 0;
  return hasContent ? view : null;
}

/** A document's AI analysis from Document.aiAnalysis; null when there is none or nothing to show. */
export function documentAnalysisOf(doc: { aiAnalysis?: unknown }): DocumentAnalysisView | null {
  return parseDocumentAnalysis(doc.aiAnalysis);
}

/**
 * The backend analyses a document only when its extracted text is longer than
 * this many characters (raqib-backend documentParser MIN_TEXT_FOR_ANALYSIS).
 */
export const ANALYSIS_MIN_TEXT_LENGTH = 50;

/**
 * How long after upload Raqib may still be reading a document or preparing its
 * analysis. Reading runs inside the API and the analysis follows it, so a restart
 * can leave a document "processing", and some documents never get an analysis
 * (an AI failure): after this the row stops waiting and the list stops refreshing.
 */
export const DOCUMENT_WAIT_MS = 15 * 60_000;

/**
 * What a document row shows:
 * - pending, processing: Raqib is reading the file (within DOCUMENT_WAIT_MS of the upload);
 * - stalled: still pending or processing after that ("taking longer than expected");
 * - failed: the file could not be read;
 * - noText: read, but 50 characters of text or fewer, so it is never analysed;
 * - transcript: an FGD/KII transcript from the qualitative upload, which is never analysed here;
 * - analysing: read, the analysis may still arrive (within DOCUMENT_WAIT_MS);
 * - noAnalysis: read, but no analysis to show (it failed, or the stored one has nothing to show);
 * - analysed: the analysis is there.
 */
export type DocumentRowState =
  | "pending"
  | "processing"
  | "stalled"
  | "failed"
  | "noText"
  | "transcript"
  | "analysing"
  | "noAnalysis"
  | "analysed";

type DocumentState = Pick<ProjectDocument, "parsingStatus" | "uploadedAt"> &
  Partial<Pick<ProjectDocument, "textLength" | "qualitativeSource">> & { aiAnalysis?: unknown };

/** True while less than DOCUMENT_WAIT_MS has passed since the upload (false for an unreadable date). */
function withinWait(doc: DocumentState, now: number): boolean {
  const uploaded = Date.parse(doc.uploadedAt);
  return !Number.isNaN(uploaded) && now - uploaded < DOCUMENT_WAIT_MS;
}

/** The row state of a document at `now` (a timestamp in ms). */
export function documentRowState(doc: DocumentState, now: number): DocumentRowState {
  switch (doc.parsingStatus) {
    case "failed":
      return "failed";
    case "pending":
    case "processing":
      return withinWait(doc, now) ? doc.parsingStatus : "stalled";
    case "completed":
      break;
    default:
      return withinWait(doc, now) ? "pending" : "stalled";
  }
  if (documentAnalysisOf(doc)) return "analysed";
  // A missing textLength (an older API) is unknown, not "no text".
  if (typeof doc.textLength === "number" && doc.textLength <= ANALYSIS_MIN_TEXT_LENGTH) return "noText";
  if (doc.qualitativeSource) return "transcript";
  // Any stored value means the analysis step has finished (a legacy row, or one with nothing to show).
  if (doc.aiAnalysis !== null && doc.aiAnalysis !== undefined) return "noAnalysis";
  return withinWait(doc, now) ? "analysing" : "noAnalysis";
}

/** States that change on their own, so the list refreshes while a row is in one. */
const WAITING_STATES: ReadonlySet<DocumentRowState> = new Set(["pending", "processing", "analysing"]);

/** True while the document list should refresh on its own: a file is being read or awaits its analysis. */
export function documentsNeedRefresh(docs: readonly DocumentState[], now: number): boolean {
  return docs.some((doc) => WAITING_STATES.has(documentRowState(doc, now)));
}

/**
 * When the next row stops waiting (upload + DOCUMENT_WAIT_MS), so the screen can
 * update without a refetch; null when no row is waiting.
 */
export function nextWaitDeadline(docs: readonly DocumentState[], now: number): number | null {
  const deadlines = docs
    .filter((doc) => WAITING_STATES.has(documentRowState(doc, now)))
    .map((doc) => Date.parse(doc.uploadedAt) + DOCUMENT_WAIT_MS);
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}
