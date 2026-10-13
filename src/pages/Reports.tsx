import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { api } from "@/services/api";
import { dirFor } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { isForbidden } from "@/lib/apiError";
import { isolate } from "@/lib/reports";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { ReportsList } from "@/components/project/ReportsList";
import type { Project } from "@/types/api";

/**
 * Reports across the organisation's projects. Org staff see every report with its status (Draft / Published
 * to donors); org admins and platform admins publish and unpublish them. Donor viewers receive published
 * reports only. Generating a report happens in the project, which has the form.
 */
export default function Reports() {
  const { can } = usePermissions();
  const lang = useUserLanguage();
  const dir = dirFor(lang);
  const { t } = useTranslation(undefined, { lng: lang });
  const staff = can("report.generate");

  const { data: projects = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.getProjects(),
  });

  return (
    <div lang={lang} dir={dir} className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("reports.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t(staff ? "reports.pageSubtitle" : "reports.pageSubtitleReadOnly")}</p>
      </div>

      {isLoading ? (
        <div role="status" className="flex h-64 items-center justify-center">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      ) : isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">{t(isForbidden(error) ? "errors.forbidden" : "reports.projectsLoadError")}</span>
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => void refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <div className="card-surface p-8 text-center text-sm text-muted-foreground">
          {t(staff ? "reports.noProjects" : "reports.noProjectsReadOnly")}
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectReports key={project.id} project={project} staff={staff} canPublish={can("report.publish")} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectReports({ project, staff, canPublish }: { project: Pick<Project, "id" | "name">; staff: boolean; canPublish: boolean }) {
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const headingId = useId();
  const href = `/projects/${encodeURIComponent(project.id)}`;
  // The project's Reports tab, where the Generate Report form is.
  const reportsTab = `${href}?tab=reports`;

  return (
    <section aria-labelledby={headingId} className="card-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="min-w-0 text-sm font-semibold">
          <Link to={href} className="break-words transition-colors hover:text-primary">
            <span dir="auto">{project.name}</span>
          </Link>
        </h2>
        {staff && (
          <Link
            to={reportsTab}
            aria-label={t("reports.generateInProjectLabel", { project: isolate(project.name) })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {t("reports.generateInProject")}
          </Link>
        )}
      </div>
      {/* The form to generate a report is in the project; here reports are listed, and published by admins. */}
      <ReportsList projectId={project.id} canGenerate={false} canPublish={canPublish} audience={staff ? "staff" : "donor"} />
    </section>
  );
}
