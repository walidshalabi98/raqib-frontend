import { forwardRef, useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, Archive, ArchiveRestore, CheckCircle2, ChevronDown, Loader2, Settings2, Trash2 } from "lucide-react";
import { dirFor, type AppLanguage } from "@/i18n";
import { isolate } from "@/lib/reports";
import { archiveErrorKey, confirmsProjectName, deleteErrorKey, deletionSummary } from "@/lib/projectLifecycle";
import { useArchiveProject, useDeleteProject } from "@/hooks/useProjects";
import type { ProjectDetail } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Archiving, restoring and deleting a project (org admins and platform admins; the server enforces it). Archive
 * is the normal end of a project: it leaves the active list, turns read-only and keeps everything (donors may
 * audit it for years). Delete is for test projects and mistakes: it removes everything for good, after the admin
 * types the project's name. Pages decide who sees these (`canArchive`, `canDelete`); this component is role-free.
 */

type ProjectSummary = Pick<ProjectDetail, "id" | "name" | "status" | "documents" | "frameworks" | "_count">;

/** Scrolls when taller than the screen; a 16 px side gutter on phones (375 px). */
const DIALOG_CLASS = "max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg text-start sm:w-full";
type OpenDialog = "archive" | "delete" | null;

export interface ProjectActionsProps {
  project: ProjectSummary;
  lang: AppLanguage;
  /** Archive and restore (project.archive). */
  canArchive: boolean;
  /** Delete for good (project.delete). */
  canDelete: boolean;
  /** Restores the archived project; the page owns it, as its archived banner restores too. */
  onRestore: () => void;
  restoring: boolean;
  /** The id of the archived banner: focus moves there once the project is archived (WCAG 2.4.3). */
  archivedBannerId: string;
}

