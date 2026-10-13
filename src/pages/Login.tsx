import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useForgotPassword } from "@/hooks/useAccount";
import type { AppLanguage } from "@/i18n";
import { isEmailEnabled } from "@/lib/features";
import { browserLanguage, forgotPasswordOutcome, readAuthRouteState, signInErrorKey } from "@/lib/signIn";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signIn" | "forgot";

/**
 * Sign in, and "Forgot password?" on the same screen. Nothing is pre-filled. The language follows the
 * browser (or the screen that sent the user here) and can be switched. A wrong email or password shows
 * one message for both, and the Forgot password form always answers with the same generic message, so
 * neither tells who has an account. While email is off (VITE_EMAIL_ENABLED), "Forgot password?" says that
 * reset by email is not available yet and to ask the organisation's admin, instead of promising a link.
 *
 * The "password changed" notice from the reset page is shown once: it is taken from the history state and
 * the state is cleared, so a reload or Back does not show it again. It is announced (a status region that
 * fills after the screen appears) and the focus starts on the heading.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = readAuthRouteState(location.state);
  const { login, isAuthenticated } = useAuth();
  const [lang, setLang] = useState<AppLanguage>(() => routeState.lang ?? browserLanguage());
  const { t } = useTranslation(undefined, { lng: lang });
  const [mode, setMode] = useState<Mode>(routeState.mode === "forgot" ? "forgot" : "signIn");
  const [notice] = useState(routeState.notice);
  const [noticeShown, setNoticeShown] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const [missing, setMissing] = useState({ email: false, password: false });
  const [loading, setLoading] = useState(false);
  const baseId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const forgotButtonRef = useRef<HTMLButtonElement>(null);
  // True once the user has moved between the two forms (the focus then follows; not on first load).
  const [switched, setSwitched] = useState(false);

  // If already signed in, go to the dashboard (in an effect, not during render).
  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  // Show the notice once: clear it from the history entry, then fill the (already mounted) status region.
  useEffect(() => {
    if (!notice) return;
    const { notice: _shown, ...rest } = readAuthRouteState(location.state);
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: rest });
    setNoticeShown(true);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After switching between the two forms, put the focus where the user continues.
  useEffect(() => {
    if (switched && mode === "signIn") forgotButtonRef.current?.focus();
  }, [mode, switched]);

  if (isAuthenticated) return null;

  const showForgot = () => {
    setSwitched(true);
    setErrorKey("");
    setMode("forgot");
  };
  const showSignIn = () => {
    setSwitched(true);
    setMode("signIn");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const empty = { email: !email.trim(), password: !password };
    setMissing(empty);
    if (empty.email || empty.password) {
      setErrorKey("auth.signIn.required");
      (empty.email ? emailRef.current : document.getElementById(`${baseId}-password`))?.focus();
      return;
    }
    setErrorKey("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/dashboard");
    } catch (err) {
      setErrorKey(signInErrorKey(err));
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "forgot") {
    return (
      <AuthLayout lang={lang} onLangChange={setLang} title={t("auth.forgot.title")}>
        <ForgotPasswordForm lang={lang} initialEmail={email} focusOnMount={switched} onBack={showSignIn} />
      </AuthLayout>
    );
  }

  const errorId = `${baseId}-error`;
  return (
    <AuthLayout lang={lang} onLangChange={setLang} title={t("auth.signIn.title")} focusHeading={notice === "passwordReset"}>
      {notice === "passwordReset" && (
        <div role="status">
          {noticeShown && (
            <p className="mb-4 flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>{t("auth.signIn.passwordReset")}</span>
            </p>
          )}
        </div>
      )}
      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={`${baseId}-email`}>{t("auth.signIn.email")}</Label>
          <Input
            ref={emailRef}
            id={`${baseId}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            required
            aria-invalid={missing.email ? true : undefined}
            aria-describedby={errorKey ? errorId : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg text-start"
          />
        </div>
        <PasswordField
          lang={lang}
          id={`${baseId}-password`}
          name="password"
          label={t("auth.signIn.password")}
          autoComplete="current-password"
          required
          aria-invalid={missing.password ? true : undefined}
          hintId={errorKey ? errorId : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {errorKey && (
          <p id={errorId} role="alert" className="flex items-start gap-2 text-sm font-medium text-destructive">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t(errorKey)}</span>
          </p>
        )}
        <Button type="submit" className="min-h-11 w-full rounded-lg" disabled={loading}>
          {loading ? (
            <>
              <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />
              {t("auth.signIn.submitting")}
            </>
          ) : (
            t("auth.signIn.submit")
          )}
        </Button>
        <p className="text-center text-sm">
          <Button ref={forgotButtonRef} type="button" variant="link" className="min-h-11 px-2" onClick={showForgot}>
            {t("auth.signIn.forgot")}
          </Button>
        </p>
      </form>
    </AuthLayout>
  );
}

/** "Forgot password?": asks for a reset link and answers with the same message whatever the server knows. */
function ForgotPasswordForm({
  lang,
  initialEmail,
  focusOnMount,
  onBack,
}: {
  lang: AppLanguage;
  initialEmail: string;
  focusOnMount: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation(undefined, { lng: lang });
  const emailEnabled = isEmailEnabled();
  const baseId = useId();
  const [email, setEmail] = useState(initialEmail);
  const [errorKey, setErrorKey] = useState("");
  const [sent, setSent] = useState(false);
  const request = useForgotPassword();
  const emailRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const unavailableRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!focusOnMount) return;
    if (emailEnabled) emailRef.current?.focus();
    else unavailableRef.current?.focus();
  }, [focusOnMount, emailEnabled]);

  useEffect(() => {
    if (sent) backRef.current?.focus();
  }, [sent]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorKey("auth.forgot.emailRequired");
      emailRef.current?.focus();
      return;
    }
    setErrorKey("");
    request.mutate(email, {
      onSuccess: () => setSent(true),
      onError: (err) => {
        const outcome = forgotPasswordOutcome(err);
        if (outcome === "sent") setSent(true);
        else setErrorKey(outcome === "tooManyAttempts" ? "auth.signIn.tooManyAttempts" : "auth.signIn.offline");
      },
    });
  };

  const errorId = `${baseId}-error`;
  const askAdmin = (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{t("auth.forgot.askAdmin")}</span>
    </p>
  );

  // Email is off: no link can be sent, so say so instead of promising one. (The server answers the same for
  // every address either way, so this tells nobody whether an account exists.)
  if (!emailEnabled) {
    return (
      <div className="space-y-5">
        <p ref={unavailableRef} tabIndex={-1} className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{t("auth.forgot.unavailable")}</span>
        </p>
        <Button type="button" variant="outline" className="min-h-11 w-full" onClick={onBack}>
          {t("auth.forgot.back")}
        </Button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <p role="status" className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>{t("auth.forgot.sent")}</span>
        </p>
        {askAdmin}
        <Button ref={backRef} type="button" variant="outline" className="min-h-11 w-full" onClick={onBack}>
          {t("auth.forgot.back")}
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("auth.forgot.intro")}</p>
      <div className="space-y-2">
        <Label htmlFor={`${baseId}-email`}>{t("auth.forgot.email")}</Label>
        <Input
          ref={emailRef}
          id={`${baseId}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          required
          aria-invalid={errorKey === "auth.forgot.emailRequired" ? true : undefined}
          aria-describedby={errorKey ? errorId : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg text-start"
        />
      </div>
      {errorKey && (
        <p id={errorId} role="alert" className="flex items-start gap-2 text-sm font-medium text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t(errorKey)}</span>
        </p>
      )}
      <Button type="submit" className="min-h-11 w-full rounded-lg" disabled={request.isPending}>
        {request.isPending ? (
          <>
            <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />
            {t("auth.forgot.submitting")}
          </>
        ) : (
          t("auth.forgot.submit")
        )}
      </Button>
      {askAdmin}
      <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={onBack}>
        {t("auth.forgot.back")}
      </Button>
    </form>
  );
}
