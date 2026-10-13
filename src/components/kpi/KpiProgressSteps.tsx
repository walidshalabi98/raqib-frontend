import { useId } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, Circle, Loader2 } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import type { KpiRunStep, KpiScopeType } from "@/types/api";
import { KPI_RUN_STEPS_SHOWN } from "@/lib/constants";
import { shownStepIndex } from "@/lib/kpiSuggestions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface KpiProgressStepsProps {
  /** Current step (context, retrieval, model, validation are shown; saving and done show every step done). */
  step: KpiRunStep;
  /** Chooses the estimate ("about 15 seconds" or "one to two minutes") and the title. */
  scope: KpiScopeType;
  lang: AppLanguage;
  /** Result code for the title (result and alternatives scope). */
  code?: string;
  /** The polling cap passed: show "taking longer" and Refresh. */
  takingLonger?: boolean;
  onRefresh?: () => void;
}

type StepState = "done" | "current" | "pending";

/**
 * AI task progress (UX_STANDARDS §5 "AI tasks show named progress steps and an estimated time"; design 9.4): four
 * named steps with done (Check) / current (spinner, motion-safe only) / not started (Circle) icons and visually hidden
 * state text, the estimate, and "taking longer" + Refresh once polling stops. A visually hidden status region
 * announces the step name only when the step changes (and "taking longer" once).
 */
export function KpiProgressSteps({ step, scope, lang, code, takingLonger = false, onRefresh }: KpiProgressStepsProps) {
  const { t } = useTranslation(undefined, { lng: lang });
  const titleId = useId();
  const current = shownStepIndex(step);
  const title = scope === "framework" ? t("kpi.progress.titleFramework") : t("kpi.progress.title", { code: code ?? "" });
  const estimate = t(scope === "framework" ? "kpi.progress.estimate.framework" : "kpi.progress.estimate.result");
  const announcement = takingLonger
    ? t("common.takingLonger")
    : current < KPI_RUN_STEPS_SHOWN.length ? t(`kpi.progress.steps.${KPI_RUN_STEPS_SHOWN[current]}`) : "";

  return (
    <div className="min-w-0 rounded-md border border-dashed bg-card p-3 text-sm">
      <p id={titleId} className="font-medium break-words">{title}</p>
      <ol aria-labelledby={titleId} className="mt-2 space-y-1">
        {KPI_RUN_STEPS_SHOWN.map((name, index) => {
          const state: StepState = index < current ? "done" : index === current ? "current" : "pending";
          return (
            <li
              key={name}
              aria-current={state === "current" ? "step" : undefined}
              className={cn("flex items-center gap-2", state === "pending" && "text-muted-foreground", state === "current" && "font-medium")}
            >
              {state === "done" && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />}
              {state === "current" && <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 text-primary motion-safe:animate-spin" />}
              {state === "pending" && <Circle aria-hidden="true" className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 break-words">
                {t(`kpi.progress.steps.${name}`)}
                <span className="sr-only"> ({t(`kpi.progress.state.${state}`)})</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">{estimate}</p>
      {takingLonger && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
          <span>{t("common.takingLonger")}</span>
          {onRefresh && (
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={onRefresh}>
              {t("common.refresh")}
            </Button>
          )}
        </div>
      )}
      <p role="status" className="sr-only">{announcement}</p>
    </div>
  );
}
