import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { ApiError } from "@/lib/apiError";
import { KPI_REJECT_REASONS } from "@/lib/constants";
import { can } from "@/lib/permissions";
import {
  KPI_FRAMEWORK_POLL_CAP_MS,
  KPI_RESULT_POLL_CAP_MS,
  REJECTION_SCOPE,
  acceptedToastText,
  bodyForRun,
  focusCandidates,
  groupSuggestions,
  isRetryableError,
  isSuggestableLevel,
  kpiErrorText,
  kpiPollCapMs,
  kpiPollInterval,
  kpiRunNeedsRefresh,
  mergeRunIntoList,
  nextPollCapAt,
  progressStepAt,
  qualityBand,
  rejectEffect,
  rejectEffectKeys,
  requestErrorCode,
  requestErrorContext,
  runErrorCode,
  runStartedAtOnClient,
  runTargetKey,
  shownStepIndex,
  suggestionReadingOrder,
  warningText,
  withoutSuggestion,
} from "@/lib/kpiSuggestions";
import { makeKpiRun, makeKpiSuggestion, makeKpiSuggestionList, makeKpiWarning, sampleResultNodes } from "@/test/fixtures";

const CREATED = Date.parse("2026-10-13T08:00:00.000Z");
const at = (ms: number) => CREATED + ms;
const en = i18n.getFixedT("en");
const ar = i18n.getFixedT("ar");

describe("qualityBand", () => {
  it("uses the spec thresholds: ≥ 85 strong, 65–84 review, < 65 weak", () => {
    expect(qualityBand(100)).toBe("strong");
    expect(qualityBand(85)).toBe("strong");
    expect(qualityBand(84)).toBe("review");
    expect(qualityBand(65)).toBe("review");
    expect(qualityBand(64)).toBe("weak");
    expect(qualityBand(0)).toBe("weak");
  });
});

describe("who may use the KPI Assistant, and isSuggestableLevel", () => {
  it('is the "ai.run" capability: org admins, platform admins and M&E officers, never donor viewers or signed-out users', () => {
    expect(can("org_admin", "ai.run")).toBe(true);
    expect(can("platform_admin", "ai.run")).toBe(true);
    expect(can("me_officer", "ai.run")).toBe(true);
    expect(can("donor_viewer", "ai.run")).toBe(false);
    expect(can(undefined, "ai.run")).toBe(false);
    expect(can(null, "ai.run")).toBe(false);
    expect(can("someone_else", "ai.run")).toBe(false);
  });

  it("suggests for impact, outcome and output, never activities", () => {
    expect(["impact", "outcome", "output"].every((level) => isSuggestableLevel(level))).toBe(true);
    expect(isSuggestableLevel("activity")).toBe(false);
    expect(isSuggestableLevel(undefined)).toBe(false);
  });
});

describe("kpiRunNeedsRefresh", () => {
  const result = makeKpiRun({ status: "running", scope: "result" });
  const alternatives = makeKpiRun({ status: "running", scope: "alternatives" });
  const framework = makeKpiRun({ status: "running", scope: "framework", resultId: null });

  it("polls a result or alternatives run for 2 minutes from its client start", () => {
    expect(kpiRunNeedsRefresh(result, CREATED, at(0))).toBe(true);
    expect(kpiRunNeedsRefresh(result, CREATED, at(KPI_RESULT_POLL_CAP_MS - 1))).toBe(true);
    expect(kpiRunNeedsRefresh(result, CREATED, at(KPI_RESULT_POLL_CAP_MS))).toBe(false);
    expect(kpiRunNeedsRefresh(alternatives, CREATED, at(KPI_RESULT_POLL_CAP_MS - 1))).toBe(true);
    expect(kpiRunNeedsRefresh(alternatives, CREATED, at(KPI_RESULT_POLL_CAP_MS))).toBe(false);
    expect(kpiPollCapMs("result")).toBe(KPI_RESULT_POLL_CAP_MS);
  });

  it("polls a framework run for 10 minutes", () => {
    expect(KPI_FRAMEWORK_POLL_CAP_MS).toBe(600_000);
    expect(kpiPollCapMs("framework")).toBe(KPI_FRAMEWORK_POLL_CAP_MS);
    expect(kpiRunNeedsRefresh(framework, CREATED, at(KPI_RESULT_POLL_CAP_MS + 1))).toBe(true);
    expect(kpiRunNeedsRefresh(framework, CREATED, at(KPI_FRAMEWORK_POLL_CAP_MS - 1))).toBe(true);
    expect(kpiRunNeedsRefresh(framework, CREATED, at(KPI_FRAMEWORK_POLL_CAP_MS))).toBe(false);
  });

  it("never polls a finished run, and treats a start still ahead or unreadable as just started", () => {
    expect(kpiRunNeedsRefresh(makeKpiRun({ status: "completed" }), CREATED, at(1))).toBe(false);
    expect(kpiRunNeedsRefresh(makeKpiRun({ status: "failed" }), CREATED, at(1))).toBe(false);
    expect(kpiRunNeedsRefresh(result, CREATED, at(-30_000))).toBe(true);
    expect(kpiRunNeedsRefresh(result, CREATED, new Date(at(1_000)))).toBe(true);
    expect(kpiRunNeedsRefresh(result, Number.NaN, at(KPI_FRAMEWORK_POLL_CAP_MS))).toBe(true);
  });
});

