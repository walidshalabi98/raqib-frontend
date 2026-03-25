import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus } from "lucide-react";

export function AssessmentModal() {
  const [type, setType] = useState("baseline");
  const [sampleSize, setSampleSize] = useState([300]);
  const [groups, setGroups] = useState([4]);

  const basePrice = type === "baseline" || type === "endline" ? 4000 : type === "midterm" ? 3500 : 1000;
  const sampleMultiplier = sampleSize[0] / 300;
  const price = Math.round(basePrice * sampleMultiplier + groups[0] * 200);

  return (
    <Dialog>
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
              </SelectContent>
            </Select>
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
          <Button className="w-full">Submit Request</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
