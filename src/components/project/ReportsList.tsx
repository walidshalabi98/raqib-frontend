import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Download, FileText, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

const typeBadge: Record<string, string> = {
  assessment_report: "bg-info/10 text-info",
  monthly_progress: "bg-success/10 text-success",
  quarterly_summary: "bg-warning/10 text-warning",
  annual_review: "bg-primary/10 text-primary",
  donor_export: "bg-secondary text-secondary-foreground",
};

export function ReportsList({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState("quarterly_summary");
  const [donorFormat, setDonorFormat] = useState("eu");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['reports', projectId],
    queryFn: () => api.getReports(projectId),
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.generateReport(projectId, {
        type: reportType,
        donorFormat,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['reports', projectId] });
      setOpen(false);
      toast.success("Report generation started. It will appear here when ready.");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1.5" /> Generate Report</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Generate Report</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Report Type</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly_progress">Monthly Progress</SelectItem>
                    <SelectItem value="quarterly_summary">Quarterly Summary</SelectItem>
                    <SelectItem value="assessment_report">Assessment Report</SelectItem>
                    <SelectItem value="donor_export">Donor Export</SelectItem>
                    <SelectItem value="annual_review">Annual Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Donor Format</Label>
                <Select value={donorFormat} onValueChange={setDonorFormat}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eu">EU</SelectItem>
                    <SelectItem value="usaid">USAID</SelectItem>
                    <SelectItem value="giz">GIZ</SelectItem>
                    <SelectItem value="undp">UNDP</SelectItem>
                    <SelectItem value="unicef">UNICEF</SelectItem>
                    <SelectItem value="sida">SIDA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Period Start</Label>
                  <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label>Period End</Label>
                  <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="rounded-lg" />
                </div>
              </div>
              <Button className="w-full" onClick={handleGenerate} disabled={generating}>
                {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : "Generate Report"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {reports.length === 0 ? (
        <div className="card-surface p-8 text-center text-muted-foreground">No reports generated yet.</div>
      ) : (
        <div className="card-surface divide-y">
          {reports.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{r.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeBadge[r.type] || "bg-secondary text-muted-foreground"}`}>
                      {(r.type || '').replace("_", " ")}
                    </span>
                    {r.donorFormat && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase">{r.donorFormat}</span>}
                    {r.periodStart && r.periodEnd && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.periodStart).toLocaleDateString()} — {new Date(r.periodEnd).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {r.fileUrl && <Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
