import { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  dotColor?: string;
}

export function MetricCard({ label, value, icon, dotColor }: MetricCardProps) {
  return (
    <div className="card-surface p-5 flex flex-col gap-2 hover:border-border-strong transition-colors">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        {dotColor && <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />}
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}
