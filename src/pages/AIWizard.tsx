import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Upload, Pencil, RefreshCw, Trash2, ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { toast } from "sonner";

const steps = ["Upload Documents", "AI Processing", "Review Framework", "Summary"];

const LEVEL_COLORS: Record<string, string> = {
  impact: "bg-primary/10 text-primary",
  outcome: "bg-info/10 text-info",
  output: "bg-success/10 text-success",
  activity: "bg-secondary text-secondary-foreground",
};

const METHOD_LABELS: Record<string, string> = {
  hh_survey: "HH Survey",
  fgd: "FGD",
  kii: "KII",
  observation: "Observation",
  document_review: "Doc Review",
  participatory: "Participatory",
  secondary_data: "Secondary Data",
};

export default function AIWizard() {
  const navigate = useNavigate();
  const { id: projectId } = useParams();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);

  // Step 0: Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; type: string; id: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [fileType, setFileType] = useState("proposal");

  // Step 1: Processing state
  const [generating, setGenerating] = useState(false);
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<string>("");
  const [processingStepIdx, setProcessingStepIdx] = useState(0);

  // Step 2: Review state
  const [indicators, setIndicators] = useState<any[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  // Step 3: Summary state
  const [approving, setApproving] = useState(false);

  const processingMessages = [
    "Reading project documents...",
    "Extracting objectives and outcomes...",
    "Matching against M&E template library...",
    "Generating indicators and methods...",
    "Setting targets and baselines...",
  ];

  // Load existing documents on mount
  useEffect(() => {
    if (!projectId) return;
    api.getDocuments(projectId).then((docs: any[]) => {
      setUploadedFiles(docs.map(d => ({ name: d.fileName, type: d.fileType, id: d.id })));
    }).catch(() => {});
  }, [projectId]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setUploading(true);
    try {
      const doc = await api.uploadDocument(projectId, file, fileType);
      setUploadedFiles(prev => [...prev, { name: doc.fileName, type: doc.fileType, id: doc.id }]);
      toast.success("Document uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Start framework generation and poll for status
  const startGeneration = async () => {
    if (!projectId) return;
    setCurrentStep(1);
    setGenerating(true);
    setProcessingStepIdx(0);

    // Animate processing steps
    const interval = setInterval(() => {
      setProcessingStepIdx(prev => {
        if (prev < processingMessages.length - 1) return prev + 1;
        return prev;
      });
    }, 2000);

    try {
      const result = await api.generateFramework(projectId);
      const fwId = result.frameworkId || result.id;
      setFrameworkId(fwId);

      // Poll for completion
      const poll = async () => {
        try {
          const status = await api.checkGenerationStatus(fwId);
          setPollingStatus(status.status);
          if (status.status === "completed" || status.status === "active" || status.status === "draft" || status.status === "expert_review") {
            clearInterval(interval);
            setProcessingStepIdx(processingMessages.length);
            // Fetch the framework indicators
            const fw = await api.getFramework(projectId!);
            const inds = fw.indicators || [];
            setIndicators(inds);
            setGenerating(false);
            setTimeout(() => setCurrentStep(2), 800);
          } else if (status.status === "failed") {
            clearInterval(interval);
            setGenerating(false);
            toast.error("Framework generation failed. Please try again.");
            setCurrentStep(0);
          } else {
            setTimeout(poll, 3000);
          }
        } catch {
          setTimeout(poll, 3000);
        }
      };
      setTimeout(poll, 2000);
    } catch (err: any) {
      clearInterval(interval);
      setGenerating(false);
      toast.error(err.message || "Failed to start framework generation");
      setCurrentStep(0);
    }
  };

  // Approve individual indicator
  const handleApproveIndicator = async (indId: string) => {
    try {
      await api.approveIndicator(indId);
      setApprovedIds(prev => new Set([...prev, indId]));
    } catch (err: any) {
      toast.error(err.message || "Failed to approve indicator");
    }
  };

  // Delete individual indicator
  const handleDeleteIndicator = async (indId: string) => {
    try {
      await api.deleteIndicator(indId);
      setIndicators(prev => prev.filter(i => i.id !== indId));
      toast.success("Indicator removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete indicator");
    }
  };

  // Request alternative for indicator
  const handleAlternative = async (indId: string) => {
    try {
      await api.requestAlternative(indId);
      toast.success("Alternative requested — check back shortly");
    } catch (err: any) {
      toast.error(err.message || "Failed to request alternative");
    }
  };

  // Approve entire framework
  const handleApproveFramework = async () => {
    if (!frameworkId) return;
    setApproving(true);
    try {
      await api.approveFramework(frameworkId);
      queryClient.invalidateQueries({ queryKey: ['framework', projectId] });
      toast.success("Framework approved!");
      navigate(`/projects/${projectId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve framework");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/projects/${projectId}`)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight">AI KPI Builder</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-0 mb-6">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                i < currentStep ? "bg-success border-success text-success-foreground" :
                i === currentStep ? "bg-primary border-primary text-primary-foreground" :
                "bg-card border-muted-foreground/30 text-muted-foreground"
              }`}>
                {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-[11px] mt-1 whitespace-nowrap ${i === currentStep ? "font-semibold text-primary" : "text-muted-foreground"}`}>{label}</span>
            </div>
            {i < steps.length - 1 && <div className={`h-0.5 w-16 mx-2 ${i < currentStep ? "bg-success" : "bg-muted-foreground/20"}`} />}
          </div>
        ))}
      </div>

      {/* Step 0: Upload */}
      {currentStep === 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Select value={fileType} onValueChange={setFileType}>
              <SelectTrigger className="w-48 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proposal">Proposal</SelectItem>
                <SelectItem value="logframe">Logframe</SelectItem>
                <SelectItem value="theory_of_change">Theory of Change</SelectItem>
                <SelectItem value="baseline_report">Baseline Report</SelectItem>
                <SelectItem value="donor_guidelines">Donor Guidelines</SelectItem>
                <SelectItem value="budget">Budget</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div
            className="card-surface border-dashed border-2 p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-2" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            )}
            <p className="text-sm font-medium">{uploading ? "Uploading..." : "Click to upload project documents"}</p>
            <p className="text-xs text-muted-foreground mt-1">Proposals, logframes, theory of change, donor guidelines</p>
            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.xlsx,.doc,.xls" onChange={handleFileUpload} />
          </div>
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              {uploadedFiles.map(f => (
                <div key={f.id} className="card-surface p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{f.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">{(f.type || '').replace('_', ' ')}</span>
                    </div>
                  </div>
                  <Check className="h-5 w-5 text-success" />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-3">
            {uploadedFiles.length === 0 && (
              <Button variant="outline" onClick={startGeneration}>
                Skip — Generate from Project Info <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
            <Button onClick={startGeneration} disabled={false}>
              {uploadedFiles.length > 0 ? "Process Documents" : "Upload & Process"} <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: Processing */}
      {currentStep === 1 && (
        <div className="card-surface p-8 max-w-lg mx-auto">
          <div className="space-y-4">
            {processingMessages.map((step, i) => {
              const isDone = i < processingStepIdx || processingStepIdx >= processingMessages.length;
              const isActive = i === processingStepIdx && processingStepIdx < processingMessages.length;
              return (
                <div key={i} className={`flex items-center gap-3 transition-opacity duration-500 ${
                  isDone || isActive ? "opacity-100" : "opacity-30"
                }`}>
                  {isDone ? (
                    <Check className="h-5 w-5 text-success shrink-0" />
                  ) : isActive ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                  )}
                  <span className={`text-sm ${isDone ? "text-foreground" : isActive ? "text-primary font-medium" : "text-muted-foreground"}`}>{step}</span>
                </div>
              );
            })}
          </div>
          {pollingStatus && (
            <p className="text-xs text-muted-foreground text-center mt-4">Status: {pollingStatus}</p>
          )}
        </div>
      )}

      {/* Step 2: Review */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Review the generated indicators. Approve, edit, or request alternatives.</p>
          <div className="card-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Indicator</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Level</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Method</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden md:table-cell">Target</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {indicators.map(ind => (
                  <tr key={ind.id} className={`hover:bg-secondary/30 transition-colors ${approvedIds.has(ind.id) ? "bg-success/5" : ""}`}>
                    <td className="px-3 py-3 font-medium max-w-[250px]">{ind.indicatorText}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md capitalize ${LEVEL_COLORS[ind.level] || "bg-secondary text-secondary-foreground"}`}>
                        {ind.level}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                        {METHOD_LABELS[ind.dataCollectionMethod] || ind.dataCollectionMethod}
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-muted-foreground">{ind.targetValue || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleApproveIndicator(ind.id)}
                          className={`p-1.5 rounded hover:bg-success/10 ${approvedIds.has(ind.id) ? "text-success" : "text-muted-foreground"}`}
                          title="Approve"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleAlternative(ind.id)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground" title="Request alternative">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteIndicator(ind.id)} className="p-1.5 rounded hover:bg-danger/10 text-danger" title="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setCurrentStep(3)}>
              Finalize Framework <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Summary */}
      {currentStep === 3 && (
        <div className="card-surface p-8 max-w-lg mx-auto text-center">
          <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <Check className="h-6 w-6 text-success" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Framework Ready for Review</h2>
          <p className="text-sm text-muted-foreground mb-6">Your M&E framework has been generated and is ready for review by your team.</p>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="metric-surface p-3 text-center">
              <p className="text-2xl font-semibold">{indicators.length}</p>
              <p className="text-xs text-muted-foreground">Indicators</p>
            </div>
            <div className="metric-surface p-3 text-center">
              <p className="text-2xl font-semibold">{new Set(indicators.map(i => i.dataCollectionMethod)).size}</p>
              <p className="text-xs text-muted-foreground">Methods</p>
            </div>
            <div className="metric-surface p-3 text-center">
              <p className="text-2xl font-semibold">{approvedIds.size}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </div>
          <Button onClick={handleApproveFramework} disabled={approving}>
            {approving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Approving...</> : "Approve & Submit"}
          </Button>
        </div>
      )}
    </div>
  );
}
