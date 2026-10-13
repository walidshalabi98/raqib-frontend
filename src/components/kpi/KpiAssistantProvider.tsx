import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@/i18n";
import {
  KpiAssistantContext,
  type KpiAssistantValue,
  type KpiRunView,
  type KpiTarget,
  type KpiTargetError,
} from "@/hooks/useKpiAssistant";
import {
  applyFinishedRun,
  useKpiAssistantStatus,
  useKpiSuggestionRun,
  usePendingKpiSuggestions,
  useRequestKpiSuggestions,
} from "@/hooks/useKpiSuggestions";
import { usePermissions } from "@/hooks/usePermissions";
import { queryKeys } from "@/lib/queryKeys";
import { httpStatusOf } from "@/lib/apiError";
import type { KpiShownErrorCode } from "@/lib/constants";
import {
  bodyForRun,
  isRetryableError,
  kpiErrorText,
  kpiRunNeedsRefresh,
  nextPollCapAt,
  progressStepAt,
  requestErrorCode,
  requestErrorContext,
  runErrorCode,
  runStartedAtOnClient,
  runTargetKey,
} from "@/lib/kpiSuggestions";
import type {
  Framework,
  KpiRun,
  KpiScopeType,
  KpiSuggestion,
  KpiSuggestionRunResponse,
  RequestKpiSuggestionsBody,
} from "@/types/api";

export interface KpiAssistantProviderProps {
  projectId: string;
  frameworkId: string;
  /** Language of the panel the assistant renders in (error messages are in it). */
  lang: AppLanguage;
  children: ReactNode;
}

/** One target's request or run (framework, or a result for result and alternatives runs). */
interface Tracked {
  /** "framework", "result:<id>", or "indicator:<id>" / "suggestion:<id>" until the run names its result. */
  key: string;
  /** What Retry repeats; null for a run whose request is unknown. */
  body: RequestKpiSuggestionsBody | null;
  scope: KpiScopeType;
  resultId: string | null;
  /**
   * Client time (ms) the request started, or runStartedAtOnClient for a run this client did not start (adopted after
   * a reload, or followed after 409 run_in_progress). Polling and "taking longer" count from it, never from the
   * server's createdAt (the two clocks can differ).
   */
  startedAt: number;
  runId: string | null;
  run: KpiRun | null;
  /** A failed request (the run, when known, carries its own errorCode). */
  error: KpiShownErrorCode | null;
  /** The i18n context of the failed request's message (422 nothing_to_suggest: details.reason). */
  errorContext?: string;
  /** Following a run another request started (409 run_in_progress with details.runId). */
  attached: boolean;
}

type TrackedMap = Readonly<Record<string, Tracked>>;

const TICK_MS = 500;

function keyOf(target: KpiTarget): string {
  return "scope" in target ? "framework" : `result:${target.resultId}`;
}

function resultIdOfKey(key: string): string | null {
  return key.startsWith("result:") ? key.slice("result:".length) : null;
}

/** Waiting for the POST, or the run is still running (a second request for the target is ignored). */
function isActive(entry: Tracked | undefined): boolean {
  return Boolean(entry && !entry.error && (!entry.run || entry.run.status === "running"));
}

function entryForRun(run: KpiRun, body: RequestKpiSuggestionsBody | null, startedAt: number): Tracked {
  return {
    key: runTargetKey(run),
    body: body ?? bodyForRun(run),
    scope: run.scope,
    resultId: run.scope === "framework" ? null : run.resultId,
    startedAt,
    runId: run.id,
    run,
    error: null,
    attached: false,
  };
}

/** Re-renders every `ms` while `active` (the timed progress view of a waiting request). */
function useTicker(active: boolean, ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [active, ms]);
  return now;
}

/**
 * Re-renders once the client clock reaches `at` (null: never), and returns the time it woke. Used for the polling
 * cap: polling stops there and an unchanged poll answer re-renders nothing, so without it "taking longer" and Refresh
 * would wait for an unrelated render (review UX-01).
 */
