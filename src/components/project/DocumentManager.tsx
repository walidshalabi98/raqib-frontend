import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/services/api";
import type { DocumentFileType, ParsingStatus, ProjectDocument } from "@/types/api";
import { dirFor, type AppLanguage } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { DOCUMENT_FILE_TYPES } from "@/lib/constants";
import { formatDisplayDate } from "@/lib/dates";
import { documentAnalysisOf, documentsNeedRefresh, isAnalysisPending, type DocumentAnalysisView } from "@/lib/documentAnalysis";
import { queryKeys } from "@/lib/queryKeys";
import { cn, errorMessage } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/common/NativeSelect";

/**
 * The project's documents: upload, parsing status and the AI analysis
 * (Document.aiAnalysis, or the legacy copy in parsedText). The analysis is AI
 * content and is always labelled as such. Phase 6 redesigns this screen.
 */

/** How often the list refreshes while a document is being read or awaits its analysis. */
const REFRESH_MS = 10_000;

const FILE_TYPE_ICONS: Record<DocumentFileType, LucideIcon> = {
  proposal: FileText,
  logframe: FileText,
  theory_of_change: FileText,
  baseline_report: FileText,
  donor_guidelines: FileText,
  budget: FileSpreadsheet,
  other: FileIcon,
};

/** Each status has its own icon and text; colour only tints the badge and icon (UX standards §4). */
const PARSING_STATUS_STYLE: Record<ParsingStatus, { icon: LucideIcon; badge: string; iconClass: string }> = {
  pending: { icon: Clock, badge: "bg-muted", iconClass: "text-muted-foreground" },
  processing: { icon: Loader2, badge: "border-info/30 bg-info/10", iconClass: "animate-spin text-info" },
  completed: { icon: CheckCircle2, badge: "border-success/30 bg-success/10", iconClass: "text-success" },
  failed: { icon: AlertCircle, badge: "border-destructive/30 bg-destructive/10", iconClass: "text-destructive" },
};

export default function DocumentManager({ projectId }: { projectId: string }) {
  const lang = useUserLanguage();
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const headingId = useId();

  // "Now" is when the list was fetched, so the refresh decision and the rows agree.
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: queryKeys.documents(projectId),
    queryFn: () => api.getDocuments(projectId),
    refetchInterval: (query) =>
      documentsNeedRefresh(query.state.data ?? [], query.state.dataUpdatedAt) ? REFRESH_MS : false,
  });
  const documents = data ?? [];

  return (
    <section aria-labelledby={headingId} dir={dir} lang={lang} className="space-y-4">
      <DirectionProvider dir={dir}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={headingId} className="text-lg font-semibold">{t("documents.title")}</h3>
          <UploadDocumentDialog projectId={projectId} lang={lang} />
        </div>

        {isLoading ? (
          <div role="status" className="space-y-3">
            <span className="sr-only">{t("documents.loading")}</span>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : isError && !data ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1">{t("documents.loadError")}</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>{t("common.retry")}</Button>
          </div>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <FileText aria-hidden="true" className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>{t("documents.empty")}</p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {documents.map((doc) => (
              <li key={doc.id}>
                <DocumentRow doc={doc} lang={lang} now={dataUpdatedAt} />
              </li>
            ))}
          </ul>
        )}
      </DirectionProvider>
    </section>
  );
}

