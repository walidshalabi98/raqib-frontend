import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { MethodPill } from "@/components/common/MethodPill";
import { StatusDot } from "@/components/common/StatusDot";
import { Sparkline } from "./Sparkline";
import { Loader2 } from "lucide-react";

const statusColor: Record<string, string> = { on_track: "hsl(var(--success))", at_risk: "hsl(var(--warning))", off_track: "hsl(var(--danger))", not_started: "hsl(var(--muted-foreground))" };

export function KPIScorecard({ projectId }: { projectId: string }) {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', projectId],
    queryFn: () => api.getDashboard(projectId),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const trends = dashboard?.trends || [];

  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {trends.map((ind: any) => {
        const trendData = ind.dataPoints?.map((dp: any) => parseFloat(dp.value)).filter((v: number) => !isNaN(v));
        return (
          <div key={ind.indicatorId} className="card-surface p-4 hover:border-border-strong transition-colors">
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm font-medium text-foreground leading-tight flex-1 mr-2">{ind.indicatorText}</p>
              <StatusDot status={ind.status} />
            </div>
            <div className="flex items-end justify-between mb-1">
              <div>
                <p className="text-2xl font-semibold tracking-tight text-foreground">{ind.currentValue || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Target: {ind.targetValue || 'N/A'}</p>
              </div>
              {trendData && trendData.length > 1 && (
                <div className="w-20">
                  <Sparkline data={trendData} color={statusColor[ind.status] || statusColor.not_started} />
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
                    const cur = parseFloat(String(ind.currentValue || '').replace(/[^0-9.]/g, ""));
                    const tar = parseFloat(String(ind.targetValue || '').replace(/[^0-9.]/g, ""));
                    if (!isNaN(cur) && !isNaN(tar) && tar > 0) return (cur / tar) * 100;
                    return 50;
                  })())}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
