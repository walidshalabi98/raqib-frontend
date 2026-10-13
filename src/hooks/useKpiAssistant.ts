import { createContext, useContext, type Context } from "react";
import type { AppLanguage } from "@/i18n";
import type { KpiRun, KpiRunStep, KpiScopeType, KpiSuggestion, RequestKpiSuggestionsBody } from "@/types/api";

/**
 * The KPI Assistant state shared by the results chain (knowledge/kpi-assistant-spec.md §A7; design section 9.3):
 * provided by KpiAssistantProvider (src/components/kpi/KpiAssistantProvider.tsx), read with useKpiAssistant().
 * Component files export components only, so the context and the hook live here.
 */

/**
 * What the UI shows for one target's run (design 7.4, 9.4): the server run once known, or the local timed view during
 * the synchronous wait of a request (no run id yet).
 */
export interface KpiRunView {
  /** The server run; null while the POST is still waiting. */
  run: KpiRun | null;
  scope: KpiScopeType;
  /** The scoped result (null for framework scope). */
  resultId: string | null;
  /** The server step, or progressStepAt(elapsed) during the synchronous wait. */
  step: KpiRunStep;
  /** `failed` also when the request itself failed (see errorFor). */
  status: "running" | "completed" | "failed";
  /** ISO time the request started (or the run's createdAt for a run adopted after a reload). */
  startedAt: string;
  /** The polling cap passed while still running: show "taking longer" and Refresh. */
  takingLonger: boolean;
  /** One more poll (the Refresh button). */
  refresh(): void;
}

/** A failed request or run of one target, ready to show (design 9.4 error state). */
export interface KpiTargetError {
  /** A KPI_ERROR_CODES_SHOWN code (never shown raw). */
  code: string;
  /** kpi.errors.<code> in the panel language. */
  message: string;
  /** Repeats the request; absent when a retry cannot help (isRetryableError). */
  retry?: () => void;
}

export type KpiTarget = { resultId: string } | { scope: "framework" };

/** The pending-suggestion list could not be loaded and nothing is cached (design 9.4 error state). */
export interface KpiListError {
  /** kpi.listFailed in the panel language. */
  message: string;
  /** Loads the list again. */
  retry(): void;
}

export interface KpiAssistantValue {
  /** canSuggestKpis(role): false for donor viewers (no KPI UI at all). */
  enabled: boolean;
  /** undefined while the status is loading; false after a 503 ai_not_configured too. */
  aiConfigured: boolean | undefined;
  lang: AppLanguage;
  projectId: string;
  frameworkId: string;
  /** Pending suggestions of a result (cards and their alternatives), in the API's order. */
  pendingFor(resultId: string): KpiSuggestion[];
  /** Includes the local timed view during the synchronous wait. A framework run is only under { scope: 'framework' }. */
  runFor(target: KpiTarget): KpiRunView | null;
  latestFrameworkRun: KpiRun | null;
  /** Starts a run (ignored while one for the same target runs); progress and errors appear under runFor/errorFor. */
  request(body: RequestKpiSuggestionsBody): void;
  errorFor(target: KpiTarget): KpiTargetError | null;
  /** Set while the suggestion list failed to load; KpiFrameworkPanel shows it with Retry. Absent or null otherwise. */
  listError?: KpiListError | null;
}

export const KpiAssistantContext: Context<KpiAssistantValue | null> = createContext<KpiAssistantValue | null>(null);

/** The KPI Assistant state; throws outside KpiAssistantProvider. */
export function useKpiAssistant(): KpiAssistantValue {
  const value = useContext(KpiAssistantContext);
  if (!value) throw new Error("useKpiAssistant must be used within KpiAssistantProvider");
  return value;
}
