import type { AppLanguage } from "@/i18n";
import type { QualityBand } from "@/types/api";

export interface QualityBadgeProps {
  score: number;
  band: QualityBand;
  lang: AppLanguage;
}

/**
 * Quality: icon + text + score; the band only tints (CheckCircle2 / AlertCircle / XCircle) (design section 9.3).
 *
 * Step 0 shell (Phase 4 contracts): final props; renders nothing until E7 implements it.
 */
export function QualityBadge(_props: QualityBadgeProps) {
  return null;
}
