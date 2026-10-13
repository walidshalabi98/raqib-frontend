import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { dirFor, type AppLanguage } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorText } from "@/lib/apiError";
import { useDocumentHead } from "@/lib/documentHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChangePasswordSection } from "@/components/settings/ChangePasswordSection";
import { TeamMembersSection } from "@/components/settings/TeamMembersSection";

const NOTIFICATIONS = ["offTrack", "assessment", "report", "digest"] as const;

/**
 * Settings. Every role changes their own password here. Org admins and platform admins also edit the
 * organisation (`org.manage`) and manage the team (`users.manage`): invite users and reset a member's
 * password, with the temporary password shown once while email is off.
 */
export default function SettingsPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  // The page title only: <html lang dir> stays English until every signed-in screen is translated (Phase 6).
  useDocumentHead({ screen: t("settings.title") });

  return (
    <div lang={lang} dir={dirFor(lang)} className="max-w-3xl space-y-8 animate-fade-in">
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
      {can("org.manage") && <OrganisationSection lang={lang} />}
      {can("users.manage") && <TeamMembersSection lang={lang} currentUser={user ? { id: user.id, role: user.role } : null} />}
      <ChangePasswordSection lang={lang} email={user?.email} organizationName={user?.organization?.name} />
      <NotificationsSection lang={lang} />
    </div>
  );
}

function OrganisationSection({ lang }: { lang: AppLanguage }) {
  const { user } = useAuth();
  const { t } = useTranslation(undefined, { lng: lang });
  const baseId = useId();
  const [orgName, setOrgName] = useState(user?.organization?.name ?? "");
  const [saving, setSaving] = useState(false);

  const handleSaveOrg = async () => {
    if (!user?.organization?.id) return;
    setSaving(true);
    try {
      await api.updateOrganization(user.organization.id, { name: orgName });
      toast.success(t("settings.organisation.saved"));
    } catch (err) {
      toast.error(apiErrorText(t, err, "settings.organisation.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${baseId}-heading`} className="card-surface space-y-4 p-4 sm:p-6">
      <h2 id={`${baseId}-heading`} className="text-base font-semibold">
        {t("settings.organisation.heading")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-name`}>{t("settings.organisation.name")}</Label>
          <Input id={`${baseId}-name`} dir="auto" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-email`}>{t("settings.organisation.contactEmail")}</Label>
          <Input id={`${baseId}-email`} dir="ltr" value={user?.email || ""} readOnly className="rounded-lg text-start" />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">{t("settings.organisation.logo")}</p>
        <div className="card-surface mt-1.5 border-2 border-dashed p-4 text-center">
          <Upload aria-hidden="true" className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{t("settings.organisation.logoUpload")}</p>
        </div>
      </div>
      <Button size="sm" className="min-h-11" onClick={() => void handleSaveOrg()} disabled={saving}>
        {saving ? (
          <>
            <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />
            {t("settings.organisation.saving")}
          </>
        ) : (
          t("settings.organisation.save")
        )}
      </Button>
    </section>
  );
}

function NotificationsSection({ lang }: { lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const baseId = useId();
  return (
    <section aria-labelledby={`${baseId}-heading`} className="card-surface space-y-4 p-4 sm:p-6">
      <h2 id={`${baseId}-heading`} className="text-base font-semibold">
        {t("settings.notifications.heading")}
      </h2>
      <div className="space-y-3">
        {NOTIFICATIONS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-4 py-2">
            <Label htmlFor={`${baseId}-${key}`} className="text-sm font-normal">
              {t(`settings.notifications.${key}`)}
            </Label>
            <Switch id={`${baseId}-${key}`} defaultChecked />
          </div>
        ))}
      </div>
    </section>
  );
}
