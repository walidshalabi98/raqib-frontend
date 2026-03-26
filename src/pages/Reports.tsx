import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/services/api";
import { Loader2, FileText } from "lucide-react";

export default function Reports() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const projectList = projects || [];

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">View and generate reports across all projects</p>
      </div>

      {projectList.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">No Projects Yet</h3>
          <p className="text-sm text-muted-foreground">Create a project first to generate reports.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projectList.map((project: any) => (
            <ProjectReports key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectReports({ project }: { project: any }) {
  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports', project.id],
    queryFn: () => api.getReports(project.id),
  });

  const list = reports || [];

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <Link to={`/projects/${project.id}`} className="text-sm font-semibold hover:text-primary transition-colors">
          {project.name}
        </Link>
        <Link to={`/projects/${project.id}`} className="text-xs text-primary hover:underline">
          Generate Report
        </Link>
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports generated yet</p>
      ) : (
        <div className="space-y-2">
          {list.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 text-sm">
              <div>
                <span className="font-medium capitalize">{r.type?.replace(/_/g, ' ')}</span>
                <span className="text-muted-foreground ml-2">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                r.status === 'completed' ? 'bg-success/10 text-success' :
                r.status === 'generating' ? 'bg-primary/10 text-primary' :
                'bg-warning/10 text-warning'
              }`}>
                {r.status?.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
