import type { Permission } from "@/services/authStorage";

export type AppPage = {
  name: string;
  path: string;
  permission?: Permission;
};

export const NO_ACCESS_PATH = "/no-access";

/** Order used when a role has no explicit landing page. */
export const APP_PAGES: AppPage[] = [
  { name: "Dashboard", path: "/", permission: "legacy_full_access" },
  { name: "POS", path: "/pos", permission: "legacy_pos_access" },
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
  { name: "Categories", path: "/categories", permission: "view_catalog" },
  { name: "Settings", path: "/settings", permission: "manage_settings" },
  { name: "My Attendance", path: "/my-attendance", permission: "legacy_pos_access" },
  { name: "Profile", path: "/user-profile", permission: "legacy_pos_access" },
];

export function canAccess(permissions: string[], permission?: Permission): boolean {
  if (!permission) return true;
  return permissions.includes(permission);
}

/** Admin and Manager open the dashboard. Cashier opens POS. Anyone else opens the first page they can use. */
export function getLandingPath(role: string, permissions: string[]): string {
  if ((role === "Admin" || role === "Manager") && permissions.includes("legacy_full_access")) {
    return "/";
  }
  if (role === "Cashier" && permissions.includes("legacy_pos_access")) {
    return "/pos";
  }
  const page = APP_PAGES.find((item) => item.permission && permissions.includes(item.permission));
  return page?.path ?? NO_ACCESS_PATH;
}
