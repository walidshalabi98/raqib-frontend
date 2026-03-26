import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { ASSESSMENT_STAGES, METHOD_LABELS, Method } from "@/data/mockData";
import { MethodPill } from "@/components/common/MethodPill";
import { Loader2 } from "lucide-react";

const stageLabels: Record<string, string> = {
  requested: "Requested",
  scoping: "Scoping",
  in_field: "In Field",
  data_cleaning: "Data Cleaning",
  analysis: "Analysis",
  reporting: "Reporting",
  delivered: "Delivered",
};

function getStageIndex(status: string): number {
  const map: Record<string, number> = { requested: 0, scoping: 1, in_field: 2, data_cleaning: 3, analysis: 4, reporting: 5, delivered: 6 };
  return map[status] ?? 0;
}

export function AssessmentPipeline({ projectId }: { projectId: string }) {
  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ['assessments', projectId],
    queryFn: () => api.getAssessments(projectId),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  if (assessments.length === 0) {
    return <div className="card-surface p-8 text-center text-muted-foreground">No assessments yet.</div>;
  }

  return (
    <div className="space-y-4">
      {assessments.map((a: any) => {
        const activeIdx = getStageIndex(a.status);
        const methods: string[] = Array.isArray(a.methodsIncluded) ? a.methodsIncluded : [];
        return (
          <div key={a.id} className="card-surface p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold capitalize">{(a.type || '').replace("_", " ")}</h3>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {methods.map((m: string) => <MethodPill key={m} method={m as Method} size="xs" />)}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {a.sampleSize && <p>Sample: {a.sampleSize}</p>}
                {a.priceUsd && <p className="font-medium text-foreground">${Number(a.priceUsd).toLocaleString()}</p>}
              </div>
            </div>
            <div className="flex items-center gap-0 overflow-x-auto pb-1">
              {ASSESSMENT_STAGES.map((stage, i) => {
                const isCompleted = i < activeIdx;
                const isActive = i === activeIdx;
                return (
                  <div key={stage} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div className={`h-3 w-3 rounded-full border-2 ${
                        isCompleted ? "bg-success border-success" : isActive ? "bg-primary border-primary" : "bg-card border-muted-foreground/30"
                      }`} />
                      <span className={`text-[9px] mt-1 whitespace-nowrap ${isActive ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                        {stageLabels[stage]}
                      </span>
                    </div>
                    {i < ASSESSMENT_STAGES.length - 1 && (
                      <div className={`h-0.5 w-6 mx-0.5 ${isCompleted ? "bg-success" : "bg-muted-foreground/20"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
