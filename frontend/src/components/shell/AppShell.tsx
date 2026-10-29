import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Contact,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Package,
  PackagePlus,
  Tags,
  PieChart,
  Plus,
  Receipt,
  Settings,
  Shield,
  Truck,
  UserCircle2,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { RouteProgress } from "@/components/ui/TopProgressBar";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/useFocusTrap";
import type { Permission } from "@/services/authStorage";
import { canAccess } from "@/services/navigation";
import { toast } from "@/services/toast";

type IconType = typeof LayoutDashboard;

type NavItem = {
  name: string;
  path: string;
  icon: IconType;
  permission?: Permission;
};

type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Sales",
    items: [
      { name: "Dashboard", path: "/", icon: LayoutDashboard, permission: "legacy_full_access" },
      { name: "Point of Sale", path: "/pos", icon: Monitor, permission: "legacy_pos_access" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { name: "Categories", path: "/categories", icon: Tags, permission: "view_catalog" },
      { name: "Items", path: "/items", icon: Package, permission: "view_catalog" },
      { name: "Receive stock", path: "/receipts", icon: PackagePlus, permission: "view_receipts" },
      { name: "Inventory", path: "/inventory", icon: ClipboardList, permission: "legacy_full_access" },
      { name: "Suppliers", path: "/suppliers", icon: Truck, permission: "view_suppliers" },
    ],
  },
  {
    label: "Customers",
    items: [{ name: "Customers", path: "/customers", icon: Contact, permission: "view_customers" }],
  },
  {
    label: "Finance",
    items: [
      { name: "Finance", path: "/finance", icon: Wallet, permission: "legacy_full_access" },
      { name: "Expenses", path: "/expenses", icon: Receipt, permission: "legacy_full_access" },
      { name: "Receipts", path: "/legacy/receipts", icon: Receipt, permission: "legacy_full_access" },
      { name: "Collections", path: "/collections", icon: PieChart, permission: "legacy_full_access" },
      { name: "Reports", path: "/reports", icon: ClipboardList, permission: "legacy_full_access" },
    ],
  },
  {
    label: "Administration",
    items: [
      { name: "Staff", path: "/staffs", icon: Users, permission: "manage_users" },
      { name: "Roles", path: "/roles", icon: Shield, permission: "manage_roles" },
      { name: "Attendance", path: "/staff-attendance", icon: Clock, permission: "legacy_full_access" },
      { name: "My attendance", path: "/my-attendance", icon: Clock, permission: "legacy_pos_access" },
      { name: "Audit log", path: "/audit-logs", icon: ClipboardList, permission: "view_audit_log" },
      { name: "Settings", path: "/settings", icon: Settings, permission: "manage_settings" },
      { name: "Admin profile", path: "/admin-profile", icon: UserCircle2, permission: "legacy_full_access" },
    ],
  },
];

const PREFERENCE_KEY = "agrovet_sidebar";

function readPreference(): "expanded" | "rail" | null {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return value === "expanded" || value === "rail" ? value : null;
  } catch {
    return null;
  }
}

function writePreference(value: "expanded" | "rail") {
  try {
    localStorage.setItem(PREFERENCE_KEY, value);
  } catch {
    /* UI preference only. Ignore private-mode storage failures. */
  }
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", hour: "numeric", hourCycle: "h23" }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function pageMeta(pathname: string) {
  if (pathname === "/") return { title: "Dashboard", subtitle: "Shop overview" };
  if (pathname.startsWith("/pos")) return { title: "Point of Sale", subtitle: "Counter sales" };
  if (pathname.startsWith("/categories")) return { title: "Categories", subtitle: "Product groups" };
  if (pathname.startsWith("/items")) return { title: "Items", subtitle: "Products for sale" };
  if (pathname.startsWith("/menu-management")) return { title: "Items", subtitle: "Legacy menu" };
  if (pathname.startsWith("/inventory")) return { title: "Inventory", subtitle: "Stock on hand" };
  if (pathname.startsWith("/legacy/suppliers")) return { title: "Suppliers", subtitle: "Legacy bakery suppliers" };
  if (pathname.startsWith("/suppliers")) return { title: "Suppliers", subtitle: "Who you buy from" };
  if (pathname.startsWith("/customers")) return { title: "Customers", subtitle: "People you sell to" };
  if (pathname.startsWith("/finance")) return { title: "Finance" };
  if (pathname.startsWith("/expenses")) return { title: "Expenses" };
  if (pathname.startsWith("/legacy/receipts")) return { title: "Receipts", subtitle: "Legacy sales receipts" };
  if (pathname.startsWith("/receipts")) return { title: "Receive stock", subtitle: "Goods received" };
  if (pathname.startsWith("/collections")) return { title: "Collections" };
  if (pathname.startsWith("/reports")) return { title: "Reports" };
  if (pathname.startsWith("/staffs")) return { title: "Staff" };
  if (pathname.startsWith("/roles")) return { title: "Roles" };
  if (pathname.startsWith("/staff-attendance")) return { title: "Attendance" };
  if (pathname.startsWith("/my-attendance")) return { title: "My attendance" };
  if (pathname.startsWith("/audit-logs")) return { title: "Audit log" };
  if (pathname.startsWith("/settings")) return { title: "Settings" };
  if (pathname.startsWith("/admin-profile") || pathname.startsWith("/user-profile")) return { title: "Profile" };
  if (pathname.startsWith("/no-access")) return { title: "No access yet" };
  if (pathname.startsWith("/dev/ui")) return { title: "Component gallery" };
  return { title: "Agrovet POS" };
}

function isActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [width, setWidth] = useState(() => window.innerWidth);
  const [manual, setManual] = useState<"expanded" | "rail" | null>(readPreference);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const mobileRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useFocusTrap(mobileOpen, mobileRef, () => setMobileOpen(false));

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  const permissions = user?.permissions ?? [];
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccess(permissions, item.permission)),
  })).filter((group) => group.items.length > 0);

  const overlay = width < 1024;
  const railByDefault = location.pathname.startsWith("/pos") || width < 1280;
  const rail = !overlay && (manual ? manual === "rail" : railByDefault);
  const meta = pageMeta(location.pathname);
  const firstName = (user?.name || "there").trim().split(/\s+/)[0];
  const initial = (user?.name || "A").trim().charAt(0).toUpperCase();
  const canSell = canAccess(permissions, "legacy_pos_access");
  const canProfile = canAccess(permissions, "legacy_pos_access");

  const toggleRail = () => {
    const next = rail ? "expanded" : "rail";
    setManual(next);
    writePreference(next);
  };

  const confirmLogout = () => {
    logout();
    setLogoutOpen(false);
    toast.success("Logged out successfully");
    navigate("/login");
  };

  const panel = (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-start gap-3", rail ? "justify-center px-2 pt-4" : "px-4 pt-4")}>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-700 text-sm font-bold text-white"
          title={`${greeting()}, ${firstName}`}
        >
          {initial}
        </div>
        {!rail && (
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{greeting()}</p>
            <p className="truncate text-base font-bold text-ink">{firstName}</p>
            <span className="mt-1 inline-flex rounded-pill bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-800">
              {user?.role || "Staff"}
            </span>
          </div>
        )}
        {!overlay && (
          <button
            type="button"
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-control p-1 text-muted hover:bg-primary-50"
            onClick={toggleRail}
          >
            {rail ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        )}
      </div>

      {!rail && <p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-muted">Agrovet POS</p>}

      <nav className="mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.label}>
            {!rail && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{group.label}</p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(location.pathname, item.path);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={item.name}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium",
                      rail && "justify-center px-0",
                      active ? "bg-primary-700 text-white" : "text-ink hover:bg-primary-50",
                    )}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {!rail && <span className="truncate">{item.name}</span>}
                    {rail && (
                      <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs text-surface group-hover:block group-focus-visible:block">
                        {item.name}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {canSell && (
        <div className="shrink-0 p-3">
          <Link to="/pos" title="New sale" aria-label="New sale" className={cn("block", rail && "flex justify-center")}>
            {rail ? (
              <span className="flex h-12 w-12 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <Plus size={20} />
              </span>
            ) : (
              <span className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-accent px-5 text-base font-semibold text-accent-foreground">
                <Plus size={18} />
                New sale
              </span>
            )}
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen gap-3 p-3 lg:gap-4 lg:p-4">
      {!overlay && (
        <aside className={cn("shell-sidebar sticky top-3 h-[calc(100vh-1.5rem)] shrink-0 transition-[width]", rail ? "w-[76px]" : "w-[272px]")}>
          {panel}
        </aside>
      )}

      {overlay && mobileOpen && (
        <div className="fixed inset-0 z-[60]">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-scrim" onClick={() => setMobileOpen(false)} />
          <aside ref={mobileRef} role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1} className="shell-sidebar absolute left-3 top-3 h-[calc(100vh-1.5rem)] w-[min(100%-1.5rem,272px)] outline-none">
            {panel}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-3 z-30 mb-3 rounded-card border border-sand bg-surface px-3 py-3 shadow-sm sm:px-4">
          <RouteProgress />
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {overlay && (
                <button
                  type="button"
                  aria-label="Open menu"
                  className="flex h-10 w-10 items-center justify-center rounded-control text-ink hover:bg-primary-50"
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu size={20} />
                </button>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold text-ink">{meta.title}</h1>
                {meta.subtitle && <p className="truncate text-xs text-muted">{meta.subtitle}</p>}
              </div>
            </div>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
                className="flex items-center gap-2 rounded-control py-1 pl-1 pr-2 hover:bg-primary-50"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-700 text-sm font-bold text-white">{initial}</span>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-semibold leading-tight text-ink">{user?.name}</span>
                  <span className="block text-[11px] text-muted">{user?.role}</span>
                </span>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 z-40 mt-2 w-56 rounded-card border border-sand bg-surface p-2 shadow-md">
                  <p className="px-2 py-1 text-sm font-semibold text-ink">{user?.name}</p>
                  <p className="px-2 pb-2 text-xs text-muted">{user?.role}</p>
                  {canProfile && (
                    <Link role="menuitem" to="/user-profile" className="block rounded-control px-2 py-2 text-sm text-ink hover:bg-primary-50">
                      Profile
                    </Link>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-sm text-ink hover:bg-primary-50"
                    onClick={() => {
                      setMenuOpen(false);
                      setLogoutOpen(true);
                    }}
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="Logout?"
        message="You will need to log in again to continue."
        confirmLabel="Logout"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={confirmLogout}
      />
    </div>
  );
}
