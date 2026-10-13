import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { forbiddenText, isForbidden } from "@/lib/apiError";
import type { AppLanguage } from "@/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Human-readable message from an unknown thrown value. A 403 becomes errors.forbidden in `lng`
 * (English when omitted), so no screen shows the server's "Insufficient permissions".
 */
export function errorMessage(err: unknown, fallback: string, lng?: AppLanguage): string {
  if (isForbidden(err)) {
    const forbidden = forbiddenText(lng);
    if (forbidden) return forbidden;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}
