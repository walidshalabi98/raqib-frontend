/** Helpers for the one-time password dialog (src/components/settings/PasswordHandover.tsx). */

/** Loads the dialog's code (and the translations it uses). */
export const loadPasswordDialog = () => import("@/components/settings/TemporaryPasswordDialog");

/** Loads the dialog's code ahead of time (the team screen calls it), so a handover never waits for the network. */
export function preloadPasswordHandover(): void {
  void loadPasswordDialog();
}

/** The password in groups of four ("Kq7m Wx3p Zr9T bN4s"), for reading it aloud; Copy copies the password itself. */
export function groupedPassword(password: string): string {
  return Array.from(password).reduce((text, ch, i) => text + (i > 0 && i % 4 === 0 ? " " : "") + ch, "");
}
