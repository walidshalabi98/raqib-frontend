import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AlertCircle, BadgeCheck, Eye, FilePenLine, Info, Loader2, Send, Sparkles, Undo2 } from "lucide-react";
import { dirFor } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { isForbidden } from "@/lib/apiError";
import { formatDisplayDate } from "@/lib/dates";
import { isolate, reportFrameDocument, reportStatusOf, reportTitle } from "@/lib/reports";
import { useReport } from "@/hooks/useReports";
import type { ReportListItem, ReportStatus } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Draft or Published to donors, as text with an icon (never colour alone). */
export function ReportStatusBadge({ status, t }: { status: ReportStatus; t: TFunction }) {
  const published = status === "published";
  const Icon = published ? Eye : FilePenLine;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-foreground ${published ? "bg-success/10" : "bg-muted"}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {t(`reports.status.${status}`)}
    </span>
  );
}

export interface ReportReaderProps {
  /** The report being read, as the list holds it (its status is the server's, refreshed after a change); null: closed. */
  report: ReportListItem | null;
  onClose: () => void;
  /** Staff see the status and the "AI written" review notice; donor viewers see published reports only. */
  staffView: boolean;
  /** Org admins and platform admins: Publish (a finished draft) or Unpublish, through the confirmation. */
  canPublish: boolean;
  /** Asks for the confirmation; `button` gets the focus back when it closes. */
  onRequestChange: (report: ReportListItem, publish: boolean, button: HTMLElement) => void;
  /** A publish or unpublish request is on its way. */
  busy: boolean;
  /** The row button that opened the view: the focus goes back to it when the view closes. */
  openerRef: MutableRefObject<HTMLElement | null>;
}

/**
 * The reading view of a report: its narrative (report HTML written by AI from the project's data) in a sandboxed
 * frame, with no scripts and no network requests (src/lib/reports.ts reportFrameDocument). Staff read drafts here
 * under an "AI written — review before publishing" notice, and org admins publish only from here, after the text
 * has loaded in front of them. Donor viewers read published reports here.
 */
export function ReportReader({ report, onClose, staffView, canPublish, onRequestChange, busy, openerRef }: ReportReaderProps) {
  const lang = useUserLanguage();
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const reportId = report?.id ?? "";
  const { data, isLoading, isError, error, refetch } = useReport(reportId, report !== null);

  const narrative = data && typeof data.aiNarrative === "string" && data.aiNarrative.trim() ? data.aiNarrative : null;
  const status = report ? reportStatusOf(report) : "draft";
  const published = status === "published";
  const title = report ? reportTitle(report, t) : "";
  // Publishing needs the text on screen; taking a report back to draft never waits for it.
  const showAction = canPublish && (published || narrative !== null);

  return (
    <Dialog
      open={report !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        dir={dir}
        lang={lang}
        closeLabel={t("common.close")}
        // Phones: a near full-screen sheet whose frame takes the space left, so Publish stays on screen.
        className="flex h-[94dvh] max-h-[94dvh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-3 overflow-y-auto p-4 sm:h-auto sm:p-6"
        onCloseAutoFocus={(event) => {
          // Opened from a row button, not a Trigger: give the focus back to it.
          event.preventDefault();
          const target = openerRef.current;
          openerRef.current = null;
          if (target?.isConnected) target.focus();
        }}
      >
        {report && (
          <>
            <DialogHeader className="shrink-0 space-y-2 pe-8 text-start">
              <DialogTitle className="break-words leading-snug">
                <span dir="auto">{title}</span>
              </DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {staffView && <ReportStatusBadge status={status} t={t} />}
                  <span>{t(`reportType.${report.type}`, { defaultValue: String(report.type ?? "").replace(/_/g, " ") })}</span>
                  {report.donorFormat && <span>· {t(`donorType.${report.donorFormat}`, { defaultValue: report.donorFormat })}</span>}
                  {report.periodStart && report.periodEnd && (
                    <span>
                      · {formatDisplayDate(report.periodStart, lang)} – {formatDisplayDate(report.periodEnd, lang)}
                    </span>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            {/* AI content is labelled until an org admin approves it (publishes it to donors). */}
            {staffView && !published ? (
              <div role="note" className="flex shrink-0 items-start gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-foreground">
                <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">{t("reports.reader.aiDraft")}</p>
                  <p>{t("reports.reader.aiDraftHint")}</p>
                </div>
              </div>
            ) : (
              <p role="note" className="flex shrink-0 items-start gap-2 text-sm text-muted-foreground">
                <BadgeCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t(staffView ? "reports.reader.aiPublished" : "reports.reader.donorNote")}</span>
              </p>
            )}

            {isLoading ? (
              <div role="status" className="flex h-64 items-center justify-center rounded-md border">
                <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="sr-only">{t("common.loading")}</span>
              </div>
            ) : isError ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1">{t(isForbidden(error) ? "errors.forbidden" : "reports.reader.loadError")}</span>
                <Button size="sm" variant="outline" className="min-h-11" onClick={() => void refetch()}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : narrative === null ? (
              <p className="flex items-start gap-2 rounded-md border p-4 text-sm text-muted-foreground">
                <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("reports.reader.noText")}</span>
              </p>
            ) : (
              // Sandboxed without allow-scripts or allow-same-origin: the report cannot run code, reach the app or
              // the user's session, and its policy blocks every request. The report keeps its own light page.
              <iframe
                title={t("reports.reader.frameTitle", { title: isolate(title) })}
                sandbox=""
                referrerPolicy="no-referrer"
                srcDoc={reportFrameDocument(narrative)}
                className="min-h-48 w-full flex-1 rounded-md border bg-white sm:h-[60vh] sm:flex-none"
              />
            )}

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
              {showAction && !published && <p className="w-full text-xs text-muted-foreground sm:me-auto sm:w-auto">{t("reports.reader.publishHint")}</p>}
              <DialogClose asChild>
                <Button variant="outline" className="min-h-11">{t("common.close")}</Button>
              </DialogClose>
              {showAction && (
                // One button whose action follows the status, so keyboard focus stays on it after a change.
                <Button
                  className="min-h-11"
                  variant={published ? "outline" : "default"}
                  disabled={busy}
                  aria-label={t(published ? "reports.unpublishLabel" : "reports.publishLabel", { title: isolate(title) })}
                  onClick={(event) => onRequestChange(report, !published, event.currentTarget)}
                >
                  {published ? (
                    <Undo2 aria-hidden="true" className="me-1.5 h-4 w-4 rtl:-scale-x-100" />
                  ) : (
                    <Send aria-hidden="true" className="me-1.5 h-4 w-4 rtl:-scale-x-100" />
                  )}
                  {t(published ? "reports.unpublish" : "reports.publish")}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
