import { useTranslation } from "react-i18next";
import { AlertTriangle, Info } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import type { KpiWarning } from "@/types/api";
import { warningText } from "@/lib/kpiSuggestions";
import { cn } from "@/lib/utils";

export interface KpiWarningListProps {
  warnings: readonly KpiWarning[];
  lang: AppLanguage;
  /** Id of the list (for aria-describedby). */
  id?: string;
}

/**
 * Validation notes in the UI language (knowledge/kpi-assistant-spec.md §A4 step 3; design 9.4, 9.6): each note is
 * translated by code with its params (warningText). Warnings carry AlertTriangle on a warning tint with foreground
 * text (contrast); info notes are muted with Info. A model_note is labelled "AI note" and keeps the model's English
 * text (lang="en"). Each item starts with a visually hidden "Warning:" / "Note:" so the kind is never colour alone.
 * Renders nothing for an empty list. Used by the suggestion card, KpiFrameworkPanel and ResultIndicatorList.
 */
export function KpiWarningList({ warnings, lang, id }: KpiWarningListProps) {
  const { t } = useTranslation(undefined, { lng: lang });
  if (warnings.length === 0) return null;
  return (
    <ul id={id} className="space-y-1">
      {warnings.map((warning, index) => {
        const isWarning = warning.severity === "warning";
        const Icon = isWarning ? AlertTriangle : Info;
        const modelText = warning.code === "model_note" ? String(warning.params?.message ?? warning.message) : null;
        return (
          <li
            key={`${warning.code}-${index}`}
            className={cn(
              "flex min-w-0 items-start gap-1.5 rounded-md px-2 py-1 text-xs",
              isWarning ? "border border-warning/40 bg-warning/10 text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon aria-hidden="true" className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", isWarning && "text-warning")} />
            <span className="min-w-0 break-words">
              <span className="sr-only">{t(isWarning ? "kpi.severity.warning" : "kpi.severity.info")} </span>
              {modelText !== null ? (
                <>
                  <span className="font-medium">{t("kpi.frameworkWarnings.aiNotePrefix")} </span>
                  <span lang="en" dir="auto">{modelText}</span>
                </>
              ) : (
                warningText(t, warning)
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
