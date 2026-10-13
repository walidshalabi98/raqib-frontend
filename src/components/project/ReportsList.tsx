import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dirFor } from "@/i18n";
import { formatDisplayDate } from "@/lib/dates";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { isForbidden } from "@/lib/apiError";
import { isFinishedReport, isolate, publicationErrorKey, reportStatusOf, reportTitle } from "@/lib/reports";
import { useReportPublication, useReports } from "@/hooks/useReports";
import type { ReportListItem } from "@/types/api";
import { AlertCircle, BookOpen, FileText, Hourglass, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { GenerateReportDialog } from "@/components/project/GenerateReportDialog";
import { ReportReader, ReportStatusBadge } from "@/components/project/ReportReader";

// Tinted backgrounds with foreground text: coloured text on its own tint is below WCAG AA (4.5:1).
const typeBadge: Record<string, string> = {
  assessment_report: "bg-info/10 text-foreground",
  monthly_progress: "bg-success/10 text-foreground",
  quarterly_summary: "bg-warning/10 text-foreground",
  annual_review: "bg-primary/10 text-foreground",
  donor_export: "bg-secondary text-secondary-foreground",
};

interface PendingChange {
  report: ReportListItem;
  /** true publishes the report to donor viewers; false takes it back to draft. */
  publish: boolean;
}

export interface ReportsListProps {
  projectId: string;
  /** The Generate Report dialog (org staff). Default true. */
  canGenerate?: boolean;
  /**
   * Publish and Unpublish (org admins and platform admins: the `report.publish` capability). Default false.
   * Publish is offered only in the reading view, once the report's text is on screen; Unpublish also on the row.
   */
  canPublish?: boolean;
  /**
   * "staff" see drafts and each report's status (Draft / Published to donors); "donor" viewers receive published
   * reports only, so no status is shown and the empty state says reports appear once the organisation publishes
   * them. Default: "staff" when `canGenerate`, otherwise "donor".
   */
  audience?: "staff" | "donor";
}

/**
 * The reports of a project. Pages decide what each role may do (src/lib/permissions.ts) and pass it in; the
 * server enforces every rule and answers donor viewers with published reports only.
 */
export function ReportsList({ projectId, canGenerate = true, canPublish = false, audience }: ReportsListProps) {
  const lang = useUserLanguage();
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  // The button that opened the confirmation (a row's, or the reading view's): focus goes back to it on close.
  const opener = useRef<HTMLElement | null>(null);
  // The row button that opened the reading view.
  const readerOpener = useRef<HTMLElement | null>(null);
  const staffView = (audience ?? (canGenerate ? "staff" : "donor")) === "staff";

  const { data: reports = [], isLoading, isError, error, refetch } = useReports(projectId);
  const publication = useReportPublication(projectId);
  // The reading view follows the list, so it shows the status the server holds (and closes if the report is gone).
  const reading = readingId ? (reports.find((r) => r.id === readingId) ?? null) : null;

  const requestChange = (report: ReportListItem, publish: boolean, button: HTMLElement) => {
    opener.current = button;
    setPending({ report, publish });
  };

  const confirmChange = () => {
    if (!pending || publication.isPending) return;
    const { report, publish } = pending;
    const title = isolate(reportTitle(report, t));
    publication.mutate(
      { reportId: report.id, publish },
      {
        onSuccess: () => {
          toast.success(t(publish ? "reports.toastPublished" : "reports.toastUnpublished", { title }));
        },
        onError: (err) => {
          toast.error(t(publicationErrorKey(err, publish)));
        },
        onSettled: () => setPending(null),
      },
    );
  };

  if (isLoading) {
    return (
      <div role="status" className="flex justify-center p-8">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        <span lang={lang} className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  // A failed request is never shown as "no reports yet".
  if (isError) {
    return (
      <div role="alert" lang={lang} dir={dirFor(lang)} className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t(isForbidden(error) ? "errors.forbidden" : "access.reports.loadError")}</span>
        <Button size="sm" variant="outline" className="min-h-11" onClick={() => void refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canGenerate && (
        <div className="flex justify-end">
          <GenerateReportDialog projectId={projectId} />
        </div>
      )}
      {reports.length === 0 ? (
        <div lang={lang} dir={dir} className="card-surface p-8 text-center text-muted-foreground">{t(staffView ? "access.reports.empty" : "access.reports.emptyReadOnly")}</div>
      ) : (
        <ul className="card-surface divide-y">
          {reports.map((r) => {
            const status = reportStatusOf(r);
            const published = status === "published";
            const title = reportTitle(r, t);
            // A finished report (its text exists) can be read; an admin publishes a draft from the reading view.
            const finished = isFinishedReport(r);
            const review = canPublish && !published && finished;
            return (
              // The row's labels are in the UI language; the title is as written.
              <li
                key={r.id}
                lang={lang}
                dir={dir}
                className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-secondary/30 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <FileText aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    {/* The title as written (its own direction), in a block aligned with the UI language. */}
                    <p className="break-words text-sm font-medium"><span dir="auto">{title}</span></p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {staffView && <ReportStatusBadge status={status} t={t} />}
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeBadge[r.type] || "bg-secondary text-secondary-foreground"}`}>
                        {t(`reportType.${r.type}`, { defaultValue: String(r.type ?? "").replace(/_/g, " ") })}
                      </span>
                      {r.donorFormat && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{t(`donorType.${r.donorFormat}`, { defaultValue: r.donorFormat })}</span>}
                      {r.periodStart && r.periodEnd && (
                        <span className="text-xs text-muted-foreground">
                          {formatDisplayDate(r.periodStart, lang)} – {formatDisplayDate(r.periodEnd, lang)}
                        </span>
                      )}
                    </div>
                    {canPublish && !published && !finished && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Hourglass aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{t("reports.notFinished")}</span>
                      </p>
                    )}
                  </div>
                </div>
                {(finished || (canPublish && published)) && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2 ps-8 sm:ps-0">
                    {finished && (
                      <Button
                        variant={review ? "default" : "outline"}
                        size="sm"
                        className="min-h-11"
                        aria-label={t(review ? "reports.reviewLabel" : "reports.readLabel", { title: isolate(title) })}
                        onClick={(event) => {
                          readerOpener.current = event.currentTarget;
                          setReadingId(r.id);
                        }}
                      >
                        <BookOpen aria-hidden="true" className="me-1.5 h-4 w-4" />
                        {t(review ? "reports.review" : "reports.read")}
                      </Button>
                    )}
                    {canPublish && published && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        aria-label={t("reports.unpublishLabel", { title: isolate(title) })}
                        onClick={(event) => requestChange(r, false, event.currentTarget)}
                      >
                        <Undo2 aria-hidden="true" className="me-1.5 h-4 w-4 rtl:-scale-x-100" />
                        {t("reports.unpublish")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ReportReader
        report={reading}
        onClose={() => setReadingId(null)}
        staffView={staffView}
        canPublish={canPublish}
        onRequestChange={requestChange}
        busy={publication.isPending}
        openerRef={readerOpener}
      />

      <AlertDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next && !publication.isPending) setPending(null);
        }}
      >
        <AlertDialogContent
          dir={dir}
          lang={lang}
          className="max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            // Radix returns focus to a Trigger only; this dialog is opened from the row buttons.
            event.preventDefault();
            const target = opener.current;
            opener.current = null;
            if (target?.isConnected) target.focus();
          }}
        >
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t(pending.publish ? "reports.confirmPublish.title" : "reports.confirmUnpublish.title", {
                    title: isolate(reportTitle(pending.report, t)),
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  {pending.publish ? (
                    <div className="space-y-2 text-start">
                      <p>{t("reports.confirmPublish.intro")}</p>
                      <ul className="list-disc space-y-1 ps-5">
                        <li>{t("reports.confirmPublish.seeDetails")}</li>
                        <li>{t("reports.confirmPublish.seeText")}</li>
                      </ul>
                      <p className="font-medium text-foreground">{t("reports.confirmPublish.checkNames")}</p>
                      <p>{t("reports.confirmPublish.notice")}</p>
                    </div>
                  ) : (
                    <p className="text-start">{t("reports.confirmUnpublish.body")}</p>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11" disabled={publication.isPending}>{t("common.cancel")}</AlertDialogCancel>
                <Button className="min-h-11" disabled={publication.isPending} onClick={confirmChange}>
                  {publication.isPending && <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />}
                  {t(pending.publish ? "reports.confirmPublish.action" : "reports.confirmUnpublish.action")}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