describe("runStartedAtOnClient (clock skew between the client and the server)", () => {
  // The server created the run at 08:00:00 and its last heartbeat was at 08:00:30 (server clock).
  const run = makeKpiRun({ status: "running", createdAt: "2026-10-13T08:00:00.000Z", updatedAt: "2026-10-13T08:00:30.000Z" });

  it("takes the run's age by the server's own clock back from when the client saw it", () => {
    const seenAt = Date.parse("2026-10-13T08:00:31.000Z");
    expect(runStartedAtOnClient(run, seenAt)).toBe(seenAt - 30_000);
  });

  it("keeps polling a run the client sees with its clock 2 minutes ahead (review TQ-07)", () => {
    // Client clock 2 min ahead: it sees the run 1 s after the heartbeat at 08:02:31 client time.
    const seenAt = Date.parse("2026-10-13T08:02:31.000Z");
    const startedAt = runStartedAtOnClient(run, seenAt);
    expect(kpiRunNeedsRefresh(run, startedAt, seenAt)).toBe(true);
    expect(kpiPollInterval(run, startedAt, seenAt)).toBe(5_000);
    // Comparing the server createdAt with this clock would already be past the 2-minute cap.
    expect(seenAt - Date.parse(run.createdAt)).toBeGreaterThan(KPI_RESULT_POLL_CAP_MS);
    // The cap is reached 2 minutes after the run's start on the client's clock.
    expect(kpiRunNeedsRefresh(run, startedAt, startedAt + KPI_RESULT_POLL_CAP_MS - 1)).toBe(true);
    expect(kpiRunNeedsRefresh(run, startedAt, startedAt + KPI_RESULT_POLL_CAP_MS)).toBe(false);
  });

  it("does not poll longer than the cap with a client clock behind the server", () => {
    // Client clock 1 h behind: the run still reports 30 s of age.
    const seenAt = Date.parse("2026-10-13T07:00:31.000Z");
    const startedAt = runStartedAtOnClient(run, seenAt);
    expect(seenAt - startedAt).toBe(30_000);
    expect(kpiRunNeedsRefresh(run, startedAt, seenAt + KPI_RESULT_POLL_CAP_MS - 30_000)).toBe(false);
  });

  it("prefers the server's clock at the answer (serverNow) to the last heartbeat", () => {
    // The server answered at 08:00:50, 20 s after the last heartbeat; the client (2 min ahead) saw it at 08:02:51.
    const answered = { ...run, serverNow: "2026-10-13T08:00:50.000Z" };
    const seenAt = Date.parse("2026-10-13T08:02:51.000Z");
    expect(runStartedAtOnClient(answered, seenAt)).toBe(seenAt - 50_000);
    // An unreadable serverNow falls back to the heartbeat.
    expect(runStartedAtOnClient({ ...run, serverNow: "garbage" }, seenAt)).toBe(seenAt - 30_000);
  });

  it("uses the time it was seen when the dates are unreadable or out of order", () => {
    expect(runStartedAtOnClient({ createdAt: "garbage", updatedAt: run.updatedAt }, 5_000)).toBe(5_000);
    expect(runStartedAtOnClient({ createdAt: run.updatedAt, updatedAt: run.createdAt }, 5_000)).toBe(5_000);
    expect(runStartedAtOnClient({ createdAt: run.updatedAt, updatedAt: run.updatedAt, serverNow: run.createdAt }, 5_000)).toBe(5_000);
  });
});

