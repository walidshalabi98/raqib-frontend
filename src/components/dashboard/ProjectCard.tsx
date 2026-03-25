import { Link } from "react-router-dom";
import { mockProjects, SECTOR_LABELS } from "@/data/mockData";
import { StatusDot } from "@/components/common/StatusDot";

export function ProjectCard({ project }: { project: typeof mockProjects[0] }) {
  const onTrackPct = project.total_indicators > 0
    ? Math.round((project.indicators_on_track / project.total_indicators) * 100)
    : 0;

  return (
    <Link to={`/projects/${project.id}`} className="card-surface p-5 hover:border-border-strong transition-all group block">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{project.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{project.donor}</p>
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
          project.status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"
        }`}>
          {project.status === "active" ? "Active" : "Setup"}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium">
          {SECTOR_LABELS[project.sector] || project.sector}
        </span>
      </div>
      {project.total_indicators > 0 ? (
        <>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-2">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${onTrackPct}%` }} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><StatusDot status="on_track" size="sm" /> {project.indicators_on_track}</span>
            <span className="flex items-center gap-1"><StatusDot status="at_risk" size="sm" /> {project.indicators_at_risk}</span>
            <span className="flex items-center gap-1"><StatusDot status="off_track" size="sm" /> {project.indicators_off_track}</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No indicators yet</p>
      )}
    </Link>
  );
}
