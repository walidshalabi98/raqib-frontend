import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/services/api";
import { Users, MapPin, MessageSquare, FileText, Plus, Loader2, Upload, Brain, AlertTriangle, AlertCircle, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn, errorMessage } from "@/lib/utils";
import { isForbidden } from "@/lib/apiError";
import { removedPersonalData } from "@/lib/redactions";
import { formatMonthYear } from "@/lib/dates";
import { isDonorQualitativeEntry } from "@/lib/disclosure";
import type { DonorQualitativeEntry, QualitativeEntry } from "@/types/api";
import { dirFor, type AppLanguage } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { PersonalDataWarning } from "@/components/common/PersonalDataWarning";

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

/**
 * The hint under the notes and transcript fields: the backend removes phone numbers, ID numbers
 * and email addresses when an entry is saved, but not names or addresses (CLAUDE.md rule 5).
 * Text plus icon, linked to the field with aria-describedby (UX standards §5, field warnings).
 * It carries its own lang and dir, so it reads correctly while the rest of this screen is
 * untranslated (Phase 6).
 */
function PersonalDataHint({ id, lang, className }: { id: string; lang: AppLanguage; className?: string }) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <p id={id} lang={lang} dir={dirFor(lang)} className={cn("flex items-start gap-1.5 text-start text-xs font-medium", className)}>
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <span>{t("qualitative.personalDataHint")}</span>
    </p>
  );
}

/**
 * One qualitative activity for roles that only read (donor viewers): type, month and number of
 * participants. Never the title, notes, names, places or exact date, and no AI output (themes,
 * sentiment): donors receive reviewed findings through reports. Not clickable.
 */
