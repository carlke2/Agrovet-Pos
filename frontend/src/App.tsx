import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider, landingPathFor, useAuth } from "@/context/AuthContext";
import type { Permission } from "@/services/authStorage";
import Loader from "@/components/ui/loader";
import PageLoader from "@/components/ui/PageLoader";
import { ToastProvider } from "@/components/ui/Toast";
import PermissionProtectedRoute from "@/components/PermissionProtectedRoute";
import GuestRoute from "@/components/GuestRoute";
import Shell from "@/components/shell/AppShell";
import Dashboard from "@/pages/Dashboard";
import Staffs from "@/pages/admin/Staffs";
import RolesPage from "@/pages/admin/RolesPage";
import Settings from "@/pages/settings";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import AdminProfile from "@/pages/AdminProfile";
import Reports from "@/pages/Reports";
import AuditLogs from "@/pages/AuditLogs";
import UserProfile from "@/pages/UserProfile";
import PosTerminal from "@/pages/pos/PosTerminal";
import MenuManagement from "@/pages/pos/MenuManagement";
import MenuListPage from "@/pages/pos/MenuListPage";
import MenuAddPage from "@/pages/pos/MenuAddPage";
import MenuEditPage from "@/pages/pos/MenuEditPage";
import MenuUpdatePage from "@/pages/pos/MenuUpdatePage";
import MenuDeletePage from "@/pages/pos/MenuDeletePage";
import MenuCategoriesPage from "@/pages/pos/MenuCategoriesPage";
import InventoryPage from "@/pages/pos/InventoryPage";
import LegacySuppliersPage from "@/pages/pos/SuppliersPage";
import CategoriesPage from "@/pages/catalog/CategoriesPage";
import ItemsPage from "@/pages/catalog/ItemsPage";
import SuppliersPage from "@/pages/catalog/SuppliersPage";
import CustomersPage from "@/pages/customers/CustomersPage";
import FinanceDashboard from "@/pages/finance/FinanceDashboard";
import ExpensesPage from "@/pages/finance/ExpensesPage";
import ReceiptsPage from "@/pages/finance/ReceiptsPage";
import ReceiveStockPage from "@/pages/receiving/ReceiveStockPage";
import ReceiptFormPage from "@/pages/receiving/ReceiptFormPage";
import CollectionsPage from "@/pages/finance/CollectionsPage";
import NoAccess from "@/pages/NoAccess";
import StaffAttendanceTerminal from "@/pages/attendance/StaffAttendanceTerminal";
import StaffAttendanceReport from "@/pages/attendance/StaffAttendanceReport";

const DevUi = import.meta.env.DEV ? lazy(() => import("@/pages/dev/UiKit")) : null;

const R = (permission: Permission | undefined, element: JSX.Element) => (
  <PermissionProtectedRoute permission={permission}>{element}</PermissionProtectedRoute>
);

function AppShell() {
  const location = useLocation();
  const { status, user } = useAuth();
  const publicPages = ["/login", "/forgot-password", "/attendance"];
  const isAuthPage = publicPages.includes(location.pathname);
  const isAttendancePage = location.pathname === "/attendance";
  const showShell = status === "authenticated" && !!user && !isAuthPage && !isAttendancePage;

  if (status === "loading" && !isAuthPage) {
    return (
      <Loader
        size="sm"
        title="Loading Agrovet POS..."
        subtitle="Verifying your session"
        className="min-h-screen py-24"
      />
    );
  }

  if (status === "unauthenticated" && !isAuthPage) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isAttendancePage) {
    return (
      <Routes>
        <Route path="/attendance" element={<StaffAttendanceTerminal />} />
      </Routes>
    );
  }

  const routes = (
        <Routes>
          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />

          <Route path="/" element={R("legacy_full_access", <Dashboard />)} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/staffs" element={R("manage_users", <Staffs />)} />
          <Route path="/roles" element={R("manage_roles", <RolesPage />)} />
          <Route path="/reports" element={R("legacy_full_access", <Reports />)} />
          <Route path="/audit-logs" element={R("view_audit_log", <AuditLogs />)} />
          <Route path="/staff-attendance" element={R("legacy_full_access", <StaffAttendanceReport />)} />
          <Route path="/admin-profile" element={R("legacy_full_access", <AdminProfile />)} />
          <Route path="/settings" element={R("manage_settings", <Settings />)} />

          <Route path="/pos" element={R("legacy_pos_access", <PosTerminal />)} />
          <Route path="/menu-management" element={R("legacy_full_access", <MenuManagement />)} />
          <Route path="/menu-management/list" element={R("legacy_full_access", <MenuListPage />)} />
          <Route path="/menu-management/add" element={R("legacy_full_access", <MenuAddPage />)} />
          <Route path="/menu-management/edit" element={R("legacy_full_access", <MenuEditPage />)} />
          <Route path="/menu-management/update" element={R("legacy_full_access", <MenuUpdatePage />)} />
          <Route path="/menu-management/delete" element={R("legacy_full_access", <MenuDeletePage />)} />
          <Route path="/menu-management/categories" element={R("legacy_full_access", <MenuCategoriesPage />)} />
          <Route path="/categories" element={R("view_catalog", <CategoriesPage />)} />
          <Route path="/items" element={R("view_catalog", <ItemsPage />)} />
          <Route path="/inventory" element={R("legacy_full_access", <InventoryPage />)} />
          <Route path="/suppliers" element={R("view_suppliers", <SuppliersPage />)} />
          <Route path="/customers" element={R("view_customers", <CustomersPage />)} />
          <Route path="/legacy/suppliers" element={R("legacy_full_access", <LegacySuppliersPage />)} />
          <Route path="/my-attendance" element={R("legacy_pos_access", <StaffAttendanceReport />)} />

          <Route path="/finance" element={R("legacy_full_access", <FinanceDashboard />)} />
          <Route path="/expenses" element={R("legacy_full_access", <ExpensesPage />)} />
          <Route path="/receipts" element={R("view_receipts", <ReceiveStockPage />)} />
          <Route path="/receipts/new" element={R("view_receipts", <ReceiptFormPage />)} />
          <Route path="/receipts/:id" element={R("view_receipts", <ReceiptFormPage />)} />
          <Route path="/legacy/receipts" element={R("legacy_full_access", <ReceiptsPage />)} />
          <Route path="/collections" element={R("legacy_full_access", <CollectionsPage />)} />

          <Route path="/user-profile" element={R("legacy_pos_access", <UserProfile />)} />
          <Route path="/no-access" element={<NoAccess />} />
          {DevUi ? (
            <Route
              path="/dev/ui"
              element={R(
                "manage_settings",
                <Suspense fallback={<PageLoader label="Loading gallery" />}>
                  <DevUi />
                </Suspense>,
              )}
            />
          ) : null}

          <Route
            path="*"
            element={
              status === "authenticated" && user
                ? <Navigate to={landingPathFor(user)} replace />
                : <Navigate to="/login" replace />
            }
          />
        </Routes>
  );

  if (!showShell) return routes;
  return <Shell>{routes}</Shell>;
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
