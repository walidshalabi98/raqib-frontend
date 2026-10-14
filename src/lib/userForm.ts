import { z } from "zod";
import type { UserInviteInput, UserRole } from "@/types/api";

/**
 * The Invite user form (POST /api/users/invite). Error messages are translation keys under
 * `settings.invite.errors`. Pure: schema and payload only.
 */

/**
 * Roles offered in the Invite form. platform_admin is not offered: only a platform admin may assign it
 * (the server refuses it otherwise), and it is not a role for an organisation's team.
 */
export const INVITE_ROLES = ["me_officer", "donor_viewer", "org_admin"] as const satisfies readonly UserRole[];

// A practical check (something@domain.tld, no spaces); the server and the email itself are the real test.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const inviteUserSchema = z.object({
  fullName: z.string().trim().min(1, "nameRequired"),
  email: z
    .string()
    .trim()
    .min(1, "emailRequired")
    .refine((value) => value === "" || EMAIL_PATTERN.test(value), "emailInvalid"),
  role: z.enum(INVITE_ROLES),
});

export type InviteUserValues = z.input<typeof inviteUserSchema>;

export function emptyInviteForm(): InviteUserValues {
  return { fullName: "", email: "", role: "me_officer" };
}

/** The request body for valid values: name and email trimmed. */
export function inviteFormToPayload(values: InviteUserValues): UserInviteInput {
  return { fullName: values.fullName.trim(), email: values.email.trim(), role: values.role };
}
