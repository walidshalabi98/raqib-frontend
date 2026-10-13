import { z } from "zod";
import { errorCodeOf, httpStatusOf } from "@/lib/apiError";

/**
 * The password policy, the same as the server's (backend src/utils/passwordPolicy.ts, docs/SECURITY_SETUP.md
 * §9). A password is checked in its Unicode NFC form (the server hashes and compares that form too, so the same
 * Arabic text typed on another keyboard is the same password). It has MIN_PASSWORD_LENGTH to
 * MAX_PASSWORD_LENGTH characters (counted as Unicode code points, so an Arabic letter or an emoji counts once);
 * differs from the current password; does not contain the email's local part (the part before "@", and for
 * "name+tag@…" also the part before "+"); uses at least MIN_DISTINCT_CHARACTERS different characters; and is
 * not a common password (COMMON_PASSWORDS, also with digits or symbols around it) and does not contain the
 * product's or the organisation's name. The server checks every rule again; these checks only give a clear
 * message before sending. Error messages are translation keys under `password.errors`. Pure functions only;
 * no password is ever logged or stored.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;
export const MIN_DISTINCT_CHARACTERS = 4;

/** Shorter local parts (such as "al" in al@example.org) are not checked: they would forbid ordinary letter pairs. */
export const MIN_EMAIL_PART_LENGTH = 3;

export type PasswordProblem =
  | "newRequired"
  | "tooShort"
  | "tooLong"
  | "sameAsCurrent"
  | "containsEmailName"
  | "tooSimple"
  | "tooCommon";

/** The form a password is checked in (and the server hashes): Unicode NFC. */
export function normalizePassword(password: string): string {
  return password.normalize("NFC");
}

/** Length in Unicode code points, as the server counts it. */
export function passwordLength(password: string): number {
  return Array.from(password).length;
}

/**
 * The parts of an email address a password may not contain, in lower case: the local part, and for a
 * sub-address ("name+tag@…") also the part before "+". Parts shorter than MIN_EMAIL_PART_LENGTH are left out.
 */
export function emailParts(email: string | null | undefined): string[] {
  if (!email) return [];
  const at = email.lastIndexOf("@");
  if (at <= 0) return [];
  const local = email.slice(0, at).trim().toLowerCase();
  return [...new Set([local, local.split("+")[0]])].filter((part) => passwordLength(part) >= MIN_EMAIL_PART_LENGTH);
}

/** The server's list (backend src/utils/passwordPolicy.ts COMMON_PASSWORDS), in the same compared form. */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  [
    "password", "passw0rd", "p@ssword", "p@ssw0rd", "mypassword", "newpassword", "password1", "changeme", "default",
    "secret", "letmein", "welcome", "iloveyou", "loveyou", "trustno1", "whatever", "qwerty", "qwertyuiop",
    "qwertyuiop[]", "asdfghjkl", "asdfghjkl;", "zxcvbnm", "zxcvbnm,./", "qazwsx", "qazwsxedc", "1qaz2wsx", "zaq12wsx",
    "1q2w3e4r", "1q2w3e4r5t", "1q2w3e4r5t6y", "q1w2e3r4t5", "abc123", "abcdef", "abcdefgh", "abcdefghij", "abcd1234",
    "0123456789", "1234567890", "0987654321", "9876543210", "12345678910", "123123123", "1231231231", "123456789a",
    "a123456789", "admin", "administrator", "root", "user", "guest", "test", "testing", "login", "access", "master",
    "monkey", "dragon", "shadow", "sunshine", "princess", "football", "baseball", "soccer", "superman", "batman",
    "starwars", "freedom", "computer", "internet", "samsung", "iphone", "google", "facebook", "hello", "helloworld",
    "temporary", "temppassword", "security", "monitoring", "evaluation", "palestine", "falastin", "filastin",
    "jerusalem", "alquds", "quds", "ramallah", "gaza", "nablus", "hebron", "bethlehem", "jenin", "jericho", "allah",
    "bismillah", "alhamdulillah", "inshallah", "mashallah", "mohammad", "mohammed", "muhammad", "ahmad", "ahmed",
    "habibi", "yalla", "marhaba", "salam", "كلمةالسر", "كلمةمرور", "كلمةالمرور", "فلسطين", "القدس", "غزة", "رام الله",
    "بسمالله", "الحمدلله", "مرحبا", "حبيبي",
  ].map((word) => normalizePassword(word).replace(/\s+/gu, "")),
);

/** Names a password may not contain: the product's, in English and Arabic. */
export const PRODUCT_NAMES: readonly string[] = ["raqib", "momentum", "رقيب", "مومنتوم"];

const GENERIC_ORGANISATION_WORDS = new Set(
  [
    "organisation", "organization", "association", "foundation", "society", "centre", "center", "institute",
    "international", "network", "committee", "council", "union", "group", "trust", "company", "services",
    "جمعية", "الجمعية", "مؤسسة", "المؤسسة", "منظمة", "المنظمة", "المركز", "اتحاد", "الاتحاد", "الدولية", "شركة", "الشركة",
  ].map((word) => normalizePassword(word)),
);

