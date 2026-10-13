/**
 * Tells the auth context that the signed-in user changed: sign-in, a token refresh (which can
 * carry a new role), sign-out. Kept outside src/services/api.ts so tests that mock the API client
 * keep these real.
 */

type AuthListener = () => void;

const listeners = new Set<AuthListener>();

/** Calls `listener` after every change; returns the function that stops it. */
export function onAuthChange(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAuthChange(): void {
  for (const listener of [...listeners]) listener();
}
