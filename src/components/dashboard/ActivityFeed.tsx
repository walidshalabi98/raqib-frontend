import { AlertCircle, FileText, ClipboardCheck, Database, BarChart3, UserCheck, FolderPlus } from "lucide-react";
import { mockActivityFeed } from "@/data/mockData";

const iconMap: Record<string, React.ElementType> = {
  alert: AlertCircle,
  report: FileText,
  assessment: ClipboardCheck,
  data: Database,
  indicator: BarChart3,
  user: UserCheck,
  project: FolderPlus,
};

const iconColorMap: Record<string, string> = {
  alert: "text-danger",
  report: "text-info",
  assessment: "text-warning",
  data: "text-success",
  indicator: "text-primary",
  user: "text-muted-foreground",
  project: "text-success",
};

export function ActivityFeed() {
  return (
    <div className="card-surface divide-y">
      {mockActivityFeed.map((item) => {
        const Icon = iconMap[item.icon] || BarChart3;
        return (
          <div key={item.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-secondary/30 transition-colors">
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconColorMap[item.icon] || "text-muted-foreground"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{item.text}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.project} · {item.timestamp}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
