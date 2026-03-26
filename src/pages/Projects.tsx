import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { SECTOR_LABELS } from "@/data/mockData";
import { StatusDot } from "@/components/common/StatusDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Plus, LayoutGrid, List, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Projects() {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  // New project form state
  const [newProject, setNewProject] = useState({
    name: "", description: "", sector: "livelihoods", donor: "", donorType: "eu",
    budgetUsd: "", startDate: "", endDate: "", targetBeneficiaries: "", geographicScope: "",
  });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
  });

  const filtered = projects.filter((p: any) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (sectorFilter !== "all" && p.sector !== sectorFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    return true;
  });

  const handleCreateProject = async () => {
    if (!newProject.name || !newProject.donor || !newProject.startDate || !newProject.endDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    setCreating(true);
    try {
      await api.createProject({
        ...newProject,
        budgetUsd: newProject.budgetUsd ? parseFloat(newProject.budgetUsd) : undefined,
        targetBeneficiaries: newProject.targetBeneficiaries ? parseInt(newProject.targetBeneficiaries) : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['org-overview'] });
      setDialogOpen(false);
      setNewProject({ name: "", description: "", sector: "livelihoods", donor: "", donorType: "eu", budgetUsd: "", startDate: "", endDate: "", targetBeneficiaries: "", geographicScope: "" });
      toast.success("Project created successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1.5" /> New Project</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create New Project</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Project Name *</Label>
                <Input value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} placeholder="Youth Employment Program" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={newProject.description} onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))} placeholder="Brief description..." className="rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sector *</Label>
                  <Select value={newProject.sector} onValueChange={v => setNewProject(p => ({ ...p, sector: v }))}>
                    <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="livelihoods">Livelihoods</SelectItem>
                      <SelectItem value="health">Health</SelectItem>
                      <SelectItem value="education">Education</SelectItem>
                      <SelectItem value="wash">WASH</SelectItem>
                      <SelectItem value="protection">Protection</SelectItem>
                      <SelectItem value="food_security">Food Security</SelectItem>
                      <SelectItem value="governance">Governance</SelectItem>
                      <SelectItem value="agriculture">Agriculture</SelectItem>
                      <SelectItem value="gender">Gender</SelectItem>
                      <SelectItem value="youth">Youth</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Donor Type *</Label>
                  <Select value={newProject.donorType} onValueChange={v => setNewProject(p => ({ ...p, donorType: v }))}>
                    <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eu">EU</SelectItem>
                      <SelectItem value="usaid">USAID</SelectItem>
                      <SelectItem value="giz">GIZ</SelectItem>
                      <SelectItem value="undp">UNDP</SelectItem>
                      <SelectItem value="unicef">UNICEF</SelectItem>
                      <SelectItem value="sida">SIDA</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Donor Name *</Label>
                <Input value={newProject.donor} onChange={e => setNewProject(p => ({ ...p, donor: e.target.value }))} placeholder="European Union" className="rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Budget (USD)</Label>
                  <Input type="number" value={newProject.budgetUsd} onChange={e => setNewProject(p => ({ ...p, budgetUsd: e.target.value }))} placeholder="500000" className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label>Target Beneficiaries</Label>
                  <Input type="number" value={newProject.targetBeneficiaries} onChange={e => setNewProject(p => ({ ...p, targetBeneficiaries: e.target.value }))} placeholder="1200" className="rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Date *</Label>
                  <Input type="date" value={newProject.startDate} onChange={e => setNewProject(p => ({ ...p, startDate: e.target.value }))} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date *</Label>
                  <Input type="date" value={newProject.endDate} onChange={e => setNewProject(p => ({ ...p, endDate: e.target.value }))} className="rounded-lg" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Geographic Scope</Label>
                <Input value={newProject.geographicScope} onChange={e => setNewProject(p => ({ ...p, geographicScope: e.target.value }))} placeholder="West Bank - Hebron, Nablus" className="rounded-lg" />
              </div>
              <Button className="w-full" onClick={handleCreateProject} disabled={creating}>
                {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : "Create Project"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
            <SelectItem value="education">Education</SelectItem>
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
          {filtered.map((p: any) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card-surface p-5 hover:border-border-strong transition-all group block">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">{p.name}</h3>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${p.status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
                  {p.status === "active" ? "Active" : p.status === "setup" ? "Setup" : p.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{p.donor} · {SECTOR_LABELS[p.sector] || p.sector} · {p.geographicScope || ''}</p>
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
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p: any) => (
                <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3"><Link to={`/projects/${p.id}`} className="font-medium text-foreground hover:text-primary">{p.name}</Link></td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{SECTOR_LABELS[p.sector] || p.sector}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{p.donor}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${p.status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
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