describe("kpiPollInterval", () => {
  it("backs off 2 s → 5 s after 20 s → 10 s after a minute for result runs", () => {
    const run = makeKpiRun({ status: "running", scope: "result" });
    expect(kpiPollInterval(run, CREATED, at(0))).toBe(2_000);
    expect(kpiPollInterval(run, CREATED, at(19_999))).toBe(2_000);
    expect(kpiPollInterval(run, CREATED, at(20_000))).toBe(5_000);
    expect(kpiPollInterval(run, CREATED, at(59_999))).toBe(5_000);
    expect(kpiPollInterval(run, CREATED, at(60_000))).toBe(10_000);
    expect(kpiPollInterval(run, CREATED, at(KPI_RESULT_POLL_CAP_MS))).toBe(false);
  });

  it("starts at 3 s for framework runs and stops after 10 minutes", () => {
    const run = makeKpiRun({ status: "running", scope: "framework", resultId: null });
    expect(kpiPollInterval(run, CREATED, at(0))).toBe(3_000);
    expect(kpiPollInterval(run, CREATED, at(30_000))).toBe(5_000);
    expect(kpiPollInterval(run, CREATED, at(5 * 60_000))).toBe(10_000);
    expect(kpiPollInterval(run, CREATED, at(KPI_FRAMEWORK_POLL_CAP_MS))).toBe(false);
  });

  it("stops once the run finished", () => {
    expect(kpiPollInterval(makeKpiRun({ status: "completed" }), CREATED, at(1_000))).toBe(false);
  });
});

describe("nextPollCapAt", () => {
  const running = (scope: "result" | "framework") => makeKpiRun({ status: "running", scope });

  it("is the earliest cap still ahead among running runs", () => {
    const entries = [
      { run: running("framework"), startedAt: CREATED, failed: false },
      { run: running("result"), startedAt: CREATED + 1_000, failed: false },
    ];
    expect(nextPollCapAt(entries, at(0))).toBe(CREATED + 1_000 + KPI_RESULT_POLL_CAP_MS);
    // Once the result run passed its cap, the framework run's cap is next.
    expect(nextPollCapAt(entries, CREATED + 1_000 + KPI_RESULT_POLL_CAP_MS)).toBe(CREATED + KPI_FRAMEWORK_POLL_CAP_MS);
    expect(nextPollCapAt(entries, at(KPI_FRAMEWORK_POLL_CAP_MS))).toBeNull();
  });

  it("ignores waiting requests, failed entries and finished runs", () => {
    expect(nextPollCapAt([
      { run: null, startedAt: CREATED, failed: false },
      { run: running("result"), startedAt: CREATED, failed: true },
      { run: makeKpiRun({ status: "completed" }), startedAt: CREATED, failed: false },
    ], at(0))).toBeNull();
  });
});

describe("progressStepAt and shownStepIndex", () => {
  it("shows context, then retrieval, then model, never later while waiting", () => {
    expect(progressStepAt(0)).toBe("context");
    expect(progressStepAt(1_499)).toBe("context");
    expect(progressStepAt(1_500)).toBe("retrieval");
    expect(progressStepAt(3_999)).toBe("retrieval");
    expect(progressStepAt(4_000)).toBe("model");
    expect(progressStepAt(60_000)).toBe("model");
  });

  it("puts saving and done after the four shown steps", () => {
    expect(shownStepIndex("context")).toBe(0);
    expect(shownStepIndex("validation")).toBe(3);
    expect(shownStepIndex("saving")).toBe(4);
    expect(shownStepIndex("done")).toBe(4);
  });
});

