import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { FileText, FileSpreadsheet, File, Upload, Loader2 } from "lucide-react";

const typeIcon: Record<string, React.ElementType> = {
  proposal: FileText,
  logframe: FileSpreadsheet,
  theory_of_change: File,
  donor_guidelines: FileText,
  budget: FileSpreadsheet,
  other: File,
};

const typeLabels: Record<string, string> = {
  proposal: "Proposal",
  logframe: "Logframe",
  theory_of_change: "Theory of Change",
  donor_guidelines: "Donor Guidelines",
  budget: "Budget",
  baseline_report: "Baseline Report",
  other: "Other",
};

export function DocumentUpload({ projectId }: { projectId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => api.getDocuments(projectId),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadDocument(projectId, file, 'other');
      queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div
        className="card-surface border-dashed border-2 p-8 text-center cursor-pointer hover:bg-secondary/30 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">Drag and drop files here</p>
        <p className="text-xs text-muted-foreground mt-1">or click to browse · PDF, DOCX, XLSX up to 50MB</p>
        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.xlsx,.xls,.doc" onChange={handleUpload} />
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {documents.map((doc: any) => {
          const Icon = typeIcon[doc.fileType] || File;
          return (
            <div key={doc.id} className="card-surface p-4 hover:border-border-strong transition-colors">
              <div className="flex items-start gap-3">
                <Icon className="h-8 w-8 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.fileName}</p>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{typeLabels[doc.fileType] || doc.fileType}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                    {doc.parsingStatus && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        doc.parsingStatus === 'completed' ? 'bg-success/10 text-success' :
                        doc.parsingStatus === 'processing' ? 'bg-warning/10 text-warning' :
                        doc.parsingStatus === 'failed' ? 'bg-danger/10 text-danger' :
                        'bg-secondary text-muted-foreground'
                      }`}>{doc.parsingStatus}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
