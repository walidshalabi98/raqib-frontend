import type { IndicatorStatus } from "@/types/api";

const statusConfig: Record<IndicatorStatus, { color: string; label: string }> = {
  on_track: { color: "bg-success", label: "On Track" },
  at_risk: { color: "bg-warning", label: "At Risk" },
  off_track: { color: "bg-danger", label: "Off Track" },
  not_started: { color: "bg-muted-foreground", label: "Not Started" },
  completed: { color: "bg-success", label: "Completed" },
};

/**
 * An indicator's status as a coloured dot and, with `showLabel`, its name. The label is in the text colour: the status
 * colours on white are below the 4.5:1 contrast that small text needs (WCAG 1.4.3; success 3.4:1, warning 3.5:1), and
 * the dot already carries the colour.
 */
export function StatusDot({ status, showLabel = false, size = "md" }: { status: IndicatorStatus; showLabel?: boolean; size?: "sm" | "md" }) {
  const config = statusConfig[status] ?? statusConfig.not_started;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden={showLabel ? "true" : undefined} className={`rounded-full ${config.color} ${size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"}`} />
      {showLabel && <span className="text-xs font-medium text-foreground">{config.label}</span>}
    </span>
  );
}
