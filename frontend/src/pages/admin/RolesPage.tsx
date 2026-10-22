import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import type { Permission } from "@/services/authStorage";

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
};

const PERMISSION_OPTIONS: { key: Permission; label: string }[] = [
  { key: "manage_users", label: "Manage users" },
  { key: "manage_roles", label: "Manage roles" },
  { key: "manage_settings", label: "Manage settings" },
  { key: "view_audit_log", label: "View audit log" },
  { key: "view_catalog", label: "View catalog" },
  { key: "manage_catalog", label: "Manage catalog" },
  { key: "view_cost", label: "View cost" },
  { key: "manage_prices", label: "Manage prices" },
  { key: "view_suppliers", label: "View suppliers" },
  { key: "manage_suppliers", label: "Manage suppliers" },
  { key: "legacy_full_access", label: "Back office (menu, inventory, finance, reports)" },
  { key: "legacy_pos_access", label: "Point of sale" },
];

const RolesPage = () => {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Permission[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await API.get<RoleRow[]>("/roles");
      setRoles(data || []);
      const next: Record<string, Permission[]> = {};
      for (const role of data || []) next[role.id] = [...role.permissions];
      setDrafts(next);
    } catch (e: any) {
      toast.error("Failed to load roles", e.response?.data?.message || e.response?.data?.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = (role: RoleRow, permission: Permission) => {
    if (role.name === "Admin") return;
    setDrafts((current) => {
      const list = current[role.id] || [];
      const has = list.includes(permission);
      return {
        ...current,
        [role.id]: has ? list.filter((item) => item !== permission) : [...list, permission],
      };
    });
  };

  const save = async (role: RoleRow) => {
    setSavingId(role.id);
    try {
      const { data } = await API.put<RoleRow>(`/roles/${role.id}/permissions`, {
        permissions: drafts[role.id] || [],
      });
      setRoles((current) => current.map((item) => (item.id === role.id ? data : item)));
      setDrafts((current) => ({ ...current, [role.id]: [...data.permissions] }));
      toast.success(`${role.name} permissions saved`);
    } catch (e: any) {
      toast.error("Could not save permissions", e.response?.data?.message || e.response?.data?.error);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 bg-background min-h-screen font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-primary-700 text-white rounded-card p-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield size={28} /> Roles
          </h1>
          <p className="text-white/80 text-sm mt-1">System roles stay in place. Admin permissions are locked.</p>
        </div>

        {loading ? (
          <Loader size="sm" title="Loading roles..." subtitle="Fetching roles and permissions" className="py-10" />
        ) : (
          roles.map((role) => {
            const locked = role.name === "Admin";
            const selected = drafts[role.id] || [];
            return (
              <section key={role.id} className="bg-surface rounded-card border border-sand shadow-sm p-5 space-y-4">
                <div>
                  <h2 className="font-bold text-ink">{role.name}</h2>
                  {role.description && <p className="text-sm text-muted mt-1">{role.description}</p>}
                  {locked && (
                    <p className="text-xs text-amber-700 mt-2">This role cannot lose any permission.</p>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {PERMISSION_OPTIONS.map((option) => (
                    <label key={option.key} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={selected.includes(option.key)}
                        disabled={locked}
                        onChange={() => toggle(role, option.key)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={locked || savingId === role.id}
                  onClick={() => save(role)}
                  className="px-4 py-2 bg-primary-700 text-white rounded-control text-sm font-semibold disabled:opacity-50"
                >
                  {locked ? "Locked" : savingId === role.id ? "Saving..." : "Save permissions"}
                </button>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RolesPage;
