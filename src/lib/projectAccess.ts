import { can as roleCan, isProjectWrite, STAFF_ROLES, isUserRole, type Capability } from "@/lib/permissions";
import type { ProjectStatus } from "@/types/api";

/**
 * What the signed-in user may do on one project: the role matrix (src/lib/permissions.ts) and the project's
 * state together. An archived project is read-only for everyone: the server answers every write to it with
 * 409 `project_archived` until an org admin restores it (owner decision of 13 October 2026), so the project
 * page and its tabs take every write control from here, never from ad-hoc status checks. Pure functions only.
 */
export interface ProjectAccess {
  /** The project is archived: hidden from the active list, read-only until restored. */
  archived: boolean;
  /** Who the API answers: org staff get every record, everyone else the donor shape. Archiving changes nothing here. */
  audience: "staff" | "donor";
  /** The user may change this project's data now (a staff role and the project is not archived). */
  writable: boolean;
  /** `capability` for this user on this project: write capabilities are off while the project is archived. */
  can: (capability: Capability) => boolean;
}

/** True for a project whose status is `archived`. */
export function isArchivedProject(project: { status?: ProjectStatus | string | null } | null | undefined): boolean {
  return project?.status === "archived";
}

/** The access of `role` to `project`. Unknown, empty or missing roles get the donor view and no capabilities. */
export function projectAccess(
  role: string | null | undefined,
  project: { status?: ProjectStatus | string | null } | null | undefined,
): ProjectAccess {
  const archived = isArchivedProject(project);
  const staff = isUserRole(role) && STAFF_ROLES.includes(role);
  const allowed = (capability: Capability) => roleCan(role, capability) && !(archived && isProjectWrite(capability));
  return {
    archived,
    audience: staff ? "staff" : "donor",
    writable: allowed("project.edit"),
    can: allowed,
  };
}
