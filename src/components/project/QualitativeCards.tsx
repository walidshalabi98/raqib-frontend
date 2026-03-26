import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Users, MapPin, MessageSquare, FileText, Plus, Loader2, Upload, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const sentimentColor: Record<string, string> = {
  positive: "bg-success", mixed: "bg-warning", negative: "bg-danger", neutral: "bg-muted-foreground",
};

const typeIcons: Record<string, React.ElementType> = {
  fgd_transcript: MessageSquare, kii_notes: FileText, observation_checklist: FileText,
  community_scorecard: FileText, msc_story: FileText, field_notes: FileText,
};

const typeLabels: Record<string, string> = {
  fgd_transcript: "FGD Transcript", kii_notes: "KII Notes", observation_checklist: "Observation Checklist",
  community_scorecard: "Community Scorecard", msc_story: "MSC Story", field_notes: "Field Notes",
};

export function QualitativeCards({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    entryType: "fgd_transcript", title: "", content: "", participants: "", location: "", dateConducted: "", facilitator: "",
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    entryType: "fgd_transcript", title: "", participants: "", location: "", dateConducted: "", facilitator: "",
  });
  const [uploading, setUploading] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['qualitative', projectId],
    queryFn: () => api.getQualitativeEntries(projectId),
  });

  const handleSubmit = async () => {
    if (!form.title || !form.content) { toast.error("Please fill in title and content"); return; }
    setSubmitting(true);
    try {
      await api.addQualitativeEntry(projectId, {
        ...form, participants: form.participants ? parseInt(form.participants) : undefined, dateConducted: form.dateConducted || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['qualitative', projectId] });
      setOpen(false);
      setForm({ entryType: "fgd_transcript", title: "", content: "", participants: "", location: "", dateConducted: "", facilitator: "" });
      toast.success("Entry added — AI is analyzing themes...");
    } catch (err: any) { toast.error(err.message || "Failed to add entry"); }
    finally { setSubmitting(false); }
  };

  const handleUpload = async () => {
    if (!uploadFile) { toast.error("Please select a file"); return; }
    setUploading(true);
    try {
      await api.uploadQualitativeDocument(projectId, uploadFile, uploadForm);
      queryClient.invalidateQueries({ queryKey: ['qualitative', projectId] });
      setOpen(false);
      setUploadFile(null);
      setUploadForm({ entryType: "fgd_transcript", title: "", participants: "", location: "", dateConducted: "", facilitator: "" });
      toast.success("Document uploaded! AI is extracting text and analyzing themes...");
    } catch (err: any) { toast.error(err.message || "Upload failed"); }
    finally { setUploading(false); }
  };

  const handleAiCode = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.codeQualitativeEntry(entryId);
      toast.success("AI thematic coding started...");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['qualitative', projectId] }), 5000);
    } catch (err: any) { toast.error(err.message); }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1.5" /> Add Entry</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Qualitative Data</DialogTitle></DialogHeader>
            <Tabs defaultValue="manual" className="mt-2">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                <TabsTrigger value="upload">Upload Document</TabsTrigger>
              </TabsList>

              {/* Manual Entry Tab */}
              <TabsContent value="manual" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Entry Type</Label>
                  <Select value={form.entryType} onValueChange={v => setForm(f => ({ ...f, entryType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(typeLabels).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="FGD with women farmers - Hebron" />
                </div>
                <div className="space-y-1.5">
                  <Label>Content *</Label>
                  <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="Paste transcript, interview notes, or observations..."
                    className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Participants</Label><Input type="number" value={form.participants} onChange={e => setForm(f => ({ ...f, participants: e.target.value }))} placeholder="12" /></div>
                  <div><Label>Location</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Hebron" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Date</Label><Input type="date" value={form.dateConducted} onChange={e => setForm(f => ({ ...f, dateConducted: e.target.value }))} /></div>
                  <div><Label>Facilitator</Label><Input value={form.facilitator} onChange={e => setForm(f => ({ ...f, facilitator: e.target.value }))} placeholder="Ahmad M." /></div>
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</> : "Add Entry (AI will auto-analyze)"}
                </Button>
              </TabsContent>

              {/* Upload Tab */}
              <TabsContent value="upload" className="space-y-4 pt-2">
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Upload Interview Transcript or FGD Notes</p>
                  <p className="text-xs text-muted-foreground mb-3">PDF, DOCX, or XLSX — AI will extract text and analyze themes</p>
                  <input type="file" accept=".pdf,.docx,.xlsx,.xls,.doc,.txt" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm border rounded-md p-2" />
                  {uploadFile && <p className="text-xs text-green-600 mt-1">Selected: {uploadFile.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Entry Type</Label>
                  <Select value={uploadForm.entryType} onValueChange={v => setUploadForm(f => ({ ...f, entryType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(typeLabels).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Input placeholder="Title (optional — auto-generated from filename)" value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" placeholder="Participants" value={uploadForm.participants} onChange={e => setUploadForm(f => ({ ...f, participants: e.target.value }))} />
                  <Input placeholder="Location" value={uploadForm.location} onChange={e => setUploadForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" value={uploadForm.dateConducted} onChange={e => setUploadForm(f => ({ ...f, dateConducted: e.target.value }))} />
                  <Input placeholder="Facilitator" value={uploadForm.facilitator} onChange={e => setUploadForm(f => ({ ...f, facilitator: e.target.value }))} />
                </div>
                <Button className="w-full" onClick={handleUpload} disabled={uploading || !uploadFile}>
                  {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : <><Upload className="h-4 w-4 mr-2" /> Upload & Auto-Analyze</>}
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {entries.length === 0 ? (
        <div className="card-surface p-8 text-center text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No qualitative data entries yet.</p>
          <p className="text-sm mt-1">Add interview transcripts, FGD notes, or upload documents for AI analysis.</p>
        </div>
      ) : (
        entries.map((entry: any) => {
          const Icon = typeIcons[entry.entryType] || FileText;
          const isExpanded = expandedId === entry.id;
          const themes: string[] = Array.isArray(entry.themes) ? entry.themes : [];
          return (
            <div key={entry.id}
              className="card-surface p-5 hover:border-border-strong transition-colors cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold">{entry.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">{typeLabels[entry.entryType] || entry.entryType}</Badge>
                      {entry.participants && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {entry.participants}</span>}
                      {entry.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {entry.location}</span>}
                      {entry.dateConducted && <span>{new Date(entry.dateConducted).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!entry.themes?.length && (
                    <Button variant="ghost" size="sm" className="text-xs" onClick={(e) => handleAiCode(entry.id, e)}>
                      <Brain className="h-3 w-3 mr-1" /> AI Analyze
                    </Button>
                  )}
                  {entry.sentiment && (
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${sentimentColor[entry.sentiment] || sentimentColor.neutral}`} />
                      <span className="text-xs text-muted-foreground capitalize">{entry.sentiment}</span>
                    </span>
                  )}
                </div>
              </div>
              {themes.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {themes.map((t: string) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium capitalize">
                      {t.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t animate-fade-in">
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{entry.content?.substring(0, 2000)}</p>
                  {entry.content?.length > 2000 && <p className="text-xs text-primary mt-2">... [{entry.content.length - 2000} more characters]</p>}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
