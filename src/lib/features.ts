/**
 * Build-time switches, read when called so tests can change them (vi.stubEnv).
 *
 * VITE_EMAIL_ENABLED=true once the API sends email (RESEND_API_KEY set there). While it is off, "Forgot
 * password?" says that reset by email is not available yet and to ask the organisation's admin, and the team
 * screens say that the admin hands over a temporary password.
 */
export function isEmailEnabled(): boolean {
  return String(import.meta.env.VITE_EMAIL_ENABLED ?? "").trim().toLowerCase() === "true";
}
