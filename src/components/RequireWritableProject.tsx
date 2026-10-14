import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useProject } from "@/hooks/useProjects";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { isArchivedProject } from "@/lib/projectAccess";

/**
 * Renders a screen that changes the project in the route's `:id` (the AI framework wizard) only while the project
 * is not archived; an archived project sends the user back to its page, which says it is read-only. The server
 * refuses the writes anyway (409 `project_archived`). If the project cannot be loaded, the screen shows its own
 * errors.
 */
export function RequireWritableProject({ children }: { children: ReactNode }) {
  const { id } = useParams();
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const { data: project, isLoading } = useProject(id);

  if (isLoading) {
    return (
      <div role="status" className="flex h-64 items-center justify-center">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
        <span lang={lang} className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }
  if (id && isArchivedProject(project)) return <Navigate replace to={`/projects/${encodeURIComponent(id)}`} />;
  return <>{children}</>;
}
