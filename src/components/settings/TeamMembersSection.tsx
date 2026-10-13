import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, KeyRound, Loader2 } from "lucide-react";
import { dirFor, type AppLanguage } from "@/i18n";
import { useOrgUsers, useResetUserPassword, type InviteOutcome } from "@/hooks/useUsers";
import { isForbidden } from "@/lib/apiError";
import { isEmailEnabled } from "@/lib/features";
import { canResetPasswordOf } from "@/lib/permissions";
import { isolate } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InviteUserDialog } from "@/components/settings/InviteUserDialog";
import { preloadPasswordHandover } from "@/lib/passwordHandover";
import type { OrgUser } from "@/types/api";

/**
 * Settings → Team members (the `users.manage` capability; the page decides). Lists the organisation's
 * users, invites new ones, and lets admins reset a member's password (`canResetPasswordOf`: not their
 * own, and a platform admin's only as a platform admin), after a confirmation. A temporary password (email
 * off, or the email failed) goes from the request straight to the one-time dialog above the routes
 * (src/hooks/useUsers.ts, PasswordHandoverProvider); this screen never holds it.
 */
export function TeamMembersSection({
  lang,
  currentUser,
}: {
  lang: AppLanguage;
  currentUser: { id: string; role: string } | null;
}) {
  const { t } = useTranslation(undefined, { lng: lang });
  const dir = dirFor(lang);
  const headingId = useId();
  const users = useOrgUsers();
  const resetPassword = useResetUserPassword();
  const [pendingReset, setPendingReset] = useState<OrgUser | null>(null);
  // The row button that started a reset gets the focus back (after the confirmation, or the one-time dialog).
  const opener = useRef<HTMLElement | null>(null);
  // True while the one-time dialog takes over from the confirmation: the confirmation then leaves the focus to it.
  const handedOver = useRef(false);

  // The one-time dialog's code is loaded now, so a temporary password never waits for the network.
  useEffect(() => preloadPasswordHandover(), []);

  /** Focuses `target` when it is still on screen; false when the admin has left Settings. */
  const focusIfConnected = (target: HTMLElement | null) => {
    if (!target?.isConnected) return false;
    target.focus();
    return true;
  };

  const onInvited = (user: InviteOutcome) => {
    if (user.passwordShown) return;
    const name = isolate(user.fullName);
    if (user.emailSent) toast.success(t("settings.invite.emailSent", { name }));
    else toast.error(t("settings.invite.noPassword", { name }));
  };

  const confirmReset = () => {
    const member = pendingReset;
    if (!member) return;
    const rowButton = opener.current;
    resetPassword.mutate({ member, returnFocus: () => focusIfConnected(rowButton) }, {
      onSuccess: (result) => {
        resetPassword.reset();
        handedOver.current = result.passwordShown;
        setPendingReset(null);
        if (result.passwordShown) return;
        const name = isolate(member.fullName);
        if (result.emailSent) toast.success(t("settings.resetUser.emailSent", { name }));
        else toast.error(t("settings.resetUser.noPassword", { name }));
      },
      onError: (err) => {
        setPendingReset(null);
        toast.error(isForbidden(err) ? t("errors.forbidden") : t("settings.resetUser.failed"));
      },
    });
  };

  const list = users.data ?? [];
  const roleBadge = (role: string) => (
    <span className="whitespace-nowrap rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
      {t(`roles.${role}`, { defaultValue: role })}
    </span>
  );

  return (
    <section aria-labelledby={headingId} className="card-surface space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          {t("settings.team.heading")}
        </h2>
        <InviteUserDialog lang={lang} onInvited={onInvited} />
      </div>

      {users.isLoading ? (
        <div role="status" className="flex justify-center p-4">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      ) : users.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">{t(isForbidden(users.error) ? "errors.forbidden" : "settings.team.loadError")}</span>
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => void users.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">{t("settings.team.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th scope="col" className="px-3 py-3 text-start font-medium text-muted-foreground sm:px-4">{t("settings.team.name")}</th>
                <th scope="col" className="hidden px-3 py-3 text-start font-medium text-muted-foreground sm:table-cell sm:px-4">{t("settings.team.role")}</th>
                <th scope="col" className="px-3 py-3 text-end font-medium text-muted-foreground sm:px-4">{t("settings.team.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((member) => {
                const self = member.id === currentUser?.id;
                return (
                  <tr key={member.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-3 sm:px-4">
                      <span className="block break-words font-medium">
                        <span dir="auto">{member.fullName}</span>
                        {self && <span className="ms-1 text-xs font-normal text-muted-foreground">{t("settings.team.you")}</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        <span dir="ltr">{member.email}</span>
                      </span>
                      {/* On phones the role goes under the name; wider screens have a Role column. */}
                      <span className="mt-1 inline-block sm:hidden">{roleBadge(member.role)}</span>
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell sm:px-4">{roleBadge(member.role)}</td>
                    <td className="px-3 py-3 text-end sm:px-4">
                      {canResetPasswordOf(currentUser, member) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          // The label stays visible on phones too (it wraps), so the action is clear without a tooltip.
                          className="h-auto min-h-11 min-w-11 whitespace-normal text-start"
                          aria-label={t("settings.team.resetPasswordFor", { name: isolate(member.fullName) })}
                          onClick={(event) => {
                            opener.current = event.currentTarget;
                            setPendingReset(member);
                          }}
                        >
                          <KeyRound aria-hidden="true" className="me-1.5 h-4 w-4 shrink-0" />
                          <span>{t("settings.team.resetPassword")}</span>
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog
        open={pendingReset !== null}
        onOpenChange={(next) => {
          if (!next && !resetPassword.isPending) setPendingReset(null);
        }}
      >
        <AlertDialogContent
          dir={dir}
          lang={lang}
          className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md"
          onCloseAutoFocus={(event) => {
            // Radix returns focus to a Trigger only. When the one-time dialog follows, it returns the focus later.
            event.preventDefault();
            if (handedOver.current) handedOver.current = false;
            else focusIfConnected(opener.current);
          }}
        >
          {pendingReset && (
            <>
              <AlertDialogHeader className="text-start">
                <AlertDialogTitle>{t("settings.resetUser.title", { name: isolate(pendingReset.fullName) })}</AlertDialogTitle>
                <AlertDialogDescription>{t(isEmailEnabled() ? "settings.resetUser.body" : "settings.resetUser.bodyNoEmail")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11" disabled={resetPassword.isPending}>
                  {t("common.cancel")}
                </AlertDialogCancel>
                <Button className="min-h-11" disabled={resetPassword.isPending} onClick={confirmReset}>
                  {resetPassword.isPending && <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />}
                  {t(resetPassword.isPending ? "settings.resetUser.submitting" : "settings.resetUser.confirm")}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

    </section>
  );
}
