import type { TFunction } from "i18next";

/**
 * An error from the Raqib API with the HTTP status of the response
 * (undefined when no response arrived, e.g. offline). Kept outside
 * src/services/api.ts so screens can read the status without importing the client.
 */
export class ApiError extends Error {
  readonly status?: number;
  /** The API's stable reason code, when it sends one (e.g. `password_too_short`), for screens to explain in EN/AR. */
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** The API's reason code of a failed call (`{ message, code }`), or undefined. */
export function errorCodeOf(err: unknown): string | undefined {
  const code = err instanceof ApiError ? err.code : (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code : undefined;
}

/** The HTTP status of a failed API call, or undefined when it is unknown. */
export function httpStatusOf(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/** True when the server refused the action because of the user's role (HTTP 403). */
export function isForbidden(err: unknown): boolean {
  return httpStatusOf(err) === 403;
}

/**
 * The message for a failed action, in the language of `t`: errors.forbidden for a 403 (never the
 * server's "Insufficient permissions"), otherwise the error's own message, otherwise `fallbackKey`.
 */
export function apiErrorText(t: TFunction, err: unknown, fallbackKey: string): string {
  if (isForbidden(err)) return t("errors.forbidden");
  if (err instanceof Error && err.message) return err.message;
  return t(fallbackKey);
}

type ErrorTranslator = (key: string, lng?: string) => string;

let translateError: ErrorTranslator | null = null;

/**
 * Registered by src/i18n once the translations are loaded. errorMessage (src/lib/utils.ts) uses
 * it, so the translations stay out of the main bundle (utils.ts is loaded on every screen).
 */
export function setErrorTranslator(translator: ErrorTranslator | null): void {
  translateError = translator;
}

/** errors.forbidden in `lng` (the current language when omitted), or undefined before the translations are loaded. */
export function forbiddenText(lng?: string): string | undefined {
  return translateError?.("errors.forbidden", lng) || undefined;
}
