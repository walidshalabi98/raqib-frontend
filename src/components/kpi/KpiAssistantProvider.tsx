import { useMemo, type ReactNode } from "react";
import type { AppLanguage } from "@/i18n";
import { KpiAssistantContext, type KpiAssistantValue } from "@/hooks/useKpiAssistant";

export interface KpiAssistantProviderProps {
  projectId: string;
  frameworkId: string;
  /** Language of the panel the assistant renders in. */
  lang: AppLanguage;
  children: ReactNode;
}

/**
 * Holds the KPI Assistant state for one framework's results chain: status, pending suggestions, run tracking and
 * request() (design sections 9.1 and 9.3). Renders nothing itself.
 *
 * Step 0 shell (Phase 4 contracts): final props; provides a disabled assistant until E7 implements it.
 */
export function KpiAssistantProvider({ projectId, frameworkId, lang, children }: KpiAssistantProviderProps) {
  const value = useMemo<KpiAssistantValue>(() => ({
    enabled: false,
    aiConfigured: undefined,
    lang,
    projectId,
    frameworkId,
    pendingFor: () => [],
    runFor: () => null,
    latestFrameworkRun: null,
    request: () => undefined,
    errorFor: () => null,
  }), [projectId, frameworkId, lang]);
  return <KpiAssistantContext.Provider value={value}>{children}</KpiAssistantContext.Provider>;
}
