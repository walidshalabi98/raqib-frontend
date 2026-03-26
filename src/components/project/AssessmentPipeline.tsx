import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { ASSESSMENT_STAGES, Method } from "@/data/mockData";
import { MethodPill } from "@/components/common/MethodPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileText, Brain, CheckCircle2 } from "lucide-react";

const stageLabels: Record<string, string> = {
  requested: "Requested", scoping: "Scoping", in_field: "In Field",
  data_cleaning: "Data Cleaning", analysis: "AI Analysis", reporting: "Reporting", delivered: "Delivered",
};

function getStageIndex(status: string): number {
  const map: Record<string, number> = { requested: 0, scoping: 1, in_field: 2, data_cleaning: 3, analysis: 4, reporting: 5, delivered: 6 };
  return map[status] ?? 0;
}

export function AssessmentPipeline({ projectId }: { projectId: string }) {
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState<string | null>(null);

  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ['assessments', projectId],
    queryFn: () => api.getAssessments(projectId),
    refetchInterval: 10000, // Poll for status updates
  });

  const viewReport = async (assessmentId: string) => {
    setLoadingReport(assessmentId);
    try {
      const data = await api.getAssessmentReport(assessmentId);
      setViewingReport(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingReport(null);
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  if (assessments.length === 0) {
    return (
      <div className="card-surface p-8 text-center text-muted-foreground">
        <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>No assessments yet.</p>
        <p className="text-sm mt-1">Request an assessment and AI will automatically generate a comprehensive report.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {assessments.map((a: any) => {
        const activeIdx = getStageIndex(a.status);
        const methods: string[] = Array.isArray(a.methodsIncluded) ? a.methodsIncluded : [];
        const isDelivered = a.status === 'delivered';
        const isProcessing = ['scoping', 'in_field', 'data_cleaning', 'analysis', 'reporting'].includes(a.status);

        return (
          <div key={a.id} className="card-surface p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold capitalize">{(a.type || '').replace(/_/g, " ")}</h3>
                  {isProcessing && (
                    <Badge className="text-[10px] bg-blue-100 text-blue-700">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" /> AI Generating
                    </Badge>
                  )}
                  {isDelivered && (
                    <Badge className="text-[10px] bg-green-100 text-green-700">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {methods.map((m: string) => <MethodPill key={m} method={m as Method} size="xs" />)}
                </div>
              </div>
              <div className="text-right">
                {isDelivered && (
                  <Button variant="outline" size="sm" onClick={() => viewReport(a.id)} disabled={loadingReport === a.id}>
                    {loadingReport === a.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                    View Report
                  </Button>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {a.sampleSize && <span>Sample: {a.sampleSize} · </span>}
                  {new Date(a.requestedAt).toLocaleDateString()}
                </div>
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
                        isCompleted ? "bg-success border-success" : isActive ? "bg-primary border-primary animate-pulse" : "bg-card border-muted-foreground/30"
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

      {/* Report Viewer Dialog */}
      <Dialog open={!!viewingReport} onOpenChange={() => setViewingReport(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" /> AI Assessment Report
            </DialogTitle>
          </DialogHeader>
          {viewingReport?.report ? (
            <div className="space-y-5 text-sm">
              {viewingReport.report.executiveSummary && (
                <div>
                  <h3 className="font-semibold text-base mb-2">Executive Summary</h3>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{viewingReport.report.executiveSummary}</p>
                </div>
              )}
              {viewingReport.report.keyFindings?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-base mb-2">Key Findings</h3>
                  {viewingReport.report.keyFindings.map((f: any, i: number) => (
                    <div key={i} className="p-3 mb-2 bg-muted/50 rounded-md border-l-4 border-primary">
                      <div className="flex items-center gap-2 mb-1">
                        <strong>{f.area}</strong>
                        <Badge variant="outline" className="text-[10px]">{f.rating}</Badge>
                      </div>
                      <p className="text-muted-foreground">{f.finding}</p>
                      {f.evidence && <p className="text-xs text-muted-foreground mt-1 italic">Evidence: {f.evidence}</p>}
                    </div>
                  ))}
                </div>
              )}
              {viewingReport.report.recommendations?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-base mb-2">Recommendations</h3>
                  {viewingReport.report.recommendations.map((r: any, i: number) => (
                    <div key={i} className={`p-3 mb-2 rounded-md border-l-4 ${r.priority === 'high' ? 'border-red-500 bg-red-50' : r.priority === 'medium' ? 'border-amber-500 bg-amber-50' : 'border-blue-500 bg-blue-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-[10px] ${r.priority === 'high' ? 'bg-red-100 text-red-700' : r.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{r.priority}</Badge>
                        <span className="text-xs text-muted-foreground">{r.timeline}</span>
                      </div>
                      <p>{r.recommendation}</p>
                      {r.responsible && <p className="text-xs text-muted-foreground mt-1">Responsible: {r.responsible}</p>}
                    </div>
                  ))}
                </div>
              )}
              {viewingReport.report.lessonsLearned?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-base mb-2">Lessons Learned</h3>
                  <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                    {viewingReport.report.lessonsLearned.map((l: string, i: number) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
              )}
              {viewingReport.report.nextSteps?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-base mb-2">Next Steps</h3>
                  <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                    {viewingReport.report.nextSteps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              )}
              {viewingReport.deliveredAt && (
                <p className="text-xs text-muted-foreground text-right">Generated: {new Date(viewingReport.deliveredAt).toLocaleString()}</p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">Report not yet available. Assessment may still be processing.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