function useWakeAt(at: number | null): number {
  const [wokeAt, setWokeAt] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return undefined;
    // +1 ms: a timer that fires on the very millisecond still finds the cap passed.
    const timer = setTimeout(() => setWokeAt(Date.now()), Math.max(0, at - Date.now()) + 1);
    return () => clearTimeout(timer);
    // wokeAt: a timer that fired early schedules itself again.
  }, [at, wokeAt]);
  return wokeAt;
}

/**
 * Polls one run (useKpiSuggestionRun with the 7.4 back-off) and reports every answer; renders nothing. One watcher
 * per running run, so the provider can follow several runs at once.
 */
function KpiRunWatcher({
  runId,
  startedAt,
  onData,
  onFailed,
}: {
  runId: string;
  /** Client time the run started (Tracked.startedAt): the polling cap counts from it. */
  startedAt: number;
  onData: (runId: string, data: KpiSuggestionRunResponse) => void;
  onFailed: (runId: string, err: unknown) => void;
}) {
  const query = useKpiSuggestionRun(runId, startedAt);
  useEffect(() => {
    if (query.data) onData(runId, query.data);
  }, [query.data, runId, onData]);
  useEffect(() => {
    if (query.isError && !query.data) onFailed(runId, query.error);
  }, [query.isError, query.data, query.error, runId, onFailed]);
  return null;
}

/**
 * Holds the KPI Assistant state for one framework's results chain (knowledge/kpi-assistant-spec.md §A6–A7; design
 * sections 7.4, 9.1 and 9.3): the AI status, the pending suggestions, run tracking (the timed view during the
 * synchronous wait, then polling with back-off; active runs resume after a reload) and request(). Renders nothing
 * itself. Disabled for roles without the assistant (donor viewers: spec §A1).
 */
