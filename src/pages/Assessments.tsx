import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/services/api";
import { AssessmentModal } from "@/components/project/AssessmentModal";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2, ClipboardCheck } from "lucide-react";

export default function Assessments() {
  // Requesting an assessment is for org staff; donor viewers only see the list (the server refuses them too).
  const canRequest = usePermissions().can("assessment.request");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-sm text-muted-foreground">View and manage assessments across all projects</p>
        </div>
      </div>

      {projectList.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-2">No Projects Yet</h3>
          <p className="text-sm text-muted-foreground">Create a project first to manage assessments.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projectList.map((project: any) => (
            <ProjectAssessments key={project.id} project={project} canRequest={canRequest} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectAssessments({ project, canRequest }: { project: any; canRequest: boolean }) {
  const { data: assessments, isLoading } = useQuery({
    queryKey: ['assessments', project.id],
    queryFn: () => api.getAssessments(project.id),
  });

  const list = assessments || [];

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <Link to={`/projects/${project.id}`} className="text-sm font-semibold hover:text-primary transition-colors">
          {project.name}
        </Link>
        {canRequest && <AssessmentModal projectId={project.id} />}
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assessments yet</p>
      ) : (
        <div className="space-y-2">
          {list.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 text-sm">
              <div>
                <span className="font-medium capitalize">{a.type?.replace(/_/g, ' ')}</span>
                <span className="text-muted-foreground ml-2">
                  {new Date(a.requestedAt).toLocaleDateString()}
                </span>
              </div>
              {/* Foreground text on a tinted pill (coloured text on its own tint is below 4.5:1); the status is the text. */}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium text-foreground ${
                a.status === 'delivered' ? 'bg-success/10' :
                a.status === 'requested' ? 'bg-warning/10' :
                'bg-primary/10'
              }`}>
                {a.status?.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
