import type { AuthUser, UserRole } from "@/types/api";
import { isUserRole } from "@/lib/permissions";

/**
 * The signed-in user's role as the server sees it. The backend reads the role from the access
 * token, and every refresh (at most 15 minutes apart) issues a token with the role from the
 * database. Reading the role from the same token keeps the UI and the server in step after an
 * admin changes someone's role; the profile saved at sign-in would keep the old role until the
 * next sign-in, which an active user may never do (the refresh token is renewed on every refresh).
 * The UI only decodes the token to hide controls; the server verifies it and enforces every rule.
 * Pure functions only.
 */

export interface AccessTokenClaims {
  /** The user id. */
  id: string;
  /** The role, or undefined when the token carries no known role. */
  role: UserRole | undefined;
}

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * The claims of an access token, decoded without verification. Null for anything that is not a
 * JWT whose payload has a string `id`, and for a token with a `purpose` claim (a password-reset
 * token is not an access token).
 */
export function accessTokenClaims(token: string | null | undefined): AccessTokenClaims | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(parts[1]));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const claims = payload as Record<string, unknown>;
    if (typeof claims.id !== "string" || "purpose" in claims) return null;
    return { id: claims.id, role: isUserRole(claims.role) ? claims.role : undefined };
  } catch {
    return null;
  }
}

/**
 * The signed-in user for the UI: the profile saved at sign-in, with the role from the current
 * access token. Deny by default: when the token does not decode, belongs to another user or
 * carries no known role, the role is "" (no capability: the read-only view).
 */
export function sessionUser(profile: AuthUser | null, token: string | null | undefined): AuthUser | null {
  if (!profile) return null;
  const claims = accessTokenClaims(token);
  const role = claims && claims.id === profile.id && claims.role ? claims.role : "";
  return role === profile.role ? profile : { ...profile, role };
}
