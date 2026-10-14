import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, AlertTriangle, Check, Copy } from "lucide-react";
import { dirFor, type AppLanguage } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { isolate } from "@/lib/reports";
import { groupedPassword } from "@/lib/passwordHandover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PasswordHandoverView } from "@/components/settings/PasswordHandover";

export type { PasswordHandoverView };

/**
 * Shows a temporary password once: with a copy button, the password in groups of four for reading aloud,
 * and the warning (shown only once; share it privately; ask them to change it after signing in). It cannot
 * be lost by accident: the focus starts on Copy password and stays in the dialog, a click outside and
 * Escape do not close it, and Done asks first when the password was not copied. The password lives only in
 * the handover state (PasswordHandoverProvider) and this dialog: it is not logged, cached or stored.
 */
export function TemporaryPasswordDialog({
  handover,
  lang,
  onClose,
  returnFocus,
}: {
  handover: PasswordHandoverView | null;
  lang: AppLanguage;
  onClose: () => void;
  /** Puts the focus back where the flow started; false when that element is gone. */
  returnFocus?: () => boolean;
}) {
  return (
    <AlertDialog open={handover !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        dir={dirFor(lang)}
        lang={lang}
        className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md"
        // Radix AlertDialog focuses its Cancel button, which this dialog does not have: start on Copy password.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const content = event.currentTarget;
          if (content instanceof HTMLElement) content.querySelector<HTMLElement>("[data-autofocus]")?.focus();
        }}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          if (returnFocus?.()) event.preventDefault();
        }}
      >
        {/* Keyed by the password, so a new handover starts with a fresh copy status. */}
        {handover && <HandoverContent key={handover.password} handover={handover} lang={lang} onClose={onClose} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The dialog in the signed-in user's language, for PasswordHandoverProvider (loaded on first use). */
export function TemporaryPasswordDialogHost(props: Omit<Parameters<typeof TemporaryPasswordDialog>[0], "lang">) {
  const lang = useUserLanguage();
  return <TemporaryPasswordDialog {...props} lang={lang} />;
}

function HandoverContent({ handover, lang, onClose }: { handover: PasswordHandoverView; lang: AppLanguage; onClose: () => void }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const goBackRef = useRef<HTMLButtonElement>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [confirmingClose, setConfirmingClose] = useState(false);
  const warningId = `${baseId}-warning`;
  const groupedId = `${baseId}-grouped`;
  const name = isolate(handover.name);

  useEffect(() => {
    if (confirmingClose) goBackRef.current?.focus();
  }, [confirmingClose]);

  const copyPassword = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(handover.password);
      setCopy("copied");
    } catch {
      setCopy("failed");
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const done = () => {
    if (copy === "copied") onClose();
    else setConfirmingClose(true);
  };

  return (
    <>
      <AlertDialogHeader className="text-start">
        <AlertDialogTitle>
          {t(handover.reason === "invite" ? "settings.tempPassword.titleInvite" : "settings.tempPassword.titleReset", { name })}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {handover.emailFailed && <span className="block">{t("settings.tempPassword.emailFailed")}</span>}
          {t("settings.tempPassword.intro", { name, email: isolate(handover.email) })}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor={`${baseId}-password`}>{t("settings.tempPassword.label")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={inputRef}
            id={`${baseId}-password`}
            readOnly
            value={handover.password}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${groupedId} ${warningId}`}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 font-mono text-start"
          />
          <Button ref={copyRef} data-autofocus type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => void copyPassword()}>
            <Copy aria-hidden="true" className="me-1.5 h-4 w-4" />
            {t("settings.tempPassword.copy")}
          </Button>
        </div>
        <p id={groupedId} className="text-xs text-muted-foreground">
          {t("settings.tempPassword.grouped")}{" "}
          <span dir="ltr" className="whitespace-nowrap font-mono text-sm tracking-wider text-foreground">
            {groupedPassword(handover.password)}
          </span>
        </p>
        <p aria-live="polite" className="min-h-5 text-xs">
          {copy === "copied" && (
            <span className="flex items-center gap-1.5">
              <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-success" />
              {t("settings.tempPassword.copied")}
            </span>
          )}
          {copy === "failed" && (
            <span className="flex items-start gap-1.5 text-destructive">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("settings.tempPassword.copyFailed")}
            </span>
          )}
        </p>
      </div>

      <div id={warningId} className="rounded-md border border-warning/60 bg-warning/10 p-3 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t("settings.tempPassword.warningTitle")}
        </p>
        <ul className="mt-1.5 list-disc space-y-1 ps-5">
          <li>{t("settings.tempPassword.warningOnce")}</li>
          <li>{t("settings.tempPassword.warningPrivate")}</li>
          <li>{t("settings.tempPassword.warningChange")}</li>
        </ul>
      </div>

      {confirmingClose ? (
        <div role="alert" className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
          <p className="flex items-start gap-2 text-sm font-medium">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{t("settings.tempPassword.closeConfirm")}</span>
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={goBackRef}
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setConfirmingClose(false);
                copyRef.current?.focus();
              }}
            >
              {t("settings.tempPassword.goBack")}
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={onClose}>
              {t("settings.tempPassword.closeAnyway")}
            </Button>
          </div>
        </div>
      ) : (
        <AlertDialogFooter>
          <Button type="button" className="min-h-11" onClick={done}>
            {t("settings.tempPassword.done")}
          </Button>
        </AlertDialogFooter>
      )}
    </>
  );
}