export function KpiAssistantProvider({ projectId, frameworkId, lang, children }: KpiAssistantProviderProps) {
  // The "ai.run" capability (src/lib/permissions.ts): staff roles only, never donor viewers.
  const enabled = usePermissions().can("ai.run");
  const { t } = useTranslation(undefined, { lng: lang });
  const queryClient = useQueryClient();
  const status = useKpiAssistantStatus();
  const list = usePendingKpiSuggestions(projectId, enabled);
  // A failed list with nothing cached shows an error with Retry (a failed background refetch keeps the cached cards).
  const listFailed = enabled && list.isError && !list.data;
  const refetchList = list.refetch;
  const requestMutation = useRequestKpiSuggestions(projectId);
  const mutateAsync = requestMutation.mutateAsync;

  const [tracked, setTracked] = useState<TrackedMap>({});
  const trackedRef = useRef<TrackedMap>({});
  const update = useCallback((fn: (prev: TrackedMap) => TrackedMap) => {
    const next = fn(trackedRef.current);
    if (next !== trackedRef.current) {
      trackedRef.current = next;
      setTracked(next);
    }
  }, []);

  /** Runs whose suggestions were already put into the list (the 200 answer or the last poll). */
  const finishedRuns = useRef(new Set<string>());
  /** Suggestion id → result id, so alternatives of a rejected suggestion show under its result at once. */
  const knownResults = useRef(new Map<string, string>());
  /** Set after a 503 ai_not_configured; cleared by a newer status answer. */
  const [notConfiguredAt, setNotConfiguredAt] = useState<number | null>(null);

  // A new framework version starts with nothing tracked.
  useEffect(() => {
    update((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, [frameworkId, update]);

  const markNotConfigured = useCallback(() => setNotConfiguredAt(Date.now()), []);

  const keyForBody = useCallback((body: RequestKpiSuggestionsBody): string => {
    if (body.scope === "framework") return "framework";
    if (body.scope === "result") return `result:${body.resultId}`;
    if ("suggestionId" in body) {
      const resultId = knownResults.current.get(body.suggestionId);
      return resultId ? `result:${resultId}` : `suggestion:${body.suggestionId}`;
    }
    const framework = queryClient.getQueryData<Framework | null>(queryKeys.framework(projectId));
    const resultId = framework?.indicators?.find((i) => i.id === body.indicatorId)?.resultId;
    return resultId ? `result:${resultId}` : `indicator:${body.indicatorId}`;
  }, [queryClient, projectId]);

  /** Files a run under its own target; a request that only attached to another target's run gets run_in_progress. */
  const placeRun = useCallback((fromKey: string, run: KpiRun) => {
    update((prev) => {
      const from = prev[fromKey];
      const runKey = runTargetKey(run);
      const next: Record<string, Tracked> = { ...prev };
      if (runKey === fromKey) {
        if (!from) {
          next[fromKey] = entryForRun(run, null, runStartedAtOnClient(run, Date.now()));
          return next;
        }
        // A followed run (409 run_in_progress) started before this request: count from its own start.
        const startedAt = from.attached && !from.run ? Math.min(from.startedAt, runStartedAtOnClient(run, Date.now())) : from.startedAt;
        next[fromKey] = { ...from, runId: run.id, run, error: null, errorContext: undefined, attached: false, scope: run.scope, startedAt };
        return next;
      }
      if (from?.attached) next[fromKey] = { ...from, runId: null, run: null, error: "run_in_progress", attached: false };
      else delete next[fromKey];
      const existing = prev[runKey];
      const body = from && !from.attached ? from.body : existing?.body ?? null;
      const startedAt = from && !from.attached ? from.startedAt : existing?.startedAt ?? runStartedAtOnClient(run, Date.now());
      next[runKey] = entryForRun(run, body, startedAt);
      return next;
    });
  }, [update]);

  const onFinished = useCallback((run: KpiRun, suggestions: readonly KpiSuggestion[] | null) => {
    if (finishedRuns.current.has(run.id)) return;
    finishedRuns.current.add(run.id);
    for (const s of suggestions ?? []) if (s.resultId) knownResults.current.set(s.id, s.resultId);
    if (suggestions) applyFinishedRun(queryClient, projectId, run, suggestions);
    if (run.status === "failed" && run.errorCode === "ai_not_configured") markNotConfigured();
  }, [queryClient, projectId, markNotConfigured]);

  const request = useCallback((body: RequestKpiSuggestionsBody) => {
    if (!enabled) return;
    const key = keyForBody(body);
    if (isActive(trackedRef.current[key])) return;
    update((prev) => ({
      ...prev,
      [key]: {
        key, body, scope: body.scope, resultId: resultIdOfKey(key), startedAt: Date.now(),
        runId: null, run: null, error: null, attached: false,
      },
    }));
    mutateAsync(body).then(
      (response) => {
        // The hook already put a finished run's suggestions into the list.
        if (response.run.status !== "running") {
          finishedRuns.current.add(response.run.id);
          for (const s of response.suggestions ?? []) if (s.resultId) knownResults.current.set(s.id, s.resultId);
          if (response.run.status === "failed" && response.run.errorCode === "ai_not_configured") markNotConfigured();
        }
        placeRun(key, response.run);
      },
      (err: unknown) => {
        const code = requestErrorCode(err);
        const runId = (err as { details?: Record<string, unknown> } | null)?.details?.runId;
        if (code === "run_in_progress" && typeof runId === "string") {
          // Follow the run that is already preparing suggestions (design 9.8).
          update((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], runId, attached: true } } : prev));
          return;
        }
        if (code === "ai_not_configured" || httpStatusOf(err) === 503) markNotConfigured();
        const errorContext = requestErrorContext(err);
        update((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], error: code, errorContext } } : prev));
      },
    );
  }, [enabled, keyForBody, mutateAsync, placeRun, update, markNotConfigured]);

  const onRunData = useCallback((runId: string, data: KpiSuggestionRunResponse) => {
    for (const entry of Object.values(trackedRef.current)) {
      if (entry.runId === runId) placeRun(entry.key, data.run);
    }
    if (data.run.status !== "running") onFinished(data.run, data.suggestions);
  }, [placeRun, onFinished]);

  const onRunFailed = useCallback((runId: string, err: unknown) => {
    const code = requestErrorCode(err);
    update((prev) => {
      let next = prev;
      for (const entry of Object.values(prev)) {
        if (entry.runId === runId && !entry.run) next = { ...next, [entry.key]: { ...entry, error: code, errorContext: requestErrorContext(err), attached: false } };
      }
      return next;
    });
  }, [update]);

  // After a reload or remount the list reports runs still running: follow them (design 7.4).
  useEffect(() => {
    const data = list.data;
    if (!data) return;
    for (const s of data.suggestions) if (s.resultId) knownResults.current.set(s.id, s.resultId);
    update((prev) => {
      let next = prev;
      for (const run of data.activeRuns ?? []) {
        if (finishedRuns.current.has(run.id)) continue;
        if (Object.values(next).some((e) => e.runId === run.id)) continue;
        const key = runTargetKey(run);
        if (isActive(next[key])) continue;
        next = { ...next, [key]: entryForRun(run, null, runStartedAtOnClient(run, Date.now())) };
      }
      return next;
    });
  }, [list.data, update]);

  const waiting = Object.values(tracked).some((e) => !e.error && !e.run);
  const tickedAt = useTicker(waiting, TICK_MS);
  const capAt = nextPollCapAt(
    Object.values(tracked).map((e) => ({ run: e.run, startedAt: e.startedAt, failed: Boolean(e.error) })),
    Date.now(),
  );
  const wokeAt = useWakeAt(capAt);
  const now = Math.max(tickedAt, wokeAt);

  const statusUpdatedAt = status.dataUpdatedAt;
  const aiConfigured = notConfiguredAt !== null && notConfiguredAt >= statusUpdatedAt ? false : status.data?.aiConfigured;

  const pendingByResult = useMemo(() => {
    const map = new Map<string, KpiSuggestion[]>();
    for (const s of list.data?.suggestions ?? []) {
      if (s.status !== "pending" || !s.resultId) continue;
      const items = map.get(s.resultId) ?? [];
      items.push(s);
      map.set(s.resultId, items);
    }
    return map;
  }, [list.data]);

  const value = useMemo<KpiAssistantValue>(() => {
    const viewOf = (entry: Tracked | undefined): KpiRunView | null => {
      if (!entry) return null;
      const run = entry.run;
      const current = Math.max(now, Date.now());
      return {
        run,
        scope: entry.scope,
        resultId: entry.resultId ?? run?.resultId ?? null,
        step: run ? run.step : progressStepAt(current - entry.startedAt),
        status: entry.error ? "failed" : run ? run.status : "running",
        startedAt: new Date(entry.startedAt).toISOString(),
        takingLonger: Boolean(!entry.error && run && run.status === "running" && !kpiRunNeedsRefresh(run, entry.startedAt, current)),
        refresh: () => {
          if (entry.runId) void queryClient.refetchQueries({ queryKey: queryKeys.kpiSuggestionRun(entry.runId) });
        },
      };
    };
    const errorOf = (entry: Tracked | undefined): KpiTargetError | null => {
      if (!entry) return null;
      const code = entry.error ?? (entry.run ? runErrorCode(entry.run) : null);
      if (!code) return null;
      const body = entry.body;
      return {
        code,
        message: kpiErrorText(t, code, entry.error ? entry.errorContext : undefined),
        ...(body && isRetryableError(code) && { retry: () => request(body) }),
      };
    };
    return {
      enabled,
      aiConfigured,
      lang,
      projectId,
      frameworkId,
      pendingFor: (resultId) => pendingByResult.get(resultId) ?? [],
      runFor: (target) => viewOf(tracked[keyOf(target)]),
      latestFrameworkRun: list.data?.latestFrameworkRun ?? null,
      request,
      errorFor: (target) => errorOf(tracked[keyOf(target)]),
      listError: listFailed ? { message: t("kpi.listFailed"), retry: () => void refetchList() } : null,
    };
  }, [enabled, aiConfigured, lang, projectId, frameworkId, pendingByResult, tracked, now, list.data, listFailed, refetchList, request, t, queryClient]);

  // Each running run once, with the earliest start of the entries that follow it.
  const watched = new Map<string, number>();
  for (const e of Object.values(tracked)) {
    if (!e.runId || e.error || (e.run && e.run.status !== "running")) continue;
    watched.set(e.runId, Math.min(watched.get(e.runId) ?? e.startedAt, e.startedAt));
  }

  return (
    <KpiAssistantContext.Provider value={value}>
      {enabled && [...watched].map(([runId, startedAt]) => (
        <KpiRunWatcher key={runId} runId={runId} startedAt={startedAt} onData={onRunData} onFailed={onRunFailed} />
      ))}
      {children}
    </KpiAssistantContext.Provider>
  );
}
