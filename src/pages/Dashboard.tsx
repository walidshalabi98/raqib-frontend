import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { MetricCard } from "@/components/common/MetricCard";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { Loader2 } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: overview, isLoading } = useQuery({
    queryKey: ['org-overview'],
    queryFn: () => api.getOrgOverview(),
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.fullName?.split(" ")[0] || "there";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const projects = overview?.projects || [];
  const totalOnTrack = projects.reduce((s: number, p: any) => s + (p.indicatorStatus?.on_track || 0), 0);
  const totalAtRisk = projects.reduce((s: number, p: any) => s + (p.indicatorStatus?.at_risk || 0), 0);
  const totalOffTrack = projects.reduce((s: number, p: any) => s + (p.indicatorStatus?.off_track || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting}, {firstName}</h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Active Projects" value={overview?.activeProjects || 0} />
        <MetricCard label="On Track" value={totalOnTrack} dotColor="bg-success" />
        <MetricCard label="At Risk" value={totalAtRisk} dotColor="bg-warning" />
        <MetricCard label="Off Track" value={totalOffTrack} dotColor="bg-danger" />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Active Projects</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p: any) => (
            <ProjectCard key={p.id} project={{
              id: p.id,
              name: p.name,
              sector: p.sector,
              donor: p.donor,
              status: p.status,
              geographic_scope: '',
              indicators_on_track: p.indicatorStatus?.on_track || 0,
              indicators_at_risk: p.indicatorStatus?.at_risk || 0,
              indicators_off_track: p.indicatorStatus?.off_track || 0,
              total_indicators: p.totalIndicators || 0,
            }} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
        <ActivityFeed />
      </div>
    </div>
  );
}
