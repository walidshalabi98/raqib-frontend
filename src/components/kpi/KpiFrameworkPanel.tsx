import { useEffect, useId, useRef, useState } from "react";
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
 * framework run's notes (KpiWarningList; AI notes labelled). A visually hidden status, always present while the
 * assistant is enabled, announces "N suggestions ready across all results" when a framework run it saw running
 * completes (WCAG 4.1.3; the progress region unmounts then, which announces nothing; failures use the alert). Shows
 * nothing else when there is nothing to show, and nothing at all when the assistant is disabled (donor viewers).
 */
export function KpiFrameworkPanel() {
  const kpi = useKpiAssistant();
  const { t } = useTranslation(undefined, { lng: kpi.lang });
  const gapsId = useId();
  const [announcement, setAnnouncement] = useState("");
  const sawRunning = useRef(false);
  const announcedRun = useRef<string | null>(null);

  const view = kpi.enabled ? kpi.runFor({ scope: "framework" }) : null;
  const viewStatus = view?.status;
  const finished = view?.status === "completed" ? view.run : null;

  // Announce once per framework run that was seen running and then completed (not one completed before mount).
  useEffect(() => {
    if (viewStatus === "running") {
      sawRunning.current = true;
      return;
    }
    if (!sawRunning.current) return;
    if (viewStatus === "failed" || !viewStatus) {
      sawRunning.current = false;
      return;
    }
    if (finished && announcedRun.current !== finished.id) {
      sawRunning.current = false;
      announcedRun.current = finished.id;
      setAnnouncement(t("kpi.readyFramework", { count: finished.suggestionCount }));
    }
  }, [viewStatus, finished, t]);

  if (!kpi.enabled) return null;

  const error = kpi.errorFor({ scope: "framework" });
  const latest = kpi.latestFrameworkRun;
  const gaps = latest && latest.status === "completed" ? latest.frameworkWarnings : [];
  const notConfigured = kpi.aiConfigured === false;
  const running = view?.status === "running";
  const listError = kpi.listError ?? null;
  const visible = notConfigured || running || Boolean(error) || Boolean(listError) || gaps.length > 0;

  // The status stays first and mounted whatever else shows, so its text change is announced.
  return (
    <>
      <p role="status" lang={kpi.lang} className="sr-only">{announcement}</p>
      {visible && (
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
      )}
    </>
  );
}
