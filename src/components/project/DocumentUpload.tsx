import { mockDocuments } from "@/data/mockData";
import { FileText, FileSpreadsheet, File, Upload } from "lucide-react";

const typeIcon: Record<string, React.ElementType> = {
  proposal: FileText,
  logframe: FileSpreadsheet,
  theory_of_change: File,
  donor_guidelines: FileText,
  other: File,
};

const typeLabels: Record<string, string> = {
  proposal: "Proposal",
  logframe: "Logframe",
  theory_of_change: "Theory of Change",
  donor_guidelines: "Donor Guidelines",
  other: "Other",
};

export function DocumentUpload() {
  return (
    <div className="space-y-4">
      <div className="card-surface border-dashed border-2 p-8 text-center">
        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">Drag and drop files here</p>
        <p className="text-xs text-muted-foreground mt-1">or click to browse · PDF, DOCX, XLSX up to 25MB</p>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {mockDocuments.map(doc => {
          const Icon = typeIcon[doc.type] || File;
          return (
            <div key={doc.id} className="card-surface p-4 hover:border-border-strong transition-colors">
              <div className="flex items-start gap-3">
                <Icon className="h-8 w-8 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{typeLabels[doc.type]}</span>
                  <p className="text-xs text-muted-foreground mt-1">{doc.uploaded_by} · {doc.uploaded_at} · {doc.size}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
