import { useId } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Info, Lightbulb } from "lucide-react";
import { dirFor } from "@/i18n";
import { useKpiAssistant } from "@/hooks/useKpiAssistant";
import { kpiNoticeId } from "@/lib/kpiSuggestions";
import { Button } from "@/components/ui/button";
import { KpiProgressSteps } from "@/components/kpi/KpiProgressSteps";
import { KpiWarningList } from "@/components/kpi/KpiWarningList";

/**
 * Framework-level KPI panel (knowledge/kpi-assistant-spec.md §A2, §A7; design 9.1 and 9.4), placed under the results
 * chain header: the not-configured notice (title + body; the Suggest KPIs buttons point at it with aria-describedby),
 * the framework run's progress steps, its error (role=alert + Retry), a failed suggestion list (role=alert + Retry)
 * and "Gaps Raqib noticed": the latest completed
 * framework run's notes (KpiWarningList; AI notes labelled). Renders nothing when there is nothing to show or the
 * assistant is disabled (donor viewers).
 */
export function KpiFrameworkPanel() {
  const kpi = useKpiAssistant();
  const { t } = useTranslation(undefined, { lng: kpi.lang });
  const gapsId = useId();
  if (!kpi.enabled) return null;

  const view = kpi.runFor({ scope: "framework" });
  const error = kpi.errorFor({ scope: "framework" });
  const latest = kpi.latestFrameworkRun;
  const gaps = latest && latest.status === "completed" ? latest.frameworkWarnings : [];
  const notConfigured = kpi.aiConfigured === false;
  const running = view?.status === "running";
  const listError = kpi.listError ?? null;
  if (!notConfigured && !running && !error && !listError && gaps.length === 0) return null;

  return (
    <div dir={dirFor(kpi.lang)} lang={kpi.lang} className="min-w-0 space-y-3">
      {notConfigured && (
        <div id={kpiNoticeId(kpi.projectId)} className="flex items-start gap-2 rounded-md border border-info/40 bg-info/5 p-3 text-sm">
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">{t("kpi.notConfigured.title")}</p>
            <p className="text-muted-foreground">{t("kpi.notConfigured.body")}</p>
          </div>
        </div>
      )}

      {running && view && (
        <KpiProgressSteps
          step={view.step}
          scope="framework"
          lang={kpi.lang}
          takingLonger={view.takingLonger}
          onRefresh={view.refresh}
        />
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-sm">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">{error.message}</span>
          {error.retry && (
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={error.retry}>
              {t("common.retry")}
            </Button>
          )}
        </div>
      )}

      {listError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-sm">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">{listError.message}</span>
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={listError.retry}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {gaps.length > 0 && (
        <section aria-labelledby={gapsId} className="space-y-1.5 rounded-md border border-dashed p-3">
          <h4 id={gapsId} className="flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t("kpi.frameworkWarnings.title")}
          </h4>
          <KpiWarningList warnings={gaps} lang={kpi.lang} />
        </section>
      )}
    </div>
  );
}
