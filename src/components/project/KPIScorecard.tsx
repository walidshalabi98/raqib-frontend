import { mockIndicators, mockTrendData } from "@/data/mockData";
import { MethodPill } from "@/components/common/MethodPill";
import { StatusDot } from "@/components/common/StatusDot";
import { Sparkline } from "./Sparkline";

const statusColor = { on_track: "hsl(var(--success))", at_risk: "hsl(var(--warning))", off_track: "hsl(var(--danger))", not_started: "hsl(var(--muted-foreground))" };

export function KPIScorecard() {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {mockIndicators.map(ind => {
        const trend = mockTrendData[ind.id];
        return (
          <div key={ind.id} className="card-surface p-4 hover:border-border-strong transition-colors">
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm font-medium text-foreground leading-tight flex-1 mr-2">{ind.indicator_text}</p>
              <StatusDot status={ind.status} />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <MethodPill method={ind.method} size="xs" />
            </div>
            <div className="flex items-end justify-between mb-1">
              <div>
                <p className="text-2xl font-semibold tracking-tight text-foreground">{ind.current_value}</p>
                <p className="text-xs text-muted-foreground">Target: {ind.target_value}</p>
              </div>
              {trend && (
                <div className="w-20">
                  <Sparkline data={trend} color={statusColor[ind.status]} />
                </div>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  ind.status === "on_track" ? "bg-success" : ind.status === "at_risk" ? "bg-warning" : ind.status === "off_track" ? "bg-danger" : "bg-muted-foreground"
                }`}
                style={{
                  width: `${Math.min(100, (() => {
                    const cur = parseFloat(ind.current_value.replace(/[^0-9.]/g, ""));
                    const tar = parseFloat(ind.target_value.replace(/[^0-9.]/g, ""));
                    if (!isNaN(cur) && !isNaN(tar) && tar > 0) return (cur / tar) * 100;
                    return 50;
                  })())}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Updated Dec 2025</p>
          </div>
        );
      })}
    </div>
  );
}
