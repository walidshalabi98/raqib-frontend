import type { TFunction } from "i18next";
import { ApiError, httpStatusOf } from "@/lib/apiError";
import { KPI_ERROR_CODES_SHOWN, KPI_RUN_STEPS_SHOWN, SUGGESTABLE_LEVELS, type KpiShownErrorCode } from "@/lib/constants";
import type {
  AcceptKpiSuggestionResponse,
  KpiRun,
  KpiRunStep,
  KpiSuggestion,
  KpiSuggestionList,
  KpiWarning,
  QualityBand,
  RequestKpiSuggestionsBody,
  ResultNode,
  SuggestableLevel,
  SuggestionRejectReason,
} from "@/types/api";

/**
 * Pure helpers of the KPI Assistant UI (knowledge/kpi-assistant-spec.md §A2, §A4–A7; design sections 7.4, 9.2–9.4).
 * No React and no API calls, so every rule here has a unit test (src/lib/kpiSuggestions.test.ts).
 */

// ------------------------------------------------------------------ quality

/** Score thresholds of the quality badge (spec §A4 step 3; mirror of the backend QUALITY_THRESHOLDS). */
export const QUALITY_THRESHOLDS = { strong: 85, review: 65 } as const;

/** Quality band of a score (spec §A4 step 3): ≥ 85 strong, 65–84 review, < 65 weak. */
export function qualityBand(score: number): QualityBand {
  if (score >= QUALITY_THRESHOLDS.strong) return "strong";
  if (score >= QUALITY_THRESHOLDS.review) return "review";
  return "weak";
}

// --------------------------------------------------------------------- levels
// Who may use the KPI Assistant is the "ai.run" capability of src/lib/permissions.ts (usePermissions().can("ai.run")),
// the mirror of the backend KPI_ROLES = STAFF_ROLES: donor viewers never see raw suggestions (spec §A1).

/** Whether Raqib suggests indicators for a result of this level (spec §A2: impact, outcome and output; never activities). */
export function isSuggestableLevel(level: string | null | undefined): level is SuggestableLevel {
  return typeof level === "string" && (SUGGESTABLE_LEVELS as readonly string[]).includes(level);
}

// ------------------------------------------------------------------- polling

/** How long a result or alternatives run is polled before "taking longer" + Refresh (design 7.4). */
export const KPI_RESULT_POLL_CAP_MS = 2 * 60_000;
/** How long a framework run is polled before "taking longer" + Refresh (design 7.4). */
export const KPI_FRAMEWORK_POLL_CAP_MS = 10 * 60_000;

type RunTiming = Pick<KpiRun, "status" | "scope" | "createdAt">;

function toMs(now: Date | number): number {
  return typeof now === "number" ? now : now.getTime();
}

/** Milliseconds since the run was created (0 when the date is unreadable or in the future, e.g. clock skew). */
export function runElapsedMs(run: Pick<KpiRun, "createdAt">, now: Date | number): number {
  const created = Date.parse(run.createdAt);
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, toMs(now) - created);
}

/**
 * Whether a run should still be polled (design 7.4): it is running and less than 2 minutes old (result and
 * alternatives scope) or 10 minutes old (framework scope), counted from `createdAt`. After that the UI shows
 * "taking longer" with Refresh.
 */
export function kpiRunNeedsRefresh(run: RunTiming, now: Date | number): boolean {
  if (run.status !== "running") return false;
  const cap = run.scope === "framework" ? KPI_FRAMEWORK_POLL_CAP_MS : KPI_RESULT_POLL_CAP_MS;
  return runElapsedMs(run, now) < cap;
}

/**
 * Poll interval for a run (design 7.4 back-off): every 2 s (result, alternatives) or 3 s (framework) for the first
 * 20 s, then every 5 s, then every 10 s after one minute; `false` once kpiRunNeedsRefresh is false (finished, or past
 * the cap).
 */
export function kpiPollInterval(run: RunTiming, now: Date | number): number | false {
  if (!kpiRunNeedsRefresh(run, now)) return false;
  const elapsed = runElapsedMs(run, now);
  if (elapsed < 20_000) return run.scope === "framework" ? 3_000 : 2_000;
  if (elapsed < 60_000) return 5_000;
  return 10_000;
}

/**
 * The step shown while the synchronous POST of a result or alternatives request is still waiting (no run id yet;
 * design 9.4): context for the first 1.5 s, retrieval until 4 s, then model — never a later step while waiting,
 * because validation only starts once the model has answered.
 */
