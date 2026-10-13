import type { UserRole } from "@/types/api";

/**
 * What each role may do in the UI. It mirrors the backend's role matrix (backend
 * docs/SECURITY_SETUP.md §8, tests/roles.test.ts). The server enforces every rule; the UI only
 * hides controls a role cannot use. The role comes from the current access token
 * (src/lib/session.ts), the same one the server reads, so a changed role shows after the next
 * token refresh (at most 15 minutes) without signing in again.
 * Pure functions only. Deny by default: an unknown, empty or missing role may do nothing.
 */

export const USER_ROLES: readonly UserRole[] = Object.freeze(["platform_admin", "org_admin", "me_officer", "donor_viewer"] as const);

/** May write, run AI features and see beneficiary-level personal data. */
export const STAFF_ROLES: readonly UserRole[] = Object.freeze(["org_admin", "platform_admin", "me_officer"] as const);

/** Organisation settings, users, approvals (reports published to donors included), project create/archive. */
export const ADMIN_ROLES: readonly UserRole[] = Object.freeze(["org_admin", "platform_admin"] as const);

const PLATFORM_ROLES: readonly UserRole[] = Object.freeze(["platform_admin"] as const);

export type Capability =
  | "project.create"
  | "project.edit"
  | "project.archive"
  | "framework.edit"
  | "framework.approve"
  | "data.enter"
  /** Beneficiary list, detail, register, edit, services and the register CSV (personal data). */
  | "beneficiary.records"
  /** Document upload and delete. */
  | "document.manage"
  /** Qualitative add, upload and AI coding. */
  | "qualitative.manage"
  /** Framework generation, indicator alternatives and KPI suggestions, risk analysis. */
  | "ai.run"
  /** See AI output nobody has reviewed yet: assessment reports, document analyses, qualitative coding. */
  | "ai.review"
  | "assessment.request"
  | "assessment.update"
  | "report.generate"
  /** Publish a report to donor viewers, or take it back to draft (PATCH /api/reports/:id/publish and /unpublish). */
  | "report.publish"
  /** The full project export with beneficiaries, and the register CSV. */
  | "export.personalData"
  | "org.manage"
  /** List, invite and change the organisation's users. */
  | "users.manage"
  /** Give a member a new temporary password (POST /api/users/:id/reset-password); see canResetPasswordOf. */
  | "users.resetPassword"
  | "templates.manage";

/** The roles allowed each capability. donor_viewer has none: donors read results only. */
export const CAPABILITY_ROLES: Readonly<Record<Capability, readonly UserRole[]>> = Object.freeze({
  "project.create": ADMIN_ROLES,
  "project.edit": STAFF_ROLES,
  "project.archive": ADMIN_ROLES,
  "framework.edit": STAFF_ROLES,
  "framework.approve": ADMIN_ROLES,
  "data.enter": STAFF_ROLES,
  "beneficiary.records": STAFF_ROLES,
  "document.manage": STAFF_ROLES,
  "qualitative.manage": STAFF_ROLES,
  "ai.run": STAFF_ROLES,
  "ai.review": STAFF_ROLES,
  "assessment.request": STAFF_ROLES,
  "assessment.update": ADMIN_ROLES,
  "report.generate": STAFF_ROLES,
  "report.publish": ADMIN_ROLES,
  "export.personalData": STAFF_ROLES,
  "org.manage": ADMIN_ROLES,
  "users.manage": ADMIN_ROLES,
  "users.resetPassword": ADMIN_ROLES,
  "templates.manage": PLATFORM_ROLES,
});

/** True only for one of the four roles the backend knows. */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** Whether `role` may use `capability`. Unknown, empty or missing roles (and unknown capabilities) get false. */
export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!isUserRole(role)) return false;
  if (!Object.prototype.hasOwnProperty.call(CAPABILITY_ROLES, capability)) return false;
  return CAPABILITY_ROLES[capability].includes(role);
}

/**
 * Whether `actor` may reset `target`'s password from the users list: the users.resetPassword capability,
 * not for their own account (they use Settings → Change password, which asks for the current one), and a
 * platform admin's password only by a platform admin (as only a platform admin can assign that role).
 */
export function canResetPasswordOf(
  actor: { id: string; role: string | null | undefined } | null | undefined,
  target: { id: string; role: string | null | undefined },
): boolean {
  if (!actor || !can(actor.role, "users.resetPassword")) return false;
  if (actor.id === target.id) return false;
  if (target.role === "platform_admin" && actor.role !== "platform_admin") return false;
  return true;
}
