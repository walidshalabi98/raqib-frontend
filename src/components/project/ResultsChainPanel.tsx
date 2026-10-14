import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, ChevronDown, ChevronRight, GitBranch, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/services/api";
import type { Indicator, IndicatorQuality, ResultNode, ResultNodeInput } from "@/types/api";
import { dirFor, type AppLanguage } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { invalidateFrameworkData, useFrameworkResults } from "@/hooks/useFrameworkData";
import { useIndicatorQuality } from "@/hooks/useKpiSuggestions";
import { useKpiAssistant } from "@/hooks/useKpiAssistant";
import { isSuggestableLevel, suggestKpisButtonId } from "@/lib/kpiSuggestions";
import { buildResultTree, childLevelOf, hasChildResults, type ResultTreeItem } from "@/lib/resultsHierarchy";
import {
  RESULT_LIMITS,
  newResultValues,
  resultCreatePayload,
  resultFormOptions,
  resultToValues,
  resultUpdatePayload,
  validateResultForm,
  withParent,
  type ResultFormValues,
} from "@/lib/resultForm";
import type { FormError } from "@/lib/indicatorForm";
import { cn, errorMessage } from "@/lib/utils";
import { isProjectArchived } from "@/lib/apiError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { LevelBadge } from "@/components/common/LevelBadge";
import { NativeSelect } from "@/components/common/NativeSelect";
import { FieldMessage } from "@/components/common/FieldMessage";
import { KpiAssistantProvider } from "@/components/kpi/KpiAssistantProvider";
import { KpiFrameworkPanel } from "@/components/kpi/KpiFrameworkPanel";
import { KpiResultSuggestions } from "@/components/kpi/KpiResultSuggestions";
import { SuggestKpisButton } from "@/components/kpi/SuggestKpisButton";
import { ResultIndicatorList } from "@/components/project/ResultIndicatorList";

type Editing = { mode: "create"; parent: ResultNode | null } | { mode: "edit"; node: ResultNode };

/** Props of ResultsChainPanel (design section 9.5). */
export interface ResultsChainPanelProps {
  projectId: string;
  frameworkId: string;
  /**
   * The framework's indicators (from the framework query). When given, each result's indicator count opens the list
   * of its indicators (ResultIndicatorList); without it the count is plain text.
   */
  indicators?: readonly Indicator[];
  /** No add, edit or delete of results (donor viewers, or an archived project): the tree is shown to read. */
  readOnly?: boolean;
}

/**
 * The framework's results chain (impact → outcome → output → activity; knowledge/me-foundations.md §1) as an
 * indented tree with add, edit and delete. Levels offered follow the hierarchy rule; a result with child results
 * cannot be deleted. `readOnly` (donor viewers, or an archived project) shows the tree without any of those controls.
 *
 * Phase 4 (knowledge/kpi-assistant-spec.md §A2 and §A7; design sections 9.1 and 9.5): the panel holds the KPI
 * Assistant (KpiAssistantProvider, in the panel's language). The header has "Suggest KPIs for all results", each
 * impact, outcome and output row its own "Suggest KPIs", and the suggestions appear under their result
 * (KpiResultSuggestions) before its child results. After a goal, outcome or output is created, a session-local
 * prompt offers suggestions for it ("Not now" hides it; no automatic model call, design D7). Donor viewers get no
 * KPI UI. The indicator count is a disclosure of the result's indicators with their source, AI label and quality.
 */
