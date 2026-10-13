import type { AppLanguage } from "@/i18n";

export interface StandardBadgeProps {
  libraryId: string | null;
  standardReferenceCode: string | null;
  lang: AppLanguage;
}

/**
 * Where an indicator comes from: "EU GERF 2.38" (dir=ltr), else "Library FS-01", else "Custom" (design section 9.3).
 *
 * Step 0 shell (Phase 4 contracts): final props; renders nothing until E7 implements it.
 */
export function StandardBadge(_props: StandardBadgeProps) {
  return null;
}
