import type { ResultNode } from "@/types/api";
import { useKpiAssistant } from "@/hooks/useKpiAssistant";

/** Row variant: one result (impact, outcome or output). Header variant: framework scope. */
export type SuggestKpisButtonProps = { variant: "row"; result: ResultNode } | { variant: "header" };

/**
 * "Suggest KPIs" for one result (row) or all results (header). Null when the assistant is disabled or the result is
 * an activity; aria-disabled while a run for it is active or the AI is not configured (design sections 9.3–9.4).
 *
 * Step 0 shell (Phase 4 contracts): final props; renders nothing until E7 implements it.
 */
export function SuggestKpisButton(props: SuggestKpisButtonProps) {
  const { enabled } = useKpiAssistant();
  if (!enabled || (props.variant === "row" && props.result.level === "activity")) return null;
  return null;
}
