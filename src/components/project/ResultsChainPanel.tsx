import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, GitBranch, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/services/api";
import type { ResultNode, ResultNodeInput } from "@/types/api";
import { dirFor, type AppLanguage } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { invalidateFrameworkData, useFrameworkResults } from "@/hooks/useFrameworkData";
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

/**
 * The framework's results chain (impact → outcome → output → activity) as an
 * indented tree with add, edit and delete. Levels offered follow the hierarchy
 * rule; a result with child results cannot be deleted.
 */

type Editing = { mode: "create"; parent: ResultNode | null } | { mode: "edit"; node: ResultNode };

export function ResultsChainPanel({ projectId, frameworkId }: { projectId: string; frameworkId: string }) {
  const userLang = useUserLanguage();
  const [chosenLang, setChosenLang] = useState<AppLanguage | null>(null);
  const lang = chosenLang ?? userLang;
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const queryClient = useQueryClient();
  const headingId = useId();
  const editButtonId = (node: Pick<ResultNode, "id">) => `${headingId}-edit-${node.id}`;

  const { data: nodes = [], isLoading, isError, refetch } = useFrameworkResults(frameworkId);
  const [editing, setEditing] = useState<Editing | null>(null);
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

  return (
    <section aria-labelledby={headingId} dir={dir} lang={lang} className="card-surface space-y-3 p-4">
      <DirectionProvider dir={dir}>
        <TooltipProvider delayDuration={200}>
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
              <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "create", parent: null })}>
                <Plus aria-hidden="true" className="me-1.5 h-4 w-4" />
                {t("results.add")}
              </Button>
            </div>
          </div>

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
              <span>{t("results.empty")}</span>
              <Button size="sm" onClick={() => setEditing({ mode: "create", parent: null })}>
                <Plus aria-hidden="true" className="me-1.5 h-4 w-4" />
                {t("results.add")}
              </Button>
            </div>
          ) : (
            <ResultTreeList
              items={tree}
              nodes={nodes}
              lang={lang}
              t={t}
              editButtonId={editButtonId}
              onAddChild={(parent) => setEditing({ mode: "create", parent })}
              onEdit={(node) => setEditing({ mode: "edit", node })}
              onDelete={(node, opener) => { deleteOpener.current = opener; setDeleting(node); }}
            />
          )}
        </TooltipProvider>
      </DirectionProvider>

      {editing && (
        <ResultNodeDialog
          key={editing.mode === "edit" ? editing.node.id : `new-${editing.parent?.id ?? "top"}`}
          editing={editing}
          nodes={nodes}
          lang={lang}
          topLevel={hasImpact ? "outcome" : "impact"}
          projectId={projectId}
          frameworkId={frameworkId}
          onClose={() => setEditing(null)}
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

function ResultTreeList({
  items,
  nodes,
  lang,
  t,
  editButtonId,
  nested = false,
  onAddChild,
  onEdit,
  onDelete,
}: {
  items: ResultTreeItem[];
  nodes: readonly ResultNode[];
  lang: AppLanguage;
  t: T;
  editButtonId: (node: ResultNode) => string;
  nested?: boolean;
  onAddChild: (parent: ResultNode) => void;
  onEdit: (node: ResultNode) => void;
  /** `opener` is the delete button, to return focus to when the confirmation is cancelled. */
  onDelete: (node: ResultNode, opener: HTMLElement) => void;
}) {
  return (
    <ul className={cn("space-y-1", nested && "ms-1.5 border-s ps-2 sm:ms-3 sm:ps-3")}>
      {items.map(({ node, children }) => {
        const arabic = lang === "ar" && Boolean(node.textAr);
        const blocked = hasChildResults(node, nodes);
        const canHaveChildren = childLevelOf(node.level) !== null;
        const whyId = `result-${node.id}-delete-why`;
        const indicatorCount = node._count?.indicators ?? 0;
        return (
          <li key={node.id}>
            <div className="flex flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-secondary/40 sm:flex-row sm:items-start sm:gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-1">
                <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold" dir="ltr">{node.code}</span>
                <span className="mt-0.5 shrink-0"><LevelBadge level={node.level} label={t(`level.${node.level}`)} /></span>
                <span className="min-w-[12rem] flex-1 text-sm" dir={arabic ? "rtl" : "auto"} lang={arabic ? "ar" : "en"}>
                  {arabic ? node.textAr : node.text}
                </span>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">{t("results.indicatorCount", { count: indicatorCount })}</span>
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
              </div>
            </div>
            {children.length > 0 && (
              <ResultTreeList items={children} nodes={nodes} lang={lang} t={t} editButtonId={editButtonId} nested
                onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} />
            )}
          </li>
        );
      })}
    </ul>
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
}: {
  editing: Editing;
  nodes: readonly ResultNode[];
  lang: AppLanguage;
  topLevel: ResultFormValues["level"];
  projectId: string;
  frameworkId: string;
  onClose: () => void;
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
    onSuccess: () => {
      toast.success(t(node ? "results.toast.updated" : "results.toast.created"));
      void invalidateFrameworkData(queryClient, { projectId, frameworkId });
      onClose();
    },
    onError: (err) => {
      setServerError(errorMessage(err, t("results.toast.saveFailed")));
      toast.error(t("results.toast.saveFailed"));
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