export function ResultsChainPanel({ projectId, frameworkId, indicators, readOnly = false }: ResultsChainPanelProps) {
  const userLang = useUserLanguage();
  const [chosenLang, setChosenLang] = useState<AppLanguage | null>(null);
  const lang = chosenLang ?? userLang;
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const queryClient = useQueryClient();
  const headingId = useId();
  const editButtonId = (node: Pick<ResultNode, "id">) => `${headingId}-edit-${node.id}`;

  const { data: nodes = [], isLoading, isError, refetch } = useFrameworkResults(frameworkId);
  // Quality badges belong to the indicator lists, so the check is only requested when indicators are shown.
  const { data: qualityRows } = useIndicatorQuality(indicators ? frameworkId : undefined);
  const [editing, setEditing] = useState<Editing | null>(null);
  /** Results created in this session that still show the "Raqib can suggest indicators" prompt. */
  const [prompted, setPrompted] = useState<ReadonlySet<string>>(() => new Set());
  const [deleting, setDeleting] = useState<ResultNode | null>(null);
  // Where focus goes when the confirmation closes (WCAG 2.4.3). The dialog has no trigger to return to:
  // on cancel focus goes back to the delete button; after a delete that button is gone, so it goes to
  // the parent result's row, or to the heading.
  const deleteOpener = useRef<HTMLElement | null>(null);
  const focusAfterDelete = useRef<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (node: ResultNode) => api.deleteResultNode(node.id),
    onSuccess: (_data, node) => {
      toast.success(t("results.toast.deleted"));
      const parent = nodes.find((n) => n.id === node.parentId);
      focusAfterDelete.current = parent ? editButtonId(parent) : headingId;
      setDeleting(null);
      void invalidateFrameworkData(queryClient, { projectId, frameworkId });
    },
    onError: (err) => {
      toast.error(t("results.toast.deleteFailed"), { description: errorMessage(err, "") || undefined });
    },
  });

  const tree = buildResultTree(nodes);
  const hasImpact = nodes.some((n) => n.level === "impact");

  const indicatorsByResult = useMemo(() => {
    if (!indicators) return null;
    const map = new Map<string, Indicator[]>();
    for (const indicator of indicators) {
      if (!indicator.resultId) continue;
      const list = map.get(indicator.resultId) ?? [];
      list.push(indicator);
      map.set(indicator.resultId, list);
    }
    return map;
  }, [indicators]);
  const quality = useMemo(
    () => new Map<string, IndicatorQuality>((qualityRows ?? []).map((row) => [row.indicatorId, row])),
    [qualityRows],
  );
  const dismissPrompt = (resultId: string) => setPrompted((prev) => {
    if (!prev.has(resultId)) return prev;
    const next = new Set(prev);
    next.delete(resultId);
    return next;
  });

  return (
    <section aria-labelledby={headingId} dir={dir} lang={lang} className="card-surface space-y-3 p-4">
      <DirectionProvider dir={dir}>
        <TooltipProvider delayDuration={200}>
          <KpiAssistantProvider projectId={projectId} frameworkId={frameworkId} lang={lang}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <h3 id={headingId} tabIndex={-1} className="flex items-center gap-2 text-sm font-semibold focus:outline-none">
                  <GitBranch aria-hidden="true" className="h-4 w-4" />
                  {t("results.title")}
                </h3>
                <p className="text-xs text-muted-foreground">{t("results.description")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LanguageToggle value={lang} onChange={setChosenLang} />
                {!readOnly && (
                  <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "create", parent: null })}>
                    <Plus aria-hidden="true" className="me-1.5 h-4 w-4" />
                    {t("results.add")}
                  </Button>
                )}
                {nodes.length > 0 && <SuggestKpisButton variant="header" />}
              </div>
            </div>

            <KpiFrameworkPanel />

            {isLoading ? (
              <div className="space-y-2" aria-busy="true" aria-label={t("common.loading")}>
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="ms-6 h-8 w-2/3" />
                <Skeleton className="ms-12 h-8 w-1/2" />
              </div>
            ) : isError ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
                <AlertCircle aria-hidden="true" className="h-4 w-4 text-destructive" />
                <span>{t("results.loadError")}</span>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>{t("common.retry")}</Button>
              </div>
            ) : nodes.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <span>{t(readOnly ? "results.emptyReadOnly" : "results.empty")}</span>
                {!readOnly && (
                  <Button size="sm" onClick={() => setEditing({ mode: "create", parent: null })}>
                    <Plus aria-hidden="true" className="me-1.5 h-4 w-4" />
                    {t("results.add")}
                  </Button>
                )}
              </div>
            ) : (
              <ResultTreeList
                items={tree}
                nodes={nodes}
                lang={lang}
                t={t}
                editButtonId={editButtonId}
                readOnly={readOnly}
                indicatorsByResult={indicatorsByResult}
                quality={quality}
                prompted={prompted}
                onDismissPrompt={dismissPrompt}
                onAddChild={(parent) => setEditing({ mode: "create", parent })}
                onEdit={(node) => setEditing({ mode: "edit", node })}
                onDelete={(node, opener) => { deleteOpener.current = opener; setDeleting(node); }}
              />
            )}
          </KpiAssistantProvider>
        </TooltipProvider>
      </DirectionProvider>

      {editing && !readOnly && (
        <ResultNodeDialog
          key={editing.mode === "edit" ? editing.node.id : `new-${editing.parent?.id ?? "top"}`}
          editing={editing}
          nodes={nodes}
          lang={lang}
          topLevel={hasImpact ? "outcome" : "impact"}
          projectId={projectId}
          frameworkId={frameworkId}
          onClose={() => setEditing(null)}
          onCreated={(created) => {
            if (isSuggestableLevel(created.level)) setPrompted((prev) => new Set(prev).add(created.id));
          }}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent
          dir={dir}
          lang={lang}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const afterDelete = focusAfterDelete.current;
            const opener = deleteOpener.current;
            focusAfterDelete.current = null;
            deleteOpener.current = null;
            const target = afterDelete
              ? document.getElementById(afterDelete)
              : opener?.isConnected ? opener : document.getElementById(headingId);
            target?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("results.confirmDeleteTitle", { code: deleting?.code ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {(deleting?._count?.indicators ?? 0) > 0
                ? t("results.confirmDeleteBody", { count: deleting?._count?.indicators ?? 0 })
                : t("results.confirmDeleteBodyNone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleting) deleteMutation.mutate(deleting); }}
            >
              {deleteMutation.isPending && <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />}
              {t("results.confirmDelete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ------------------------------------------------------------------ tree

type T = ReturnType<typeof useTranslation>["t"];

interface TreeProps {
  nodes: readonly ResultNode[];
  lang: AppLanguage;
  t: T;
  editButtonId: (node: ResultNode) => string;
  /** The framework's indicators by result id; null when the panel was given no indicators. */
  indicatorsByResult: ReadonlyMap<string, Indicator[]> | null;
  quality: ReadonlyMap<string, IndicatorQuality>;
  /** Results that show the new-result prompt. */
  prompted: ReadonlySet<string>;
  onDismissPrompt: (resultId: string) => void;
  /** No add, edit or delete buttons (donor viewers, archived projects). */
  readOnly: boolean;
  onAddChild: (parent: ResultNode) => void;
  onEdit: (node: ResultNode) => void;
  /** `opener` is the delete button, to return focus to when the confirmation is cancelled. */
  onDelete: (node: ResultNode, opener: HTMLElement) => void;
}

function ResultTreeList({ items, nested = false, ...props }: TreeProps & { items: ResultTreeItem[]; nested?: boolean }) {
  return (
    <ul className={cn("min-w-0 space-y-1", nested && "ms-1.5 border-s ps-2 sm:ms-3 sm:ps-3")}>
      {items.map((item) => <ResultTreeItemView key={item.node.id} item={item} {...props} />)}
    </ul>
  );
}

/**
 * One result: its row (code, level, text, indicator-count disclosure, Suggest KPIs, add, edit, delete), the
 * new-result prompt, its indicators, its KPI suggestions, then its child results (design 9.1).
 */
function ResultTreeItemView({ item, ...props }: TreeProps & { item: ResultTreeItem }) {
  const { node, children } = item;
  const { nodes, lang, t, editButtonId, readOnly, indicatorsByResult, quality, prompted, onDismissPrompt, onAddChild, onEdit, onDelete } = props;
  const kpi = useKpiAssistant();
  const [toggled, setToggled] = useState<boolean | null>(null);
  const listId = useId();
  const toggleId = `${listId}-toggle`;

  const arabic = lang === "ar" && Boolean(node.textAr);
  const blocked = hasChildResults(node, nodes);
  const canHaveChildren = childLevelOf(node.level) !== null;
  const whyId = `result-${node.id}-delete-why`;
  const resultIndicators = indicatorsByResult?.get(node.id) ?? [];
  const indicatorCount = indicatorsByResult ? resultIndicators.length : node._count?.indicators ?? 0;
  // A weak indicator is the automatic prompt of spec §A2 trigger 3: its result opens with the list shown.
  const hasWeak = kpi.enabled && resultIndicators.some((i) => quality.get(i.id)?.needsAlternatives);
  const showIndicators = indicatorCount > 0 && (toggled ?? hasWeak);
  const suggestable = isSuggestableLevel(node.level);
  const countText = t("results.indicatorCount", { count: indicatorCount });

  return (
    <li className="min-w-0">
      <div className="flex flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-secondary/40 sm:flex-row sm:items-start sm:gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-1">
          <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold" dir="ltr">{node.code}</span>
          <span className="mt-0.5 shrink-0"><LevelBadge level={node.level} label={t(`level.${node.level}`)} /></span>
          <span className="min-w-0 flex-1 break-words text-sm sm:min-w-[12rem]" dir={arabic ? "rtl" : "auto"} lang={arabic ? "ar" : "en"}>
            {arabic ? node.textAr : node.text}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
          {indicatorsByResult && indicatorCount > 0 ? (
            <Button id={toggleId} type="button" variant="ghost" size="sm"
              className="h-11 gap-1 px-2 text-xs font-normal text-muted-foreground sm:h-8"
              aria-expanded={showIndicators} aria-controls={showIndicators ? listId : undefined}
              title={t(showIndicators ? "kpi.indicators.hide" : "kpi.indicators.show")}
              onClick={() => setToggled(!showIndicators)}>
              {showIndicators
                ? <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-180" />}
              {countText}
              <span className="sr-only" dir="ltr"> ({node.code})</span>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{countText}</span>
          )}
          <SuggestKpisButton variant="row" result={node} />
          {!readOnly && (
            <span className="flex shrink-0 items-center">
              {canHaveChildren && (
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8"
                  aria-label={t("results.addChild", { code: node.code })} title={t("results.addChild", { code: node.code })}
                  onClick={() => onAddChild(node)}>
                  <Plus aria-hidden="true" className="h-4 w-4" />
                </Button>
              )}
              <Button id={editButtonId(node)} type="button" variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8"
                aria-label={t("results.edit", { code: node.code })} title={t("results.edit", { code: node.code })}
                onClick={() => onEdit(node)}>
                <Pencil aria-hidden="true" className="h-4 w-4" />
              </Button>
              {blocked ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-disabled="true"
                      className="h-11 w-11 cursor-not-allowed opacity-50 sm:h-8 sm:w-8"
                      aria-label={t("results.delete", { code: node.code })} aria-describedby={whyId}
                      onClick={(e) => e.preventDefault()}>
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("results.deleteDisabled", { code: node.code })}</TooltipContent>
                </Tooltip>
              ) : (
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-destructive sm:h-8 sm:w-8"
                  aria-label={t("results.delete", { code: node.code })} title={t("results.delete", { code: node.code })}
                  onClick={(e) => onDelete(node, e.currentTarget)}>
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              )}
              {blocked && <span id={whyId} className="sr-only">{t("results.deleteDisabled", { code: node.code })}</span>}
            </span>
          )}
        </div>
      </div>

      {prompted.has(node.id) && (
        <NewResultPrompt node={node} t={t} editButtonId={editButtonId} onDismiss={() => onDismissPrompt(node.id)} />
      )}

      {showIndicators && (
        <div className="ms-2 mt-1 min-w-0 sm:ms-6">
          <ResultIndicatorList id={listId} labelledBy={toggleId} result={node} indicators={resultIndicators} quality={quality} lang={lang} />
        </div>
      )}

      {suggestable && (
        <KpiResultSuggestions
          result={node}
          nodes={nodes}
          focusFallback={() => document.getElementById(suggestKpisButtonId(node.id)) ?? document.getElementById(editButtonId(node))}
        />
      )}

      {children.length > 0 && <ResultTreeList items={children} nested {...props} />}
    </li>
  );
}

/**
 * The on-demand prompt after a goal, outcome or output was created in this session (spec §A2 trigger 2 as design D7:
 * no automatic model call). Hidden for roles without the assistant, while the AI is not configured, and once the
 * result has a run or suggestions. Either button removes the prompt, so focus moves to the row's Suggest KPIs button
 * (or the edit button) instead of being lost.
 */
function NewResultPrompt({ node, t, editButtonId, onDismiss }: {
  node: ResultNode;
  t: T;
  editButtonId: (node: ResultNode) => string;
  onDismiss: () => void;
}) {
  const kpi = useKpiAssistant();
  if (!kpi.enabled || kpi.aiConfigured === false || !isSuggestableLevel(node.level)) return null;
  if (kpi.runFor({ resultId: node.id }) || kpi.pendingFor(node.id).length > 0) return null;

  const close = (suggest: boolean) => {
    if (suggest) kpi.request({ scope: "result", resultId: node.id });
    onDismiss();
    requestAnimationFrame(() => {
      (document.getElementById(suggestKpisButtonId(node.id)) ?? document.getElementById(editButtonId(node)))?.focus();
    });
  };

  return (
    <div className="ms-2 mt-1 flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm sm:ms-6">
      <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
      <p role="status" className="min-w-0 flex-1 break-words">{t("kpi.newResult.prompt", { code: node.code })}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-11 sm:min-h-8" aria-label={t("kpi.suggestForResult", { code: node.code })}
          onClick={() => close(true)}>
          {t("kpi.suggest")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onClick={() => close(false)}>
          {t("kpi.actions.notNow")}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- node form

function ResultNodeDialog({
  editing,
  nodes,
  lang,
  topLevel,
  projectId,
  frameworkId,
  onClose,
  onCreated,
}: {
  editing: Editing;
  nodes: readonly ResultNode[];
  lang: AppLanguage;
  topLevel: ResultFormValues["level"];
  projectId: string;
  frameworkId: string;
  onClose: () => void;
  /** A new result was saved (not called on edit). */
  onCreated?: (node: ResultNode) => void;
}) {
  const { t } = useTranslation(undefined, { lng: lang });
  const dir = dirFor(lang);
  const queryClient = useQueryClient();
  const baseId = useId();
  const fid = (name: string) => `${baseId}-${name}`;
  const node = editing.mode === "edit" ? editing.node : null;

  const [values, setValues] = useState<ResultFormValues>(() =>
    editing.mode === "edit" ? resultToValues(editing.node) : newResultValues(editing.parent, topLevel),
  );
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = validateResultForm(values, nodes, node);
  const { levels, parents, levelLocked } = resultFormOptions(values, nodes, node);
  const errorText = (e?: FormError) => (e ? t(`results.form.errors.${e.key}`, e.values) : undefined);
  const visible = (name: string) => (submitted ? errorText(errors[name]) : undefined);

  const set = (patch: Partial<ResultFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    setServerError(null);
  };

  const mutation = useMutation({
    mutationFn: (payload: Partial<ResultNodeInput>) =>
      node ? api.updateResultNode(node.id, payload) : api.createResultNode(frameworkId, payload as ResultNodeInput),
    onSuccess: (saved) => {
      toast.success(t(node ? "results.toast.updated" : "results.toast.created"));
      void invalidateFrameworkData(queryClient, { projectId, frameworkId });
      if (!node) onCreated?.(saved);
      onClose();
    },
    onError: (err) => {
      setServerError(errorMessage(err, t("results.toast.saveFailed")));
      // Archived elsewhere meanwhile: the page turns read-only and this dialog closes with it, so the toast says why.
      toast.error(t(isProjectArchived(err) ? "errors.projectArchived" : "results.toast.saveFailed"));
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      document.getElementById(fid(firstError))?.focus();
      return;
    }
    if (node) {
      const payload = resultUpdatePayload(node, values);
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      mutation.mutate(payload);
    } else {
      mutation.mutate(resultCreatePayload(values));
    }
  };

  const describedBy = (name: string, hint = false) => [hint ? `${fid(name)}-hint` : null, `${fid(name)}-error`].filter(Boolean).join(" ");
  const parentNode = nodes.find((n) => n.id === values.parentId);
  const levelHint = levelLocked
    ? t("results.form.levelLocked")
    : levels.length === 0
      ? t("results.form.noChildLevel")
      : t("results.form.levelHint");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir={dir} lang={lang} closeLabel={t("common.close")} className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DirectionProvider dir={dir}>
          <DialogHeader className="pe-6 text-start">
            <DialogTitle>{node ? t("results.form.titleEdit", { code: node.code }) : t("results.form.titleCreate")}</DialogTitle>
            <DialogDescription>{t("results.description")}</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            {serverError && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span dir="auto">{serverError}</span>
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={fid("parentId")}>{t("results.form.parent")}</Label>
              <NativeSelect id={fid("parentId")} value={values.parentId} aria-describedby={describedBy("parentId")}
                aria-invalid={visible("parentId") ? true : undefined}
                onChange={(e) => setValues((prev) => withParent(prev, e.target.value, nodes))}>
                <option value="">{t("results.form.noParent")}</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.code} · ${t(`level.${p.level}`)} · ${(lang === "ar" && p.textAr ? p.textAr : p.text).slice(0, 70)}`}
                  </option>
                ))}
              </NativeSelect>
              <FieldMessage id={`${fid("parentId")}-error`} message={visible("parentId")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div className="space-y-1.5">
                <Label htmlFor={fid("level")}>{t("results.form.level")}</Label>
                <NativeSelect id={fid("level")} value={values.level} disabled={levelLocked || (parentNode !== undefined && levels.length <= 1)}
                  aria-describedby={describedBy("level", true)} aria-invalid={visible("level") ? true : undefined}
                  onChange={(e) => set({ level: e.target.value as ResultFormValues["level"] })}>
                  {(levels.length > 0 ? levels : [values.level]).map((level) => (
                    <option key={level} value={level}>{t(`level.${level}`)}</option>
                  ))}
                </NativeSelect>
                <p id={`${fid("level")}-hint`} className="text-xs text-muted-foreground">{levelHint}</p>
                <FieldMessage id={`${fid("level")}-error`} message={visible("level")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("code")}>
                  {t("results.form.code")}<span aria-hidden="true" className="ms-0.5 text-destructive">*</span>
                </Label>
                <Input id={fid("code")} dir="ltr" aria-required="true" maxLength={RESULT_LIMITS.code}
                  placeholder={t("results.form.codePlaceholder")} value={values.code}
                  aria-describedby={describedBy("code")} aria-invalid={visible("code") ? true : undefined}
                  onChange={(e) => set({ code: e.target.value })} />
                <FieldMessage id={`${fid("code")}-error`} message={visible("code")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fid("text")}>
                {t("results.form.text")}<span aria-hidden="true" className="ms-0.5 text-destructive">*</span>
              </Label>
              <Textarea id={fid("text")} dir="ltr" lang="en" rows={2} aria-required="true" maxLength={RESULT_LIMITS.text}
                value={values.text} aria-describedby={describedBy("text")} aria-invalid={visible("text") ? true : undefined}
                onChange={(e) => set({ text: e.target.value })} />
              <FieldMessage id={`${fid("text")}-error`} message={visible("text")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fid("textAr")}>{t("results.form.textAr")}</Label>
              <Textarea id={fid("textAr")} dir="rtl" lang="ar" rows={2} maxLength={RESULT_LIMITS.textAr}
                value={values.textAr} aria-describedby={describedBy("textAr")} aria-invalid={visible("textAr") ? true : undefined}
                onChange={(e) => set({ textAr: e.target.value })} />
              <FieldMessage id={`${fid("textAr")}-error`} message={visible("textAr")} />
            </div>
            <div className="space-y-1.5 sm:w-40">
              <Label htmlFor={fid("sortOrder")}>{t("results.form.sortOrder")}</Label>
              <Input id={fid("sortOrder")} dir="ltr" inputMode="numeric" value={values.sortOrder}
                aria-describedby={describedBy("sortOrder")} aria-invalid={visible("sortOrder") ? true : undefined}
                onChange={(e) => set({ sortOrder: e.target.value })} />
              <FieldMessage id={`${fid("sortOrder")}-error`} message={visible("sortOrder")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />}
                {t(mutation.isPending ? "results.form.saving" : "results.form.save")}
              </Button>
            </DialogFooter>
          </form>
        </DirectionProvider>
      </DialogContent>
    </Dialog>
  );
}
