import type { Permission } from "@/services/authStorage";

export type AppPage = {
  name: string;
  path: string;
  permission?: Permission;
};

/** Order is the landing order for anyone who is not an Admin or Manager. */
export const APP_PAGES: AppPage[] = [
  { name: "Dashboard", path: "/", permission: "legacy_full_access" },
  { name: "POS", path: "/pos", permission: "legacy_full_access" },
  { name: "Staff", path: "/staffs", permission: "manage_users" },
  { name: "Roles", path: "/roles", permission: "manage_roles" },
  { name: "Menu", path: "/menu-management", permission: "legacy_full_access" },
  { name: "Inventory", path: "/inventory", permission: "legacy_full_access" },
  { name: "Suppliers", path: "/suppliers", permission: "legacy_full_access" },
  { name: "Finance Dashboard", path: "/finance", permission: "legacy_full_access" },
  { name: "Expenses", path: "/expenses", permission: "legacy_full_access" },
  { name: "Receipts", path: "/receipts", permission: "legacy_full_access" },
  { name: "Collections", path: "/collections", permission: "legacy_full_access" },
  { name: "Reports", path: "/reports", permission: "legacy_full_access" },
  { name: "Staff Attendance", path: "/staff-attendance", permission: "legacy_full_access" },
  { name: "Audit Logs", path: "/audit-logs", permission: "view_audit_log" },
  { name: "Settings", path: "/settings", permission: "manage_settings" },
  { name: "My Attendance", path: "/my-attendance" },
  { name: "Profile", path: "/user-profile" },
];

export function canAccess(permissions: string[], permission?: Permission): boolean {
  if (!permission) return true;
  return permissions.includes(permission);
}

/** Admin and Manager open the dashboard. Everyone else opens the first permitted page. */
export function getLandingPath(role: string, permissions: string[]): string {
  if (role === "Admin" || role === "Manager") return "/";
  const page = APP_PAGES.find(
    (item) => item.path !== "/" && item.permission && permissions.includes(item.permission),
  );
  return page?.path ?? "/my-attendance";
}
