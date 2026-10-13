import type { AppLanguage } from "@/i18n";
import type { KpiRunStep, KpiScopeType } from "@/types/api";

export interface KpiProgressStepsProps {
  /** Current step (context, retrieval, model, validation are shown; later steps show all done). */
  step: KpiRunStep;
  /** Chooses the estimate ("about 15 seconds" or "one to two minutes") and the title. */
  scope: KpiScopeType;
  lang: AppLanguage;
  /** Result code for the title (result and alternatives scope). */
  code?: string;
  /** The polling cap passed: show "taking longer" and Refresh. */
  takingLonger?: boolean;
  onRefresh?: () => void;
}

/**
 * Four named steps with done / current / pending icons and sr-only states, the estimate and "taking longer" +
 * Refresh (design section 9.4).
 *
 * Step 0 shell (Phase 4 contracts): final props (not fixed by the design; E7 may refine them); renders nothing until
 * E7 implements it.
 */
export function KpiProgressSteps(_props: KpiProgressStepsProps) {
  return null;
}
