import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Upload, Pencil, RefreshCw, Trash2, ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { MethodPill } from "@/components/common/MethodPill";
import { LevelBadge } from "@/components/common/LevelBadge";
import { StatusDot } from "@/components/common/StatusDot";
import { mockIndicators, Method, IndicatorLevel, IndicatorStatus } from "@/data/mockData";

const steps = ["Upload Documents", "AI Processing", "Review Framework", "Summary"];

const mockUploadedFiles = [
  { name: "WASH Project Proposal.pdf", type: "Proposal", done: true },
  { name: "UNICEF Logframe Template.xlsx", type: "Logframe", done: true },
  { name: "ToC Diagram — Jenin WASH.pdf", type: "Theory of Change", done: true },
];

const processingSteps = [
  "Reading project documents...",
  "Extracting objectives and outcomes...",
  "Matching against M&E template library...",
  "Generating indicators and methods...",
  "Setting targets and baselines...",
];

const generatedIndicators = mockIndicators.slice(0, 10).map((ind, i) => ({
  ...ind,
  confidence: Math.round(70 + Math.random() * 25),
}));

export default function AIWizard() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedProcessing, setCompletedProcessing] = useState<number[]>([]);

  // Animate processing steps
  useEffect(() => {
    if (currentStep !== 1) return;
    setCompletedProcessing([]);
    const timers: NodeJS.Timeout[] = [];
    processingSteps.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setCompletedProcessing(prev => [...prev, i]);
      }, (i + 1) * 1200));
    });
    // Auto advance after all done
    timers.push(setTimeout(() => setCurrentStep(2), processingSteps.length * 1200 + 800));
    return () => timers.forEach(clearTimeout);
  }, [currentStep]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/projects/${id || "proj-3"}`)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
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
          <div className="card-surface border-dashed border-2 p-8 text-center">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Upload project documents</p>
            <p className="text-xs text-muted-foreground mt-1">Proposals, logframes, theory of change, donor guidelines</p>
          </div>
          <div className="space-y-2">
            {mockUploadedFiles.map(f => (
              <div key={f.name} className="card-surface p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{f.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{f.type}</span>
                  </div>
                </div>
                <Check className="h-5 w-5 text-success" />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setCurrentStep(1)}>
              Process Documents <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: Processing */}
      {currentStep === 1 && (
        <div className="card-surface p-8 max-w-lg mx-auto">
          <div className="space-y-4">
            {processingSteps.map((step, i) => {
              const isDone = completedProcessing.includes(i);
              const isActive = !isDone && completedProcessing.length === i;
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
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden md:table-cell">Confidence</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {generatedIndicators.map(ind => (
                  <tr key={ind.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-3 font-medium max-w-[250px]">{ind.indicator_text}</td>
                    <td className="px-3 py-3"><LevelBadge level={ind.level} /></td>
                    <td className="px-3 py-3"><MethodPill method={ind.method} size="xs" /></td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-success" style={{ width: `${ind.confidence}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{ind.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="p-1.5 rounded hover:bg-success/10 text-success"><Check className="h-3.5 w-3.5" /></button>
                        <button className="p-1.5 rounded hover:bg-secondary text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="p-1.5 rounded hover:bg-secondary text-muted-foreground"><RefreshCw className="h-3.5 w-3.5" /></button>
                        <button className="p-1.5 rounded hover:bg-danger/10 text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
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
          <h2 className="text-lg font-semibold mb-2">Framework Ready for Expert Review</h2>
          <p className="text-sm text-muted-foreground mb-6">Your M&E framework has been generated and is ready for review by your team.</p>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="metric-surface p-3 text-center">
              <p className="text-2xl font-semibold">10</p>
              <p className="text-xs text-muted-foreground">Indicators</p>
            </div>
            <div className="metric-surface p-3 text-center">
              <p className="text-2xl font-semibold">6</p>
              <p className="text-xs text-muted-foreground">Methods</p>
            </div>
            <div className="metric-surface p-3 text-center">
              <p className="text-2xl font-semibold">3</p>
              <p className="text-xs text-muted-foreground">Phases</p>
            </div>
          </div>
          <Button onClick={() => navigate(`/projects/${id || "proj-3"}`)}>
            Submit for Review
          </Button>
        </div>
      )}
    </div>
  );
}
