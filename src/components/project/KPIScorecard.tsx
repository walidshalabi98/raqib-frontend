import { useId } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, BadgeCheck, CheckCircle2, Circle, XCircle, type LucideIcon } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import { Sparkline } from "./Sparkline";
import { chartValue, progressBarPercent, trendPoints } from "@/lib/trends";
import type { DashboardTrend, IndicatorStatus } from "@/types/api";

/** Each indicator status as icon, colour token and label (docs/UX_STANDARDS.md §4): never colour alone. */
const STATUS: Record<IndicatorStatus, { icon: LucideIcon; text: string; bar: string; line: string }> = {
  on_track: { icon: CheckCircle2, text: "text-success", bar: "bg-success", line: "hsl(var(--success))" },
  at_risk: { icon: AlertTriangle, text: "text-warning", bar: "bg-warning", line: "hsl(var(--warning))" },
  off_track: { icon: XCircle, text: "text-danger", bar: "bg-danger", line: "hsl(var(--danger))" },
  not_started: { icon: Circle, text: "text-muted-foreground", bar: "bg-muted-foreground", line: "hsl(var(--muted-foreground))" },
  completed: { icon: BadgeCheck, text: "text-success", bar: "bg-success", line: "hsl(var(--success))" },
};

const statusOf = (status: unknown): IndicatorStatus =>
  typeof status === "string" && Object.prototype.hasOwnProperty.call(STATUS, status) ? (status as IndicatorStatus) : "not_started";

const textOf = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

/**
 * One card per indicator of the project dashboard: status (icon and text), current value against the target,
 * a sparkline and a progress bar from baseline to target when it can be computed (src/lib/trends.ts). Renders the staff and the donor shape alike
 * (donor survey results arrive as monthly aggregates: src/lib/trends.ts).
 */
export function KPIScorecard({ trends, lang }: { trends: readonly DashboardTrend[]; lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="mb-3 text-sm font-semibold">{t("dashboard.scorecardTitle")}</h3>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {trends.map((ind, index) => {
          const status = statusOf(ind.status);
          const { icon: StatusIcon, text, bar, line } = STATUS[status];
          const current = textOf(ind.currentValue);
          const target = textOf(ind.targetValue);
          const sparkline = trendPoints(ind).map((point) => chartValue(point.value)).filter((value): value is number => value !== null);
          // From baseline to target, as the backend computes progress (reports, risk analysis).
          const percent = progressBarPercent(ind);
          return (
            <li key={ind.indicatorId ?? index} className="card-surface p-4 transition-colors hover:border-border-strong">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 break-words text-sm font-medium leading-tight text-foreground" dir="auto">
                  {textOf(ind.indicatorText)}
                </p>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground">
                  <StatusIcon aria-hidden="true" className={`h-3.5 w-3.5 ${text}`} />
                  {t(`status.${status}`)}
                </span>
              </div>
              <div className="mb-1 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("dashboard.currentValue")}</p>
                  {current ? (
                    <p className="break-words text-2xl font-semibold tracking-tight text-foreground" dir="auto">{current}</p>
                  ) : (
                    <p className="py-1.5 text-sm font-medium text-muted-foreground">{t("dashboard.noValue")}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {target ? t("dashboard.target", { value: target }) : t("dashboard.targetNotSet")}
                  </p>
                </div>
                {sparkline.length > 1 && (
                  // The values are in the trend chart and its table: the sparkline is a picture only.
                  <div aria-hidden="true" className="w-20 shrink-0">
                    <Sparkline data={sparkline} color={line} />
                  </div>
                )}
              </div>
              {percent !== null && (
                // The values above say it in text; the bar repeats it visually.
                <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div data-testid="progress-bar" className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${percent}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
