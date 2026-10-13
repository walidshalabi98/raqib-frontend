import type { ReactNode } from "react";
import { Navigate, useParams, type Params } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import type { Capability } from "@/lib/permissions";

/**
 * Renders a route only for roles with `capability`; everyone else is sent to `redirectTo`
 * (replacing the history entry). The server still refuses the actions behind the route.
 */
export function RequireCapability({
  capability,
  redirectTo,
  children,
}: {
  capability: Capability;
  redirectTo: (params: Readonly<Params<string>>) => string;
  children: ReactNode;
}) {
  const params = useParams();
  const { can } = usePermissions();
  if (!can(capability)) return <Navigate replace to={redirectTo(params)} />;
  return <>{children}</>;
}
