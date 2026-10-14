import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles } from "lucide-react";
import type { ResultNode } from "@/types/api";
import { useKpiAssistant } from "@/hooks/useKpiAssistant";
import { isSuggestableLevel, kpiNoticeId, suggestKpisButtonId } from "@/lib/kpiSuggestions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Row variant: one result (impact, outcome or output). Header variant: framework scope. */
export type SuggestKpisButtonProps = { variant: "row"; result: ResultNode } | { variant: "header" };

/**
 * "Suggest KPIs" for one result (row) or for all results (header) (knowledge/kpi-assistant-spec.md §A2 trigger 1;
 * design 9.3–9.4). Null when the assistant is disabled (donor viewers), the project is read-only (archived) or the result is an activity. While a run for
 * it is active (a framework run counts for every row) the button is aria-disabled and shows a spinner; when the AI is
 * not configured it stays visible but aria-disabled, described by the not-configured notice. The row button has the
 * id suggestKpisButtonId(result.id), the focus fallback of the result's suggestion list.
 */
export function SuggestKpisButton(props: SuggestKpisButtonProps) {
  const kpi = useKpiAssistant();
  const { t } = useTranslation(undefined, { lng: kpi.lang });
  if (!kpi.writable) return null;
  if (props.variant === "row" && !isSuggestableLevel(props.result.level)) return null;

  const frameworkRun = kpi.runFor({ scope: "framework" });
  const ownRun = props.variant === "row" ? kpi.runFor({ resultId: props.result.id }) : null;
  const running = frameworkRun?.status === "running" || ownRun?.status === "running";
  const notConfigured = kpi.aiConfigured === false;
  const unavailable = running || notConfigured;

  const label = props.variant === "row" ? t("kpi.suggestForResult", { code: props.result.code }) : t("kpi.suggestFramework");
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (unavailable) {
      event.preventDefault();
      return;
    }
    kpi.request(props.variant === "row" ? { scope: "result", resultId: props.result.id } : { scope: "framework" });
  };

  return (
    <Button
      type="button"
      id={props.variant === "row" ? suggestKpisButtonId(props.result.id) : undefined}
      variant={props.variant === "header" ? "default" : "outline"}
      size="sm"
      aria-label={label}
      aria-disabled={unavailable ? "true" : undefined}
      aria-describedby={notConfigured ? kpiNoticeId(kpi.projectId) : undefined}
      onClick={onClick}
      className={cn(
        props.variant === "row" && "h-11 px-2.5 sm:h-8",
        unavailable && "cursor-not-allowed opacity-60",
      )}
    >
      {running ? (
        <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
      ) : (
        <Sparkles aria-hidden="true" />
      )}
      {t("kpi.suggest")}
    </Button>
  );
}
