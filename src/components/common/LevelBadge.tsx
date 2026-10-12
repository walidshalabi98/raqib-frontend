import type { IndicatorLevel } from "@/types/api";

const levelStyles: Record<IndicatorLevel, string> = {
  impact: "bg-foreground text-card",
  outcome: "bg-primary text-primary-foreground",
  output: "bg-secondary text-secondary-foreground",
  activity: "bg-muted text-muted-foreground",
};

/** Level badge; pass `label` to show a translated level name (defaults to the level key). */
export function LevelBadge({ level, label }: { level: IndicatorLevel; label?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide [&:lang(ar)]:normal-case ${levelStyles[level] ?? levelStyles.activity}`}>
      {label ?? level}
    </span>
  );
}
