import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { MethodPill } from "@/components/common/MethodPill";
import { StatusDot } from "@/components/common/StatusDot";
import { LevelBadge } from "@/components/common/LevelBadge";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

export function IndicatorTable({ projectId }: { projectId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: framework, isLoading } = useQuery({
    queryKey: ['framework', projectId],
    queryFn: () => api.getFramework(projectId),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const indicators = framework?.indicators || [];

  if (indicators.length === 0) {
    return <div className="card-surface p-8 text-center text-muted-foreground">No framework generated yet.</div>;
  }

  return (
    <div className="card-surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50">
          <tr>
            <th className="w-8" />
            <th className="text-left px-3 py-3 font-medium text-muted-foreground">Indicator</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground">Level</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground">Method</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden lg:table-cell">Freq.</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden md:table-cell">Baseline</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden md:table-cell">Target</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground">Current</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden lg:table-cell">Phases</th>
            <th className="text-center px-3 py-3 font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {indicators.map((ind: any) => (
            <>
              <tr
                key={ind.id}
                className="hover:bg-secondary/30 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === ind.id ? null : ind.id)}
              >
                <td className="pl-3">
                  {expanded === ind.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </td>
                <td className="px-3 py-3 font-medium max-w-[250px]">{ind.indicatorText}</td>
                <td className="px-3 py-3"><LevelBadge level={ind.level} /></td>
                <td className="px-3 py-3"><MethodPill method={ind.dataCollectionMethod} size="xs" /></td>
                <td className="px-3 py-3 text-muted-foreground hidden lg:table-cell capitalize">{(ind.frequency || '').replace("_", " ")}</td>
                <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">{ind.baselineValue || 'N/A'}</td>
                <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">{ind.targetValue || 'N/A'}</td>
                <td className="px-3 py-3 font-medium">{ind.currentValue || 'N/A'}</td>
                <td className="px-3 py-3 hidden lg:table-cell">
                  <div className="flex gap-1 flex-wrap">
                    {(Array.isArray(ind.phases) ? ind.phases : []).map((p: string) => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">{p}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-center"><StatusDot status={ind.status} showLabel /></td>
              </tr>
              {expanded === ind.id && (
                <tr key={`${ind.id}-detail`}>
                  <td colSpan={10} className="px-6 py-4 bg-secondary/20">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-primary">AI Rationale:</span>
                      <span className="text-xs text-muted-foreground">{ind.aiRationale || 'No rationale available'}</span>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
