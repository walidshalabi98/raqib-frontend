import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { MethodPill } from "@/components/common/MethodPill";
import { StatusDot } from "@/components/common/StatusDot";
import { LevelBadge } from "@/components/common/LevelBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronDown, ChevronRight, Loader2, Plus, Pencil, Save, X,
  Calendar, AlertTriangle, Clock, CheckCircle2, Users,
} from "lucide-react";
import { toast } from "sonner";

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function getTimelineStatus(ind: any) {
  if (!ind.startDate || !ind.endDate) return null;
  const now = new Date();
  const start = new Date(ind.startDate);
  const end = new Date(ind.endDate);
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const progress = Math.max(0, Math.min(100, (elapsed / total) * 100));

  const isOverdue = now > end && ind.status !== "completed";
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return { progress, isOverdue, daysLeft, start, end };
}

function TimelineBar({ ind }: { ind: any }) {
  const tl = getTimelineStatus(ind);
  if (!tl) return <span className="text-xs text-muted-foreground">No timeline</span>;

  const barColor = tl.isOverdue
    ? "bg-danger"
    : ind.status === "completed"
    ? "bg-success"
    : ind.status === "at_risk"
    ? "bg-warning"
    : "bg-primary";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{formatDate(ind.startDate)}</span>
        <span>{formatDate(ind.endDate)}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${tl.progress}%` }} />
      </div>
      <div className="text-[10px]">
        {tl.isOverdue ? (
          <span className="text-danger font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Overdue by {Math.abs(tl.daysLeft)} days
          </span>
        ) : ind.status === "completed" ? (
          <span className="text-success font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </span>
        ) : (
          <span className="text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> {tl.daysLeft} days remaining
          </span>
        )}
      </div>
    </div>
  );
}

// Edit indicator dialog
function EditIndicatorDialog({ ind, onSaved }: { ind: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    indicatorText: ind.indicatorText || "",
    level: ind.level || "output",
    dataCollectionMethod: ind.dataCollectionMethod || "hh_survey",
    frequency: ind.frequency || "quarterly",
    baselineValue: ind.baselineValue || "",
    targetValue: ind.targetValue || "",
    currentValue: ind.currentValue || "",
    unit: ind.unit || "",
    status: ind.status || "not_started",
    responsibility: ind.responsibility || "",
    startDate: ind.startDate ? ind.startDate.split("T")[0] : "",
    endDate: ind.endDate ? ind.endDate.split("T")[0] : "",
    actualStartDate: ind.actualStartDate ? ind.actualStartDate.split("T")[0] : "",
    actualEndDate: ind.actualEndDate ? ind.actualEndDate.split("T")[0] : "",
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateIndicator(ind.id, {
        ...form,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        actualStartDate: form.actualStartDate || null,
        actualEndDate: form.actualEndDate || null,
      });
      toast.success("Indicator updated");
      setOpen(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2">
          <Pencil className="h-3 w-3 mr-1" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Indicator</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Indicator Text</Label>
            <textarea
              value={form.indicatorText}
              onChange={(e) => setForm((f) => ({ ...f, indicatorText: e.target.value }))}
              className="flex min-h-[60px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Level</Label>
              <Select value={form.level} onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="impact">Impact</SelectItem>
                  <SelectItem value="outcome">Outcome</SelectItem>
                  <SelectItem value="output">Output</SelectItem>
                  <SelectItem value="activity">Activity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Method</Label>
              <Select value={form.dataCollectionMethod} onValueChange={(v) => setForm((f) => ({ ...f, dataCollectionMethod: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hh_survey">HH Survey</SelectItem>
                  <SelectItem value="fgd">FGD</SelectItem>
                  <SelectItem value="kii">KII</SelectItem>
                  <SelectItem value="observation">Observation</SelectItem>
                  <SelectItem value="document_review">Document Review</SelectItem>
                  <SelectItem value="participatory">Participatory</SelectItem>
                  <SelectItem value="secondary_data">Secondary Data</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="biannual">Biannual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="per_cohort">Per Cohort</SelectItem>
                  <SelectItem value="baseline_endline">Baseline/Endline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="on_track">On Track</SelectItem>
                  <SelectItem value="at_risk">At Risk</SelectItem>
                  <SelectItem value="off_track">Off Track</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Baseline</Label><Input className="mt-1" value={form.baselineValue} onChange={(e) => setForm((f) => ({ ...f, baselineValue: e.target.value }))} /></div>
            <div><Label>Target</Label><Input className="mt-1" value={form.targetValue} onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))} /></div>
            <div><Label>Current</Label><Input className="mt-1" value={form.currentValue} onChange={(e) => setForm((f) => ({ ...f, currentValue: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Unit</Label><Input className="mt-1" placeholder="%, number, etc." value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} /></div>
            <div><Label>Responsible</Label><Input className="mt-1" placeholder="M&E Officer" value={form.responsibility} onChange={(e) => setForm((f) => ({ ...f, responsibility: e.target.value }))} /></div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Calendar className="h-4 w-4" /> Timeline</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Planned Start</Label><Input type="date" className="mt-1" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>Planned End</Label><Input type="date" className="mt-1" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
              <div><Label>Actual Start</Label><Input type="date" className="mt-1" value={form.actualStartDate} onChange={(e) => setForm((f) => ({ ...f, actualStartDate: e.target.value }))} /></div>
              <div><Label>Actual End</Label><Input type="date" className="mt-1" value={form.actualEndDate} onChange={(e) => setForm((f) => ({ ...f, actualEndDate: e.target.value }))} /></div>
            </div>
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-1.5" /> Save Changes</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Add indicator dialog
function AddIndicatorDialog({ frameworkId, onAdded }: { frameworkId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    indicatorText: "",
    level: "output",
    dataCollectionMethod: "hh_survey",
    frequency: "quarterly",
    baselineValue: "",
    targetValue: "",
    unit: "",
    responsibility: "",
    startDate: "",
    endDate: "",
  });

  const handleSave = async () => {
    if (!form.indicatorText.trim()) { toast.error("Indicator text is required"); return; }
    setSaving(true);
    try {
      await api.addIndicatorToFramework(frameworkId, {
        ...form,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      });
      toast.success("Indicator added");
      setOpen(false);
      setForm({ indicatorText: "", level: "output", dataCollectionMethod: "hh_survey", frequency: "quarterly", baselineValue: "", targetValue: "", unit: "", responsibility: "", startDate: "", endDate: "" });
      onAdded();
    } catch (err: any) {
      toast.error(err.message || "Failed to add indicator");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1.5" /> Add Indicator</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Custom Indicator</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Indicator Text *</Label>
            <textarea value={form.indicatorText} onChange={(e) => setForm((f) => ({ ...f, indicatorText: e.target.value }))}
              placeholder="e.g. Number of women who report improved income..."
              className="flex min-h-[60px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Level</Label>
              <Select value={form.level} onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="impact">Impact</SelectItem>
                  <SelectItem value="outcome">Outcome</SelectItem>
                  <SelectItem value="output">Output</SelectItem>
                  <SelectItem value="activity">Activity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Method</Label>
              <Select value={form.dataCollectionMethod} onValueChange={(v) => setForm((f) => ({ ...f, dataCollectionMethod: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hh_survey">HH Survey</SelectItem>
                  <SelectItem value="fgd">FGD</SelectItem>
                  <SelectItem value="kii">KII</SelectItem>
                  <SelectItem value="observation">Observation</SelectItem>
                  <SelectItem value="document_review">Document Review</SelectItem>
                  <SelectItem value="participatory">Participatory</SelectItem>
                  <SelectItem value="secondary_data">Secondary Data</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Baseline</Label><Input className="mt-1" value={form.baselineValue} onChange={(e) => setForm((f) => ({ ...f, baselineValue: e.target.value }))} /></div>
            <div><Label>Target</Label><Input className="mt-1" value={form.targetValue} onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))} /></div>
            <div><Label>Unit</Label><Input className="mt-1" placeholder="%" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Responsible</Label><Input className="mt-1" placeholder="M&E Officer" value={form.responsibility} onChange={(e) => setForm((f) => ({ ...f, responsibility: e.target.value }))} /></div>
            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="biannual">Biannual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="baseline_endline">Baseline/Endline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" className="mt-1" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
            <div><Label>End Date</Label><Input type="date" className="mt-1" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...</> : <><Plus className="h-4 w-4 mr-1.5" /> Add Indicator</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Create manual framework dialog
function CreateFrameworkDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Please enter a framework name"); return; }
    setSaving(true);
    try {
      await api.createManualFramework(projectId, name);
      toast.success("Framework created — add your indicators");
      setOpen(false);
      setName("");
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create framework");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1.5" /> New Framework</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Create Manual Framework</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div><Label>Framework Name *</Label><Input className="mt-1" placeholder="e.g. Custom Logframe v2" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button className="w-full" onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Framework"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function IndicatorTable({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "timeline">("table");

  const { data: framework, isLoading } = useQuery({
    queryKey: ["framework", projectId],
    queryFn: () => api.getFramework(projectId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["framework", projectId] });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const indicators = framework?.indicators || [];

  if (!framework) {
    return (
      <div className="space-y-4">
        <div className="card-surface p-8 text-center text-muted-foreground">
          <p>No framework generated yet.</p>
          <p className="text-sm mt-1">Generate one with AI or create a manual framework.</p>
        </div>
        <div className="flex justify-center">
          <CreateFrameworkDialog projectId={projectId} onCreated={refresh} />
        </div>
      </div>
    );
  }

  const overdue = indicators.filter((i: any) => {
    const tl = getTimelineStatus(i);
    return tl?.isOverdue;
  }).length;

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{framework.name || "M&E Framework"}</h3>
          <Badge variant="outline" className="text-[10px]">v{framework.version}</Badge>
          <Badge variant="outline" className="text-[10px] capitalize">{framework.status}</Badge>
          {overdue > 0 && (
            <Badge className="text-[10px] bg-red-100 text-red-700">
              <AlertTriangle className="h-3 w-3 mr-1" /> {overdue} overdue
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setView("table")} className={`px-3 py-1.5 text-xs font-medium ${view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>Table</button>
            <button onClick={() => setView("timeline")} className={`px-3 py-1.5 text-xs font-medium ${view === "timeline" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>Timeline</button>
          </div>
          <AddIndicatorDialog frameworkId={framework.id} onAdded={refresh} />
          <CreateFrameworkDialog projectId={projectId} onCreated={refresh} />
        </div>
      </div>

      {/* Table View */}
      {view === "table" && (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="w-8" />
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Indicator</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Level</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Method</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden md:table-cell">Target</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Current</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden lg:table-cell">Timeline</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground w-16">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {indicators.map((ind: any) => (
                <>
                  <tr
                    key={ind.id}
                    className="hover:bg-secondary/30 cursor-pointer transition-colors"
                    onClick={() => setExpanded(expanded === ind.id ? null : ind.id)}
                  >
                    <td className="pl-3">
                      {expanded === ind.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </td>
                    <td className="px-3 py-3 font-medium max-w-[250px]">
                      <div>{ind.indicatorText}</div>
                      {ind.responsibility && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" /> {ind.responsibility}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3"><LevelBadge level={ind.level} /></td>
                    <td className="px-3 py-3"><MethodPill method={ind.dataCollectionMethod} size="xs" /></td>
                    <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">{ind.targetValue || "N/A"}</td>
                    <td className="px-3 py-3 font-medium">{ind.currentValue || "N/A"}</td>
                    <td className="px-3 py-3 hidden lg:table-cell w-44">
                      <TimelineBar ind={ind} />
                    </td>
                    <td className="px-3 py-3 text-center"><StatusDot status={ind.status} showLabel /></td>
                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <EditIndicatorDialog ind={ind} onSaved={refresh} />
                    </td>
                  </tr>
                  {expanded === ind.id && (
                    <tr key={`${ind.id}-detail`}>
                      <td colSpan={9} className="px-6 py-4 bg-secondary/20">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            {ind.aiRationale && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-semibold text-primary shrink-0">AI Rationale:</span>
                                <span className="text-xs text-muted-foreground">{ind.aiRationale}</span>
                              </div>
                            )}
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span><strong>Frequency:</strong> {(ind.frequency || "").replace("_", " ")}</span>
                              <span><strong>Baseline:</strong> {ind.baselineValue || "N/A"}</span>
                              <span><strong>Unit:</strong> {ind.unit || "N/A"}</span>
                            </div>
                            {(Array.isArray(ind.phases) && ind.phases.length > 0) && (
                              <div className="flex gap-1 flex-wrap">
                                {ind.phases.map((p: string) => (
                                  <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">{p}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            {(ind.startDate || ind.endDate) && (
                              <div className="text-xs space-y-1">
                                <div className="flex gap-4">
                                  <span><strong>Planned:</strong> {formatDate(ind.startDate)} → {formatDate(ind.endDate)}</span>
                                </div>
                                {(ind.actualStartDate || ind.actualEndDate) && (
                                  <div className="flex gap-4">
                                    <span><strong>Actual:</strong> {formatDate(ind.actualStartDate)} → {formatDate(ind.actualEndDate)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {Array.isArray(ind.milestones) && ind.milestones.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-xs font-semibold">Milestones:</span>
                                {ind.milestones.map((m: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className={`h-2 w-2 rounded-full ${m.completed ? "bg-success" : "bg-muted-foreground/30"}`} />
                                    <span className="text-muted-foreground">{m.label}</span>
                                    <span className="text-[10px] text-muted-foreground">{formatDate(m.date)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Timeline (Gantt-like) View */}
      {view === "timeline" && (
        <div className="card-surface p-5 space-y-3">
          <div className="space-y-2">
            {indicators.map((ind: any) => {
              const tl = getTimelineStatus(ind);
              return (
                <div key={ind.id} className="flex items-start gap-4 py-3 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <LevelBadge level={ind.level} />
                      <span className="text-sm font-medium truncate">{ind.indicatorText}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <StatusDot status={ind.status} showLabel />
                      {ind.responsibility && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{ind.responsibility}</span>}
                      <span>{(ind.frequency || "").replace("_", " ")}</span>
                    </div>
                  </div>
                  <div className="w-52 shrink-0">
                    <TimelineBar ind={ind} />
                  </div>
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <EditIndicatorDialog ind={ind} onSaved={refresh} />
                  </div>
                </div>
              );
            })}
          </div>
          {indicators.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No indicators yet. Add one above.</p>
          )}
        </div>
      )}
    </div>
  );
}
