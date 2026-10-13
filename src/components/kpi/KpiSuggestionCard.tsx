import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import type { AcceptKpiSuggestionResponse, Framework, KpiSuggestion, ResultNode } from "@/types/api";
import { useKpiAssistant } from "@/hooks/useKpiAssistant";
import { useAcceptKpiSuggestion } from "@/hooks/useKpiSuggestions";
import {
  acceptedToastText, indicatorNameIn, kpiCardHeadingId, kpiNoticeId, replaceableSource, requestErrorCode,
} from "@/lib/kpiSuggestions";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LevelBadge } from "@/components/common/LevelBadge";
import { MethodPill } from "@/components/common/MethodPill";
import { IndicatorDialog } from "@/components/project/IndicatorDialog";
import { KpiWarningList } from "@/components/kpi/KpiWarningList";
import { QualityBadge } from "@/components/kpi/QualityBadge";
import { RejectReasonPicker } from "@/components/kpi/RejectReasonPicker";
import { StandardBadge } from "@/components/kpi/StandardBadge";
import { labelWithName } from "@/components/kpi/labelWithName";

export interface KpiSuggestionCardProps {
  suggestion: KpiSuggestion;
  /** The result the suggestion is for. */
  result: ResultNode;
  /** Every result node of the framework (the Edit & accept dialog's result select). */
  nodes: readonly ResultNode[];
  /** Id of the list's AiSuggestedLabel (the card points to it with aria-describedby). */
  aiLabelId: string;
  lang: AppLanguage;
  /**
   * After accept, reject or a 409 that removed the card ("dismissed"): the list turns a rejected card into the
   * stub and moves focus (next card, previous card, else the result's Suggest KPIs button).
   */
  onDecided?: (outcome: "accepted" | "rejected" | "dismissed", suggestion: KpiSuggestion) => void;
}

const ARABIC_LETTER = /[؀-ۿ]/;

/** Model free text is English: lang="en" and the direction of its own text. */
function ModelText({ children, className }: { children: ReactNode; className?: string }) {
  return <span lang="en" dir="auto" className={className}>{children}</span>;
}

/**
 * One suggested indicator (knowledge/kpi-assistant-spec.md §A7; design 9.4): the name in the panel language with an
 * aria-pressed button that also shows the other language; level, standard, quality and method badges, frequency and
 * disaggregation chips; a one-line rationale with "Why?" opening the proposed definition, means of verification,
 * baseline and target with their basis (document text, standard threshold, target-setting method or pending
 * baseline), custom reason, quality notes and confidence; validation notes; and Accept / Edit & accept / Reject /
 * Show alternatives (accessible names include the indicator name; aria-disabled while an accept runs, so no double
 * accept). Accept on an alternative to an existing indicator first asks "Replace the old indicator?" inline (Replace
 * sends replaceSource; Keep both accepts it next to the old one; SPEC-8). The AI never invents numbers: values shown
 * are the server-validated ones (me-foundations §6).
 */