function UploadDocumentDialog({ projectId, lang }: { projectId: string; lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const dir = dirFor(lang);
  const queryClient = useQueryClient();
  const typeId = useId();
  const fileId = useId();
  const fileHintId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<DocumentFileType>("proposal");

  const upload = useMutation({
    mutationFn: (input: { file: File; fileType: DocumentFileType }) => api.uploadDocument(projectId, input.file, input.fileType),
    onSuccess: () => {
      toast.success(t("documents.toast.uploaded"));
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents(projectId) });
      setOpen(false);
      setFile(null);
    },
    onError: (err) => {
      toast.error(t("documents.toast.uploadFailed"), { description: errorMessage(err, "") || undefined });
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (file && !upload.isPending) upload.mutate({ file, fileType });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFile(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload aria-hidden="true" className="me-2 h-4 w-4" />
          {t("documents.upload")}
        </Button>
      </DialogTrigger>
      <DialogContent dir={dir} lang={lang} closeLabel={t("common.close")}>
        <DirectionProvider dir={dir}>
          <DialogHeader className="pe-8 text-start">
            <DialogTitle>{t("documents.uploadTitle")}</DialogTitle>
            <DialogDescription>{t("documents.uploadDescription")}</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={typeId}>{t("documents.fileType")}</Label>
              <NativeSelect id={typeId} value={fileType} onChange={(e) => setFileType(e.target.value as DocumentFileType)}>
                {DOCUMENT_FILE_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`documentType.${type}`)}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fileId}>{t("documents.file")}</Label>
              <input
                id={fileId}
                type="file"
                accept=".pdf,.docx,.doc,.xlsx"
                aria-describedby={fileHintId}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-md border border-input bg-background p-2 text-sm"
              />
              <p id={fileHintId} className="text-xs text-muted-foreground">{t("documents.fileHint")}</p>
            </div>
            <Button type="submit" disabled={!file || upload.isPending} className="w-full">
              {upload.isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />
                  {t("documents.uploading")}
                </>
              ) : (
                t("documents.submit")
              )}
            </Button>
          </form>
        </DirectionProvider>
      </DialogContent>
    </Dialog>
  );
}

