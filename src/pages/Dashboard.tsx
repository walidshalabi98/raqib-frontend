import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import {
  BarChart3, TrendingDown, AlertTriangle, CheckCircle2,
  FolderOpen, Target, Clock, Loader2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { Link } from "react-router-dom";

const STATUS_COLORS: Record<string, string> = {
  on_track: "#10b981",
  at_risk: "#f59e0b",
  off_track: "#ef4444",
  not_started: "#6b7280",
};

export default function Dashboard() {
  const { user } = useAuth();

  const { data: overview, isLoading } = useQuery({
    queryKey: ["org-overview"],
    queryFn: () => api.getOrgOverview(),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.fullName?.split(" ")[0] || "there";

  const projects = overview?.projects || [];
  const totalOnTrack = projects.reduce((sum: number, p: any) => sum + (p.indicatorStatus?.on_track || 0), 0);
  const totalAtRisk = projects.reduce((sum: number, p: any) => sum + (p.indicatorStatus?.at_risk || 0), 0);
  const totalOffTrack = projects.reduce((sum: number, p: any) => sum + (p.indicatorStatus?.off_track || 0), 0);
  const totalNotStarted = projects.reduce((sum: number, p: any) => {
    const total = p.totalIndicators || 0;
    const tracked = (p.indicatorStatus?.on_track || 0) + (p.indicatorStatus?.at_risk || 0) + (p.indicatorStatus?.off_track || 0);
    return sum + Math.max(0, total - tracked);
  }, 0);
  const totalIndicators = totalOnTrack + totalAtRisk + totalOffTrack + totalNotStarted;

  const statusPieData = [
    { name: "On Track", value: totalOnTrack, color: STATUS_COLORS.on_track },
    { name: "At Risk", value: totalAtRisk, color: STATUS_COLORS.at_risk },
    { name: "Off Track", value: totalOffTrack, color: STATUS_COLORS.off_track },
    { name: "Not Started", value: totalNotStarted, color: STATUS_COLORS.not_started },
  ].filter(d => d.value > 0);

  const projectBarData = projects.map((p: any) => ({
    name: p.name.length > 15 ? p.name.substring(0, 15) + "\u2026" : p.name,
    onTrack: p.indicatorStatus?.on_track || 0,
    atRisk: p.indicatorStatus?.at_risk || 0,
    offTrack: p.indicatorStatus?.off_track || 0,
  }));

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{greeting}, {firstName}</h1>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Link to="/projects"><Button><FolderOpen className="mr-2 h-4 w-4" /> View All Projects</Button></Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><FolderOpen className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-sm text-muted-foreground">Active Projects</p><p className="text-2xl font-bold">{overview?.activeProjects || 0}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-sm text-muted-foreground">On Track</p><p className="text-2xl font-bold text-green-600">{totalOnTrack}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
          <div><p className="text-sm text-muted-foreground">At Risk</p><p className="text-2xl font-bold text-amber-600">{totalAtRisk}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg"><TrendingDown className="h-5 w-5 text-red-600" /></div>
          <div><p className="text-sm text-muted-foreground">Off Track</p><p className="text-2xl font-bold text-red-600">{totalOffTrack}</p></div>
        </div></CardContent></Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Indicator Status</CardTitle></CardHeader>
          <CardContent>
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {statusPieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">No indicator data yet</div>
            )}
            <div className="text-center mt-2 text-sm text-muted-foreground">{totalIndicators} indicators across {projects.length} projects</div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Project Performance</CardTitle></CardHeader>
          <CardContent>
            {projectBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={projectBarData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="onTrack" name="On Track" stackId="a" fill="#10b981" />
                  <Bar dataKey="atRisk" name="At Risk" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="offTrack" name="Off Track" stackId="a" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">No projects yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Projects + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><FolderOpen className="h-5 w-5" /> Active Projects</h2>
          {projects.length > 0 ? projects.map((project: any) => {
            const total = project.totalIndicators || 1;
            const onTrack = project.indicatorStatus?.on_track || 0;
            const atRisk = project.indicatorStatus?.at_risk || 0;
            const offTrack = project.indicatorStatus?.off_track || 0;
            const pct = Math.round((onTrack / total) * 100);
            return (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{project.name}</h3>
                        <p className="text-sm text-muted-foreground">{project.sector} - {project.donor}</p>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{onTrack} on track</Badge>
                        {atRisk > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{atRisk} at risk</Badge>}
                        {offTrack > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{offTrack} off track</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="flex-1 h-2" />
                      <span className="text-sm font-medium text-muted-foreground">{pct}%</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          }) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No active projects. <Link to="/projects" className="text-primary underline">Create one</Link></CardContent></Card>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Clock className="h-5 w-5" /> Recent Activity</h2>
          <Card><CardContent className="pt-4"><ActivityFeed /></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