describe("groupSuggestions", () => {
  const nodes = sampleResultNodes();

  it("groups by result in the API's order and drops unknown or deleted results and repeated ids", () => {
    const a = makeKpiSuggestion({ id: "a", sortOrder: 2 });
    const b = makeKpiSuggestion({ id: "b", sortOrder: 1 });
    const later = makeKpiSuggestion({ id: "later", sortOrder: 1, createdAt: "2026-10-13T09:00:00.000Z" });
    const other = makeKpiSuggestion({ id: "o2-1", resultId: "o2", resultCode: "O2" });
    const unknown = makeKpiSuggestion({ id: "x", resultId: "gone" });
    const deleted = makeKpiSuggestion({ id: "y", resultId: null });
    const groups = groupSuggestions([later, a, other, unknown, b, deleted, a], nodes);
    expect([...groups.keys()].sort()).toEqual(["o1", "o2"]);
    expect(groups.get("o1")?.items.map((i) => i.suggestion.id)).toEqual(["b", "a", "later"]);
    expect(groups.get("o2")?.items.map((i) => i.suggestion.id)).toEqual(["o2-1"]);
  });

  it("nests alternatives under their source card, else groups them by source", () => {
    const source = makeKpiSuggestion({ id: "src" });
    const alt1 = makeKpiSuggestion({ id: "alt1", alternativeOfSuggestionId: "src", sortOrder: 1, createdAt: "2026-10-13T09:00:00.000Z" });
    const alt2 = makeKpiSuggestion({ id: "alt2", alternativeOfSuggestionId: "src", sortOrder: 2, createdAt: "2026-10-13T09:00:00.000Z" });
    const ofRejected = makeKpiSuggestion({ id: "alt3", alternativeOfSuggestionId: "rejected-earlier" });
    const ofIndicator = makeKpiSuggestion({ id: "alt4", alternativeOfIndicatorId: "ind-1" });
    const ofIndicator2 = makeKpiSuggestion({ id: "alt5", alternativeOfIndicatorId: "ind-1", sortOrder: 2 });
    const group = groupSuggestions([alt2, ofIndicator, alt1, ofRejected, source, ofIndicator2], nodes).get("o1");
    expect(group?.items).toHaveLength(1);
    expect(group?.items[0].suggestion.id).toBe("src");
    expect(group?.items[0].alternatives.map((s) => s.id)).toEqual(["alt1", "alt2"]);
    expect(group?.alternativeGroups.map((g) => [g.source.kind, g.source.id, g.suggestions.map((s) => s.id)])).toEqual([
      ["suggestion", "rejected-earlier", ["alt3"]],
      ["indicator", "ind-1", ["alt4", "alt5"]],
    ]);
    expect(suggestionReadingOrder(group)).toEqual(["src", "alt1", "alt2", "alt3", "alt4", "alt5"]);
    expect(suggestionReadingOrder(undefined)).toEqual([]);
  });
});

describe("focusCandidates", () => {
  it("prefers the next card, then the previous ones nearest first", () => {
    expect(focusCandidates(["a", "b", "c", "d"], "b")).toEqual(["c", "d", "a"]);
    expect(focusCandidates(["a", "b"], "b")).toEqual(["a"]);
    expect(focusCandidates(["a"], "a")).toEqual([]);
    expect(focusCandidates(["a", "b"], "zz")).toEqual(["a", "b"]);
  });
});

