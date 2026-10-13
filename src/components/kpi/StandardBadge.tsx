import { useTranslation } from "react-i18next";
import { Award, BookOpen, PenLine } from "lucide-react";
import type { AppLanguage } from "@/i18n";

export interface StandardBadgeProps {
  libraryId: string | null;
  standardReferenceCode: string | null;
  lang: AppLanguage;
}

const BADGE = "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium";

/**
 * Where an indicator comes from (knowledge/kpi-assistant-spec.md §A1 "library vs AI-written vs donor-standard", §A7;
 * design 9.3): the donor or standard reference ("EU GERF 2.38", left-to-right), else the library entry
 * ("Library FS-01"), else "Custom". Icon + text.
 */
export function StandardBadge({ libraryId, standardReferenceCode, lang }: StandardBadgeProps) {
  const { t } = useTranslation(undefined, { lng: lang });
  const reference = standardReferenceCode?.trim();
  if (reference) {
    return (
      <span className={`${BADGE} border-primary/30 bg-primary/5 text-foreground`}>
        <Award aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span dir="ltr" className="min-w-0 break-words">{reference}</span>
      </span>
    );
  }
  if (libraryId) {
    return (
      <span className={`${BADGE} border-border bg-secondary text-secondary-foreground`}>
        <BookOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 break-words">{t("kpi.card.library", { id: libraryId })}</span>
      </span>
    );
  }
  return (
    <span className={`${BADGE} border-dashed border-border text-muted-foreground`}>
      <PenLine aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {t("kpi.card.custom")}
    </span>
  );
}
