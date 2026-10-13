import { httpStatusOf } from "@/lib/apiError";

/**
 * Helpers for the screens before sign-in (src/pages/Login.tsx and ResetPassword.tsx). Pure functions;
 * no translations are imported here, so the main bundle stays small.
 */

export type PublicLanguage = "en" | "ar";

/**
 * What the sign-in screens pass each other in the router's history state (never in the address):
 * the language chosen, "forgot" to open the Forgot password form, the notice after a reset, and the
 * reset link's token once it is moved out of the address bar.
 */
export interface AuthRouteState {
  lang?: PublicLanguage;
  mode?: "forgot";
  notice?: "passwordReset";
  resetToken?: string;
}

/** The known fields of a history state; anything else (or a wrong type) is dropped. */
export function readAuthRouteState(state: unknown): AuthRouteState {
  if (!state || typeof state !== "object") return {};
  const s = state as Record<string, unknown>;
  const out: AuthRouteState = {};
  if (s.lang === "en" || s.lang === "ar") out.lang = s.lang;
  if (s.mode === "forgot") out.mode = "forgot";
  if (s.notice === "passwordReset") out.notice = "passwordReset";
  if (typeof s.resetToken === "string" && s.resetToken) out.resetToken = s.resetToken;
  return out;
}

/** Arabic when the browser's first preferred language is Arabic, otherwise English. */
export function browserLanguage(languages: readonly string[] | undefined = globalThis.navigator?.languages): PublicLanguage {
  const first = languages?.[0] ?? globalThis.navigator?.language ?? "";
  return first.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/** A reset token worth sending: present, one piece of text, and not absurdly long. The server decides the rest. */
export function isPlausibleResetToken(token: string | null | undefined): token is string {
  return typeof token === "string" && token.length > 0 && token.length <= 4096 && !/\s/.test(token);
}

/** The message key for a failed sign-in. The server's own text is not shown (it is English only). */
export function signInErrorKey(err: unknown): string {
  const status = httpStatusOf(err);
  if (status === 401 || status === 400) return "auth.signIn.invalid";
  if (status === 429) return "auth.signIn.tooManyAttempts";
  if (status === undefined && err instanceof Error) return "auth.signIn.offline";
  return "auth.signIn.failed";
}

/**
 * The outcome of "Send reset link". The server answers the same whether or not the account exists, and
 * the screen keeps that: any answer from the server shows the same generic message, so the screen never
 * tells who has an account. Only "wait" (429, which applies to everyone) and "no answer" differ.
 */
export function forgotPasswordOutcome(err: unknown): "sent" | "tooManyAttempts" | "offline" {
  const status = httpStatusOf(err);
  if (status === 429) return "tooManyAttempts";
  if (status === undefined && err instanceof Error) return "offline";
  return "sent";
}