describe("mergeRunIntoList and withoutSuggestion", () => {
  const old = makeKpiSuggestion({ id: "old", createdAt: "2026-10-12T08:00:00.000Z" });
  const oldAlternative = makeKpiSuggestion({ id: "old-alt", alternativeOfIndicatorId: "ind-1", createdAt: "2026-10-12T08:00:00.000Z" });
  const otherResult = makeKpiSuggestion({ id: "o2-old", resultId: "o2", createdAt: "2026-10-12T08:00:00.000Z" });

  it("adds the run's pending suggestions and replaces older cards of the results it refreshed", () => {
    const run = makeKpiRun({ id: "run-2", createdAt: "2026-10-13T08:00:00.000Z" });
    const fresh = makeKpiSuggestion({ id: "new", runId: "run-2" });
    const rejectedInRun = makeKpiSuggestion({ id: "gone", runId: "run-2", status: "rejected" });
    const list = makeKpiSuggestionList({ suggestions: [old, oldAlternative, otherResult], activeRuns: [makeKpiRun({ id: "run-2", status: "running" })] });
    const merged = mergeRunIntoList(list, run, [fresh, rejectedInRun]);
    expect(merged?.suggestions.map((s) => s.id).sort()).toEqual(["new", "o2-old", "old-alt"]);
    expect(merged?.activeRuns).toEqual([]);
    expect(merged?.latestFrameworkRun).toBeNull();
  });

  it("never replaces cards after an alternatives run, and records a framework run as the latest", () => {
    const list = makeKpiSuggestionList({ suggestions: [old] });
    const alternatives = mergeRunIntoList(list, makeKpiRun({ id: "r-alt", scope: "alternatives" }), [makeKpiSuggestion({ id: "alt", alternativeOfSuggestionId: "old" })]);
    expect(alternatives?.suggestions.map((s) => s.id)).toEqual(["old", "alt"]);
    const frameworkRun = makeKpiRun({ id: "r-fw", scope: "framework", resultId: null });
    expect(mergeRunIntoList(list, frameworkRun, [])?.latestFrameworkRun).toBe(frameworkRun);
  });

  it("leaves a missing list or another framework version unchanged", () => {
    expect(mergeRunIntoList(undefined, makeKpiRun(), [])).toBeUndefined();
    const list = makeKpiSuggestionList({ frameworkId: "fw-old", suggestions: [old] });
    expect(mergeRunIntoList(list, makeKpiRun(), [makeKpiSuggestion({ id: "new" })])).toBe(list);
  });

  it("removes one decided suggestion", () => {
    const list = makeKpiSuggestionList({ suggestions: [old, otherResult] });
    expect(withoutSuggestion(list, "old")?.suggestions.map((s) => s.id)).toEqual(["o2-old"]);
    expect(withoutSuggestion(undefined, "old")).toBeUndefined();
  });
});

describe("runTargetKey and bodyForRun", () => {
  it("files framework runs together and result or alternatives runs under their result", () => {
    expect(runTargetKey(makeKpiRun({ scope: "framework", resultId: null }))).toBe("framework");
    expect(runTargetKey(makeKpiRun({ scope: "result", resultId: "o1" }))).toBe("result:o1");
    expect(runTargetKey(makeKpiRun({ scope: "alternatives", resultId: "o1", sourceIndicatorId: "ind-1" }))).toBe("result:o1");
    expect(runTargetKey(makeKpiRun({ scope: "alternatives", resultId: null, sourceIndicatorId: "ind-1" }))).toBe("indicator:ind-1");
  });

  it("rebuilds the request of a run", () => {
    expect(bodyForRun(makeKpiRun({ scope: "framework" }))).toEqual({ scope: "framework" });
    expect(bodyForRun(makeKpiRun({ scope: "result", resultId: "o1" }))).toEqual({ scope: "result", resultId: "o1" });
    expect(bodyForRun(makeKpiRun({ scope: "alternatives", sourceSuggestionId: "s-1" }))).toEqual({ scope: "alternatives", suggestionId: "s-1" });
    expect(bodyForRun(makeKpiRun({ scope: "alternatives", sourceIndicatorId: "ind-1" }))).toEqual({ scope: "alternatives", indicatorId: "ind-1" });
    expect(bodyForRun(makeKpiRun({ scope: "result", resultId: null }))).toBeNull();
  });
});

