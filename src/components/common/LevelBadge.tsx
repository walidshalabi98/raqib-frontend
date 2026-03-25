import { IndicatorLevel } from "@/data/mockData";

const levelStyles: Record<IndicatorLevel, string> = {
  impact: "bg-foreground text-card",
  outcome: "bg-primary text-primary-foreground",
  output: "bg-secondary text-secondary-foreground",
  activity: "bg-muted text-muted-foreground",
};

export function LevelBadge({ level }: { level: IndicatorLevel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${levelStyles[level]}`}>
      {level}
    </span>
  );
}
