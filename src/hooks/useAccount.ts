import { useMutation } from "@tanstack/react-query";
import { api } from "@/services/api";

/**
 * Sign-in help and the user's own password. Passwords and reset tokens are passed straight to the API
 * client: they are never logged, and the mutations are dropped from the cache as soon as their screen
 * no longer uses them (`gcTime: 0`). Callers show the messages (they know the language).
 */

/** "Forgot password?": asks for a reset link. The server answers the same whether or not the account exists. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.forgotPassword(email.trim()),
    gcTime: 0,
  });
}

export interface ResetWithLinkInput {
  token: string;
  newPassword: string;
}

/** The reset page: sets a new password with the token from the emailed link (no sign-in). */
export function useResetPasswordWithLink() {
  return useMutation({
    mutationFn: ({ token, newPassword }: ResetWithLinkInput) => api.resetPassword(token, newPassword),
    gcTime: 0,
  });
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** Settings → Change password, for every role. */
export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: ChangePasswordInput) => api.changePassword(currentPassword, newPassword),
    gcTime: 0,
  });
}
