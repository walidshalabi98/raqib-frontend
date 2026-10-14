import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import type { QualityBand } from "@/types/api";
import { cn } from "@/lib/utils";

export interface QualityBadgeProps {
  score: number;
  band: QualityBand;
  lang: AppLanguage;
}

const BAND_STYLE: Record<QualityBand, { icon: LucideIcon; tint: string; iconTint: string }> = {
  strong: { icon: CheckCircle2, tint: "border-success/40 bg-success/10", iconTint: "text-success" },
  review: { icon: AlertCircle, tint: "border-warning/40 bg-warning/10", iconTint: "text-warning" },
  weak: { icon: XCircle, tint: "border-destructive/40 bg-destructive/10", iconTint: "text-destructive" },
};

/**
 * Quality of a suggested or existing indicator (knowledge/kpi-assistant-spec.md §A4 step 3, §A7; design 9.3):
 * icon + text + score ("Quality: Strong (100/100)"); the band only tints the border, background and icon, the text
 * stays in the foreground colour (contrast; status never by colour alone).
 */
export function QualityBadge({ score, band, lang }: QualityBadgeProps) {
  const { t } = useTranslation(undefined, { lng: lang });
  const style = BAND_STYLE[band] ?? BAND_STYLE.review;
  const Icon = style.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-foreground", style.tint)}>
      <Icon aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", style.iconTint)} />
      {t("kpi.quality.label", { band: t(`kpi.quality.${band}`), score })}
    </span>
  );
}
