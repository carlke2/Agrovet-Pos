export type Permission =
  | "manage_users"
  | "manage_roles"
  | "manage_settings"
  | "view_audit_log"
  | "legacy_full_access";

export type AuthUser = {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  role: string;
  permissions: Permission[];
  mustChangePassword?: boolean;
};

const AUTH_KEYS = ["token", "role", "auth_session", "userName", "adminName", "studentName", "regNo"] as const;

export function getToken(): string | null {
  const token = localStorage.getItem("token");
  return token && token.trim() ? token.trim() : null;
}

function decodeTokenPayload(token: string): { exp?: number } | null {
  try {
    const base64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!base64) return null;
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const exp = decodeTokenPayload(token)?.exp;
  if (!exp) return true;
  return Date.now() >= exp * 1000;
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem("auth_session");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id || typeof parsed.role !== "string" || !Array.isArray(parsed.permissions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasValidStoredSession(): boolean {
  const token = getToken();
  const user = getStoredUser();
  if (!token || !user || isTokenExpired(token)) return false;
  return true;
}

export function persistAuthSession(user: AuthUser, token: string) {
  localStorage.setItem("token", token);
  localStorage.setItem("auth_session", JSON.stringify(user));
  localStorage.removeItem("role");
}

export function clearAuthSession() {
  for (const key of AUTH_KEYS) {
    localStorage.removeItem(key);
  }
}
