import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dirFor, type AppLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * The warning next to every file input whose text reaches the AI: Raqib removes
 * phone numbers, ID numbers and email addresses, but not names or addresses
 * (CLAUDE.md rule 5, docs/AI.md "Limits"). Text plus icon; the file input points
 * at it with aria-describedby (UX standards §5, field warnings). It carries its
 * own lang and dir, so it reads correctly on screens not yet translated.
 */
export function PersonalDataWarning({ id, lang, className }: { id: string; lang: AppLanguage; className?: string }) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <p
      id={id}
      lang={lang}
      dir={dirFor(lang)}
      className={cn("flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-start text-xs font-medium", className)}
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <span>{t("ai.personalDataWarning")}</span>
    </p>
  );
}
