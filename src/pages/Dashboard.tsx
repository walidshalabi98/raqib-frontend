import { mockProjects, mockUsers } from "@/data/mockData";
import { MetricCard } from "@/components/common/MetricCard";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

export default function Dashboard() {
  const user = mockUsers[0];
  const totalOnTrack = mockProjects.reduce((s, p) => s + p.indicators_on_track, 0);
  const totalAtRisk = mockProjects.reduce((s, p) => s + p.indicators_at_risk, 0);
  const totalOffTrack = mockProjects.reduce((s, p) => s + p.indicators_off_track, 0);
  const activeCount = mockProjects.filter(p => p.status === "active").length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting}, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Active Projects" value={activeCount} />
        <MetricCard label="On Track" value={totalOnTrack} dotColor="bg-success" />
        <MetricCard label="At Risk" value={totalAtRisk} dotColor="bg-warning" />
        <MetricCard label="Off Track" value={totalOffTrack} dotColor="bg-danger" />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Active Projects</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mockProjects.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
        <ActivityFeed />
      </div>
    </div>
  );
}