export function KpiSuggestionCard({ suggestion, result, nodes, aiLabelId, lang, onDecided }: KpiSuggestionCardProps) {
  const kpi = useKpiAssistant();
  const { t } = useTranslation(undefined, { lng: lang });
  const baseId = useId();
  const s = suggestion.suggestion;
  const nameId = kpiCardHeadingId(suggestion.id);
  const detailsId = `${baseId}-details`;
  const [showOther, setShowOther] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const rejectButton = useRef<HTMLButtonElement>(null);
  /** The Edit & accept dialog closed because the card was decided (accepted, or 409 already decided or stale). */
  const decidedViaDialog = useRef(false);
  const accept = useAcceptKpiSuggestion(kpi.projectId, kpi.frameworkId);
  const busy = accept.isPending;
  const queryClient = useQueryClient();
  const [choosingReplace, setChoosingReplace] = useState(false);
  const replaceHeading = useRef<HTMLHeadingElement>(null);
  const acceptButton = useRef<HTMLButtonElement>(null);
  const replaceTitleId = `${baseId}-replace`;
  const source = replaceableSource(
    suggestion,
    queryClient.getQueryData<Framework | null>(queryKeys.framework(kpi.projectId))?.indicators,
  );

  useEffect(() => {
    if (choosingReplace) replaceHeading.current?.focus();
  }, [choosingReplace]);

  const hasArabic = ARABIC_LETTER.test(s.nameAr ?? "");
  const arabicFirst = lang === "ar" && hasArabic;
  const primary = arabicFirst ? { text: s.nameAr, lang: "ar", dir: "rtl" as const } : { text: s.name, lang: "en", dir: "ltr" as const };
  const other = arabicFirst
    ? { text: s.name, lang: "en", dir: "ltr" as const }
    : hasArabic ? { text: s.nameAr, lang: "ar", dir: "rtl" as const } : null;
  const name = primary.text;

  const runForResult = kpi.runFor({ resultId: result.id });
  const frameworkRun = kpi.runFor({ scope: "framework" });
  const alternativesUnavailable = runForResult?.status === "running" || frameworkRun?.status === "running" || kpi.aiConfigured === false;

  const blockWhileBusy = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault();
      return true;
    }
    return false;
  };

  const sendAccept = (replaceSource: boolean) => {
    accept.mutateAsync(replaceSource ? { id: suggestion.id, replaceSource } : { id: suggestion.id }).then(
      (response: AcceptKpiSuggestionResponse) => {
        toast.success(acceptedToastText(t, response, result.code));
        onDecided?.("accepted", suggestion);
      },
      (err: unknown) => {
        const code = requestErrorCode(err);
        toast.error(t("kpi.toast.acceptFailed"), { description: code === "internal" ? undefined : t(`kpi.errors.${code}`) });
        if (code === "already_decided" || code === "stale") onDecided?.("dismissed", suggestion);
        // source_has_data keeps the choice open: Keep both still works.
      },
    );
  };

  const acceptNow = (event: MouseEvent<HTMLButtonElement>) => {
    if (blockWhileBusy(event)) return;
    // An alternative to an indicator still in the framework: ask whether it replaces that indicator (SPEC-8).
    if (source) {
      setChoosingReplace(true);
      return;
    }
    sendAccept(false);
  };

  const closeReplaceChoice = () => {
    setChoosingReplace(false);
    requestAnimationFrame(() => acceptButton.current?.focus());
  };

  const requestAlternatives = (event: MouseEvent<HTMLButtonElement>) => {
    if (alternativesUnavailable) {
      event.preventDefault();
      return;
    }
    kpi.request({ scope: "alternatives", suggestionId: suggestion.id });
  };

  const baseline = s.baselineBasis === "document" && s.baselineSuggestion.trim()
    ? (
      <>
        <ModelText className="font-medium">{s.baselineSuggestion}</ModelText>
        <ProposedTag label={t("kpi.card.proposed")} />
        <span className="block text-muted-foreground">{t("kpi.card.foundInDocument", { file: s.sources.baseline ?? "" })}</span>
      </>
    )
    : <span>{t("kpi.card.pendingBaseline")}</span>;

  const target = (s.targetBasis === "document" || s.targetBasis === "standard_threshold") && s.targetSuggestion.trim()
    ? (
      <>
        <ModelText className="font-medium">{s.targetSuggestion}</ModelText>
        <ProposedTag label={t("kpi.card.proposed")} />
        <span className="block text-muted-foreground">
          {s.targetBasis === "document"
            ? t("kpi.card.foundInDocument", { file: s.sources.target ?? "" })
            : t("kpi.card.standardThreshold", { reference: s.standardReferenceCode ?? "" })}
        </span>
      </>
    )
    : (
      <>
        <span className="block font-medium">{t("kpi.card.targetMethod")} <ProposedTag label={t("kpi.card.proposed")} /></span>
        <ModelText className="block">{s.targetSuggestion.trim() || s.targetJustification}</ModelText>
      </>
    );

  return (
    <article
      aria-labelledby={nameId}
      aria-describedby={aiLabelId}
      className="min-w-0 break-words rounded-md border border-dashed border-primary/40 bg-card p-3 text-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-[10rem] flex-1 space-y-1">
          <h4 id={nameId} tabIndex={-1} className="text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span lang={primary.lang} dir={primary.dir}>{primary.text}</span>
          </h4>
          {other && showOther && (
            <p lang={other.lang} dir={other.dir} className="text-sm text-muted-foreground">{other.text}</p>
          )}
        </div>
        {other && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={showOther}
            className="h-11 shrink-0 px-2 text-xs sm:h-8"
            onClick={() => setShowOther((v) => !v)}
          >
            {t(arabicFirst ? "kpi.card.showEnglish" : "kpi.card.showArabic")}
          </Button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <LevelBadge level={suggestion.level} label={t(`level.${suggestion.level}`)} />
        <StandardBadge libraryId={suggestion.libraryId} standardReferenceCode={s.standardReferenceCode} provenance="ai_suggested" lang={lang} />
        <QualityBadge score={suggestion.qualityScore} band={suggestion.qualityBand} lang={lang} />
        <MethodPill method={s.method} label={t(`methodShort.${s.method}`)} />
        <span className="text-xs text-muted-foreground">{t("kpi.card.frequency", { value: t(`frequency.${s.frequency}`) })}</span>
      </div>

      {s.disaggregation.length > 0 && (
        <ul aria-label={t("kpi.card.disaggregation")} className="mt-2 flex flex-wrap gap-1">
          {s.disaggregation.map((key) => (
            <li key={key} className="rounded-full border px-2 py-0.5 text-xs">
              {t(`disaggregation.${key}`, { defaultValue: key })}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex min-w-0 items-start gap-2">
        <p className="min-w-0 flex-1 line-clamp-1 text-muted-foreground"><ModelText>{s.rationale}</ModelText></p>
        <Button
          type="button"
          variant="link"
          size="sm"
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="h-auto min-h-11 shrink-0 p-0 sm:min-h-0"
          onClick={() => setExpanded((v) => !v)}
        >
          {t(expanded ? "kpi.card.hideWhy" : "kpi.card.why")}
          <ChevronDown aria-hidden="true" className={cn("transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>

      <div id={detailsId} hidden={!expanded} className="mt-2 space-y-2 rounded-md bg-secondary/40 p-2">
        {lang === "ar" && <p className="text-xs text-muted-foreground">{t("kpi.card.englishOnly")}</p>}
        <dl className="space-y-2">
          <Detail term={t("kpi.card.rationale")}><ModelText>{s.rationale}</ModelText></Detail>
          <Detail term={t("kpi.card.definition")}><ModelText>{s.definition}</ModelText></Detail>
          <Detail term={t("kpi.card.meansOfVerification")}><ModelText>{s.meansOfVerification}</ModelText></Detail>
          <Detail term={t("kpi.card.baseline")}>{baseline}</Detail>
          <Detail term={t("kpi.card.target")}>{target}</Detail>
          {suggestion.isCustom && s.customReason.trim() && (
            <Detail term={t("kpi.card.customReason")}><ModelText>{s.customReason}</ModelText></Detail>
          )}
          {s.qualityNotes.length > 0 && (
            <Detail term={t("kpi.card.qualityNotes")}>
              <ul className="list-disc space-y-0.5 ps-4">
                {s.qualityNotes.map((note, index) => <li key={index}><ModelText>{note}</ModelText></li>)}
              </ul>
            </Detail>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">{t("kpi.card.confidence", { level: t(`kpi.confidence.${s.confidence}`) })}</p>
      </div>

      {suggestion.warnings.length > 0 && (
        <div className="mt-2">
          <KpiWarningList warnings={suggestion.warnings} lang={lang} />
        </div>
      )}

      {choosingReplace && source && !rejecting ? (
        <section aria-labelledby={replaceTitleId} className="mt-3 space-y-2 rounded-md border bg-secondary/40 p-3">
          <h5 id={replaceTitleId} ref={replaceHeading} tabIndex={-1} className="text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("kpi.replace.title")}
          </h5>
          <p className="text-sm">
            {labelWithName(t, "kpi.replace.body", indicatorNameIn(source, lang))}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <Button
              type="button"
              size="sm"
              className="min-h-11 whitespace-normal sm:min-h-9"
              aria-disabled={busy ? "true" : undefined}
              onClick={(event) => { if (!blockWhileBusy(event)) sendAccept(true); }}
            >
              {busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
              {t("kpi.replace.replace")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 whitespace-normal sm:min-h-9"
              aria-disabled={busy ? "true" : undefined}
              onClick={(event) => { if (!blockWhileBusy(event)) sendAccept(false); }}
            >
              {t("kpi.replace.keepBoth")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11 whitespace-normal sm:min-h-9"
              aria-disabled={busy ? "true" : undefined}
              onClick={(event) => { if (!blockWhileBusy(event)) closeReplaceChoice(); }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </section>
      ) : rejecting ? (
        <div className="mt-3">
          <RejectReasonPicker
            suggestion={suggestion}
            lang={lang}
            onRejected={(rejected) => onDecided?.("rejected", rejected)}
            onCancel={() => {
              setRejecting(false);
              requestAnimationFrame(() => rejectButton.current?.focus());
            }}
            onStale={() => onDecided?.("dismissed", suggestion)}
          />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button
            ref={acceptButton}
            type="button"
            size="sm"
            className="min-h-11 whitespace-normal sm:min-h-9"
            aria-label={t("kpi.actions.acceptNamed", { name })}
            aria-disabled={busy ? "true" : undefined}
            onClick={acceptNow}
          >
            {busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
            {t("kpi.actions.accept")}
          </Button>
          <IndicatorDialog
            mode="accept"
            projectId={kpi.projectId}
            frameworkId={kpi.frameworkId}
            resultNodes={nodes}
            defaultResultId={result.id}
            suggestion={suggestion}
            initialLang={lang}
            onAccepted={() => {
              decidedViaDialog.current = true;
              onDecided?.("accepted", suggestion);
            }}
            onConflict={(code) => {
              // Decided elsewhere or expired: the card leaves the list (as for the Accept button); a duplicate stays.
              if (code !== "already_decided" && code !== "stale") return;
              decidedViaDialog.current = true;
              onDecided?.("dismissed", suggestion);
            }}
            onCloseAutoFocus={(event) => {
              // After a decision the list moves focus to the next card; otherwise focus returns to this button.
              if (decidedViaDialog.current) event.preventDefault();
            }}
            trigger={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 whitespace-normal sm:min-h-9"
                aria-label={t("kpi.actions.editAcceptNamed", { name })}
                aria-disabled={busy ? "true" : undefined}
                onClick={(event) => { blockWhileBusy(event); }}
              >
                {t("kpi.actions.editAccept")}
              </Button>
            }
          />
          <Button
            ref={rejectButton}
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 whitespace-normal sm:min-h-9"
            aria-label={t("kpi.actions.rejectNamed", { name })}
            aria-disabled={busy ? "true" : undefined}
            onClick={(event) => { if (!blockWhileBusy(event)) setRejecting(true); }}
          >
            {t("kpi.actions.reject")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn("min-h-11 whitespace-normal sm:min-h-9", alternativesUnavailable && "cursor-not-allowed opacity-60")}
            aria-label={t("kpi.actions.alternativesNamed", { name })}
            aria-disabled={alternativesUnavailable || busy ? "true" : undefined}
            aria-describedby={kpi.aiConfigured === false ? kpiNoticeId(kpi.projectId) : undefined}
            onClick={(event) => { if (!blockWhileBusy(event)) requestAlternatives(event); }}
          >
            {t("kpi.actions.alternatives")}
          </Button>
        </div>
      )}
    </article>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function ProposedTag({ label }: { label: string }) {
  return <span className="ms-1.5 inline-flex rounded border px-1 py-px text-[11px] font-medium text-muted-foreground">{label}</span>;
}