describe("rejectEffect", () => {
  it("mirrors the backend REJECTION_SCOPE for library indicators (design D9)", () => {
    expect(REJECTION_SCOPE).toEqual({
      not_relevant: "organisation", too_costly_to_measure: "organisation", other: "organisation",
      donor_not_required: "donor", duplicate: "project", wording: "project",
    });
    expect(KPI_REJECT_REASONS.map((reason) => rejectEffect(reason, true))).toEqual([
      "organisation", "organisation", "donor", "project", "project", "organisation",
    ]);
  });

  it("excludes nothing for a custom indicator", () => {
    expect(KPI_REJECT_REASONS.map((reason) => rejectEffect(reason, false))).toEqual(Array(6).fill("custom"));
  });

  it("adds the Edit & accept hint for wording", () => {
    expect(rejectEffectKeys("wording", true)).toEqual(["kpi.reject.effect.project", "kpi.reject.effect.wordingHint"]);
    expect(rejectEffectKeys("wording", false)).toEqual(["kpi.reject.effect.custom", "kpi.reject.effect.wordingHint"]);
    expect(rejectEffectKeys("not_relevant", true)).toEqual(["kpi.reject.effect.organisation"]);
    expect(rejectEffectKeys("donor_not_required", true)).toEqual(["kpi.reject.effect.donor"]);
  });
});

describe("warningText", () => {
  it("translates by code with params and the translated level", () => {
    const capped = makeKpiWarning("result_cap", { params: { code: "O1", cap: 3, dropped: 1 } });
    expect(warningText(en, capped)).toBe("O1: kept 3 indicators per result (donor or level limit); 1 more dropped.");
    const level = makeKpiWarning("level_adjusted", { params: { level: "outcome", code: "O1" } });
    expect(warningText(en, level)).toBe("Level changed to Outcome to match result O1.");
    expect(warningText(ar, level)).toBe("غُيّر المستوى إلى المحصّلة ليطابق النتيجة O1.");
  });

  it("falls back to the English message for a code the UI does not know", () => {
    const future = { ...makeKpiWarning("sex_added"), code: "future_code" as never, message: "A new note." };
    expect(warningText(en, future)).toBe("A new note.");
  });

  it("translates both levels of level_mismatch_library, and says result_empty", () => {
    const mismatch = makeKpiWarning("level_mismatch_library", { params: { libraryId: "FS-01", entryLevel: "outcome", level: "output", code: "OP1" } });
    expect(warningText(en, mismatch)).toBe("Library indicator FS-01 is an Outcome indicator; OP1 is an Output. Check that it measures this level.");
    expect(warningText(ar, mismatch)).toBe("مؤشر المكتبة FS-01 مؤشر على مستوى المحصّلة، والنتيجة OP1 على مستوى المُخرَج. تحقّق من أنه يقيس هذا المستوى.");
    const empty = makeKpiWarning("result_empty", { params: { code: "O2" } });
    expect(warningText(en, empty)).toBe("No suggestions were kept for O2. Ask for suggestions for this result again or add an indicator yourself.");
  });
});

describe("requestErrorCode and runErrorCode", () => {
  it("uses the API code the UI knows", () => {
    for (const code of ["budget_reached", "nothing_to_suggest", "too_many_results", "project_archived", "duplicate", "run_in_progress", "not_suggestable"]) {
      expect(requestErrorCode(new ApiError("x", 409, code))).toBe(code);
    }
  });

  it("falls back by status: 429 rate_limited, 503 ai_not_configured, else internal", () => {
    expect(requestErrorCode(new ApiError("Too many requests", 429))).toBe("rate_limited");
    expect(requestErrorCode(new ApiError("Service unavailable", 503))).toBe("ai_not_configured");
    expect(requestErrorCode(new ApiError("Bad request", 400))).toBe("internal");
    expect(requestErrorCode(new ApiError("Odd", 400, "some_new_code"))).toBe("internal");
    expect(requestErrorCode(new Error("offline"))).toBe("internal");
    expect(requestErrorCode(null)).toBe("internal");
  });

  it("reads a failed run's errorCode", () => {
    expect(runErrorCode(makeKpiRun({ status: "failed", errorCode: "ai_refused" }))).toBe("ai_refused");
    expect(runErrorCode(makeKpiRun({ status: "failed", errorCode: null }))).toBe("internal");
    expect(runErrorCode(makeKpiRun({ status: "completed" }))).toBeNull();
  });

  it("knows the codes of accept, reject and write conflicts", () => {
    expect(requestErrorCode(new ApiError("Has data", 409, "source_has_data"))).toBe("source_has_data");
    expect(requestErrorCode(new ApiError("Not editable", 400, "not_editable", { keys: ["status"] }))).toBe("not_editable");
    expect(requestErrorCode(new ApiError("Conflict", 409, "conflict"))).toBe("conflict");
    expect(kpiErrorText(en, "conflict")).toBe("This change clashed with another change made at the same time, so nothing was saved. Try again.");
    expect(isRetryableError("conflict")).toBe(true);
    expect(isRetryableError("source_has_data")).toBe(false);
    expect(isRetryableError("not_editable")).toBe(false);
  });

  it("offers Retry only where it can help", () => {
    expect(isRetryableError("ai_unavailable")).toBe(true);
    expect(isRetryableError("rate_limited")).toBe(true);
    expect(isRetryableError("internal")).toBe(true);
    for (const code of ["ai_not_configured", "nothing_to_suggest", "not_suggestable", "budget_reached", "project_archived", "too_many_results"]) {
      expect(isRetryableError(code)).toBe(false);
    }
  });
});

