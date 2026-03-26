import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileText, FileSpreadsheet, File, CheckCircle2, Loader2, AlertCircle, Brain, Eye } from "lucide-react";

const FILE_TYPE_ICONS: Record<string, any> = {
  proposal: FileText, logframe: FileText, theory_of_change: FileText,
  baseline_report: FileText, donor_guidelines: FileText, budget: FileSpreadsheet, other: File,
};

const PARSING_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function DocumentManager({ projectId }: { projectId: string }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState("proposal");
  const [uploading, setUploading] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api.getDocuments(projectId),
  });

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      await api.uploadDocument(projectId, selectedFile, fileType);
      toast.success("Document uploaded! AI is analyzing it...");
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
      setUploadOpen(false);
      setSelectedFile(null);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const getAiAnalysis = (doc: any) => {
    if (!doc.parsedText) return null;
    const marker = "---AI_ANALYSIS---";
    const idx = doc.parsedText?.indexOf(marker);
    if (!idx || idx === -1) return null;
    try { return JSON.parse(doc.parsedText.substring(idx + marker.length).trim()); }
    catch { return null; }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Project Documents</h3>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button><Upload className="mr-2 h-4 w-4" /> Upload Document</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload Project Document</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Document Type</label>
                <Select value={fileType} onValueChange={setFileType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proposal">Project Proposal</SelectItem>
                    <SelectItem value="logframe">Logframe</SelectItem>
                    <SelectItem value="theory_of_change">Theory of Change</SelectItem>
                    <SelectItem value="baseline_report">Baseline Report</SelectItem>
                    <SelectItem value="donor_guidelines">Donor Guidelines</SelectItem>
                    <SelectItem value="budget">Budget</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">File (PDF, DOCX, XLSX)</label>
                <input type="file" accept=".pdf,.docx,.xlsx,.xls,.doc"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-sm border rounded-md p-2" />
              </div>
              <Button onClick={handleUpload} disabled={!selectedFile || uploading} className="w-full">
                {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : "Upload & Analyze"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No documents uploaded yet.</p>
            <p className="text-sm">Upload project proposals, logframes, or reports for AI analysis.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc: any) => {
            const Icon = FILE_TYPE_ICONS[doc.fileType] || File;
            const aiAnalysis = getAiAnalysis(doc);
            return (
              <Card key={doc.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{doc.fileName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{doc.fileType?.replace(/_/g, " ")}</Badge>
                          <Badge className={`text-xs ${PARSING_BADGE[doc.parsingStatus] || ""}`}>
                            {doc.parsingStatus === "processing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {doc.parsingStatus === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                            {doc.parsingStatus === "failed" && <AlertCircle className="mr-1 h-3 w-3" />}
                            {doc.parsingStatus}
                          </Badge>
                          {aiAnalysis && <Badge className="text-xs bg-purple-100 text-purple-700"><Brain className="mr-1 h-3 w-3" /> AI Analyzed</Badge>}
                          <span className="text-xs text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    {aiAnalysis && (
                      <Button variant="ghost" size="sm" onClick={() => setViewingDoc(doc)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {aiAnalysis && (
                    <div className="mt-3 p-3 bg-purple-50 rounded-md border border-purple-100">
                      <p className="text-sm font-medium text-purple-800 mb-1"><Brain className="inline h-3 w-3 mr-1" /> AI Summary</p>
                      <p className="text-sm text-purple-700">{aiAnalysis.summary}</p>
                      {aiAnalysis.keyFindings?.length > 0 && (
                        <ul className="text-xs text-purple-600 list-disc pl-4 mt-2">
                          {aiAnalysis.keyFindings.slice(0, 3).map((f: string, i: number) => <li key={i}>{f}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewingDoc} onOpenChange={() => setViewingDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>AI Document Analysis</DialogTitle></DialogHeader>
          {viewingDoc && (() => {
            const analysis = getAiAnalysis(viewingDoc);
            if (!analysis) return <p>No analysis available.</p>;
            return (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                <div><h4 className="font-medium text-sm">Summary</h4><p className="text-sm text-muted-foreground">{analysis.summary}</p></div>
                {analysis.keyFindings?.length > 0 && (
                  <div><h4 className="font-medium text-sm">Key Findings</h4>
                    <ul className="text-sm list-disc pl-4 space-y-1">{analysis.keyFindings.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
                {analysis.indicators_mentioned?.length > 0 && (
                  <div><h4 className="font-medium text-sm">Indicators Mentioned</h4>
                    <div className="flex flex-wrap gap-1">{analysis.indicators_mentioned.map((ind: string, i: number) => <Badge key={i} variant="outline" className="text-xs">{ind}</Badge>)}</div>
                  </div>
                )}
                {analysis.recommendations?.length > 0 && (
                  <div><h4 className="font-medium text-sm">Recommendations</h4>
                    <ul className="text-sm list-disc pl-4 space-y-1">{analysis.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