export function progressStepAt(elapsedMs: number): Extract<KpiRunStep, "context" | "retrieval" | "model"> {
  if (elapsedMs < 1_500) return "context";
  if (elapsedMs < 4_000) return "retrieval";
  return "model";
}

/**
 * Position of a run step among the named progress steps (design 9.4: context, retrieval, model, validation); saving
 * and done are past the last shown step, so every step shows done.
 */
export function shownStepIndex(step: KpiRunStep): number {
  const index = (KPI_RUN_STEPS_SHOWN as readonly string[]).indexOf(step);
  return index >= 0 ? index : KPI_RUN_STEPS_SHOWN.length;
}

// ------------------------------------------------------------------ grouping

/** A suggestion card and the alternatives requested for it (design 9.1: alternatives nest under their source). */
export interface SuggestionItem {
  suggestion: KpiSuggestion;
  alternatives: KpiSuggestion[];
}

/** Alternatives whose source is not a card in the list: an existing indicator, or a suggestion no longer listed. */
export interface AlternativesGroup {
  source: { kind: "indicator" | "suggestion"; id: string };
  suggestions: KpiSuggestion[];
}

/** One result's suggestions, in list order. */
export interface ResultSuggestionGroup {
  resultId: string;
  items: SuggestionItem[];
  alternativeGroups: AlternativesGroup[];
}

/** List order within a result: oldest run first, then rank (the API's order; design 7.1), then id. */
function compareSuggestions(a: KpiSuggestion, b: KpiSuggestion): number {
  const byCreated = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (byCreated) return byCreated;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id.localeCompare(b.id);
}

/**
 * Groups suggestions by result (design 9.2): drops suggestions whose result is unknown (deleted, or not in `nodes`)
 * and repeated ids (the first is kept); nests alternatives of a suggestion under that suggestion's card when it is in
 * the list, else in an alternatives group of their source (an indicator, or a suggestion that is not listed). Each
 * result's cards and alternatives are ordered as the API orders them (run, then rank).
 */
