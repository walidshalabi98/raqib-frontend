import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/queryKeys";
import { isEmailEnabled } from "@/lib/features";
import { usePasswordHandover } from "@/components/settings/PasswordHandover";
import type { InviteUserResponse, OrgUser, UserInviteInput } from "@/types/api";

/** The organisation's members (org admins and platform admins); loaded only while `enabled`. */
export function useOrgUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => api.getUsers(),
    enabled,
  });
}

/**
 * What an invitation or an admin reset did, without the password: `passwordShown` is true when a temporary
 * password came back and was handed to the one-time dialog; otherwise `emailSent` says whether the email
 * with the set-password link went out.
 */
export interface PasswordOutcome {
  emailSent: boolean;
  passwordShown: boolean;
}

export type InviteOutcome = Omit<InviteUserResponse, "temporaryPassword"> & PasswordOutcome;

export interface InviteVariables {
  input: UserInviteInput;
  /** Puts the focus back where the flow started when the one-time dialog closes; false when that is gone. */
  returnFocus?: () => boolean;
}

/**
 * Invites a user. A temporary password in the answer (email off, or the email failed) goes straight from the
 * request to the one-time dialog (PasswordHandoverProvider, above the routes), inside the mutation function:
 * so it is shown even when the admin left Settings before the answer came, and it never enters the mutation's
 * state or the query cache. The users list is refetched whatever the outcome.
 */
export function useInviteUser() {
  const queryClient = useQueryClient();
  const handover = usePasswordHandover();
  return useMutation({
    mutationFn: async ({ input, returnFocus }: InviteVariables): Promise<InviteOutcome> => {
      const { temporaryPassword, ...user } = await api.inviteUser(input);
      if (temporaryPassword) {
        handover.offer(
          { reason: "invite", name: user.fullName, email: user.email, password: temporaryPassword, emailFailed: isEmailEnabled() },
          returnFocus,
        );
      }
      return { ...user, passwordShown: Boolean(temporaryPassword) };
    },
    gcTime: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export interface ResetVariables {
  member: Pick<OrgUser, "id" | "fullName" | "email">;
  returnFocus?: () => boolean;
}

/** An admin resets a member's password; a temporary password is handed over like an invitation's. */
export function useResetUserPassword() {
  const handover = usePasswordHandover();
  return useMutation({
    mutationFn: async ({ member, returnFocus }: ResetVariables): Promise<PasswordOutcome> => {
      const { temporaryPassword, emailSent } = await api.resetUserPassword(member.id);
      if (temporaryPassword) {
        handover.offer(
          { reason: "reset", name: member.fullName, email: member.email, password: temporaryPassword, emailFailed: isEmailEnabled() },
          returnFocus,
        );
      }
      return { emailSent, passwordShown: Boolean(temporaryPassword) };
    },
    gcTime: 0,
  });
}
