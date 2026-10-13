import type { AppLanguage } from "@/i18n";
import type { KpiWarning } from "@/types/api";

export interface KpiWarningListProps {
  warnings: readonly KpiWarning[];
  lang: AppLanguage;
  /** Id of the list (for aria-describedby). */
  id?: string;
}

/**
 * Validation notes translated by code (warningText): warnings with AlertTriangle, info notes muted with Info; a
 * model_note is labelled "AI note" (design section 9.4). Used by the card, KpiFrameworkPanel and E8's
 * ResultIndicatorList.
 *
 * Step 0 shell (Phase 4 contracts): final props (not fixed by the design); renders nothing until E7 implements it.
 */
export function KpiWarningList(_props: KpiWarningListProps) {
  return null;
}