function ReadOnlyEntryCard({ entry, lang }: { entry: QualitativeEntry | DonorQualitativeEntry; lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const headingId = useId();
  const Icon = typeIcons[entry.entryType] || FileText;
  const type = t(`qualitativeType.${entry.entryType}`, { defaultValue: entry.entryType });
  const month = formatMonthYear(isDonorQualitativeEntry(entry) ? entry.monthConducted : entry.dateConducted, lang);
  const heading = month ? t("access.qualitative.entryHeading", { type, month }) : type;
  return (
    <article aria-labelledby={headingId} className="card-surface p-5">
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h3 id={headingId} className="break-words text-sm font-semibold">{heading}</h3>
          {typeof entry.participants === "number" && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users aria-hidden="true" className="h-3 w-3 shrink-0" />
              {t("access.qualitative.participants", { count: entry.participants })}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * The AI coding of an entry for org staff: sentiment and themes together under the
 * "AI suggested — review before approval" label (frontend rule 5), shown when either exists.
 */
function AiCodedFindings({ sentiment, themes, lang }: { sentiment: string | null | undefined; themes: string[]; lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  if (!sentiment && themes.length === 0) return null;
  return (
    <div role="group" aria-label={t("access.qualitative.codedFindings")} lang={lang} dir={dirFor(lang)} className="mb-3 space-y-2 rounded-md border border-warning/40 p-2 text-start">
      <p role="note" className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium">
        <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {t("ai.suggestedLabel")}
      </p>
      {sentiment && (
        <p className="flex items-center gap-1.5 text-xs">
          <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", sentimentColor[sentiment] || sentimentColor.neutral)} />
          {t("access.qualitative.sentimentLabel", { sentiment: t(`sentiment.${sentiment}`, { defaultValue: sentiment }) })}
        </p>
      )}
      {themes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {themes.map((theme) => (
            <li key={theme} className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
              <bdi>{theme.replace(/_/g, " ")}</bdi>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The project's qualitative entries. `readOnly` (donor viewers) hides adding, uploading and AI
 * coding and shows each entry's coded findings only.
 */
export function QualitativeCards({ projectId, readOnly = false }: { projectId: string; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const contentId = useId();
  const contentHintId = useId();
  const uploadHintId = useId();
  const uploadWarningId = useId();
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

  const { data: entries = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['qualitative', projectId],
    queryFn: () => api.getQualitativeEntries(projectId),
  });

  const handleSubmit = async () => {
    if (!form.title || !form.content) { toast.error("Please fill in title and content"); return; }
    setSubmitting(true);
    try {
      const saved = await api.addQualitativeEntry(projectId, {
        ...form, participants: form.participants ? parseInt(form.participants) : undefined, dateConducted: form.dateConducted || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['qualitative', projectId] });
      setOpen(false);
      setForm({ entryType: "fgd_transcript", title: "", content: "", participants: "", location: "", dateConducted: "", facilitator: "" });
      toast.success("Entry added — AI is analyzing themes...");
      // No counts in the message: it reads the same for one or many (and needs no Arabic plural forms).
      if (removedPersonalData(saved?.redactions)) toast.info(t("qualitative.toast.redacted"));
    } catch (err) { toast.error(errorMessage(err, "Failed to add entry")); }
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
    } catch (err) { toast.error(errorMessage(err, "Upload failed")); }
    finally { setUploading(false); }
  };

  const handleAiCode = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.codeQualitativeEntry(entryId);
      toast.success("AI thematic coding started...");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['qualitative', projectId] }), 5000);
    } catch (err) { toast.error(errorMessage(err, "Something went wrong")); }
  };

  if (isLoading) {
    return (
      <div role="status" className="flex justify-center p-8">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        <span lang={lang} className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  // A failed request is never shown as "no findings yet".
  if (isError) {
    return (
      <div role="alert" lang={lang} dir={dirFor(lang)} className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t(isForbidden(error) ? "errors.forbidden" : "access.qualitative.loadError")}</span>
        <Button size="sm" variant="outline" className="min-h-11" onClick={() => void refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readOnly && (
        <p role="note" lang={lang} dir={dirFor(lang)} className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-start text-sm">
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("access.qualitative.donorNote")}</span>
        </p>
      )}
      {!readOnly && (
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
                  <Label htmlFor={contentId}>Content *</Label>
                  <textarea id={contentId} aria-describedby={contentHintId} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="Paste transcript, interview notes, or observations..."
                    className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <PersonalDataHint id={contentHintId} lang={lang} />
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
                  <input type="file" accept=".pdf,.docx,.xlsx" aria-describedby={`${uploadHintId} ${uploadWarningId}`} onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm border rounded-md p-2" />
                  <PersonalDataHint id={uploadHintId} lang={lang} className="mt-2" />
                  <PersonalDataWarning id={uploadWarningId} lang={lang} className="mt-2" />
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
      )}

      {readOnly ? (
        entries.length === 0 ? (
          <div lang={lang} dir={dirFor(lang)} className="card-surface p-8 text-center text-muted-foreground">
            <MessageSquare aria-hidden="true" className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{t("access.qualitative.emptyReadOnly")}</p>
          </div>
        ) : (
          <div lang={lang} dir={dirFor(lang)} className="space-y-4">
            {entries.map((entry: QualitativeEntry | DonorQualitativeEntry) => <ReadOnlyEntryCard key={entry.id} entry={entry} lang={lang} />)}
          </div>
        )
      ) : entries.length === 0 ? (
        <div className="card-surface p-8 text-center text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No qualitative data entries yet.</p>
          <p className="text-sm mt-1">Add interview transcripts, FGD notes, or upload documents for AI analysis.</p>
        </div>
      ) : (
        entries.map((entry: any) => {
          const Icon = typeIcons[entry.entryType] || FileText;
          const isExpanded = expandedId === entry.id;
          const themes: string[] = Array.isArray(entry.themes) ? entry.themes.filter((theme: unknown): theme is string => typeof theme === "string") : [];
          return (
            <div key={entry.id}
              className="card-surface p-5 hover:border-border-strong transition-colors cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
              {/* Wraps at 375 px: the AI Analyze button moves under the title instead of running past the card. */}
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
                  <div className="min-w-0">
                    <h3 dir="auto" className="text-sm font-semibold break-words">{entry.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">{typeLabels[entry.entryType] || entry.entryType}</Badge>
                      {entry.participants && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {entry.participants}</span>}
                      {entry.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {entry.location}</span>}
                      {entry.dateConducted && <span>{new Date(entry.dateConducted).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!entry.themes?.length && (
                    <Button variant="ghost" size="sm" className="text-xs" onClick={(e) => handleAiCode(entry.id, e)}>
                      <Brain aria-hidden="true" className="h-3 w-3 me-1" /> AI Analyze
                    </Button>
                  )}
                </div>
              </div>
              <AiCodedFindings sentiment={entry.sentiment} themes={themes} lang={lang} />
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