const compact = (text: string) => normalizePassword(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** The organisation name without spaces, and each of its words of 5 or more letters that is not generic. */
export function organisationNameParts(name: string | null | undefined): string[] {
  if (!name) return [];
  const parts = new Set<string>();
  const whole = compact(name);
  if (passwordLength(whole) >= 4) parts.add(whole);
  for (const word of normalizePassword(name).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    if (passwordLength(word) >= 5 && !GENERIC_ORGANISATION_WORDS.has(word)) parts.add(word);
  }
  return [...parts];
}

/** True when the password is a common one, or contains the product's or the organisation's name. */
export function isGuessablePassword(password: string, organizationName?: string | null): boolean {
  const joined = normalizePassword(password).toLowerCase().replace(/\s+/gu, "");
  const core = joined.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  if (COMMON_PASSWORDS.has(joined) || (core !== "" && COMMON_PASSWORDS.has(core))) return true;
  const letters = compact(password);
  return [...PRODUCT_NAMES, ...organisationNameParts(organizationName)].some((name) => letters.includes(name));
}

/**
 * The first rule `password` breaks, or undefined when it meets the policy. `currentPassword`, `email` and
 * `organizationName` are optional: the reset page knows none of them (the server checks them).
 */
export function passwordProblem(
  password: string,
  {
    currentPassword,
    email,
    organizationName,
  }: { currentPassword?: string; email?: string | null; organizationName?: string | null } = {},
): PasswordProblem | undefined {
  const normalized = normalizePassword(password);
  const length = passwordLength(normalized);
  if (length === 0) return "newRequired";
  if (length < MIN_PASSWORD_LENGTH) return "tooShort";
  if (length > MAX_PASSWORD_LENGTH) return "tooLong";
  if (currentPassword && normalized === normalizePassword(currentPassword)) return "sameAsCurrent";
  const lower = normalized.toLowerCase();
  if (emailParts(email).some((part) => lower.includes(part))) return "containsEmailName";
  if (new Set(Array.from(lower)).size < MIN_DISTINCT_CHARACTERS) return "tooSimple";
  if (isGuessablePassword(normalized, organizationName)) return "tooCommon";
  return undefined;
}

const newPasswordFields = {
  newPassword: z.string(),
  confirmPassword: z.string(),
};

/** What the form knows about the account: its email and organisation (both unknown on the reset page). */
export interface AccountContext {
  email?: string | null;
  organizationName?: string | null;
}

function checkNewPassword(
  values: { newPassword?: string; confirmPassword?: string; currentPassword?: string },
  account: AccountContext,
  ctx: z.RefinementCtx,
) {
  const newPassword = values.newPassword ?? "";
  const confirmPassword = values.confirmPassword ?? "";
  const problem = passwordProblem(newPassword, { currentPassword: values.currentPassword, ...account });
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["newPassword"], message: problem });
  if (confirmPassword.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "confirmRequired" });
  } else if (confirmPassword !== newPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "mismatch" });
  }
}

/** Settings → Change password: current, new and confirmation, for the signed-in user's account. */
export function changePasswordSchema(account: AccountContext) {
  return z
    .object({ currentPassword: z.string().min(1, "currentRequired"), ...newPasswordFields })
    .superRefine((values, ctx) => checkNewPassword(values, account, ctx));
}

export type ChangePasswordValues = z.infer<ReturnType<typeof changePasswordSchema>>;

/** The reset page (from an emailed link): new password and confirmation. */
export const resetPasswordSchema = z.object(newPasswordFields).superRefine((values, ctx) => checkNewPassword(values, {}, ctx));

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/**
 * What went wrong when the server refused a password change or reset, as a translation key under
 * `password.errors`. The server's English text never reaches the screen: the reason `code` it sends is
 * mapped to the screen's own text.
 *
 * - `invalidLink`: the reset link is invalid, expired or already used (`reset_link_invalid`, or any 401 on
 *   the reset page);
 * - `currentWrong`: the current password is wrong (`current_password_incorrect`, change only);
 * - a policy rule the server applied (`tooShort`, `tooLong`, `sameAsCurrent`, `containsEmailName`, `tooSimple`,
 *   `tooCommon`);
 * - `changedMeanwhile`: another change won (409 `password_changed_meanwhile`);
 * - `tooManyAttempts` (429), `offline` (no answer), `failed` (anything else).
 */
export type PasswordFailure =
  | "invalidLink"
  | "currentWrong"
  | "tooShort"
  | "tooLong"
  | "sameAsCurrent"
  | "containsEmailName"
  | "tooSimple"
  | "tooCommon"
  | "changedMeanwhile"
  | "tooManyAttempts"
  | "offline"
  | "failed";

const FAILURE_BY_CODE: Readonly<Record<string, PasswordFailure>> = {
  reset_link_invalid: "invalidLink",
  current_password_incorrect: "currentWrong",
  password_too_short: "tooShort",
  password_too_long: "tooLong",
  password_same_as_current: "sameAsCurrent",
  password_contains_email: "containsEmailName",
  password_too_simple: "tooSimple",
  password_too_common: "tooCommon",
  password_changed_meanwhile: "changedMeanwhile",
};

/** The failures that belong to the new-password field (shown under it). */
export const NEW_PASSWORD_FAILURES: readonly PasswordFailure[] = ["tooShort", "tooLong", "sameAsCurrent", "containsEmailName", "tooSimple", "tooCommon"];

export function passwordFailure(err: unknown, context: "change" | "reset"): PasswordFailure {
  const status = httpStatusOf(err);
  if (status === undefined) return err instanceof Error ? "offline" : "failed";
  if (status === 429) return "tooManyAttempts";
  const code = errorCodeOf(err);
  const known = code && Object.prototype.hasOwnProperty.call(FAILURE_BY_CODE, code) ? FAILURE_BY_CODE[code] : undefined;
  if (known && (known !== "invalidLink" || context === "reset") && (known !== "currentWrong" || context === "change")) return known;
  if (context === "reset" && status === 401) return "invalidLink";
  return "failed";
}