export function groupSuggestions(
  suggestions: readonly KpiSuggestion[],
  nodes: readonly Pick<ResultNode, "id">[],
): Map<string, ResultSuggestionGroup> {
  const known = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const usable = suggestions.filter((s) => {
    if (!s.resultId || !known.has(s.resultId) || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  const sorted = [...usable].sort(compareSuggestions);
  const isAlternative = (s: KpiSuggestion) => Boolean(s.alternativeOfSuggestionId || s.alternativeOfIndicatorId);

  const groups = new Map<string, ResultSuggestionGroup>();
  const groupOf = (resultId: string) => {
    let group = groups.get(resultId);
    if (!group) {
      group = { resultId, items: [], alternativeGroups: [] };
      groups.set(resultId, group);
    }
    return group;
  };
  const itemById = new Map<string, SuggestionItem>();
  for (const s of sorted) {
    if (isAlternative(s)) continue;
    const item: SuggestionItem = { suggestion: s, alternatives: [] };
    itemById.set(s.id, item);
    groupOf(s.resultId as string).items.push(item);
  }
  for (const s of sorted) {
    if (!isAlternative(s)) continue;
    const group = groupOf(s.resultId as string);
    const sourceItem = s.alternativeOfSuggestionId ? itemById.get(s.alternativeOfSuggestionId) : undefined;
    if (sourceItem && sourceItem.suggestion.resultId === s.resultId) {
      sourceItem.alternatives.push(s);
      continue;
    }
    const source = s.alternativeOfSuggestionId
      ? { kind: "suggestion" as const, id: s.alternativeOfSuggestionId }
      : { kind: "indicator" as const, id: s.alternativeOfIndicatorId as string };
    const existing = group.alternativeGroups.find((g) => g.source.kind === source.kind && g.source.id === source.id);
    if (existing) existing.suggestions.push(s);
    else group.alternativeGroups.push({ source, suggestions: [s] });
  }
  return groups;
}

/** Ids of a result's cards in reading order (cards, their alternatives, then the alternatives groups), for focus moves. */
export function suggestionReadingOrder(group: ResultSuggestionGroup | undefined): string[] {
  if (!group) return [];
  return [
    ...group.items.flatMap((item) => [item.suggestion.id, ...item.alternatives.map((a) => a.id)]),
    ...group.alternativeGroups.flatMap((g) => g.suggestions.map((s) => s.id)),
  ];
}

/**
 * Where focus goes after a card is decided (design 9.4): the next card in reading order, else the previous one
 * (nearest first); the caller falls back to the result's Suggest KPIs button when none is left.
 */
export function focusCandidates(order: readonly string[], decidedId: string): string[] {
  const index = order.indexOf(decidedId);
  if (index < 0) return [...order];
  return [...order.slice(index + 1), ...order.slice(0, index).reverse()];
}

// ---------------------------------------------------------- list cache merges

const isAlternativeSuggestion = (s: KpiSuggestion) => Boolean(s.alternativeOfSuggestionId || s.alternativeOfIndicatorId);

/**
 * The project's suggestion list after a run finished (200 answer or the last poll), before the list is fetched again
 * (design 4.5): adds the run's pending suggestions and, like the server, drops older pending cards of each result that
 * received new suggestions (result and framework runs only; alternatives are never replaced). The run leaves
 * `activeRuns`; a framework run becomes `latestFrameworkRun`. A list of another framework version is returned unchanged.
 */
export function mergeRunIntoList(
  list: KpiSuggestionList | undefined,
  run: KpiRun,
  suggestions: readonly KpiSuggestion[],
): KpiSuggestionList | undefined {
  if (!list) return list;
  if (list.frameworkId && list.frameworkId !== run.frameworkId) return list;
  const fresh = suggestions.filter((s) => s.status === "pending" && s.resultId !== null);
  const freshIds = new Set(fresh.map((s) => s.id));
  const refreshed = new Set(run.scope === "alternatives" ? [] : fresh.map((s) => s.resultId));
  const createdAt = Date.parse(run.createdAt);
  const kept = list.suggestions.filter((s) => {
    if (freshIds.has(s.id)) return false;
    const replaced = s.status === "pending" && refreshed.has(s.resultId) && !isAlternativeSuggestion(s)
      && Date.parse(s.createdAt) < createdAt;
    return !replaced;
  });
  return {
    ...list,
    frameworkId: list.frameworkId ?? run.frameworkId,
    suggestions: [...kept, ...fresh],
    activeRuns: list.activeRuns.filter((r) => r.id !== run.id),
    latestFrameworkRun: run.scope === "framework" ? run : list.latestFrameworkRun,
  };
}

/** The list without one suggestion (after accept or reject, until the list is fetched again). */
export function withoutSuggestion(list: KpiSuggestionList | undefined, suggestionId: string): KpiSuggestionList | undefined {
  if (!list) return list;
  return { ...list, suggestions: list.suggestions.filter((s) => s.id !== suggestionId) };
}

// ------------------------------------------------------------------ requests

/** Tracking key of a run: the framework, or the result a result or alternatives run is about (design 7.2 conflicts). */
export function runTargetKey(run: Pick<KpiRun, "scope" | "resultId" | "sourceIndicatorId">): string {
  if (run.scope === "framework") return "framework";
  if (run.resultId) return `result:${run.resultId}`;
  return `indicator:${run.sourceIndicatorId ?? "unknown"}`;
}

/** The request that repeats a run (Retry and "Suggest again"). */
export function bodyForRun(run: Pick<KpiRun, "scope" | "resultId" | "sourceIndicatorId" | "sourceSuggestionId">): RequestKpiSuggestionsBody | null {
  if (run.scope === "framework") return { scope: "framework" };
  if (run.scope === "result") return run.resultId ? { scope: "result", resultId: run.resultId } : null;
  if (run.sourceSuggestionId) return { scope: "alternatives", suggestionId: run.sourceSuggestionId };
  if (run.sourceIndicatorId) return { scope: "alternatives", indicatorId: run.sourceIndicatorId };
  return null;
}

// -------------------------------------------------------------------- reject

/** What a rejection excludes, mirror of the backend REJECTION_SCOPE (design D9 and 8.3). */
export const REJECTION_SCOPE: Readonly<Record<SuggestionRejectReason, "organisation" | "donor" | "project">> = {
  not_relevant: "organisation",
  too_costly_to_measure: "organisation",
  other: "organisation",
  donor_not_required: "donor",
  duplicate: "project",
  wording: "project",
};

/** Who stops getting a rejected library indicator suggested (design D9); `custom`: nothing is excluded. */
export type RejectEffect = "organisation" | "donor" | "project" | "custom";

/**
 * The consequence of rejecting a suggestion for a reason (design D8/D9, 9.4): a library indicator is no longer
 * suggested to the organisation, to projects with the same donor type, or to this project (REJECTION_SCOPE); a custom
 * indicator (no library id) excludes nothing, the reason only informs later suggestions.
 */
export function rejectEffect(reason: SuggestionRejectReason, hasLibraryId: boolean): RejectEffect {
  return hasLibraryId ? REJECTION_SCOPE[reason] : "custom";
}

/** i18n keys of the consequence line(s): the effect, plus the Edit & accept hint for `wording`. */
export function rejectEffectKeys(reason: SuggestionRejectReason, hasLibraryId: boolean): string[] {
  const keys = [`kpi.reject.effect.${rejectEffect(reason, hasLibraryId)}`];
  if (reason === "wording") keys.push("kpi.reject.effect.wordingHint");
  return keys;
}

// ------------------------------------------------------------- texts, errors

/**
 * A validation note in the UI language (design 9.2, 9.6): `kpi.warnings.<code>` with the note's params, the level
 * translated, and the English message as the fallback (a code the frontend does not know yet).
 */
export function warningText(t: TFunction, warning: KpiWarning): string {
  const params = warning.params ?? {};
  const level = typeof params.level === "string" ? t(`level.${params.level}`, { defaultValue: params.level }) : undefined;
  return t(`kpi.warnings.${warning.code}`, {
    ...params,
    ...(level !== undefined && { level }),
    defaultValue: warning.message,
  }) as string;
}

/**
 * The error code the UI shows for a failed KPI request (design 9.2): the API's `code` when the UI knows it
 * (KPI_ERROR_CODES_SHOWN, e.g. budget_reached, nothing_to_suggest, too_many_results, project_archived, duplicate),
 * else 429 → rate_limited, 503 → ai_not_configured, anything else → internal. Raw codes are never shown.
 */
export function requestErrorCode(err: unknown): KpiShownErrorCode {
  const code = err instanceof ApiError ? err.code : (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && (KPI_ERROR_CODES_SHOWN as readonly string[]).includes(code)) return code as KpiShownErrorCode;
  const status = httpStatusOf(err);
  if (status === 429) return "rate_limited";
  if (status === 503) return "ai_not_configured";
  return "internal";
}

/** The error code shown for a failed run (KpiRun.errorCode; an unknown or missing code is internal). */
export function runErrorCode(run: Pick<KpiRun, "status" | "errorCode">): KpiShownErrorCode | null {
  if (run.status !== "failed") return null;
  const code = run.errorCode;
  return code && (KPI_ERROR_CODES_SHOWN as readonly string[]).includes(code) ? (code as KpiShownErrorCode) : "internal";
}

/** Errors a Retry cannot fix (design 9.4: these show the message without Retry). */
const NOT_RETRYABLE: ReadonlySet<KpiShownErrorCode> = new Set<KpiShownErrorCode>([
  "ai_not_configured", "not_suggestable", "no_framework", "nothing_to_suggest", "too_many_results", "budget_reached",
  "project_archived", "already_decided", "duplicate",
]);

/** Whether the error state offers Retry. */
export function isRetryableError(code: string): boolean {
  return !NOT_RETRYABLE.has(code as KpiShownErrorCode);
}

/**
 * Success toast of an accept (design 9.4, D5): kpi.toast.accepted, or kpi.toast.acceptedOverCap when the response
 * carries donor_cap_exceeded (the result now has more indicators than the donor allows; accept is never blocked).
 */
export function acceptedToastText(t: TFunction, response: Pick<AcceptKpiSuggestionResponse, "warnings">, code: string): string {
  const cap = response.warnings?.find((w) => w.code === "donor_cap_exceeded");
  if (!cap) return t("kpi.toast.accepted", { code }) as string;
  return t("kpi.toast.acceptedOverCap", {
    code,
    count: Number(cap.params.count),
    cap: cap.params.cap,
  }) as string;
}

// ----------------------------------------------------------------- element ids

/** Id of the not-configured notice (KpiFrameworkPanel); the Suggest KPIs buttons point at it with aria-describedby. */
export function kpiNoticeId(projectId: string): string {
  return `kpi-not-configured-${projectId}`;
}

/** Id of a result's row Suggest KPIs button (the focus fallback of its suggestion list; design 9.4). */
export function suggestKpisButtonId(resultId: string): string {
  return `kpi-suggest-${resultId}`;
}

/** Id of a suggestion card's heading (focus target after a decision). */
export function kpiCardHeadingId(suggestionId: string): string {
  return `kpi-card-${suggestionId}-name`;
}

/** Id of a rejected stub's heading (focus moves there after a rejection). */
export function kpiStubHeadingId(suggestionId: string): string {
  return `kpi-stub-${suggestionId}`;
}
