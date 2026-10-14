import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Project, ProjectStatus, Sector } from "@/types/api";
import { dirFor, type AppLanguage } from "@/i18n";
import { PROJECT_STATUSES, SECTORS } from "@/lib/constants";
import { isForbidden } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { useProjectList } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateProjectDialog } from "@/components/project/CreateProjectDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { AlertCircle, Archive, FolderOpen, Info, LayoutGrid, List, Search } from "lucide-react";

type ProjectsView = "active" | "archived";

/** True when the project works in the sector (primary or additional). */
function inSector(project: Project, sector: Sector): boolean {
  return project.sector === sector || (project.sectors ?? []).includes(sector);
}

/** Statuses an active project can have (archived projects are in the other view). */
const ACTIVE_STATUSES = PROJECT_STATUSES.filter((status) => status !== "archived");

/**
 * The organisation's projects, as two views: active projects (the default) and archived ones (`?view=archived`),
 * which are read-only and can be restored by an org admin. Archived projects never mix into the active list:
 * the API leaves them out unless asked (GET /api/projects?archived=true).
 */
export default function Projects() {
  const lang = useUserLanguage();
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view: ProjectsView = searchParams.get("view") === "archived" ? "archived" : "active";
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<Sector | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  // Creating a project is for org and platform admins (the API refuses everyone else).
  const canCreate = usePermissions().can("project.create");
  const heading = useRef<HTMLHeadingElement>(null);

  // After a project was deleted (its page sends the user here): focus on the heading, once (WCAG 2.4.3).
  const projectDeleted = (location.state as { projectDeleted?: boolean } | null)?.projectDeleted === true;
  useEffect(() => {
    if (!projectDeleted) return;
    heading.current?.focus();
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [projectDeleted, navigate, location.pathname, location.search]);

  // The view is in the address, so it can be linked to and survives a reload; switching replaces the entry.
  const selectView = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === "archived") next.set("view", "archived");
        else next.delete("view");
        return next;
      },
      { replace: true },
    );
  };

  const filters = { search, sectorFilter, statusFilter: view === "archived" ? "all" : statusFilter } as const;

  return (
    <div lang={lang} dir={dir} className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">{t("projects.title")}</h1>
        {canCreate && <CreateProjectDialog />}
      </div>

      <Tabs value={view} onValueChange={selectView} dir={dir}>
        <TabsList aria-label={t("projects.views")} className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="active" className="min-h-11 gap-1.5 px-3 sm:min-h-9">
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            {t("projects.viewActive")}
          </TabsTrigger>
          <TabsTrigger value="archived" className="min-h-11 gap-1.5 px-3 sm:min-h-9">
            <Archive aria-hidden="true" className="h-4 w-4" />
            {t("projects.viewArchived")}
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search aria-hidden="true" className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={t("projects.search")} placeholder={t("projects.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="min-h-11 rounded-lg ps-9 sm:min-h-10" />
          </div>
          <Select value={sectorFilter} onValueChange={(v) => setSectorFilter(v as Sector | "all")} dir={dir}>
            <SelectTrigger aria-label={t("projects.filterSector")} className="min-h-11 w-40 rounded-lg sm:min-h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("projects.allSectors")}</SelectItem>
              {SECTORS.map((s) => <SelectItem key={s} value={s}>{t(`sector.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          {view === "active" && (
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProjectStatus | "all")} dir={dir}>
              <SelectTrigger aria-label={t("projects.filterStatus")} className="min-h-11 w-40 rounded-lg sm:min-h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("projects.allStatuses")}</SelectItem>
                {ACTIVE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`projectStatus.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* Icon-only toggles: named, and the pressed one says so (not by its background alone). */}
          <div role="group" aria-label={t("projects.view")} className="flex overflow-hidden rounded-lg border">
            <button type="button" aria-label={t("projects.viewGrid")} aria-pressed={layout === "grid"} onClick={() => setLayout("grid")} className={cn("inline-flex min-h-11 min-w-11 items-center justify-center sm:min-h-10 sm:min-w-10", layout === "grid" ? "bg-secondary" : "hover:bg-secondary/50")}><LayoutGrid aria-hidden="true" className="h-4 w-4" /></button>
            <button type="button" aria-label={t("projects.viewList")} aria-pressed={layout === "list"} onClick={() => setLayout("list")} className={cn("inline-flex min-h-11 min-w-11 items-center justify-center sm:min-h-10 sm:min-w-10", layout === "list" ? "bg-secondary" : "hover:bg-secondary/50")}><List aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        </div>

        <TabsContent value="active" className="mt-4">
          <ProjectsList archived={false} filters={filters} layout={layout} lang={lang} t={t} canCreate={canCreate} />
        </TabsContent>
        <TabsContent value="archived" className="mt-4 space-y-4">
          <p className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-start text-sm">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("projects.archivedNote")}</span>
          </p>
          <ProjectsList archived filters={filters} layout={layout} lang={lang} t={t} canCreate={canCreate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ProjectsListProps {
  archived: boolean;
  filters: { search: string; sectorFilter: Sector | "all"; statusFilter: ProjectStatus | "all" };
  layout: "grid" | "list";
  lang: AppLanguage;
  t: TFunction;
  canCreate: boolean;
}

/** One view's projects, with its loading, error and empty states. */
function ProjectsList({ archived, filters, layout, lang, t, canCreate }: ProjectsListProps) {
  const { data: projects = [], isLoading, isError, error, refetch } = useProjectList(archived);

  if (isLoading) {
    return (
      <div role="status" className={layout === "grid" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
        <span className="sr-only">{t("projects.loading")}</span>
        {[0, 1, 2].map((i) => <Skeleton key={i} className={layout === "grid" ? "h-24 rounded-lg" : "h-12 rounded-lg"} />)}
      </div>
    );
  }

  // A failed request is never shown as "no projects".
  if (isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t(isForbidden(error) ? "errors.forbidden" : "projects.loadError")}</span>
        <Button size="sm" variant="outline" className="min-h-11" onClick={() => void refetch()}>{t("common.retry")}</Button>
      </div>
    );
  }

  if (projects.length === 0) {
    const empty = archived ? "projects.emptyArchived" : canCreate ? "projects.emptyActiveAdmin" : "projects.emptyActive";
    return (
      <div className="card-surface flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
        {archived ? <Archive aria-hidden="true" className="h-8 w-8 opacity-40" /> : <FolderOpen aria-hidden="true" className="h-8 w-8 opacity-40" />}
        <p className="max-w-md">{t(empty)}</p>
      </div>
    );
  }

  const query = filters.search.trim().toLowerCase();
  const shown = projects.filter((p) => {
    if (query && !p.name.toLowerCase().includes(query) && !(p.nameAr ?? "").toLowerCase().includes(query)) return false;
    if (filters.sectorFilter !== "all" && !inSector(p, filters.sectorFilter)) return false;
    if (filters.statusFilter !== "all" && p.status !== filters.statusFilter) return false;
    return true;
  });

  if (shown.length === 0) {
    return <p className="card-surface p-8 text-center text-sm text-muted-foreground">{t("projects.noMatches")}</p>;
  }

  if (layout === "grid") {
    return (
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`} className="card-surface group block h-full p-5 transition-all hover:border-border-strong">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <h2 dir="auto" className="min-w-0 break-words text-sm font-semibold transition-colors group-hover:text-primary">
                  {lang === "ar" && p.nameAr ? p.nameAr : p.name}
                </h2>
                <ProjectStatusBadge status={p.status} t={t} />
              </div>
              <p className="text-xs text-muted-foreground">
                <span dir="auto">{p.donor}</span> · {t(`sector.${p.sector}`, { defaultValue: p.sector })}
                {p.geographicScope ? <> · <span dir="auto">{p.geographicScope}</span></> : null}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="card-surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50">
          <tr>
            <th scope="col" className="px-4 py-3 text-start font-medium text-muted-foreground">{t("projects.column.project")}</th>
            <th scope="col" className="hidden px-4 py-3 text-start font-medium text-muted-foreground md:table-cell">{t("projects.column.sector")}</th>
            <th scope="col" className="hidden px-4 py-3 text-start font-medium text-muted-foreground md:table-cell">{t("projects.column.donor")}</th>
            <th scope="col" className="px-4 py-3 text-start font-medium text-muted-foreground">{t("projects.column.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {shown.map((p) => (
            <tr key={p.id} className="transition-colors hover:bg-secondary/30">
              <td className="px-4 py-3">
                <Link to={`/projects/${p.id}`} dir="auto" className="inline-flex min-h-11 items-center font-medium text-foreground hover:text-primary sm:min-h-0">
                  {lang === "ar" && p.nameAr ? p.nameAr : p.name}
                </Link>
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{t(`sector.${p.sector}`, { defaultValue: p.sector })}</td>
              <td className="hidden px-4 py-3 text-muted-foreground md:table-cell" dir="auto">{p.donor}</td>
              <td className="px-4 py-3"><ProjectStatusBadge status={p.status} t={t} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A project's status as text on a tint (foreground text: coloured text on its own tint is below 4.5:1). Archived
 * projects also carry the archive icon, so the badge never relies on colour.
 */
function ProjectStatusBadge({ status, t }: { status: ProjectStatus | string; t: TFunction }) {
  const archived = status === "archived";
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-foreground",
      status === "active" ? "bg-success/10" : archived ? "border border-border-strong bg-muted" : "bg-secondary",
    )}>
      {archived && <Archive aria-hidden="true" className="h-3 w-3" />}
      {t(`projectStatus.${status}`, { defaultValue: status })}
    </span>
  );
}
