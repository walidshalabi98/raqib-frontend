import { IndicatorStatus } from "@/data/mockData";

const statusConfig: Record<IndicatorStatus, { color: string; label: string }> = {
  on_track: { color: "bg-success", label: "On Track" },
  at_risk: { color: "bg-warning", label: "At Risk" },
  off_track: { color: "bg-danger", label: "Off Track" },
  not_started: { color: "bg-muted-foreground", label: "Not Started" },
};

const textConfig: Record<IndicatorStatus, string> = {
  on_track: "text-success",
  at_risk: "text-warning",
  off_track: "text-danger",
  not_started: "text-muted-foreground",
};

export function StatusDot({ status, showLabel = false, size = "md" }: { status: IndicatorStatus; showLabel?: boolean; size?: "sm" | "md" }) {
  const config = statusConfig[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`rounded-full ${config.color} ${size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"}`} />
      {showLabel && <span className={`text-xs font-medium ${textConfig[status]}`}>{config.label}</span>}
    </span>
  );
}
