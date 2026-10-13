import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Clock, Info, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { api } from "@/services/api";
import type { AcceptKpiSuggestionResponse, Indicator, IndicatorInput, KpiSuggestion, ResultNode } from "@/types/api";
import { dirFor, type AppLanguage } from "@/i18n";
import {
  COLLECTION_METHODS,
  DIRECTIONS,
  DISAGGREGATION_SUGGESTIONS,
  FREQUENCIES,
  INDICATOR_LEVELS,
  INDICATOR_STATUSES,
  UNIT_SUGGESTIONS,
} from "@/lib/constants";
import {
  FORM_SECTIONS,
  LIMITS,
  MAX_INTERMEDIATE_TARGETS,
  MAX_MILESTONES,
  acceptEdits,
  blockingErrors,
  buildCreatePayload,
  buildUpdatePayload,
  checkGroupKey,
  createProvenance,
  emptyIndicatorForm,
  indicatorFormWarnings,
  indicatorToFormValues,
  inputToFormValues,
  isPercentUnit,
  needsAiReviewLabel,
  normaliseLibraryId,
  sectionOfField,
  validateIndicatorForm,
  type FormError,
  type FormSection,
  type IndicatorFormValues,
} from "@/lib/indicatorForm";
import { buildResultTree, flattenResultTree, resultText } from "@/lib/resultsHierarchy";
import { queryKeys } from "@/lib/queryKeys";
import { invalidateFrameworkData, useDebouncedValue } from "@/hooks/useFrameworkData";
import { useAcceptKpiSuggestion } from "@/hooks/useKpiSuggestions";
import { httpStatusOf } from "@/lib/apiError";
import { acceptedToastText, requestErrorCode } from "@/lib/kpiSuggestions";
import { cn, errorMessage } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/NativeSelect";
import { FieldMessage } from "@/components/common/FieldMessage";
import { AiSuggestedLabel } from "@/components/common/AiSuggestedLabel";

/**
 * The indicator reference sheet (knowledge/me-foundations.md §3) as one form,
 * used to add and to edit indicators and to edit a KPI suggestion before
 * accepting it. Sections are an accordion (keyboard accessible); every input
 * has a visible label; errors are announced. On edit only the changed fields
 * are sent, and only problems in changed fields block saving.
 *
 * Accept mode (knowledge/kpi-assistant-spec.md §A7 "Edit & accept"; design
 * section 9.5): the form starts from the suggestion's draft, every problem
 * blocks (as on create), the level follows the result, provenance is set by
 * Raqib ("AI suggested") and the AI label is shown. Saving accepts the
 * suggestion with only the fields the user changed (none: accepted as is).
 */

/** Props of IndicatorForm (design section 9.5 adds accept mode, `suggestion` and `onAccepted`). */
export interface IndicatorFormProps {
  /** accept: Edit & accept of a KPI suggestion (needs `suggestion`). */
  mode: "create" | "edit" | "accept";
  projectId: string;
  frameworkId: string;
  /** The indicator being edited (edit mode). */
  indicator?: Indicator;
  /** Result nodes of the framework, for the "Result it measures" select. */
  resultNodes: readonly ResultNode[];
  /** Language of the labels; the form renders right-to-left in Arabic. */
  lang: AppLanguage;
  /** Pre-selected result when adding an indicator under a result. */
  defaultResultId?: string;
  /** The suggestion being accepted (accept mode): the form starts from its draft. */
  suggestion?: KpiSuggestion;
  /** Create and edit: the saved indicator. */
  onSaved: (indicator: Indicator) => void;
  /**
   * Accept mode: the accept response (indicator, suggestion, warnings such as donor_cap_exceeded), after the form
   * has shown the success toast (kpi.toast.accepted or kpi.toast.acceptedOverCap).
   */
  onAccepted?: (response: AcceptKpiSuggestionResponse) => void;
  /** Cancel, nothing to save, or an accept answered 409 (already decided, stale, duplicate: toast shown, list refetched). */
  onCancel: () => void;
}

const MAX_OPTION_TEXT = 90;

function clip(text: string, max = MAX_OPTION_TEXT): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Library ids look like "FS-01" or "WASH-03". */
const LIBRARY_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*-\d+[A-Za-z0-9-]*$/;

/**
 * The indicator form (knowledge/me-foundations.md §3) in create, edit or accept mode (knowledge/kpi-assistant-spec.md
 * §A7 "Edit & accept"; design section 9.5). See the module comment above for the rules of each mode.
 */
