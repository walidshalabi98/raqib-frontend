import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { dirFor, type AppLanguage } from "@/i18n";
import type { Framework, KpiRun, KpiSuggestion, ResultNode } from "@/types/api";
import { useKpiAssistant } from "@/hooks/useKpiAssistant";
import { queryKeys } from "@/lib/queryKeys";
import {
  focusCandidates,
  groupSuggestions,
  isSuggestableLevel,
  kpiCardHeadingId,
  kpiNoticeId,
  kpiStubHeadingId,
  suggestKpisButtonId,
  suggestionReadingOrder,
  type AlternativesGroup,
} from "@/lib/kpiSuggestions";
import { Button } from "@/components/ui/button";
import { AiSuggestedLabel } from "@/components/common/AiSuggestedLabel";
import { KpiProgressSteps } from "@/components/kpi/KpiProgressSteps";
import { KpiSuggestionCard } from "@/components/kpi/KpiSuggestionCard";
import { KpiWarningList } from "@/components/kpi/KpiWarningList";

export interface KpiResultSuggestionsProps {
  /** The result whose suggestions are shown. */
  result: ResultNode;
  /** Every result node of the framework (codes, the accept dialog's result select). */
  nodes: readonly ResultNode[];
  /** Where focus goes when the last card is decided (the result's Suggest KPIs button). */
  focusFallback: () => HTMLElement | null;
}

type Decision = "accepted" | "rejected" | "dismissed";
type FocusRequest = { kind: "stub"; id: string } | { kind: "next"; candidates: string[] };

const ARABIC_LETTER = /[؀-ۿ]/;

/** A suggestion's name in the panel language (Arabic when it has one). */
function nameIn(suggestion: KpiSuggestion, lang: string): string {
  const { name, nameAr } = suggestion.suggestion;
  return lang === "ar" && ARABIC_LETTER.test(nameAr ?? "") ? nameAr : name;
}

type T = ReturnType<typeof useTranslation>["t"];

/** Stands for the name while the label is translated (a private-use character no translation contains). */
const NAME_SLOT = "\uE000";

/**
 * A translated label with `{{name}}` in a <bdi> carrying the name's own language (Arabic letters → ar, else en), so an
 * English indicator name inside an Arabic label keeps its reading order and is read with the English voice (WCAG
 * 3.1.2; review UX-12).
 */
function labelWithName(t: T, key: string, name: string): ReactNode {
  const nameLang: AppLanguage = ARABIC_LETTER.test(name) ? "ar" : "en";
  const parts = (t(key, { name: NAME_SLOT }) as string).split(NAME_SLOT);
  return parts.map((part, index) => (index === 0 ? part : (
    <Fragment key={index}>
      <bdi lang={nameLang} dir="auto">{name}</bdi>
      {part}
    </Fragment>
  )));
}

/**
 * The KPI Assistant under one result (knowledge/kpi-assistant-spec.md §A2, §A7; design 9.1 and 9.4): progress of a
 * result or alternatives run (KpiProgressSteps), the error state (role=alert, translated message, Retry when it can
 * help), the empty state after a run with nothing new ("Suggest again"), the run's notes, and the list of suggestion
 * cards with one "AI suggested — review before approval" label. Alternatives nest under their source; a rejected
 * card becomes a stub offering alternatives (trigger 3). Focus moves to the stub after a rejection and to the next
 * card (else the previous, else the Suggest KPIs button) after an accept or dismiss; it never moves when a run
 * finishes. A visually hidden status announces "N suggestions ready for O1" and "Indicator added to O1". The empty
 * state follows what the last run returned (suggestionCount 0: "No new suggestions", or "No alternatives found" for an
 * alternatives run, shown next to other cards too) until the user decides a card (review UX-04).
 */
