import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { Project, Sector } from "@/types/api";
import { useTranslation } from "react-i18next";
import { SECTORS } from "@/lib/constants";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { queryKeys } from "@/lib/queryKeys";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateProjectDialog } from "@/components/project/CreateProjectDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { Search, LayoutGrid, List, Loader2 } from "lucide-react";

/** True when the project works in the sector (primary or additional). */
function inSector(project: Project, sector: Sector): boolean {
  return project.sector === sector || (project.sectors ?? []).includes(sector);
}

export default function Projects() {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<Sector | "all">("all");
  // The page is English until Phase 6; translated parts carry their own lang (WCAG 3.1.2, Arabic font rules in index.css).
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  // Creating a project is for org and platform admins (the API refuses everyone else).
  const canCreate = usePermissions().can("project.create");
  const { data: projects = [], isLoading } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api.getProjects(),
  });

  const filtered = projects.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (sectorFilter !== "all" && !inSector(p, sectorFilter)) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    return true;
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        {canCreate && <CreateProjectDialog />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input aria-label={t("projects.search")} lang={lang} placeholder={t("projects.searchPlaceholder")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9 rounded-lg" />
        </div>
        <Select value={sectorFilter} onValueChange={(v) => setSectorFilter(v as Sector | "all")}>
          <SelectTrigger aria-label={t("projects.filterSector")} lang={lang} className="w-36 rounded-lg"><SelectValue placeholder="Sector" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><span lang={lang}>{t("projects.allSectors")}</span></SelectItem>
            {SECTORS.map((s) => <SelectItem key={s} value={s}><span lang={lang}>{t(`sector.${s}`)}</span></SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label={t("projects.filterStatus")} lang={lang} className="w-32 rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {/* English until Phase 6 translates project statuses; marked so inside the translated trigger. */}
            <SelectItem value="all"><span lang="en">All</span></SelectItem>
            <SelectItem value="active"><span lang="en">Active</span></SelectItem>
            <SelectItem value="setup"><span lang="en">Setup</span></SelectItem>
          </SelectContent>
        </Select>
        {/* Icon-only toggles: named, and the pressed one says so (not by its background alone). */}
        <div role="group" aria-label={t("projects.view")} lang={lang} className="flex border rounded-lg overflow-hidden">
          <button type="button" aria-label={t("projects.viewGrid")} aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`p-2 ${view === "grid" ? "bg-secondary" : "hover:bg-secondary/50"}`}><LayoutGrid aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" aria-label={t("projects.viewList")} aria-pressed={view === "list"} onClick={() => setView("list")} className={`p-2 ${view === "list" ? "bg-secondary" : "hover:bg-secondary/50"}`}><List aria-hidden="true" className="h-4 w-4" /></button>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card-surface p-5 hover:border-border-strong transition-all group block">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">{p.name}</h3>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${p.status === "active" ? "bg-success/10 text-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  {p.status === "active" ? "Active" : p.status === "setup" ? "Setup" : p.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{p.donor} · <span lang={lang}>{t(`sector.${p.sector}`, { defaultValue: p.sector })}</span> · {p.geographicScope || ''}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">Project</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Sector</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Donor</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3"><Link to={`/projects/${p.id}`} className="font-medium text-foreground hover:text-primary">{p.name}</Link></td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground" lang={lang}>{t(`sector.${p.sector}`, { defaultValue: p.sector })}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{p.donor}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${p.status === "active" ? "bg-success/10 text-foreground" : "bg-secondary text-secondary-foreground"}`}>
                      {p.status === "active" ? "Active" : p.status === "setup" ? "Setup" : p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
