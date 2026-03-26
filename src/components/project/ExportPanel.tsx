import { useState } from "react";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Loader2, Database } from "lucide-react";

function downloadCSV(data: any[], filename: string) {
  if (!data.length) { toast.error("No data to export"); return; }
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map(row => headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val).replace(/"/g, '""');
      return str.includes(",") || str.includes("\n") ? `"${str}"` : str;
    }).join(","))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPanel({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState<string | null>(null);

  const exportIndicators = async () => {
    setLoading("indicators");
    try {
      const data = await api.exportIndicators(projectId);
      const rows = data.indicators.map((ind: any) => ({
        Indicator: ind.indicator,
        "Indicator (AR)": ind.indicatorAr || "",
        Level: ind.level,
        Method: ind.method,
        Frequency: ind.frequency,
        Baseline: ind.baseline || "",
        Target: ind.target || "",
        Current: ind.current || "",
        Unit: ind.unit || "",
        Status: ind.status,
        "Data Points": ind.dataPoints?.length || 0,
      }));
      downloadCSV(rows, `${data.project.name}_indicators.csv`);
      toast.success("Indicators exported!");
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setLoading(null);
    }
  };

  const exportBeneficiaries = async () => {
    setLoading("beneficiaries");
    try {
      const data = await api.exportBeneficiaries(projectId);
      const rows = data.beneficiaries.map((b: any) => ({
        Name: b.name,
        "Name (AR)": b.nameAr || "",
        Gender: b.gender,
        Age: b.age || "",
        "Age Group": b.ageGroup || "",
        Location: b.location || "",
        Governorate: b.governorate || "",
        "Household Size": b.householdSize || "",
        Status: b.status,
        "Registered At": b.registeredAt || "",
        "Services Received": b.servicesReceived,
      }));
      downloadCSV(rows, `${data.project.name}_beneficiaries.csv`);
      toast.success("Beneficiaries exported!");
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setLoading(null);
    }
  };

  const exportFull = async () => {
    setLoading("full");
    try {
      const data = await api.exportFullProject(projectId);
      downloadJSON(data, `${data.project.name}_full_export.json`);
      toast.success("Full project exported!");
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Download className="h-5 w-5" /> Export Data
      </h3>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6 text-center space-y-3">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-green-600" />
            <h4 className="font-medium">Indicators</h4>
            <p className="text-xs text-muted-foreground">Export all indicators with baseline, target, current values as CSV</p>
            <Button onClick={exportIndicators} disabled={loading === "indicators"} className="w-full" variant="outline">
              {loading === "indicators" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export CSV
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6 text-center space-y-3">
            <FileText className="h-10 w-10 mx-auto text-blue-600" />
            <h4 className="font-medium">Beneficiaries</h4>
            <p className="text-xs text-muted-foreground">Export beneficiary registry with demographics and services as CSV</p>
            <Button onClick={exportBeneficiaries} disabled={loading === "beneficiaries"} className="w-full" variant="outline">
              {loading === "beneficiaries" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export CSV
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6 text-center space-y-3">
            <Database className="h-10 w-10 mx-auto text-purple-600" />
            <h4 className="font-medium">Full Project</h4>
            <p className="text-xs text-muted-foreground">Export everything including assessments, qualitative data as JSON</p>
            <Button onClick={exportFull} disabled={loading === "full"} className="w-full" variant="outline">
              {loading === "full" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export JSON
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
