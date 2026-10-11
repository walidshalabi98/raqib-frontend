import { useOptionalAuth } from "@/contexts/AuthContext";
import { toAppLanguage, type AppLanguage } from "@/i18n";

/** The signed-in user's language preference (English when signed out or unknown). */
export function useUserLanguage(): AppLanguage {
  const auth = useOptionalAuth();
  return toAppLanguage(auth?.user?.languagePref);
}
