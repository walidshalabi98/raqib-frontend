import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Users, MapPin, MessageSquare, FileText, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

const sentimentColor: Record<string, string> = {
  positive: "bg-success",
  mixed: "bg-warning",
  negative: "bg-danger",
  neutral: "bg-muted-foreground",
};

const typeIcons: Record<string, React.ElementType> = {
  fgd_transcript: MessageSquare,
  kii_notes: FileText,
  observation_checklist: FileText,
  community_scorecard: FileText,
  msc_story: FileText,
  field_notes: FileText,
};

const typeLabels: Record<string, string> = {
  fgd_transcript: "FGD Transcript",
  kii_notes: "KII Notes",
  observation_checklist: "Observation Checklist",
  community_scorecard: "Community Scorecard",
  msc_story: "MSC Story",
  field_notes: "Field Notes",
};

export function QualitativeCards({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    entryType: "fgd_transcript",
    title: "",
    content: "",
    participants: "",
    location: "",
    dateConducted: "",
    facilitator: "",
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['qualitative', projectId],
    queryFn: () => api.getQualitativeEntries(projectId),
  });

  const handleSubmit = async () => {
    if (!form.title || !form.content) {
      toast.error("Please fill in title and content");
      return;
    }
    setSubmitting(true);
    try {
      await api.addQualitativeEntry(projectId, {
        ...form,
        participants: form.participants ? parseInt(form.participants) : undefined,
        dateConducted: form.dateConducted || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['qualitative', projectId] });
      setOpen(false);
      setForm({ entryType: "fgd_transcript", title: "", content: "", participants: "", location: "", dateConducted: "", facilitator: "" });
      toast.success("Qualitative entry added successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to add entry");
    } finally {
      setSubmitting(false);
    }
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
            <DialogHeader><DialogTitle>Add Qualitative Entry</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Entry Type</Label>
                <Select value={form.entryType} onValueChange={v => setForm(f => ({ ...f, entryType: v }))}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="FGD with women farmers - Hebron" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>Content *</Label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Detailed notes, transcript, or observations..."
                  className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Participants</Label>
                  <Input type="number" value={form.participants} onChange={e => setForm(f => ({ ...f, participants: e.target.value }))} placeholder="12" className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Hebron" className="rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date Conducted</Label>
                  <Input type="date" value={form.dateConducted} onChange={e => setForm(f => ({ ...f, dateConducted: e.target.value }))} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label>Facilitator</Label>
                  <Input value={form.facilitator} onChange={e => setForm(f => ({ ...f, facilitator: e.target.value }))} placeholder="Ahmad M." className="rounded-lg" />
                </div>
              </div>
              <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</> : "Add Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {entries.length === 0 ? (
        <div className="card-surface p-8 text-center text-muted-foreground">No qualitative data entries yet.</div>
      ) : (
        entries.map((entry: any) => {
          const Icon = typeIcons[entry.entryType] || FileText;
          const isExpanded = expandedId === entry.id;
          const themes: string[] = Array.isArray(entry.themes) ? entry.themes : [];
          return (
            <div
              key={entry.id}
              className="card-surface p-5 hover:border-border-strong transition-colors cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold">{entry.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {entry.participants && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {entry.participants}</span>}
                      {entry.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {entry.location}</span>}
                      {entry.dateConducted && <span>{new Date(entry.dateConducted).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
                {entry.sentiment && (
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${sentimentColor[entry.sentiment] || sentimentColor.neutral}`} />
                    <span className="text-xs text-muted-foreground capitalize">{entry.sentiment}</span>
                  </span>
                )}
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
                  <p className="text-sm text-muted-foreground leading-relaxed">{entry.content}</p>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
