import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldMessage } from "@/components/common/FieldMessage";

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id" | "autoComplete"> {
  id: string;
  label: string;
  /** The language of the show/hide button's label. */
  lang: AppLanguage;
  /** current-password for the password in use; new-password for a new one (password managers offer to save it). */
  autoComplete: "current-password" | "new-password";
  /** The field's error message, announced and linked with aria-describedby. */
  error?: string;
  /** The id of a hint the field also points at (the password policy). */
  hintId?: string;
}

/**
 * A labelled password input with its error message, for the sign-in, reset and change-password forms, and a
 * "Show password" toggle (44 px target, aria-pressed), so a 16-character temporary password can be checked
 * while it is typed on a phone.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(({ id, label, lang, error, hintId, ...input }, ref) => {
  const { t } = useTranslation(undefined, { lng: lang });
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, `${id}-error`].filter(Boolean).join(" ")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="rounded-lg pe-12"
          {...input}
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-controls={id}
          aria-label={t("password.show")}
          title={t("password.show")}
          onClick={() => setVisible((shown) => !shown)}
          className="absolute end-0 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
      <FieldMessage id={`${id}-error`} message={error} />
    </div>
  );
});
PasswordField.displayName = "PasswordField";