/** The "Project actions" menu with its confirmation dialogs. */
export function ProjectActions({ project, lang, canArchive, canDelete, onRestore, restoring, archivedBannerId }: ProjectActionsProps) {
  const { t } = useTranslation(undefined, { lng: lang });
  const dir = dirFor(lang);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // The open dialog, read when another one closes ("Archive instead" swaps the delete dialog for this one).
  const openDialog = useRef<OpenDialog>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Where focus goes when a dialog closes: the archived banner after archiving; the menu button otherwise.
  const focusAfterClose = useRef<string | null>(null);
  const archived = project.status === "archived";

  if (!canArchive && !canDelete) return null;

  const show = (next: OpenDialog) => {
    openDialog.current = next;
    setDialog(next);
  };

  const returnFocus = (event: Event) => {
    event.preventDefault();
    // Another dialog took over: it keeps the focus it moved into itself.
    if (openDialog.current !== null) return;
    const target = focusAfterClose.current ? document.getElementById(focusAfterClose.current) : null;
    focusAfterClose.current = null;
    (target ?? trigger.current)?.focus();
  };

  return (
    <>
      {/* Not modal: a modal menu hides the page with aria-hidden while it stays focusable (axe aria-hidden-focus),
          and the dialogs it opens trap focus themselves. Escape and a click outside still close it. The menu takes
          its position from the page's direction; each item reads in the user's language and direction. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} variant="outline" lang={lang} className="min-h-11 sm:min-h-10">
            <Settings2 aria-hidden="true" />
            {t("projectActions.menu")}
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" lang={lang} className="min-w-[14rem]">
          {canArchive && !archived && (
            <DropdownMenuItem dir={dir} className="min-h-11 gap-2" onSelect={() => show("archive")}>
              <Archive aria-hidden="true" className="h-4 w-4 shrink-0" />
              {t("projectActions.archive")}
            </DropdownMenuItem>
          )}
          {canArchive && archived && (
            <DropdownMenuItem dir={dir} className="min-h-11 gap-2" disabled={restoring} onSelect={onRestore}>
              <ArchiveRestore aria-hidden="true" className="h-4 w-4 shrink-0" />
              {t("projectActions.restore")}
            </DropdownMenuItem>
          )}
          {canArchive && canDelete && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuItem
              dir={dir}
              className="min-h-11 gap-2 text-destructive focus:bg-destructive focus:text-destructive-foreground"
              onSelect={() => show("delete")}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4 shrink-0" />
              {t("projectActions.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ArchiveProjectDialog
        open={dialog === "archive"}
        project={project}
        lang={lang}
        onClose={() => show(null)}
        onArchived={() => { focusAfterClose.current = archivedBannerId; show(null); }}
        onCloseAutoFocus={returnFocus}
      />
      <DeleteProjectDialog
        open={dialog === "delete"}
        project={project}
        lang={lang}
        onClose={() => show(null)}
        onArchiveInstead={canArchive && !archived ? () => show("archive") : undefined}
        onCloseAutoFocus={returnFocus}
      />
    </>
  );
}

// ------------------------------------------------------------------ archive

interface DialogProps {
  open: boolean;
  project: ProjectSummary;
  lang: AppLanguage;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** Confirms archiving: what it means (hidden, read-only, nothing deleted, can be restored). */
export function ArchiveProjectDialog({ open, project, lang, onClose, onArchived, onCloseAutoFocus }: DialogProps & { onArchived: () => void }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const dir = dirFor(lang);
  const archive = useArchiveProject();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const name = isolate(project.name);

  const confirm = () => {
    if (archive.isPending) return;
    setErrorKey(null);
    archive.mutate(project.id, {
      onSuccess: () => {
        toast.success(t("projectActions.toast.archived", { name }));
        onArchived();
      },
      onError: (err) => setErrorKey(archiveErrorKey(err)),
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next || archive.isPending) return;
        setErrorKey(null);
        onClose();
      }}
    >
      <AlertDialogContent dir={dir} lang={lang} className={DIALOG_CLASS} onCloseAutoFocus={onCloseAutoFocus}>
        <DirectionProvider dir={dir}>
          <AlertDialogHeader className="text-start sm:text-start">
            <AlertDialogTitle className="break-words">{t("projectActions.archiveDialog.title", { name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("projectActions.archiveDialog.intro")}</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="mt-4 space-y-2 text-sm">
            {(["pointHidden", "pointReadOnly", "pointKept", "pointRestore"] as const).map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{t(`projectActions.archiveDialog.${point}`)}</span>
              </li>
            ))}
          </ul>
          <div aria-live="assertive">
            {errorKey && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{t(errorKey)}</span>
              </p>
            )}
          </div>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="mt-0 min-h-11 sm:min-h-10" disabled={archive.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <Button className="min-h-11 sm:min-h-10" disabled={archive.isPending} onClick={confirm}>
              {archive.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Archive aria-hidden="true" />}
              {t(archive.isPending ? "projectActions.archiveDialog.pending" : "projectActions.archiveDialog.confirm")}
            </Button>
          </AlertDialogFooter>
        </DirectionProvider>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ------------------------------------------------------------------- delete

/**
 * Confirms a permanent deletion: says it cannot be undone, lists what goes (from the counts the page already
 * has), suggests archiving instead, and asks for the project's exact name. The delete button stays disabled
 * until the name matches; the server checks it again.
 */
export function DeleteProjectDialog({
  open,
  project,
  lang,
  onClose,
  onArchiveInstead,
  onCloseAutoFocus,
}: DialogProps & { onArchiveInstead?: () => void }) {
  const dir = dirFor(lang);
  const remove = useDeleteProject();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !remove.isPending) onClose();
      }}
    >
      {/* Mounted only while open, so the typed name and any error start empty each time. */}
      <AlertDialogContent
        dir={dir}
        lang={lang}
        className={DIALOG_CLASS}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(`delete-project-name-${project.id}`)?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DirectionProvider dir={dir}>
          <DeleteProjectForm project={project} lang={lang} remove={remove} onClose={onClose} onArchiveInstead={onArchiveInstead} />
        </DirectionProvider>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteProjectForm({
  project,
  lang,
  remove,
  onClose,
  onArchiveInstead,
}: {
  project: ProjectSummary;
  lang: AppLanguage;
  remove: ReturnType<typeof useDeleteProject>;
  onClose: () => void;
  onArchiveInstead?: () => void;
}) {
  const { t } = useTranslation(undefined, { lng: lang });
  const navigate = useNavigate();
  const baseId = useId();
  const inputId = `delete-project-name-${project.id}`;
  const hintId = `${baseId}-hint`;
  const nameId = `${baseId}-name`;
  const [typed, setTyped] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const matches = confirmsProjectName(typed, project.name);
  const items = deletionSummary(project);
  const archived = project.status === "archived";
  const name = isolate(project.name);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!matches || remove.isPending) return;
    setErrorKey(null);
    remove.mutate(
      { projectId: project.id, confirmName: typed },
      {
        onSuccess: () => {
          toast.success(t("projects.deleted", { name }));
          // Back to the list the project was in; the list page puts focus on its heading.
          navigate(archived ? "/projects?view=archived" : "/projects", { replace: true, state: { projectDeleted: true } });
        },
        onError: (err) => {
          setErrorKey(deleteErrorKey(err));
          document.getElementById(inputId)?.focus();
        },
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <AlertDialogHeader className="text-start sm:text-start">
        <AlertDialogTitle className="break-words">{t("projectActions.deleteDialog.title", { name })}</AlertDialogTitle>
        <AlertDialogDescription className="flex items-start gap-2 font-medium text-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{t("projectActions.deleteDialog.warning")}</span>
        </AlertDialogDescription>
      </AlertDialogHeader>

      <p className="text-sm text-muted-foreground">{t("projectActions.deleteDialog.advice")}</p>

      <div>
        <h3 className="text-sm font-semibold">{t("projectActions.deleteDialog.listTitle")}</h3>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
          {items.map((item) => {
            const label = t(`projectActions.deleteDialog.item.${item.key}`);
            return (
              <li key={item.key}>
                {item.count === null ? label : t("projectActions.deleteDialog.count", { label, count: item.count })}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t("projectActions.deleteDialog.auditNote")}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm">
          {t("projectActions.deleteDialog.nameToType")}{" "}
          <strong id={nameId} dir="auto" className="break-words rounded bg-muted px-1.5 py-0.5 font-semibold">{project.name}</strong>
        </p>
        <Label htmlFor={inputId}>{t("projectActions.deleteDialog.nameLabel")}</Label>
        <Input
          id={inputId}
          dir="auto"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-11"
          value={typed}
          aria-describedby={`${hintId}${errorKey ? ` ${baseId}-error` : ""}`}
          aria-invalid={errorKey === "projectActions.deleteDialog.errors.mismatch" ? true : undefined}
          onChange={(event) => {
            setTyped(event.target.value);
            setErrorKey(null);
          }}
        />
        <p id={hintId} className="text-xs text-muted-foreground">{t("projectActions.deleteDialog.nameHint")}</p>
        {/* Says when the delete button turns on, for people who cannot see it change (WCAG 4.1.3). */}
        <p aria-live="polite" className="min-h-5 text-xs">
          {matches && (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {t("projectActions.deleteDialog.matches")}
            </span>
          )}
        </p>
      </div>

      <div aria-live="assertive">
        {errorKey && (
          <p id={`${baseId}-error`} role="alert" className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{t(errorKey)}</span>
          </p>
        )}
      </div>

      <AlertDialogFooter className="gap-2 sm:flex-wrap">
        <AlertDialogCancel className="mt-0 min-h-11 sm:min-h-10" disabled={remove.isPending}>
          {t("common.cancel")}
        </AlertDialogCancel>
        {onArchiveInstead && (
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" disabled={remove.isPending} onClick={onArchiveInstead}>
            <Archive aria-hidden="true" />
            {t("projectActions.deleteDialog.archiveInstead")}
          </Button>
        )}
        <Button type="submit" variant="destructive" className="min-h-11 sm:min-h-10" disabled={!matches || remove.isPending}>
          {remove.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
          {t(remove.isPending ? "projectActions.deleteDialog.pending" : "projectActions.deleteDialog.confirm")}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

// ------------------------------------------------------------------- banner

/**
 * Shown on an archived project's page: it is read-only for everyone, nothing was deleted, and (for admins) a
 * Restore button. A status (text and icon), focusable so the page can move focus here after archiving.
 */
export const ArchivedProjectBanner = forwardRef<
  HTMLDivElement,
  { id: string; lang: AppLanguage; canRestore: boolean; onRestore: () => void; restoring: boolean }
>(function ArchivedProjectBanner({ id, lang, canRestore, onRestore, restoring }, ref) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <div
      ref={ref}
      id={id}
      role="status"
      tabIndex={-1}
      lang={lang}
      dir={dirFor(lang)}
      className="flex flex-col gap-3 rounded-md border border-border-strong bg-muted/60 px-4 py-3 text-start text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-start"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Archive aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold">{t("projectDetail.archivedTitle")}</p>
          <p>
            {t("projectDetail.archivedBody")}
            {!canRestore && <> {t("projectDetail.archivedAskAdmin")}</>}
          </p>
        </div>
      </div>
      {canRestore && (
        <Button variant="outline" className="min-h-11 shrink-0 self-start sm:min-h-10" disabled={restoring} onClick={onRestore}>
          {restoring ? <Loader2 aria-hidden="true" className="animate-spin" /> : <ArchiveRestore aria-hidden="true" />}
          {t(restoring ? "projectActions.restoring" : "projectActions.restore")}
        </Button>
      )}
    </div>
  );
});
