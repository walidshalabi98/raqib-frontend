import { useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import { useChangePassword } from "@/hooks/useAccount";
import {
  MAX_PASSWORD_LENGTH,
  MIN_DISTINCT_CHARACTERS,
  MIN_PASSWORD_LENGTH,
  NEW_PASSWORD_FAILURES,
  changePasswordSchema,
  passwordFailure,
  type ChangePasswordValues,
  type PasswordFailure,
} from "@/lib/passwordPolicy";
import { PasswordField } from "@/components/auth/PasswordField";
import { PasswordPolicyHint } from "@/components/auth/PasswordPolicyHint";
import { Button } from "@/components/ui/button";

const EMPTY: ChangePasswordValues = { currentPassword: "", newPassword: "", confirmPassword: "" };

/**
 * Settings → Change password, for every role: current, new and confirmation, checked against the policy
 * (src/lib/passwordPolicy.ts) before sending, with the server's refusals shown on the field they concern.
 * Success shows a toast and empties the form; the server ends the account's other sessions and this one
 * continues with the new token pair (src/services/api.ts). Invited users change their temporary password here.
 */
export function ChangePasswordSection({
  lang,
  email,
  organizationName,
}: {
  lang: AppLanguage;
  email: string | null | undefined;
  organizationName?: string | null;
}) {
  const { t } = useTranslation(undefined, { lng: lang });
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const hintId = `${baseId}-policy`;
  const fid = (name: keyof ChangePasswordValues) => `${baseId}-${name}`;
  const [formFailure, setFormFailure] = useState<PasswordFailure | null>(null);
  const change = useChangePassword();
  const schema = useMemo(() => changePasswordSchema({ email, organizationName }), [email, organizationName]);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitted },
  } = useForm<ChangePasswordValues>({ resolver: zodResolver(schema), defaultValues: EMPTY, shouldFocusError: true });

  const onSubmit = (values: ChangePasswordValues) => {
    setFormFailure(null);
    change.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          reset(EMPTY);
          toast.success(t("settings.changePassword.success"));
        },
        onError: (err) => {
          const failure = passwordFailure(err, "change");
          if (failure === "currentWrong") setError("currentPassword", { message: failure }, { shouldFocus: true });
          else if (NEW_PASSWORD_FAILURES.includes(failure)) setError("newPassword", { message: failure }, { shouldFocus: true });
          else setFormFailure(failure);
        },
      },
    );
  };

  const errorText = (name: keyof ChangePasswordValues) => {
    const key = errors[name]?.message;
    return key ? t(`password.errors.${key}`, { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH, distinct: MIN_DISTINCT_CHARACTERS }) : undefined;
  };
  const summary = formFailure
    ? t(`password.errors.${formFailure}`)
    : isSubmitted && Object.keys(errors).length > 0
      ? t("password.errors.summary")
      : "";

  return (
    <section aria-labelledby={headingId} className="card-surface space-y-4 p-4 sm:p-6">
      <div>
        <h2 id={headingId} className="text-base font-semibold">
          {t("settings.changePassword.heading")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("settings.changePassword.intro")}</p>
      </div>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
        {/* Tells password managers which account the new password belongs to. */}
        {email && <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />}
        {summary && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm font-medium">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{summary}</span>
          </p>
        )}
        <PasswordField
          lang={lang}
          id={fid("currentPassword")}
          label={t("settings.changePassword.current")}
          autoComplete="current-password"
          error={errorText("currentPassword")}
          {...register("currentPassword")}
        />
        <PasswordField
          lang={lang}
          id={fid("newPassword")}
          label={t("settings.changePassword.new")}
          autoComplete="new-password"
          hintId={hintId}
          error={errorText("newPassword")}
          {...register("newPassword")}
        />
        <PasswordPolicyHint id={hintId} lang={lang} />
        <PasswordField
          lang={lang}
          id={fid("confirmPassword")}
          label={t("settings.changePassword.confirm")}
          autoComplete="new-password"
          error={errorText("confirmPassword")}
          {...register("confirmPassword")}
        />
        <Button type="submit" className="min-h-11" disabled={change.isPending}>
          {change.isPending ? (
            <>
              <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />
              {t("settings.changePassword.submitting")}
            </>
          ) : (
            t("settings.changePassword.submit")
          )}
        </Button>
      </form>
    </section>
  );
}
