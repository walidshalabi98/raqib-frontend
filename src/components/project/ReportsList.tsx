import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/services/api";
import { dirFor } from "@/i18n";
import { formatDisplayDate } from "@/lib/dates";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { isForbidden } from "@/lib/apiError";
import { AlertCircle, Download, FileText, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

// Tinted backgrounds with foreground text: coloured text on its own tint is below WCAG AA (4.5:1).
const typeBadge: Record<string, string> = {
  assessment_report: "bg-info/10 text-foreground",
  monthly_progress: "bg-success/10 text-foreground",
  quarterly_summary: "bg-warning/10 text-foreground",
  annual_review: "bg-primary/10 text-foreground",
  donor_export: "bg-secondary text-secondary-foreground",
};

/**
 * `canGenerate` (default true) shows the Generate Report dialog; roles that cannot generate reports only read
 * them (donor viewers receive published reports only).
 */
export function ReportsList({ projectId, canGenerate = true }: { projectId: string; canGenerate?: boolean }) {
  const queryClient = useQueryClient();
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState("quarterly_summary");
  const [donorFormat, setDonorFormat] = useState("eu");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const { data: reports = [], isLoading, isError, error, refetch } = useQuery({
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
    } catch (err) {
      toast.error(errorMessage(err, "Failed to generate report"));
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div role="status" className="flex justify-center p-8">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        <span lang={lang} className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  // A failed request is never shown as "no reports yet".
  if (isError) {
    return (
      <div role="alert" lang={lang} dir={dirFor(lang)} className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t(isForbidden(error) ? "errors.forbidden" : "access.reports.loadError")}</span>
        <Button size="sm" variant="outline" className="min-h-11" onClick={() => void refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canGenerate && (
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
      )}
      {reports.length === 0 ? (
        <div lang={lang} dir={dirFor(lang)} className="card-surface p-8 text-center text-muted-foreground">{t(canGenerate ? "access.reports.empty" : "access.reports.emptyReadOnly")}</div>
      ) : (
        <div className="card-surface divide-y">
          {reports.map((r: any) => (
            // The row's labels are in the UI language; the title is as written.
            <div key={r.id} lang={lang} dir={dirFor(lang)} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <FileText aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
                <div>
                  {/* The title as written (its own direction), in a block aligned with the UI language. */}
                  <p className="text-sm font-medium"><span dir="auto">{r.title}</span></p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeBadge[r.type] || "bg-secondary text-secondary-foreground"}`}>
                      {t(`reportType.${r.type}`, { defaultValue: String(r.type ?? "").replace(/_/g, " ") })}
                    </span>
                    {r.donorFormat && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{t(`donorType.${r.donorFormat}`, { defaultValue: r.donorFormat })}</span>}
                    {r.periodStart && r.periodEnd && (
                      <span className="text-xs text-muted-foreground">
                        {formatDisplayDate(r.periodStart, lang)} – {formatDisplayDate(r.periodEnd, lang)}
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