function DocumentRow({ doc, lang, now }: { doc: ProjectDocument; lang: AppLanguage; now: number }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const analysis = documentAnalysisOf(doc);
  const waitingForAnalysis = !analysis && isAnalysisPending(doc, now);
  const Icon = FILE_TYPE_ICONS[doc.fileType] ?? FileIcon;
  const uploaded = formatDisplayDate(doc.uploadedAt, lang);

  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Icon aria-hidden="true" className="h-8 w-8 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p dir="auto" className="break-words font-medium">{doc.fileName}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs font-medium">
                  {t(`documentType.${doc.fileType}`, { defaultValue: doc.fileType })}
                </Badge>
                <ParsingStatusBadge status={doc.parsingStatus} lang={lang} />
                {analysis && (
                  <Badge variant="outline" className="gap-1 text-xs font-medium">
                    <Sparkles aria-hidden="true" className="h-3 w-3" />
                    {t("documents.aiAnalysed")}
                  </Badge>
                )}
                {uploaded && <span className="text-xs text-muted-foreground">{t("documents.uploadedOn", { date: uploaded })}</span>}
              </div>
            </div>
          </div>
          {analysis && <AnalysisDialog doc={doc} analysis={analysis} lang={lang} />}
        </div>

        {doc.parsingStatus === "failed" && (
          <p className="flex items-start gap-1.5 text-sm">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            {t("documents.failedHint")}
          </p>
        )}

        {waitingForAnalysis && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
            {t("documents.analysisPending")}
          </p>
        )}

        {analysis && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{t("documents.summaryTitle")}</p>
              <AiLabel lang={lang} />
            </div>
            {analysis.summary && <p dir="auto" className="break-words text-sm">{analysis.summary}</p>}
            {analysis.keyFindings.length > 0 && <TextList items={analysis.keyFindings.slice(0, 3)} className="text-xs text-muted-foreground" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ParsingStatusBadge({ status, lang }: { status: ParsingStatus; lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const style = PARSING_STATUS_STYLE[status] ?? PARSING_STATUS_STYLE.pending;
  const Icon = style.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs font-medium text-foreground", style.badge)}>
      <Icon aria-hidden="true" className={cn("h-3 w-3", style.iconClass)} />
      {t(`parsingStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

/** The label every piece of AI content carries (CLAUDE.md rule 5). */
function AiLabel({ lang }: { lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <p role="note" className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium">
      <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {t("ai.suggestedLabel")}
    </p>
  );
}

/** Model text may be in either language: each item isolates its own direction. */
function TextList({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={cn("list-disc space-y-1 ps-5", className)}>
      {items.map((item, i) => (
        <li key={i} className="break-words">
          <bdi>{item}</bdi>
        </li>
      ))}
    </ul>
  );
}

function AnalysisSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
    </div>
  );
}

function AnalysisDialog({ doc, analysis, lang }: { doc: ProjectDocument; analysis: DocumentAnalysisView; lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const dir = dirFor(lang);
  const analysed = formatDisplayDate(analysis.analysedAt, lang);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0 sm:min-h-9"
          aria-label={t("documents.viewAnalysisOf", { name: doc.fileName })}
        >
          <Eye aria-hidden="true" className="me-1.5 h-4 w-4" />
          {t("documents.viewAnalysis")}
        </Button>
      </DialogTrigger>
      <DialogContent dir={dir} lang={lang} closeLabel={t("common.close")} className="flex max-h-[90vh] flex-col">
        <DirectionProvider dir={dir}>
          <DialogHeader className="pe-8 text-start">
            <DialogTitle>{t("documents.analysisTitle")}</DialogTitle>
            <DialogDescription className="break-words">
              <bdi>{doc.fileName}</bdi>
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto">
            <AiLabel lang={lang} />
            {analysis.summary && (
              <AnalysisSection title={t("documents.sections.summary")}>
                <p dir="auto" className="break-words text-sm text-muted-foreground">{analysis.summary}</p>
              </AnalysisSection>
            )}
            {analysis.keyFindings.length > 0 && (
              <AnalysisSection title={t("documents.sections.keyFindings")}>
                <TextList items={analysis.keyFindings} className="text-sm" />
              </AnalysisSection>
            )}
            {analysis.indicatorsMentioned.length > 0 && (
              <AnalysisSection title={t("documents.sections.indicatorsMentioned")}>
                <ul className="flex flex-wrap gap-1">
                  {analysis.indicatorsMentioned.map((indicator, i) => (
                    <li key={i}>
                      <Badge variant="outline" className="text-xs font-normal">
                        <bdi>{indicator}</bdi>
                      </Badge>
                    </li>
                  ))}
                </ul>
              </AnalysisSection>
            )}
            {analysis.targetsMentioned.length > 0 && (
              <AnalysisSection title={t("documents.sections.targetsMentioned")}>
                <p className="text-xs text-muted-foreground">{t("documents.targetsNote")}</p>
                <ul className="space-y-2">
                  {analysis.targetsMentioned.map((mention, i) => (
                    <li key={i} className="rounded-md border p-2 text-sm">
                      {mention.indicator && <p dir="auto" className="break-words font-medium">{mention.indicator}</p>}
                      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                        <dt className="text-muted-foreground">{t("documents.target")}</dt>
                        <dd className="break-words">
                          <bdi>{mention.target || t("documents.notStated")}</bdi>
                        </dd>
                        {mention.timeline && (
                          <>
                            <dt className="text-muted-foreground">{t("documents.timeline")}</dt>
                            <dd className="break-words">
                              <bdi>{mention.timeline}</bdi>
                            </dd>
                          </>
                        )}
                      </dl>
                    </li>
                  ))}
                </ul>
              </AnalysisSection>
            )}
            {analysis.recommendations.length > 0 && (
              <AnalysisSection title={t("documents.sections.recommendations")}>
                <TextList items={analysis.recommendations} className="text-sm" />
              </AnalysisSection>
            )}
            {analysed && <p className="text-xs text-muted-foreground">{t("documents.analysedOn", { date: analysed })}</p>}
          </div>
        </DirectionProvider>
      </DialogContent>
    </Dialog>
  );
}
