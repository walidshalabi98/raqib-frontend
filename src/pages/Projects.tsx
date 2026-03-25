import { useState } from "react";
import { Link } from "react-router-dom";
import { mockProjects, SECTOR_LABELS } from "@/data/mockData";
import { StatusDot } from "@/components/common/StatusDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, LayoutGrid, List } from "lucide-react";

export default function Projects() {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = mockProjects.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (sectorFilter !== "all" && p.sector !== sectorFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <Button><Plus className="h-4 w-4 mr-1.5" /> New Project</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-lg" />
        </div>
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-36 rounded-lg"><SelectValue placeholder="Sector" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            <SelectItem value="livelihoods">Livelihoods</SelectItem>
            <SelectItem value="health">Health</SelectItem>
            <SelectItem value="wash">WASH</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="setup">Setup</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex border rounded-lg overflow-hidden">
          <button onClick={() => setView("grid")} className={`p-2 ${view === "grid" ? "bg-secondary" : "hover:bg-secondary/50"}`}><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setView("list")} className={`p-2 ${view === "list" ? "bg-secondary" : "hover:bg-secondary/50"}`}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card-surface p-5 hover:border-border-strong transition-all group block">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">{p.name}</h3>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${p.status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
                  {p.status === "active" ? "Active" : "Setup"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{p.donor} · {SECTOR_LABELS[p.sector]} · {p.geographic_scope}</p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><StatusDot status="on_track" size="sm" /> {p.indicators_on_track}</span>
                <span className="flex items-center gap-1"><StatusDot status="at_risk" size="sm" /> {p.indicators_at_risk}</span>
                <span className="flex items-center gap-1"><StatusDot status="off_track" size="sm" /> {p.indicators_off_track}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Project</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Sector</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Donor</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Indicators</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3"><Link to={`/projects/${p.id}`} className="font-medium text-foreground hover:text-primary">{p.name}</Link></td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{SECTOR_LABELS[p.sector]}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{p.donor}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${p.status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
                      {p.status === "active" ? "Active" : "Setup"}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex gap-2 text-xs">
                      <span className="flex items-center gap-1"><StatusDot status="on_track" size="sm" /> {p.indicators_on_track}</span>
                      <span className="flex items-center gap-1"><StatusDot status="at_risk" size="sm" /> {p.indicators_at_risk}</span>
                      <span className="flex items-center gap-1"><StatusDot status="off_track" size="sm" /> {p.indicators_off_track}</span>
                    </div>
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