export function IndicatorForm({
  mode,
  projectId,
  frameworkId,
  indicator,
  resultNodes,
  lang,
  defaultResultId,
  suggestion,
  onSaved,
  onAccepted,
  onCancel,
}: IndicatorFormProps) {
  // Accept mode without a suggestion cannot accept anything: it behaves like create.
  const accepting = mode === "accept" && suggestion !== undefined;
  const createLike = mode !== "edit";
  const { t } = useTranslation(undefined, { lng: lang });
  const queryClient = useQueryClient();
  const baseId = useId();
  const fid = (name: string) => `${baseId}-${name.replace(/\./g, "-")}`;

  // The stored values on edit: problems already in them do not block saving.
  const [initialValues] = useState<IndicatorFormValues | null>(() =>
    mode === "edit" && indicator ? indicatorToFormValues(indicator) : null,
  );
  const [values, setValues] = useState<IndicatorFormValues>(() => {
    if (initialValues) return initialValues;
    if (accepting) return inputToFormValues(suggestion.draft);
    const result = resultNodes.find((n) => n.id === defaultResultId);
    return emptyIndicatorForm(result ? { resultId: result.id, level: result.level } : {});
  });
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [openSections, setOpenSections] = useState<string[]>([...FORM_SECTIONS]);
  const [groupDraft, setGroupDraft] = useState("");
  const [groupError, setGroupError] = useState<FormError | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const errors = useMemo(() => blockingErrors(validateIndicatorForm(values), values, initialValues), [values, initialValues]);
  const errorKeys = Object.keys(errors);
  const warnings = useMemo(() => indicatorFormWarnings(values), [values]);

  const set = <K extends keyof IndicatorFormValues>(key: K, value: IndicatorFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setServerError(null);
  };
  const touch = (name: string) => setTouched((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));

  const errorText = (e: FormError | null | undefined) => (e ? t(`indicatorForm.errors.${e.key}`, e.values) : undefined);
  const visibleError = (name: string) => (submitted || touched.has(name) ? errorText(errors[name]) : undefined);
  const warningText = (name: string) => (warnings[name] ? t(`indicatorForm.warnings.${warnings[name].key}`) : undefined);

  /** id, aria and blur props for the input of a field. */
  const control = (name: string, opts: { hint?: boolean } = {}) => {
    const error = visibleError(name);
    return {
      id: fid(name),
      "aria-invalid": error ? true : undefined,
      "aria-describedby": [opts.hint ? `${fid(name)}-hint` : null, warnings[name] ? `${fid(name)}-warning` : null, `${fid(name)}-error`]
        .filter(Boolean).join(" "),
      onBlur: () => touch(name),
    } as const;
  };

  // Move focus to a field once its section is open.
  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(`${baseId}-${focusTarget.replace(/\./g, "-")}`)?.focus();
    setFocusTarget(null);
  }, [focusTarget, openSections, baseId]);

  const percent = isPercentUnit(values.unit);
  const dir = dirFor(lang);

  // ---------------------------------------------------------- result options
  const resultOptions = useMemo(() => {
    const flat = flattenResultTree(buildResultTree(resultNodes));
    const options = flat.map(({ node, depth }) => ({
      id: node.id,
      label: `${"  ".repeat(depth)}${node.code} · ${clip(resultText(node, lang))}`,
    }));
    // Keep the current link visible even if the list has not loaded it.
    if (values.resultId && !options.some((o) => o.id === values.resultId) && indicator?.result?.id === values.resultId) {
      options.unshift({ id: indicator.result.id, label: `${indicator.result.code} · ${clip(indicator.result.text)}` });
    }
    return options;
  }, [resultNodes, lang, values.resultId, indicator]);

  const onResultChange = (resultId: string) => {
    const node = resultNodes.find((n) => n.id === resultId)
      ?? (indicator?.result?.id === resultId ? indicator.result : undefined);
    // A linked indicator sits at the level of the result it measures (me-foundations §2); the API rejects other levels.
    setValues((prev) => ({ ...prev, resultId, ...(node ? { level: node.level } : {}) }));
    setServerError(null);
  };
  // Accept mode: the indicator measures a result, so the level always follows it (design 9.5).
  const levelFromResult = Boolean(values.resultId) || accepting;

  // ------------------------------------------------------------ library id
  // Library ids are stored upper-case; "fs-01" finds FS-01.
  const libraryId = useDebouncedValue(normaliseLibraryId(values.libraryId), 400);
  const libraryLookup = useQuery({
    queryKey: queryKeys.libraryEntry(libraryId),
    queryFn: () => api.getLibraryEntry(libraryId),
    enabled: LIBRARY_ID_PATTERN.test(libraryId),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const libraryActive = LIBRARY_ID_PATTERN.test(libraryId) && libraryId === normaliseLibraryId(values.libraryId);
  const libraryEntry = libraryLookup.data;
  // Only a 404 means the id is not in the library; other failures (offline, 5xx) say nothing about the id.
  const libraryState: LookupState = !libraryActive
    ? "idle"
    : libraryLookup.isFetching
      ? "loading"
      : libraryEntry
        ? "found"
        : libraryLookup.isError
          ? httpStatusOf(libraryLookup.error) === 404 ? "notFound" : "unavailable"
          : "idle";
  const libraryMessage = {
    idle: "",
    loading: t("indicatorForm.library.checking"),
    found: libraryEntry
      ? t("indicatorForm.library.found", { name: lang === "ar" && libraryEntry.nameAr ? libraryEntry.nameAr : libraryEntry.name })
      : "",
    notFound: t("indicatorForm.library.notFound"),
    unavailable: t("indicatorForm.library.unavailable"),
  }[libraryState];

  // ------------------------------------------------------- disaggregation
  const groupLabel = (key: string) => t(`disaggregation.${key}`, { defaultValue: key });

  const addGroup = (raw: string) => {
    const problem = checkGroupKey(raw, values.disaggregation);
    if (problem) {
      setGroupError(problem);
      return false;
    }
    set("disaggregation", [...values.disaggregation, raw.trim()]);
    setGroupError(null);
    return true;
  };
  const removeGroup = (key: string) => set("disaggregation", values.disaggregation.filter((k) => k !== key));

  // ---------------------------------------------------------------- lists
  const setTarget = (i: number, patch: Partial<IndicatorFormValues["intermediateTargets"][number]>) =>
    set("intermediateTargets", values.intermediateTargets.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const setMilestone = (i: number, patch: Partial<IndicatorFormValues["milestones"][number]>) =>
    set("milestones", values.milestones.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  // ----------------------------------------------------------------- save
  const mutation = useMutation({
    mutationFn: (payload: IndicatorInput) =>
      createLike
        ? api.addIndicatorToFramework(frameworkId, payload)
        : api.updateIndicator((indicator as Indicator).id, payload),
    onSuccess: (saved) => {
      toast.success(t(createLike ? "indicatorForm.toast.created" : "indicatorForm.toast.updated"));
      void invalidateFrameworkData(queryClient, { projectId, frameworkId });
      onSaved(saved);
    },
    onError: (err) => {
      const message = errorMessage(err, t("indicatorForm.toast.saveFailed"));
      setServerError(message);
      toast.error(t("indicatorForm.toast.saveFailed"));
      requestAnimationFrame(() => summaryRef.current?.focus());
    },
  });

  // Accept (Edit & accept): the hook refetches the framework, the suggestions and the quality check.
  const acceptMutation = useAcceptKpiSuggestion(projectId, frameworkId);
  const acceptSuggestion = (edits: IndicatorInput | undefined) => {
    if (!suggestion) return;
    acceptMutation.mutate(edits ? { id: suggestion.id, edits } : { id: suggestion.id }, {
      onSuccess: (response) => {
        const resultId = response.indicator.resultId ?? values.resultId;
        const code = resultNodes.find((n) => n.id === resultId)?.code ?? response.indicator.result?.code ?? suggestion.resultCode;
        toast.success(acceptedToastText(t, response, code));
        onAccepted?.(response);
      },
      onError: (err) => {
        if (httpStatusOf(err) === 409) {
          // Decided by someone else, expired (stale) or a duplicate: nothing to fix in the form; the list is refetched.
          toast.error(t(`kpi.errors.${requestErrorCode(err)}`));
          onCancel();
          return;
        }
        setServerError(errorMessage(err, t("kpi.toast.acceptFailed")));
        toast.error(t("kpi.toast.acceptFailed"));
        requestAnimationFrame(() => summaryRef.current?.focus());
      },
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);

    if (errorKeys.length > 0) {
      const sections = new Set<FormSection>(errorKeys.map(sectionOfField));
      setOpenSections((prev) => Array.from(new Set([...prev, ...sections])));
      setFocusTarget(errorKeys[0]);
      return;
    }

    if (accepting) {
      acceptSuggestion(acceptEdits(suggestion.draft, values));
      return;
    }
    if (createLike) {
      mutation.mutate(buildCreatePayload(values));
      return;
    }
    const payload = buildUpdatePayload(indicator as Indicator, values);
    if (Object.keys(payload).length === 0) {
      toast(t("indicatorForm.toast.noChanges"));
      onCancel();
      return;
    }
    mutation.mutate(payload);
  };

  const sectionErrorCount = (section: FormSection) =>
    submitted ? errorKeys.filter((k) => sectionOfField(k) === section).length : 0;

  const allOpen = openSections.length === FORM_SECTIONS.length;
  const provenance = accepting ? "ai_suggested" : mode === "edit" && indicator ? indicator.provenance : createProvenance(values);
  const showAiLabel = accepting || (mode === "edit" && indicator ? needsAiReviewLabel(indicator.provenance, indicator.isApproved) : false);
  const aiModel = accepting
    ? { model: suggestion.model, promptVersion: suggestion.promptVersion }
    : mode === "edit" && indicator?.aiModel ? { model: indicator.aiModel, promptVersion: indicator.promptVersion } : null;
  const saving = mutation.isPending || acceptMutation.isPending;

  // --------------------------------------------------------------- layout
  const sectionHeader = (section: FormSection) => {
    const count = sectionErrorCount(section);
    return (
      <AccordionTrigger className="py-3 text-start text-sm font-semibold hover:no-underline">
        <span className="flex flex-1 items-center gap-2">
          {t(`indicatorForm.sections.${section}`)}
          {count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-destructive/50 px-1.5 py-0.5 text-xs font-medium text-destructive">
              <AlertCircle aria-hidden="true" className="h-3 w-3" />
              {t("indicatorForm.sectionErrors", { count })}
            </span>
          )}
        </span>
      </AccordionTrigger>
    );
  };

  return (
    <form noValidate onSubmit={handleSubmit} dir={dir} lang={lang} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
        {showAiLabel && <AiSuggestedLabel lang={lang} variant="banner" />}

        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className={cn(
            "rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            // No tinted background: destructive text on bg-background keeps 4.5:1 contrast (WCAG 1.4.3).
            (submitted && errorKeys.length > 0) || serverError ? "border-destructive/50" : "sr-only",
          )}
        >
          {submitted && errorKeys.length > 0 && (
            <>
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                {t("indicatorForm.errors.summary", { count: errorKeys.length })}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 ps-6">
                {errorKeys.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      className="text-start underline underline-offset-2"
                      onClick={() => {
                        setOpenSections((prev) => Array.from(new Set([...prev, sectionOfField(key)])));
                        setFocusTarget(key);
                      }}
                    >
                      {errorText(errors[key])}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {serverError && (
            <div className={cn(submitted && errorKeys.length > 0 && "mt-2")}>
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                {t("indicatorForm.toast.saveFailed")}
              </p>
              <p className="mt-1 text-muted-foreground" dir="auto">{serverError}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            aria-expanded={allOpen}
            onClick={() => setOpenSections(allOpen ? [] : [...FORM_SECTIONS])}
          >
            {t(allOpen ? "indicatorForm.collapseAll" : "indicatorForm.expandAll")}
          </Button>
        </div>

        <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} dir={dir} className="w-full">
          {/* Basics */}
          <AccordionItem value="basics">
            {sectionHeader("basics")}
            <AccordionContent className="space-y-4 px-1 pt-1">
              <Field id={fid("indicatorText")} label={t("indicatorForm.fields.indicatorText")} required error={visibleError("indicatorText")}
                hint={t("glossary.indicator")}>
                <Textarea {...control("indicatorText", { hint: true })} aria-required="true" dir="ltr" lang="en" rows={2}
                  maxLength={LIMITS.indicatorText} placeholder={t("indicatorForm.placeholders.indicatorText")}
                  value={values.indicatorText} onChange={(e) => set("indicatorText", e.target.value)} />
              </Field>
              <Field id={fid("indicatorTextAr")} label={t("indicatorForm.fields.indicatorTextAr")} error={visibleError("indicatorTextAr")}
                hint={t("indicatorForm.hints.nameAr")}>
                <Textarea {...control("indicatorTextAr", { hint: true })} dir="rtl" lang="ar" rows={2} className="text-start"
                  maxLength={LIMITS.indicatorTextAr} placeholder={t("indicatorForm.placeholders.indicatorTextAr")}
                  value={values.indicatorTextAr} onChange={(e) => set("indicatorTextAr", e.target.value)} />
              </Field>
              <Field id={fid("resultId")} label={t("indicatorForm.fields.result")} error={visibleError("resultId")}
                hint={resultOptions.length > 0 ? t("indicatorForm.hints.result") : t("indicatorForm.hints.noResults")}>
                <NativeSelect {...control("resultId", { hint: true })} value={values.resultId} onChange={(e) => onResultChange(e.target.value)}>
                  {/* An accepted suggestion always measures a result. */}
                  {!accepting && <option value="">{t("indicatorForm.noResultOption")}</option>}
                  {resultOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </NativeSelect>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid("level")} label={t("indicatorForm.fields.level")} error={visibleError("level")}
                  hint={accepting ? t("indicatorForm.hints.levelAccept") : levelFromResult ? t("indicatorForm.hints.levelFromResult") : undefined}>
                  <NativeSelect {...control("level", { hint: levelFromResult })} disabled={levelFromResult} value={values.level}
                    onChange={(e) => set("level", e.target.value as IndicatorFormValues["level"])}>
                    {INDICATOR_LEVELS.map((level) => <option key={level} value={level}>{t(`level.${level}`)}</option>)}
                  </NativeSelect>
                </Field>
                <Field id={fid("status")} label={t("indicatorForm.fields.status")} error={visibleError("status")}>
                  <NativeSelect {...control("status")} value={values.status} onChange={(e) => set("status", e.target.value as IndicatorFormValues["status"])}>
                    {INDICATOR_STATUSES.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
                  </NativeSelect>
                </Field>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Definition and calculation */}
          <AccordionItem value="definition">
            {sectionHeader("definition")}
            <AccordionContent className="space-y-4 px-1 pt-1">
              <Field id={fid("definition")} label={t("indicatorForm.fields.definition")} error={visibleError("definition")}>
                <Textarea {...control("definition")} dir="auto" rows={3} maxLength={LIMITS.definition}
                  placeholder={t("indicatorForm.placeholders.definition")}
                  value={values.definition} onChange={(e) => set("definition", e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid("unit")} label={t("indicatorForm.fields.unit")} error={visibleError("unit")}
                  hint={percent ? t("indicatorForm.hints.unitPercent") : undefined}>
                  <Input {...control("unit", { hint: percent })} dir="auto" list={fid("unit-options")} maxLength={LIMITS.unit}
                    placeholder={t("indicatorForm.placeholders.unit")}
                    value={values.unit} onChange={(e) => set("unit", e.target.value)} />
                  <datalist id={fid("unit-options")}>
                    {UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}
                  </datalist>
                </Field>
                <Field id={fid("direction")} label={t("indicatorForm.fields.direction")} error={visibleError("direction")}>
                  <NativeSelect {...control("direction")} value={values.direction}
                    onChange={(e) => set("direction", e.target.value as IndicatorFormValues["direction"])}>
                    <option value="">{t("indicatorForm.directionNone")}</option>
                    {DIRECTIONS.map((d) => <option key={d} value={d}>{t(`direction.${d}`)}</option>)}
                  </NativeSelect>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid("numerator")} label={t("indicatorForm.fields.numerator")} error={visibleError("numerator")}
                  warning={warningText("numerator")}>
                  <Textarea {...control("numerator")} dir="auto" rows={2} maxLength={LIMITS.numerator}
                    placeholder={t("indicatorForm.placeholders.numerator")}
                    value={values.numerator} onChange={(e) => set("numerator", e.target.value)} />
                </Field>
                <Field id={fid("denominator")} label={t("indicatorForm.fields.denominator")} error={visibleError("denominator")}
                  warning={warningText("denominator")}>
                  <Textarea {...control("denominator")} dir="auto" rows={2} maxLength={LIMITS.denominator}
                    placeholder={t("indicatorForm.placeholders.denominator")}
                    value={values.denominator} onChange={(e) => set("denominator", e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid("formula")} label={t("indicatorForm.fields.formula")} error={visibleError("formula")}>
                  <Input {...control("formula")} dir="auto" maxLength={LIMITS.formula} placeholder={t("indicatorForm.placeholders.formula")}
                    value={values.formula} onChange={(e) => set("formula", e.target.value)} />
                </Field>
                <Field id={fid("rounding")} label={t("indicatorForm.fields.rounding")} error={visibleError("rounding")}>
                  <Input {...control("rounding")} dir="auto" maxLength={LIMITS.rounding} placeholder={t("indicatorForm.placeholders.rounding")}
                    value={values.rounding} onChange={(e) => set("rounding", e.target.value)} />
                </Field>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Disaggregation */}
          <AccordionItem value="disaggregation">
            {sectionHeader("disaggregation")}
            <AccordionContent className="space-y-3 px-1 pt-1">
              <p className="text-xs text-muted-foreground">{t("glossary.disaggregation")}</p>
              <p className="flex items-start gap-1.5 text-xs font-medium">
                <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("indicatorForm.hints.disaggregationMinimum")}
              </p>

              <div>
                <p id={fid("disaggregation")} tabIndex={-1} className="mb-1.5 text-sm font-medium focus:outline-none">
                  {t("indicatorForm.fields.disaggregation")}
                </p>
                {values.disaggregation.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("indicatorForm.hints.noGroups")}</p>
                ) : (
                  <ul aria-labelledby={fid("disaggregation")} className="flex flex-wrap gap-1.5">
                    {values.disaggregation.map((key) => (
                      <li key={key} className="inline-flex items-center gap-1 rounded-full border bg-secondary py-0.5 pe-1 ps-2.5 text-xs font-medium">
                        <span>{groupLabel(key)}</span>
                        <button
                          type="button"
                          onClick={() => removeGroup(key)}
                          aria-label={t("indicatorForm.actions.removeGroup", { group: groupLabel(key) })}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <FieldMessage id={`${fid("disaggregation")}-error`} message={visibleError("disaggregation")} />
              </div>

              {DISAGGREGATION_SUGGESTIONS.some((s) => !values.disaggregation.includes(s)) && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("indicatorForm.hints.suggestions")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DISAGGREGATION_SUGGESTIONS.filter((s) => !values.disaggregation.includes(s)).map((s) => (
                      <Button key={s} type="button" variant="outline" size="sm" className="h-8 rounded-full px-2.5 text-xs"
                        aria-label={t("indicatorForm.actions.addSuggestion", { group: groupLabel(s) })}
                        onClick={() => addGroup(s)}>
                        <Plus aria-hidden="true" className="me-1 h-3 w-3" />
                        {groupLabel(s)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={fid("customGroup")}>{t("indicatorForm.fields.customGroup")}</Label>
                <div className="flex gap-2">
                  <Input
                    id={fid("customGroup")}
                    dir="ltr"
                    className="font-mono"
                    maxLength={LIMITS.groupKey + 10}
                    placeholder={t("indicatorForm.placeholders.customGroup")}
                    aria-invalid={groupError ? true : undefined}
                    aria-describedby={`${fid("customGroup")}-hint ${fid("customGroup")}-error`}
                    value={groupDraft}
                    onChange={(e) => { setGroupDraft(e.target.value); setGroupError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (addGroup(groupDraft)) setGroupDraft("");
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => { if (addGroup(groupDraft)) setGroupDraft(""); }}>
                    <Plus aria-hidden="true" className="me-1 h-4 w-4" />
                    {t("indicatorForm.actions.addGroup")}
                  </Button>
                </div>
                <p id={`${fid("customGroup")}-hint`} className="text-xs text-muted-foreground">{t("indicatorForm.hints.disaggregationKey")}</p>
                <FieldMessage id={`${fid("customGroup")}-error`} message={errorText(groupError)} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Data collection */}
          <AccordionItem value="collection">
            {sectionHeader("collection")}
            <AccordionContent className="space-y-4 px-1 pt-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid("dataCollectionMethod")} label={t("indicatorForm.fields.method")} error={visibleError("dataCollectionMethod")}>
                  <NativeSelect {...control("dataCollectionMethod")} value={values.dataCollectionMethod}
                    onChange={(e) => set("dataCollectionMethod", e.target.value as IndicatorFormValues["dataCollectionMethod"])}>
                    {COLLECTION_METHODS.map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}
                  </NativeSelect>
                </Field>
                <Field id={fid("frequency")} label={t("indicatorForm.fields.frequency")} error={visibleError("frequency")}>
                  <NativeSelect {...control("frequency")} value={values.frequency}
                    onChange={(e) => set("frequency", e.target.value as IndicatorFormValues["frequency"])}>
                    {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`frequency.${f}`)}</option>)}
                  </NativeSelect>
                </Field>
              </div>
              <Field id={fid("meansOfVerification")} label={t("indicatorForm.fields.meansOfVerification")} error={visibleError("meansOfVerification")}
                hint={t("glossary.meansOfVerification")}>
                <Textarea {...control("meansOfVerification", { hint: true })} dir="auto" rows={2} maxLength={LIMITS.meansOfVerification}
                  placeholder={t("indicatorForm.placeholders.meansOfVerification")}
                  value={values.meansOfVerification} onChange={(e) => set("meansOfVerification", e.target.value)} />
              </Field>
              <Field id={fid("responsibility")} label={t("indicatorForm.fields.responsibility")} error={visibleError("responsibility")}>
                <Input {...control("responsibility")} dir="auto" maxLength={LIMITS.responsibility}
                  placeholder={t("indicatorForm.placeholders.responsibility")}
                  value={values.responsibility} onChange={(e) => set("responsibility", e.target.value)} />
              </Field>
            </AccordionContent>
          </AccordionItem>

          {/* Baseline and targets */}
          <AccordionItem value="baseline">
            {sectionHeader("baseline")}
            <AccordionContent className="space-y-4 px-1 pt-1">
              <p className="text-xs text-muted-foreground">{t("glossary.baseline")}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid("baselineValue")} label={t("indicatorForm.fields.baselineValue")} error={visibleError("baselineValue")}
                  hint={values.baselineValue.trim() ? undefined : t("indicatorForm.hints.pendingBaseline")}
                  hintIcon={values.baselineValue.trim() ? undefined : <Clock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />}>
                  <Input {...control("baselineValue", { hint: !values.baselineValue.trim() })} dir="auto" maxLength={LIMITS.baselineValue}
                    value={values.baselineValue} onChange={(e) => set("baselineValue", e.target.value)} />
                </Field>
                <Field id={fid("baselineDate")} label={t("indicatorForm.fields.baselineDate")} error={visibleError("baselineDate")}>
                  <Input {...control("baselineDate")} type="date" dir="ltr" value={values.baselineDate}
                    onChange={(e) => set("baselineDate", e.target.value)} />
                </Field>
              </div>
              <Field id={fid("baselineMethod")} label={t("indicatorForm.fields.baselineMethod")} error={visibleError("baselineMethod")}>
                <Input {...control("baselineMethod")} dir="auto" maxLength={LIMITS.baselineMethod}
                  placeholder={t("indicatorForm.placeholders.baselineMethod")}
                  value={values.baselineMethod} onChange={(e) => set("baselineMethod", e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid("targetValue")} label={t("indicatorForm.fields.targetValue")} error={visibleError("targetValue")}
                  hint={t("glossary.target")}>
                  <Input {...control("targetValue", { hint: true })} dir="auto" maxLength={LIMITS.targetValue}
                    value={values.targetValue} onChange={(e) => set("targetValue", e.target.value)} />
                </Field>
                <Field id={fid("currentValue")} label={t("indicatorForm.fields.currentValue")} error={visibleError("currentValue")}>
                  <Input {...control("currentValue")} dir="auto" maxLength={LIMITS.currentValue}
                    value={values.currentValue} onChange={(e) => set("currentValue", e.target.value)} />
                </Field>
              </div>
              <Field id={fid("targetJustification")} label={t("indicatorForm.fields.targetJustification")} error={visibleError("targetJustification")}>
                <Textarea {...control("targetJustification")} dir="auto" rows={2} maxLength={LIMITS.targetJustification}
                  placeholder={t("indicatorForm.placeholders.targetJustification")}
                  value={values.targetJustification} onChange={(e) => set("targetJustification", e.target.value)} />
              </Field>

              <fieldset className="space-y-2" aria-describedby={`${fid("intermediateTargets")}-hint`}>
                <legend id={fid("intermediateTargets")} tabIndex={-1} className="text-sm font-medium focus:outline-none">
                  {t("indicatorForm.fields.intermediateTargets")}
                </legend>
                <p id={`${fid("intermediateTargets")}-hint`} className="text-xs text-muted-foreground">{t("indicatorForm.hints.intermediateTargets")}</p>
                {values.intermediateTargets.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("indicatorForm.hints.noIntermediateTargets")}</p>
                )}
                {values.intermediateTargets.map((row, i) => {
                  const n = i + 1;
                  return (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                      <Field id={fid(`intermediateTargets.${i}.date`)} label={t("indicatorForm.fields.targetDate", { n })}
                        error={visibleError(`intermediateTargets.${i}.date`)} labelClassName="text-xs">
                        <Input {...control(`intermediateTargets.${i}.date`)} type="date" dir="ltr" value={row.date}
                          onChange={(e) => setTarget(i, { date: e.target.value })} />
                      </Field>
                      <Field id={fid(`intermediateTargets.${i}.value`)} label={t("indicatorForm.fields.targetValueN", { n })}
                        error={visibleError(`intermediateTargets.${i}.value`)} labelClassName="text-xs">
                        <Input {...control(`intermediateTargets.${i}.value`)} dir="auto" maxLength={LIMITS.intermediateTargetValue} value={row.value}
                          onChange={(e) => setTarget(i, { value: e.target.value })} />
                      </Field>
                      <Button type="button" variant="ghost" size="icon" className="mt-6 h-10 w-10"
                        aria-label={t("indicatorForm.actions.removeTarget", { n })}
                        onClick={() => set("intermediateTargets", values.intermediateTargets.filter((_, j) => j !== i))}>
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                <FieldMessage id={`${fid("intermediateTargets")}-error`} message={visibleError("intermediateTargets")} />
                <Button type="button" variant="outline" size="sm" disabled={values.intermediateTargets.length >= MAX_INTERMEDIATE_TARGETS}
                  onClick={() => set("intermediateTargets", [...values.intermediateTargets, { date: "", value: "" }])}>
                  <Plus aria-hidden="true" className="me-1 h-4 w-4" />
                  {t("indicatorForm.actions.addTarget")}
                </Button>
              </fieldset>
            </AccordionContent>
          </AccordionItem>

          {/* Standard and source */}
          <AccordionItem value="standard">
            {sectionHeader("standard")}
            <AccordionContent className="space-y-4 px-1 pt-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid("libraryId")} label={t("indicatorForm.fields.libraryId")} error={visibleError("libraryId")}
                  hint={t("indicatorForm.hints.libraryId")}>
                  <Input {...control("libraryId", { hint: true })}
                    aria-describedby={`${fid("libraryId")}-hint ${fid("libraryId")}-lookup ${fid("libraryId")}-error`}
                    dir="ltr" className="font-mono" maxLength={LIMITS.libraryId}
                    placeholder={t("indicatorForm.placeholders.libraryId")}
                    value={values.libraryId} onChange={(e) => set("libraryId", e.target.value)} />
                  <LibraryLookupStatus id={`${fid("libraryId")}-lookup`} state={libraryState} message={libraryMessage} />
                </Field>
                <Field id={fid("standardReferenceCode")} label={t("indicatorForm.fields.standardReferenceCode")}
                  error={visibleError("standardReferenceCode")} hint={t("indicatorForm.hints.standardReferenceCode")}>
                  <Input {...control("standardReferenceCode", { hint: true })} dir="ltr" maxLength={LIMITS.standardReferenceCode}
                    placeholder={t("indicatorForm.placeholders.standardReferenceCode")}
                    value={values.standardReferenceCode} onChange={(e) => set("standardReferenceCode", e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={fid("provenance")} label={t("indicatorForm.fields.provenance")}
                  hint={t(accepting ? "indicatorForm.hints.provenanceAccept" : "indicatorForm.hints.provenance")}>
                  <Input id={fid("provenance")} readOnly aria-describedby={`${fid("provenance")}-hint`} className="bg-muted"
                    value={t(`provenance.${provenance}`)} />
                </Field>
                {aiModel && (
                  <Field id={fid("aiModel")} label={t("indicatorForm.fields.aiModel")}>
                    <Input id={fid("aiModel")} readOnly dir="ltr" className="bg-muted font-mono"
                      value={aiModel.promptVersion ? `${aiModel.model} · ${aiModel.promptVersion}` : aiModel.model} />
                  </Field>
                )}
              </div>
              {showAiLabel && <AiSuggestedLabel lang={lang} />}
            </AccordionContent>
          </AccordionItem>

          {/* Assumptions */}
          <AccordionItem value="assumptions">
            {sectionHeader("assumptions")}
            <AccordionContent className="space-y-4 px-1 pt-1">
              <Field id={fid("assumptions")} label={t("indicatorForm.fields.assumptions")} error={visibleError("assumptions")}>
                <Textarea {...control("assumptions")} dir="auto" rows={3} maxLength={LIMITS.assumptions}
                  placeholder={t("indicatorForm.placeholders.assumptions")}
                  value={values.assumptions} onChange={(e) => set("assumptions", e.target.value)} />
              </Field>
            </AccordionContent>
          </AccordionItem>

          {/* Timeline and milestones */}
          <AccordionItem value="timeline">
            {sectionHeader("timeline")}
            <AccordionContent className="space-y-4 px-1 pt-1">
              <div className="grid gap-4 sm:grid-cols-2">
                {(["startDate", "endDate", "actualStartDate", "actualEndDate"] as const).map((field) => (
                  <Field key={field} id={fid(field)} label={t(`indicatorForm.fields.${field}`)} error={visibleError(field)}>
                    <Input {...control(field)} type="date" dir="ltr" value={values[field]} onChange={(e) => set(field, e.target.value)} />
                  </Field>
                ))}
              </div>

              <fieldset className="space-y-2">
                <legend id={fid("milestones")} tabIndex={-1} className="text-sm font-medium focus:outline-none">
                  {t("indicatorForm.fields.milestones")}
                </legend>
                {values.milestones.length === 0 && <p className="text-xs text-muted-foreground">{t("indicatorForm.hints.noMilestones")}</p>}
                {values.milestones.map((row, i) => {
                  const n = i + 1;
                  return (
                    <div key={i} className="grid items-start gap-2 sm:grid-cols-[2fr_1fr_auto_auto]">
                      <Field id={fid(`milestones.${i}.label`)} label={t("indicatorForm.fields.milestoneLabel", { n })}
                        error={visibleError(`milestones.${i}.label`)} labelClassName="text-xs">
                        <Input {...control(`milestones.${i}.label`)} dir="auto" maxLength={LIMITS.milestoneLabel}
                          placeholder={t("indicatorForm.placeholders.milestoneLabel")} value={row.label}
                          onChange={(e) => setMilestone(i, { label: e.target.value })} />
                      </Field>
                      <Field id={fid(`milestones.${i}.date`)} label={t("indicatorForm.fields.milestoneDate", { n })}
                        error={visibleError(`milestones.${i}.date`)} labelClassName="text-xs">
                        <Input {...control(`milestones.${i}.date`)} type="date" dir="ltr" value={row.date}
                          onChange={(e) => setMilestone(i, { date: e.target.value })} />
                      </Field>
                      <div className="flex h-10 items-center gap-2 sm:mt-6">
                        <Checkbox id={fid(`milestones.${i}.completed`)} checked={row.completed}
                          onCheckedChange={(checked) => setMilestone(i, { completed: checked === true })} />
                        <Label htmlFor={fid(`milestones.${i}.completed`)} className="text-xs">
                          {t("indicatorForm.fields.milestoneCompleted", { n })}
                        </Label>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 sm:mt-6"
                        aria-label={t("indicatorForm.actions.removeMilestone", { n })}
                        onClick={() => set("milestones", values.milestones.filter((_, j) => j !== i))}>
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                <FieldMessage id={`${fid("milestones")}-error`} message={visibleError("milestones")} />
                <Button type="button" variant="outline" size="sm" disabled={values.milestones.length >= MAX_MILESTONES}
                  onClick={() => set("milestones", [...values.milestones, { label: "", date: "", completed: false }])}>
                  <Plus aria-hidden="true" className="me-1 h-4 w-4" />
                  {t("indicatorForm.actions.addMilestone")}
                </Button>
              </fieldset>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <><Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />{t("indicatorForm.actions.saving")}</>
          ) : accepting ? (
            <><Check aria-hidden="true" className="me-1.5 h-4 w-4" />{t("indicatorForm.actions.accept")}</>
          ) : (
            <><Save aria-hidden="true" className="me-1.5 h-4 w-4" />{t(createLike ? "indicatorForm.actions.create" : "indicatorForm.actions.save")}</>
          )}
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------- field parts

function Field({
  id,
  label,
  required,
  hint,
  hintIcon,
  warning,
  error,
  labelClassName,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  hintIcon?: ReactNode;
  /** Advice that does not block saving. */
  warning?: string;
  error?: string;
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={cn("leading-snug", labelClassName)}>
        {label}
        {required && <span aria-hidden="true" className="ms-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          {hintIcon}
          <span>{hint}</span>
        </p>
      )}
      {warning && (
        <p id={`${id}-warning`} className="flex items-start gap-1.5 text-xs font-medium">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>{warning}</span>
        </p>
      )}
      <FieldMessage id={`${id}-error`} message={error} />
    </div>
  );
}


type LookupState = "idle" | "loading" | "found" | "notFound" | "unavailable";

function LibraryLookupStatus({ id, state, message }: { id: string; state: LookupState; message: string }) {
  const icon = {
    idle: null,
    loading: <Loader2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />,
    found: <CheckCircle2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />,
    notFound: <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />,
    unavailable: <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />,
  }[state];
  return (
    <p id={id} aria-live="polite" className={cn("flex items-start gap-1.5 text-xs", state === "idle" && "sr-only")}>
      {icon}
      <span dir="auto">{message}</span>
    </p>
  );
}
