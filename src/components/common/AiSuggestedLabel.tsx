import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

export interface AiSuggestedLabelProps {
  lang: AppLanguage;
  /** For aria-describedby (one label per suggestion list; the cards point to it). */
  id?: string;
  /** inline: small badge (cards, rows); banner: full-width note (dialogs). Default inline. */
  variant?: "inline" | "banner";
}

/**
 * "AI suggested — review before approval": the label AI content carries until an org admin approves it
 * (raqib-frontend CLAUDE.md rule 5; design section 9.3). Text + icon, not colour alone.
 */
export function AiSuggestedLabel({ lang, id, variant = "inline" }: AiSuggestedLabelProps) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <p
      id={id}
      role="note"
      lang={lang}
      className={cn(
        "items-center rounded-md border border-warning/40 bg-warning/10 font-medium",
        variant === "banner" ? "flex gap-2 px-3 py-2 text-sm" : "inline-flex gap-1.5 px-2 py-0.5 text-xs",
      )}
    >
      <Sparkles aria-hidden="true" className={cn("shrink-0", variant === "banner" ? "h-4 w-4" : "h-3.5 w-3.5")} />
      {t("ai.suggestedLabel")}
    </p>
  );
}
