import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { projectAccess, type ProjectAccess } from "@/lib/projectAccess";
import type { ProjectStatus } from "@/types/api";

/**
 * The signed-in user's access to one project (src/lib/projectAccess.ts): the role's capabilities, with every
 * write off while the project is archived. The project page derives every child's props from this one flag
 * set, so archiving a project turns the whole page read-only at once.
 */
export function useProjectAccess(project: { status?: ProjectStatus | string | null } | null | undefined): ProjectAccess {
  const { role } = usePermissions();
  const status = project?.status;
  return useMemo(() => projectAccess(role, { status }), [role, status]);
}
