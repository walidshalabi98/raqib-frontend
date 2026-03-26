import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AssessmentModal() {
  const { id: projectId } = useParams();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [type, setType] = useState("baseline");
  const [sampleSize, setSampleSize] = useState([300]);
  const [groups, setGroups] = useState([4]);
  const [scopeDescription, setScopeDescription] = useState("");
  const [methods, setMethods] = useState<string[]>(["hh_survey", "fgd", "kii"]);

  const basePrice = type === "baseline" || type === "endline" ? 4000 : type === "midterm" ? 3500 : 1000;
  const sampleMultiplier = sampleSize[0] / 300;
  const price = Math.round(basePrice * sampleMultiplier + groups[0] * 200);

  const handleSubmit = async () => {
    if (!projectId) return;
    setSubmitting(true);
    try {
      await api.requestAssessment(projectId, {
        type,
        sampleSize: sampleSize[0],
        scopeDescription: scopeDescription || `${type} assessment with ${sampleSize[0]} sample size`,
        methodsIncluded: methods,
      });
      queryClient.invalidateQueries({ queryKey: ['assessments', projectId] });
      setOpen(false);
      toast.success("Assessment submitted! AI is generating the report — this takes 30-60 seconds.");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit assessment request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1.5" /> Request Assessment</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Assessment</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Assessment Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baseline">Baseline</SelectItem>
                <SelectItem value="midterm">Midterm</SelectItem>
                <SelectItem value="endline">Endline</SelectItem>
                <SelectItem value="fgd_round">FGD Round</SelectItem>
                <SelectItem value="kii_round">KII Round</SelectItem>
                <SelectItem value="observation_round">Observation Round</SelectItem>
                <SelectItem value="survey_round">Survey Round</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Scope Description</Label>
            <Input value={scopeDescription} onChange={e => setScopeDescription(e.target.value)} placeholder="Describe the assessment scope..." className="rounded-lg" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Sample Size: {sampleSize[0]}</label>
            <Slider value={sampleSize} onValueChange={setSampleSize} min={50} max={600} step={50} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Focus Groups / Interviews: {groups[0]}</label>
            <Slider value={groups} onValueChange={setGroups} min={1} max={12} step={1} />
          </div>
          <div className="card-surface p-4 text-center">
            <p className="text-xs text-muted-foreground">Estimated Price</p>
            <p className="text-2xl font-semibold text-foreground">${price.toLocaleString()}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            <strong>AI Auto-Generation:</strong> Our AI will ingest all project data (indicators, qualitative entries, documents) and generate a comprehensive assessment report automatically.
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : "Generate AI Assessment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