export function KpiResultSuggestions({ result, nodes, focusFallback }: KpiResultSuggestionsProps) {
  const kpi = useKpiAssistant();
  const lang = kpi.lang;
  const { t } = useTranslation(undefined, { lng: lang });
  const queryClient = useQueryClient();
  const baseId = useId();
  const aiLabelId = `${baseId}-ai-label`;
  const [stubs, setStubs] = useState<Readonly<Record<string, KpiSuggestion>>>({});
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  /** The finished run the user last decided a card after: its empty state is no longer news. */
  const [decidedAfterRun, setDecidedAfterRun] = useState<string | null>(null);
  const orderRef = useRef<string[]>([]);
  const announcedRun = useRef<string | null>(null);
  const focusFallbackRef = useRef(focusFallback);
  focusFallbackRef.current = focusFallback;

  const view = kpi.enabled ? kpi.runFor({ resultId: result.id }) : null;
  const finishedRun = view?.status === "completed" ? view.run : null;

  // "N suggestions ready for O1" ("No new suggestions for O1" for none), once per finished run (focus does not move).
  useEffect(() => {
    if (!finishedRun || announcedRun.current === finishedRun.id) return;
    announcedRun.current = finishedRun.id;
    setAnnouncement(t("kpi.ready", { count: finishedRun.suggestionCount, code: result.code }));
  }, [finishedRun, result.code, t]);

  useEffect(() => {
    if (!focusRequest) return;
    setFocusRequest(null);
    if (focusRequest.kind === "stub") {
      document.getElementById(kpiStubHeadingId(focusRequest.id))?.focus();
      return;
    }
    for (const id of focusRequest.candidates) {
      const heading = document.getElementById(kpiCardHeadingId(id)) ?? document.getElementById(kpiStubHeadingId(id));
      if (heading) {
        heading.focus();
        return;
      }
    }
    (focusFallbackRef.current() ?? document.getElementById(suggestKpisButtonId(result.id)))?.focus();
  }, [focusRequest, result.id]);

  if (!kpi.enabled || !isSuggestableLevel(result.level)) return null;

  const pending = kpi.pendingFor(result.id).filter((s) => !hidden.has(s.id) && !stubs[s.id]);
  const shownStubs = Object.values(stubs).filter((s) => !hidden.has(s.id) && s.resultId === result.id);
  const group = groupSuggestions([...pending, ...shownStubs], nodes).get(result.id);
  orderRef.current = suggestionReadingOrder(group);
  const error = kpi.errorFor({ resultId: result.id });
  const running = view?.status === "running";
  const hasCards = Boolean(group && (group.items.length > 0 || group.alternativeGroups.length > 0));
  const frameworkRunning = kpi.runFor({ scope: "framework" })?.status === "running";
  const alternativesUnavailable = running || frameworkRunning || kpi.aiConfigured === false;

  const onDecided = (outcome: Decision, suggestion: KpiSuggestion) => {
    if (finishedRun) setDecidedAfterRun(finishedRun.id);
    if (outcome === "rejected") {
      setStubs((prev) => ({ ...prev, [suggestion.id]: { ...suggestion, status: "rejected" } }));
      setFocusRequest({ kind: "stub", id: suggestion.id });
      return;
    }
    const candidates = focusCandidates(orderRef.current, suggestion.id);
    setHidden((prev) => new Set(prev).add(suggestion.id));
    if (outcome === "accepted") setAnnouncement(t("kpi.toast.accepted", { code: result.code }));
    setFocusRequest({ kind: "next", candidates });
  };

  const nameOfSource = (source: AlternativesGroup["source"]): string | null => {
    if (source.kind === "suggestion") {
      const known = stubs[source.id] ?? kpi.pendingFor(result.id).find((s) => s.id === source.id);
      return known ? nameIn(known, lang) : null;
    }
    const framework = queryClient.getQueryData<Framework | null>(queryKeys.framework(kpi.projectId));
    const indicator = framework?.indicators?.find((i) => i.id === source.id);
    if (!indicator) return null;
    return lang === "ar" && indicator.indicatorTextAr ? indicator.indicatorTextAr : indicator.indicatorText;
  };

  const groupLabel = (source: AlternativesGroup["source"]): ReactNode => {
    const name = nameOfSource(source);
    if (name) return labelWithName(t, "kpi.alternatives.groupLabel", name);
    return t(source.kind === "indicator" ? "kpi.alternatives.groupLabelIndicator" : "kpi.alternatives.groupLabelSuggestion");
  };

  /** The source of an alternatives run (a suggestion or an existing indicator), or null. */
  const sourceOfRun = (run: KpiRun): AlternativesGroup["source"] | null => {
    if (run.sourceSuggestionId) return { kind: "suggestion", id: run.sourceSuggestionId };
    if (run.sourceIndicatorId) return { kind: "indicator", id: run.sourceIndicatorId };
    return null;
  };

  /** "No alternatives found for “<name>”." of an alternatives run that returned nothing (the name isolated). */
  const noAlternativesLabel = (run: KpiRun): ReactNode => {
    const source = sourceOfRun(run);
    const name = source ? nameOfSource(source) : null;
    return name ? labelWithName(t, "kpi.alternatives.noneFor", name) : t("kpi.alternatives.none");
  };

  // The last run returned nothing new, and the user has not decided a card since.
  const emptyRun = finishedRun && finishedRun.suggestionCount === 0 && decidedAfterRun !== finishedRun.id && !error
    ? finishedRun
    : null;

  const renderEntry = (suggestion: KpiSuggestion) =>
    stubs[suggestion.id] ? (
      <RejectedStub
        suggestion={suggestion}
        name={nameIn(suggestion, lang)}
        label={labelWithName(t, "kpi.rejected.stub", nameIn(suggestion, lang))}
        t={t}
        alternativesUnavailable={alternativesUnavailable}
        describedBy={kpi.aiConfigured === false ? kpiNoticeId(kpi.projectId) : undefined}
        onAlternatives={() => kpi.request({ scope: "alternatives", suggestionId: suggestion.id })}
        onDismiss={() => onDecided("dismissed", suggestion)}
      />
    ) : (
      <KpiSuggestionCard
        suggestion={suggestion}
        result={result}
        nodes={nodes}
        aiLabelId={aiLabelId}
        lang={lang}
        onDecided={onDecided}
      />
    );

  return (
    <div dir={dirFor(lang)} lang={lang} className="min-w-0 space-y-2">
      {running && view && (
        <KpiProgressSteps
          step={view.step}
          scope={view.scope}
          lang={lang}
          code={result.code}
          takingLonger={view.takingLonger}
          onRefresh={view.refresh}
        />
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-sm">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">{error.message}</span>
          {error.retry && (
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={error.retry}>
              {t("common.retry")}
            </Button>
          )}
        </div>
      )}

      {finishedRun && finishedRun.frameworkWarnings.length > 0 && (
        <KpiWarningList warnings={finishedRun.frameworkWarnings} lang={lang} />
      )}

      {emptyRun && emptyRun.scope === "alternatives" && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{noAlternativesLabel(emptyRun)}</p>
      )}

      {emptyRun && emptyRun.scope !== "alternatives" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <span className="min-w-0 flex-1">{t("kpi.empty", { code: result.code })}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            onClick={() => kpi.request({ scope: "result", resultId: result.id })}
          >
            {t("kpi.suggestAgain")}
          </Button>
        </div>
      )}

      {group && hasCards && (
        <div className="space-y-2">
          <AiSuggestedLabel lang={lang} id={aiLabelId} />
          <ul aria-label={t("kpi.listLabel", { code: result.code })} aria-describedby={aiLabelId} className="space-y-2">
            {group.items.map((item) => (
              <li key={item.suggestion.id} className="min-w-0">
                {renderEntry(item.suggestion)}
                {item.alternatives.length > 0 && (
                  <AlternativesList label={labelWithName(t, "kpi.alternatives.groupLabel", nameIn(item.suggestion, lang))}>
                    {item.alternatives.map((alternative) => (
                      <li key={alternative.id} className="min-w-0">{renderEntry(alternative)}</li>
                    ))}
                  </AlternativesList>
                )}
              </li>
            ))}
            {group.alternativeGroups.map((g) => (
              <li key={`${g.source.kind}-${g.source.id}`} className="min-w-0">
                <AlternativesList label={groupLabel(g.source)}>
                  {g.suggestions.map((alternative) => (
                    <li key={alternative.id} className="min-w-0">{renderEntry(alternative)}</li>
                  ))}
                </AlternativesList>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p role="status" className="sr-only">{announcement}</p>
    </div>
  );
}

/** A nested list of alternatives with a visible label. */
function AlternativesList({ label, children }: { label: ReactNode; children: ReactNode }) {
  const labelId = useId();
  return (
    <div className="mt-2 min-w-0 space-y-2 border-s-2 border-dashed ps-2 sm:ps-3">
      <p id={labelId} className="text-xs font-medium text-muted-foreground">{label}</p>
      <ul aria-labelledby={labelId} className="space-y-2">{children}</ul>
    </div>
  );
}

/** "Rejected: <name> — Would you like alternatives to this indicator? [Show alternatives] [Dismiss]" (spec §A2 trigger 3). */
function RejectedStub({
  suggestion,
  name,
  label,
  t,
  alternativesUnavailable,
  describedBy,
  onAlternatives,
  onDismiss,
}: {
  suggestion: KpiSuggestion;
  name: string;
  /** "Rejected: <name>" with the name isolated (labelWithName). */
  label: ReactNode;
  t: T;
  alternativesUnavailable: boolean;
  /** The not-configured notice, when the AI is not set up. */
  describedBy?: string;
  onAlternatives: () => void;
  onDismiss: () => void;
}) {
  const headingId = kpiStubHeadingId(suggestion.id);
  return (
    <article aria-labelledby={headingId} className="min-w-0 break-words rounded-md border border-dashed bg-muted/40 p-3 text-sm">
      <h4 id={headingId} tabIndex={-1} className="font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </h4>
      <p className="mt-1 text-muted-foreground">{t("kpi.rejected.offerAlternatives")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 whitespace-normal sm:min-h-9"
          aria-label={t("kpi.actions.alternativesNamed", { name })}
          aria-disabled={alternativesUnavailable ? "true" : undefined}
          aria-describedby={describedBy}
          onClick={(event) => {
            if (alternativesUnavailable) event.preventDefault();
            else onAlternatives();
          }}
        >
          {t("kpi.actions.alternatives")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={onDismiss}>
          {t("kpi.actions.dismiss")}
        </Button>
      </div>
    </article>
  );
}
