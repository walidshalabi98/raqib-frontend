import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type AppLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * EN/AR switch for one screen or dialog. Each button names its language in
 * that language ("English", "العربية") and shows its state with aria-pressed.
 * `size="lg"` gives 44 × 44 px touch targets (UX_STANDARDS §7), for screens
 * where it is the only language control (sign-in, reset password).
 */
export function LanguageToggle({
  value,
  onChange,
  className,
  size = "sm",
}: {
  value: AppLanguage;
  onChange: (lang: AppLanguage) => void;
  className?: string;
  size?: "sm" | "lg";
}) {
  const { t } = useTranslation(undefined, { lng: value });
  return (
    <div role="group" aria-label={t("language.switcher")} className={cn("inline-flex items-center gap-1", className)}>
      <Languages aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      <div className="inline-flex overflow-hidden rounded-md border">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            lang={lang}
            aria-pressed={value === lang}
            onClick={() => onChange(lang)}
            className={cn(
              size === "lg" ? "min-h-11 min-w-11 px-3 py-2 text-sm" : "min-h-8 px-2.5 py-1 text-xs",
              "font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === lang ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary",
            )}
          >
            {t(`language.${lang}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
