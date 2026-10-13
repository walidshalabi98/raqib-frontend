import { useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2 } from "lucide-react";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useResetPasswordWithLink } from "@/hooks/useAccount";
import type { AppLanguage } from "@/i18n";
import {
  MAX_PASSWORD_LENGTH,
  MIN_DISTINCT_CHARACTERS,
  MIN_PASSWORD_LENGTH,
  NEW_PASSWORD_FAILURES,
  passwordFailure,
  resetPasswordSchema,
  type PasswordFailure,
  type ResetPasswordValues,
} from "@/lib/passwordPolicy";
import { browserLanguage, isPlausibleResetToken, readAuthRouteState, type AuthRouteState } from "@/lib/signIn";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import { PasswordPolicyHint } from "@/components/auth/PasswordPolicyHint";
import { Button } from "@/components/ui/button";

/**
 * /reset-password?token=… (the link in the password-reset email; no sign-in). The token is moved out of
 * the address bar into this history entry's state at once, so it does not stay in the browser's history
 * or on screen, and a reload still works. New password + confirmation, with the policy shown; success
 * goes to the sign-in screen with a notice (ending any session this browser had, which may be another
 * account's: the notice must be seen, and the old session is over anyway). A missing, invalid or expired link
 * says so and offers a new one (or the organisation's admin); when the server refuses the link, the focus moves
 * to the new heading.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeState = readAuthRouteState(location.state);
  const urlToken = searchParams.get("token");
  const token = urlToken ?? routeState.resetToken ?? "";
  const [lang, setLang] = useState<AppLanguage>(() => routeState.lang ?? browserLanguage());
  const { t } = useTranslation(undefined, { lng: lang });
  const baseId = useId();
  const [linkRefused, setLinkRefused] = useState(false);
  const [formFailure, setFormFailure] = useState<PasswordFailure | null>(null);
  const reset = useResetPasswordWithLink();
  const auth = useOptionalAuth();

  useEffect(() => {
    if (urlToken === null) return;
    const state: AuthRouteState = { ...readAuthRouteState(location.state), resetToken: urlToken };
    navigate({ pathname: location.pathname, search: "", hash: location.hash }, { replace: true, state });
  }, [urlToken, location.pathname, location.hash, location.state, navigate]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitted },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
    shouldFocusError: true,
  });

  const invalidLink = linkRefused || !isPlausibleResetToken(token);

  const onSubmit = (values: ResetPasswordValues) => {
    setFormFailure(null);
    reset.mutate(
      { token, newPassword: values.newPassword },
      {
        onSuccess: () => {
          if (auth?.isAuthenticated) auth.endSession();
          navigate("/", { replace: true, state: { notice: "passwordReset", lang } satisfies AuthRouteState });
        },
        onError: (err) => {
          const failure = passwordFailure(err, "reset");
          if (failure === "invalidLink") setLinkRefused(true);
          else if (NEW_PASSWORD_FAILURES.includes(failure)) setError("newPassword", { message: failure }, { shouldFocus: true });
          else setFormFailure(failure);
        },
      },
    );
  };

  if (invalidLink) {
    return (
      <AuthLayout lang={lang} onLangChange={setLang} title={t("resetPassword.invalidTitle")} focusHeading={linkRefused}>
        <div className="space-y-4">
          <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{t("resetPassword.invalidBody")}</span>
          </p>
          <Button asChild className="min-h-11 w-full">
            <Link to="/" state={{ mode: "forgot", lang } satisfies AuthRouteState}>
              {t("resetPassword.requestNew")}
            </Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 w-full">
            <Link to="/" state={{ lang } satisfies AuthRouteState}>
              {t("resetPassword.backToSignIn")}
            </Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const fid = (name: keyof ResetPasswordValues) => `${baseId}-${name}`;
  const hintId = `${baseId}-policy`;
  const errorText = (name: keyof ResetPasswordValues) => {
    const key = errors[name]?.message;
    return key ? t(`password.errors.${key}`, { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH, distinct: MIN_DISTINCT_CHARACTERS }) : undefined;
  };
  const hasErrors = isSubmitted && Object.keys(errors).length > 0;

  return (
    <AuthLayout lang={lang} onLangChange={setLang} title={t("resetPassword.title")}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("resetPassword.intro")}</p>
        {(hasErrors || formFailure) && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm font-medium">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{t(formFailure ? `password.errors.${formFailure}` : "password.errors.summary")}</span>
          </p>
        )}
        <PasswordField
          lang={lang}
          id={fid("newPassword")}
          label={t("resetPassword.newPassword")}
          autoComplete="new-password"
          hintId={hintId}
          error={errorText("newPassword")}
          {...register("newPassword")}
        />
        <PasswordPolicyHint id={hintId} lang={lang} />
        <PasswordField
          lang={lang}
          id={fid("confirmPassword")}
          label={t("resetPassword.confirmPassword")}
          autoComplete="new-password"
          error={errorText("confirmPassword")}
          {...register("confirmPassword")}
        />
        <Button type="submit" className="min-h-11 w-full rounded-lg" disabled={reset.isPending}>
          {reset.isPending ? (
            <>
              <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />
              {t("resetPassword.submitting")}
            </>
          ) : (
            t("resetPassword.submit")
          )}
        </Button>
        <p className="text-center text-sm">
          <Link to="/" state={{ lang } satisfies AuthRouteState} className="inline-flex min-h-11 items-center px-2 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("resetPassword.backToSignIn")}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
