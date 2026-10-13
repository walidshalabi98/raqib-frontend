import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { dirFor } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { isForbidden } from "@/lib/apiError";
import { useProjectDashboard } from "@/hooks/useProjectDashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KPIScorecard } from "@/components/project/KPIScorecard";
import { TrendChart } from "@/components/project/TrendChart";
import type { DashboardTrend } from "@/types/api";

/**
 * The project's Dashboard tab: indicator cards and trends from GET /api/dashboard/projects/:id/dashboard, with
 * loading, error and empty states. Org staff and donor viewers get the same keys and the same screen; the donor
 * rows carry less (survey results as monthly aggregates, listed places only, no notes or authors), which the
 * cards and the chart read without assuming the staff fields.
 */
export function ProjectDashboard({ projectId }: { projectId: string }) {
  const lang = useUserLanguage();
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const { data, isLoading, isError, error, refetch } = useProjectDashboard(projectId);

  if (isLoading) {
    return (
      <div role="status" className="space-y-5">
        <span lang={lang} className="sr-only">{t("common.loading")}</span>
        <div aria-hidden="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
        <Skeleton aria-hidden="true" className="h-72" />
      </div>
    );
  }

  // A failed request is never shown as "no indicators yet".
  if (isError) {
    return (
      <div role="alert" lang={lang} dir={dir} className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t(isForbidden(error) ? "errors.forbidden" : "dashboard.loadError")}</span>
        <Button size="sm" variant="outline" className="min-h-11" onClick={() => void refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  const trends: DashboardTrend[] = Array.isArray(data?.trends) ? data.trends.filter((trend) => trend && typeof trend === "object") : [];

  if (trends.length === 0) {
    return (
      <div lang={lang} dir={dir} className="card-surface p-8 text-center text-sm text-muted-foreground">
        {t("dashboard.empty")}
      </div>
    );
  }

  return (
    <div lang={lang} dir={dir} className="space-y-5">
      <KPIScorecard trends={trends} lang={lang} />
      <TrendChart trends={trends} lang={lang} />
    </div>
  );
}
