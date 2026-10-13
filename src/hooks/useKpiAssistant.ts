import { createContext, useContext, type Context } from "react";
import type { AppLanguage } from "@/i18n";
import type { KpiRun, KpiRunStep, KpiScopeType, KpiSuggestion, RequestKpiSuggestionsBody } from "@/types/api";

/**
 * The KPI Assistant state shared by the results chain (design section 9.3): provided by KpiAssistantProvider
 * (src/components/kpi/KpiAssistantProvider.tsx), read with useKpiAssistant(). Component files export components
 * only, so the context and the hook live here.
 *
 * Step 0 (Phase 4 contracts): KpiAssistantValue, KpiRunView, the context and the hook are final; E7 implements
 * the provider.
 */

/**
 * What the UI shows for one target's run: the server run once known, or the local timed view during the
 * synchronous wait of a result/alternatives request (no run id yet).
 */
export interface KpiRunView {
  /** The server run; null while the synchronous POST is still waiting. */
  run: KpiRun | null;
  scope: KpiScopeType;
  /** The scoped result (null for framework scope). */
  resultId: string | null;
  /** The server step, or progressStepAt(elapsed) during the synchronous wait. */
  step: KpiRunStep;
  status: "running" | "completed" | "failed";
  /** ISO time the request started (estimates and the polling caps count from here). */
  startedAt: string;
  /** The polling cap passed while still running: show "taking longer" and Refresh. */
  takingLonger: boolean;
  /** One more poll (the Refresh button). */
  refresh(): void;
}

export interface KpiAssistantValue {
  /** canSuggestKpis(role): false for donor viewers (no KPI UI at all). */
  enabled: boolean;
  /** undefined while the status is loading. */
  aiConfigured: boolean | undefined;
  lang: AppLanguage;
  projectId: string;
  frameworkId: string;
  pendingFor(resultId: string): KpiSuggestion[];
  /** Includes the local timed view during the synchronous wait. */
  runFor(target: { resultId: string } | { scope: "framework" }): KpiRunView | null;
  latestFrameworkRun: KpiRun | null;
  request(body: RequestKpiSuggestionsBody): void;
  errorFor(target: { resultId: string } | { scope: "framework" }): { code: string; message: string } | null;
}

export const KpiAssistantContext: Context<KpiAssistantValue | null> = createContext<KpiAssistantValue | null>(null);

/** The KPI Assistant state; throws outside KpiAssistantProvider. */
export function useKpiAssistant(): KpiAssistantValue {
  const value = useContext(KpiAssistantContext);
  if (!value) throw new Error("useKpiAssistant must be used within KpiAssistantProvider");
  return value;
}
