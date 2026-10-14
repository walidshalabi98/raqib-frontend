import { useId, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { dirFor, type AppLanguage } from "@/i18n";
import { useInviteUser, type InviteOutcome } from "@/hooks/useUsers";
import { httpStatusOf, isForbidden } from "@/lib/apiError";
import { isEmailEnabled } from "@/lib/features";
import { INVITE_ROLES, emptyInviteForm, inviteFormToPayload, inviteUserSchema, type InviteUserValues } from "@/lib/userForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/common/NativeSelect";
import { FieldMessage } from "@/components/common/FieldMessage";

/**
 * Invite user (org admins and platform admins): full name, email and role. On success the dialog closes
 * and `onInvited` gets the outcome. A temporary password (email off, or the email failed) never reaches this
 * dialog: useInviteUser hands it straight to the one-time dialog, which returns the focus to Invite user.
 */
export function InviteUserDialog({
  lang,
  onInvited,
}: {
  lang: AppLanguage;
  onInvited: (user: InviteOutcome) => void;
}) {
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const baseId = useId();
  const fid = (name: keyof InviteUserValues) => `${baseId}-${name}`;
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<"forbidden" | "failed" | null>(null);
  const invite = useInviteUser();
  const trigger = useRef<HTMLButtonElement>(null);
  // True when the one-time dialog takes over: this dialog then leaves the focus to it when it closes.
  const handedOver = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitted },
  } = useForm<InviteUserValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: emptyInviteForm(),
    shouldFocusError: true,
  });

  const close = () => {
    setOpen(false);
    setFailure(null);
    reset(emptyInviteForm());
  };

  const onSubmit = (values: InviteUserValues) => {
    setFailure(null);
    const focusTrigger = () => {
      if (!trigger.current?.isConnected) return false;
      trigger.current.focus();
      return true;
    };
    invite.mutate({ input: inviteFormToPayload(values), returnFocus: focusTrigger }, {
      onSuccess: (user) => {
        invite.reset();
        handedOver.current = user.passwordShown;
        close();
        onInvited(user);
      },
      onError: (err) => {
        if (httpStatusOf(err) === 409) setError("email", { message: "exists" }, { shouldFocus: true });
        else setFailure(isForbidden(err) ? "forbidden" : "failed");
      },
    });
  };

  const errorText = (name: keyof InviteUserValues) => {
    const key = errors[name]?.message;
    return key ? t(`settings.invite.errors.${key}`, { defaultValue: t("settings.invite.errors.summary") }) : undefined;
  };
  const a11y = (name: keyof InviteUserValues) => ({
    id: fid(name),
    "aria-describedby": `${fid(name)}-error`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-required": true,
  });
  const field = (name: keyof InviteUserValues, label: string, input: ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={fid(name)}>
        {label}
        <span aria-hidden="true" className="ms-0.5 text-destructive">*</span>
      </Label>
      {input}
      <FieldMessage id={`${fid(name)}-error`} message={errorText(name)} />
    </div>
  );
  const summary = failure ? (failure === "forbidden" ? t("errors.forbidden") : t("settings.invite.failed")) : isSubmitted && Object.keys(errors).length > 0 ? t("settings.invite.errors.summary") : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (invite.isPending) return;
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <Button ref={trigger} size="sm" className="min-h-11">
          <Plus aria-hidden="true" className="me-1 h-4 w-4" />
          {t("settings.team.invite")}
        </Button>
      </DialogTrigger>
      <DialogContent
        dir={dir}
        lang={lang}
        closeLabel={t("common.close")}
        className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-sm"
        onCloseAutoFocus={(event) => {
          if (!handedOver.current) return;
          handedOver.current = false;
          event.preventDefault();
        }}
      >
        <DirectionProvider dir={dir}>
          <DialogHeader className="text-start">
            <DialogTitle className="pe-8">{t("settings.invite.title")}</DialogTitle>
            <DialogDescription>{t(isEmailEnabled() ? "settings.invite.description" : "settings.invite.descriptionNoEmail")}</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            {summary && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm font-medium">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{summary}</span>
              </p>
            )}
            {field("fullName", t("settings.invite.fullName"), <Input {...a11y("fullName")} dir="auto" autoComplete="off" {...register("fullName")} />)}
            {field(
              "email",
              t("settings.invite.email"),
              <Input {...a11y("email")} type="email" inputMode="email" dir="ltr" autoComplete="off" spellCheck={false} className="text-start" {...register("email")} />,
            )}
            {field(
              "role",
              t("settings.invite.role"),
              <NativeSelect {...a11y("role")} {...register("role")}>
                {INVITE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`roles.${role}`)}
                  </option>
                ))}
              </NativeSelect>,
            )}
            <Button type="submit" className="min-h-11 w-full" disabled={invite.isPending}>
              {invite.isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />
                  {t("settings.invite.submitting")}
                </>
              ) : (
                t("settings.invite.submit")
              )}
            </Button>
          </form>
        </DirectionProvider>
      </DialogContent>
    </Dialog>
  );
}