describe("requestErrorContext and kpiErrorText (review UX-08)", () => {
  it("reads why there is nothing to suggest", () => {
    for (const reason of ["no_results", "level_cap", "donor_cap"]) {
      expect(requestErrorContext(new ApiError("x", 422, "nothing_to_suggest", { reason }))).toBe(reason);
    }
    expect(requestErrorContext(new ApiError("x", 422, "nothing_to_suggest", { reason: "new_reason" }))).toBeUndefined();
    expect(requestErrorContext(new ApiError("x", 422, "nothing_to_suggest"))).toBeUndefined();
  });

  it("reads who reached an hourly limit, and nothing for a 429 without a code", () => {
    expect(requestErrorContext(new ApiError("x", 429, "rate_limited", { scope: "user" }))).toBe("user");
    expect(requestErrorContext(new ApiError("x", 429, "rate_limited", { scope: "organisation" }))).toBe("organisation");
    expect(requestErrorContext(new ApiError("x", 429, "rate_limited", { scope: "planet" }))).toBeUndefined();
    expect(requestErrorContext(new ApiError("Too many requests", 429))).toBeUndefined();
    // A detail of another code is never read as a context.
    expect(requestErrorContext(new ApiError("x", 409, "stale", { scope: "user", reason: "donor_cap" }))).toBeUndefined();
  });

  it("words the limit for the organisation or the person, in both languages", () => {
    const org = new ApiError("x", 429, "rate_limited", { scope: "organisation" });
    const user = new ApiError("x", 429, "rate_limited", { scope: "user" });
    expect(kpiErrorText(en, requestErrorCode(org), requestErrorContext(org))).toBe("Your organisation has reached its hourly limit of KPI suggestions. Try again later.");
    expect(kpiErrorText(en, requestErrorCode(user), requestErrorContext(user))).toMatch(/^You have reached your hourly limit of AI requests/);
    expect(kpiErrorText(ar, requestErrorCode(org), requestErrorContext(org))).toBe("بلغت مؤسستك حدّها من اقتراحات المؤشرات لهذه الساعة. حاول لاحقًا.");
    expect(kpiErrorText(en, "rate_limited")).toBe("Too many requests right now. Wait a minute and try again.");
    // An unknown context falls back to the generic message.
    expect(kpiErrorText(en, "rate_limited", "planet")).toBe("Too many requests right now. Wait a minute and try again.");
  });
});

describe("acceptedToastText", () => {
  it("names the result, and the donor cap when the response warns about it (D5)", () => {
    expect(acceptedToastText(en, { warnings: [] }, "O1")).toBe("Indicator added to O1");
    const over = makeKpiWarning("donor_cap_exceeded", { params: { code: "O1", cap: 3, count: 4 } });
    expect(acceptedToastText(en, { warnings: [over] }, "O1")).toBe("Indicator added to O1. O1 now has 4 indicators; the donor allows 3. Remove one.");
    expect(acceptedToastText(ar, { warnings: [over] }, "O1")).toContain("والمانح يسمح بـ3");
  });
});
