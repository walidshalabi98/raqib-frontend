import { useMemo } from "react";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { can as roleCan, isUserRole, type Capability } from "@/lib/permissions";
import type { UserRole } from "@/types/api";

export interface Permissions {
  /** The signed-in user's role, or undefined when signed out or unknown. */
  role: UserRole | undefined;
  /** Whether the signed-in user may use `capability` (false for an unknown or missing role). */
  can: (capability: Capability) => boolean;
  /** True when the user cannot change project data (donor viewers, unknown roles). */
  readOnly: boolean;
}

/**
 * The signed-in user's permissions (src/lib/permissions.ts). The role is the auth context's, which
 * follows the current access token (src/lib/session.ts), so it changes with the next token refresh
 * after an admin changes it. Outside AuthProvider, or with a missing or unknown role, everything is
 * denied (the donor view). Pages call this and pass props down; components stay role-free.
 */
export function usePermissions(): Permissions {
  const stored = useOptionalAuth()?.user?.role;
  const role = isUserRole(stored) ? stored : undefined;
  return useMemo(() => {
    const allowed = (capability: Capability) => roleCan(role, capability);
    return { role, can: allowed, readOnly: !allowed("project.edit") };
  }, [role]);
}
