import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import API from "@/services/api";
import {
  AuthUser,
  clearAuthSession,
  getStoredUser,
  getToken,
  hasValidStoredSession,
  isTokenExpired,
  persistAuthSession,
  Permission,
} from "@/services/authStorage";
import { getLandingPath } from "@/services/navigation";

function normalizeAuthUser(raw: any): AuthUser | null {
  const source = raw?.user?.id ? raw.user : raw;
  if (!source?.id || typeof source.role !== "string") return null;
  const permissions = Array.isArray(source.permissions)
    ? source.permissions.filter((item: unknown): item is Permission => typeof item === "string")
    : [];
  return {
    id: source.id,
    name: source.name,
    email: source.email,
    phone: source.phone,
    role: source.role,
    permissions,
    mustChangePassword: Boolean(source.mustChangePassword),
  };
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  refreshSession: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function landingPathFor(user: Pick<AuthUser, "role" | "permissions">) {
  return getLandingPath(user.role, user.permissions);
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const logout = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const login = useCallback((nextUser: AuthUser, token: string) => {
    const normalized = normalizeAuthUser(nextUser);
    if (!normalized) {
      clearAuthSession();
      setUser(null);
      setStatus("unauthenticated");
      return;
    }
    persistAuthSession(normalized, token);
    if (!hasValidStoredSession()) {
      clearAuthSession();
      setUser(null);
      setStatus("unauthenticated");
      return;
    }
    setUser(normalized);
    setStatus("authenticated");
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const token = getToken();
    if (!token || isTokenExpired(token) || !getStoredUser()) {
      logout();
      return false;
    }

    try {
      const { data } = await API.get("/auth/session", {
        skipAuthRedirect: true,
        timeout: 10000,
      } as any);
      const sessionUser = normalizeAuthUser(data);
      if (!sessionUser?.id) {
        logout();
        return false;
      }
      persistAuthSession(sessionUser, token);
      setUser(sessionUser);
      setStatus("authenticated");
      return true;
    } catch {
      logout();
      return false;
    }
  }, [logout]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const value = useMemo(
    () => ({ status, user, login, logout, refreshSession }),
    [status, user, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
