import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { AlertCircle, FileText, ClipboardCheck, Database, BarChart3, UserCheck, FolderPlus, Bell } from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  off_track_alert: AlertCircle,
  report_generated: FileText,
  assessment_ready: ClipboardCheck,
  new_data: Database,
  framework_approved: BarChart3,
  deadline_reminder: Bell,
};

const iconColorMap: Record<string, string> = {
  off_track_alert: "text-danger",
  report_generated: "text-info",
  assessment_ready: "text-warning",
  new_data: "text-success",
  framework_approved: "text-primary",
  deadline_reminder: "text-muted-foreground",
};

export function ActivityFeed() {
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications(),
  });

  if (notifications.length === 0) {
    return (
      <div className="card-surface p-6 text-center text-sm text-muted-foreground">
        No recent activity.
      </div>
    );
  }

  return (
    <div className="card-surface divide-y">
      {notifications.slice(0, 8).map((item: any) => {
        const Icon = iconMap[item.type] || BarChart3;
        return (
          <div key={item.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-secondary/30 transition-colors">
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconColorMap[item.type] || "text-muted-foreground"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{item.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
