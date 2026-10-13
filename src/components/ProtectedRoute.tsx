import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  // Load the translations after sign-in (outside the main bundle), so error messages such as the
  // 403 explanation are translated on screens that do not use translations themselves yet.
  useEffect(() => {
    if (isAuthenticated) void import("@/i18n");
  }, [isAuthenticated]);
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}
