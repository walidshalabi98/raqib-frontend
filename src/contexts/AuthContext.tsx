import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "@/services/api";
import type { AuthUser } from "@/types/api";

type User = AuthUser;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => api.getUser());

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password);
    setUser(data.user);
  };

  const logout = () => {
    setUser(null);
    api.logout();
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user && !!api.getToken(), login, logout }}>
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
