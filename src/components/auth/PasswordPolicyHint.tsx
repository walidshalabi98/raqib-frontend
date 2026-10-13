import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import { MIN_DISTINCT_CHARACTERS, MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy";

/** The password rules (src/lib/passwordPolicy.ts), shown next to a new-password field, which points at `id`. */
export function PasswordPolicyHint({ id, lang }: { id: string; lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <div id={id} className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <p className="font-medium text-foreground">{t("password.policyTitle")}</p>
        <ul className="mt-1 list-disc space-y-0.5 ps-4">
          <li>{t("password.ruleLength", { min: MIN_PASSWORD_LENGTH })}</li>
          <li>{t("password.ruleDifferent")}</li>
          <li>{t("password.ruleEmail")}</li>
          <li>{t("password.ruleSimple", { distinct: MIN_DISTINCT_CHARACTERS })}</li>
          <li>{t("password.ruleCommon")}</li>
        </ul>
      </div>
    </div>
  );
}
