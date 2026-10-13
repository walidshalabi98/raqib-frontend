import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { api } from "@/services/api";
import { onAuthChange } from "@/lib/authEvents";
import type { AuthUser } from "@/types/api";

type User = AuthUser;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Forgets this browser's session without leaving the screen (after a password reset with a link). */
  endSession: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * The signed-in user. Its role comes from the current access token (api.getUser), and the user is
 * read again after every sign-in, token refresh and sign-out, so a role an admin changed reaches
 * every screen within one token refresh (at most 15 minutes), without signing in again.
 * When the role or the user changes, every cached response is dropped and fetched again: the API
 * answers donor viewers in another shape, so data cached under the old role must not stay on screen.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => api.getUser());
  // Undefined outside a QueryClientProvider (isolated component tests).
  const queryClient = useContext(QueryClientContext);

  useEffect(() => onAuthChange(() => setUser(api.getUser())), []);

  const role = user?.role ?? null;
  const userId = user?.id ?? null;
  const previous = useRef({ role, userId });
  useEffect(() => {
    const before = previous.current;
    previous.current = { role, userId };
    if (before.role === role && before.userId === userId) return;
    void queryClient?.resetQueries();
  }, [role, userId, queryClient]);

  const login = async (email: string, password: string) => {
    await api.login(email, password);
    setUser(api.getUser());
  };

  const logout = () => {
    setUser(null);
    api.logout();
  };

  const endSession = () => {
    setUser(null);
    api.clearToken();
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user && !!api.getToken(), login, logout, endSession }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** The auth context, or null outside AuthProvider (e.g. isolated component tests). */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useOptionalAuth(): AuthContextType | null {
  return useContext(AuthContext);
}
