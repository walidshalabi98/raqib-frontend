import { mockReports } from "@/data/mockData";
import { Download, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const typeBadge: Record<string, string> = {
  assessment_report: "bg-info/10 text-info",
  monthly_progress: "bg-success/10 text-success",
  quarterly_summary: "bg-warning/10 text-warning",
};

export function ReportsList() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button><Plus className="h-4 w-4 mr-1.5" /> Generate Report</Button>
      </div>
      <div className="card-surface divide-y">
        {mockReports.map(r => (
          <div key={r.id} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{r.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeBadge[r.type] || "bg-secondary text-muted-foreground"}`}>
                    {r.type.replace("_", " ")}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase">{r.donor_format}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.period_start).toLocaleDateString()} — {new Date(r.period_end).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
