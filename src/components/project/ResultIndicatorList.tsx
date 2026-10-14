import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import type { Indicator, IndicatorQuality, ResultNode } from "@/types/api";
import { useKpiAssistant } from "@/hooks/useKpiAssistant";
import { needsAiReviewLabel } from "@/lib/indicatorForm";
import { kpiNoticeId } from "@/lib/kpiSuggestions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AiSuggestedLabel } from "@/components/common/AiSuggestedLabel";
import { KpiWarningList } from "@/components/kpi/KpiWarningList";
import { QualityBadge } from "@/components/kpi/QualityBadge";
import { StandardBadge } from "@/components/kpi/StandardBadge";

export interface ResultIndicatorListProps {
  /** Id of the list, for the row's disclosure button (aria-controls). */
  id: string;
  /** Id of the element that names the list (the disclosure button). */
  labelledBy?: string;
  /** The result whose indicators are listed. */
  result: ResultNode;
  /** The result's indicators, in framework order. */
  indicators: readonly Indicator[];
  /** Deterministic quality checks by indicator id (useIndicatorQuality; empty for roles without the KPI Assistant). */
  quality: ReadonlyMap<string, IndicatorQuality>;
  lang: AppLanguage;
}

/**
 * The indicators of one result in the results chain (knowledge/kpi-assistant-spec.md §A7 "each result card shows its
 * indicators"; design sections 9.1 and 9.5), opened from the row's indicator-count disclosure. Each indicator shows
 * where it comes from (provenance, StandardBadge), the "AI suggested — review before approval" label until the
 * indicator itself is approved (design D18), and its quality badge. An indicator whose quality check costs points
 * (`needsAlternatives`) gets the weak-indicator prompt with the penalised notes and "Show alternatives"
 * (spec §A2 trigger 3: alternatives for that indicator), which needs the indicator to measure a result (D21) and a
 * role with the assistant; it stays visible but aria-disabled while the AI is not configured or a run for the result
 * is active, and is not shown on a read-only (archived) project, where the prompt and its notes stay to read. Must be
 * rendered inside KpiAssistantProvider.
 */
export function ResultIndicatorList({ id, labelledBy, result, indicators, quality, lang }: ResultIndicatorListProps) {
  const { t } = useTranslation(undefined, { lng: lang });
  const kpi = useKpiAssistant();

  const running = kpi.runFor({ resultId: result.id })?.status === "running"
    || kpi.runFor({ scope: "framework" })?.status === "running";
  const notConfigured = kpi.aiConfigured === false;

  return (
    <ul id={id} aria-labelledby={labelledBy} className="min-w-0 space-y-1.5">
      {indicators.map((indicator) => {
        const arabic = lang === "ar" && Boolean(indicator.indicatorTextAr);
        const name = arabic ? (indicator.indicatorTextAr as string) : indicator.indicatorText;
        const check = quality.get(indicator.id);
        const offerAlternatives = kpi.enabled && Boolean(check?.needsAlternatives);
        const penalised = check ? check.warnings.filter((w) => w.penalty > 0) : [];
        const promptId = `${id}-${indicator.id}-weak`;
        const onAlternatives = (event: MouseEvent<HTMLButtonElement>) => {
          if (running || notConfigured) {
            event.preventDefault();
            return;
          }
          kpi.request({ scope: "alternatives", indicatorId: indicator.id });
        };
        return (
          <li key={indicator.id} className="min-w-0 space-y-1.5 rounded-md border bg-background px-2.5 py-2">
            <p className="break-words text-sm font-medium" lang={arabic ? "ar" : "en"} dir={arabic ? "rtl" : "auto"}>
              {name}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t(`provenance.${indicator.provenance}`)}</span>
              <StandardBadge libraryId={indicator.libraryId} standardReferenceCode={indicator.standardReferenceCode} provenance={indicator.provenance} lang={lang} />
              {indicator.libraryId && indicator.standardReferenceCode && (
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">{indicator.libraryId}</span>
              )}
              {needsAiReviewLabel(indicator.provenance, indicator.isApproved) && <AiSuggestedLabel lang={lang} />}
              {check && <QualityBadge score={check.qualityScore} band={check.qualityBand} lang={lang} />}
            </div>
            {offerAlternatives && (
              <div className="min-w-0 space-y-1.5 rounded-md border border-warning/40 p-2">
                <p id={promptId} className="flex items-start gap-1.5 text-xs font-medium">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <span className="min-w-0 break-words">{t(kpi.writable ? "kpi.indicators.weakPrompt" : "kpi.indicators.weakPromptReadOnly")}</span>
                </p>
                <KpiWarningList warnings={penalised} lang={lang} />
                {/* Alternatives are suggested for a result (D21): an unlinked indicator gets no button. */}
                {kpi.writable && indicator.resultId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn("min-h-11 sm:min-h-8", (running || notConfigured) && "cursor-not-allowed opacity-60")}
                    aria-label={t("kpi.actions.alternativesNamed", { name })}
                    aria-disabled={running || notConfigured ? "true" : undefined}
                    aria-describedby={notConfigured ? kpiNoticeId(kpi.projectId) : promptId}
                    onClick={onAlternatives}
                  >
                    <RefreshCw aria-hidden="true" className="me-1.5 h-3.5 w-3.5" />
                    {t("kpi.actions.alternatives")}
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
