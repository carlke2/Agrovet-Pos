import { useEffect, useMemo, useState } from "react";
import { Users, Plus, Edit, UserX, UserCheck, X, Search, Filter } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";

type RoleOption = { id: string; name: string };
type StaffStatus = "active" | "inactive";

type StaffRow = {
  id: string;
  _id?: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  roleId: string;
  status: StaffStatus;
};

const emptyStaff = {
  name: "",
  email: "",
  phone: "",
  password: "",
  roleId: "",
  status: "active" as StaffStatus,
};

const inputCls =
  "w-full px-3 py-2 border border-sand rounded-lg text-sm focus:ring-2 focus:ring-primary-700 outline-none";

const Staffs = () => {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState(emptyStaff);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | StaffStatus>("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        API.get<StaffRow[]>("/users"),
        API.get<RoleOption[]>("/roles"),
      ]);
      setStaff(usersRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (e: any) {
      toast.error("Failed to load staff", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return staff.filter((u) => {
      if (roleFilter !== "all" && u.roleId !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!q) return true;
      return [u.name, u.email, u.phone, u.role, u.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [staff, searchQuery, roleFilter, statusFilter]);

  const hasActiveFilters = searchQuery !== "" || roleFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setStaffForm({ ...emptyStaff, roleId: roles[0]?.id || "" });
  };

  const saveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = {
        name: staffForm.name,
        email: staffForm.email,
        phone: staffForm.phone,
        roleId: staffForm.roleId,
        status: staffForm.status,
        ...(staffForm.password ? { password: staffForm.password } : {}),
      };

      if (editId) {
        await API.put(`/users/${editId}`, body);
      } else {
        if (!staffForm.password) {
          toast.error("Password required", "Enter a password for the new staff account");
          return;
        }
        await API.post("/users", { ...body, password: staffForm.password });
      }

      toast.success(editId ? "Staff updated" : "Staff added");
      closeForm();
      fetchData();
    } catch (e: any) {
      toast.error("Operation failed", e.response?.data?.message || e.response?.data?.error);
    }
  };

  const openAdd = () => {
    setEditId(null);
    setStaffForm({ ...emptyStaff, roleId: roles[0]?.id || "" });
    setShowForm(true);
  };

  const editStaffMember = (u: StaffRow) => {
    setEditId(u._id || u.id);
    setStaffForm({
      name: u.name,
      email: u.email,
      phone: u.phone || "",
      password: "",
      roleId: u.roleId,
      status: u.status === "inactive" ? "inactive" : "active",
    });
    setShowForm(true);
  };

  const toggleStatus = async (u: StaffRow) => {
    const next = u.status === "active" ? "inactive" : "active";
    const confirmed = await toast.confirm(
      next === "inactive" ? `Deactivate ${u.name}?` : `Activate ${u.name}?`,
      { confirmLabel: next === "inactive" ? "Deactivate" : "Activate" },
    );
    if (!confirmed) return;
    try {
      await API.patch(`/users/${u.id}/status`, { status: next });
      toast.success(next === "inactive" ? "Staff deactivated" : "Staff activated");
      fetchData();
    } catch (e: any) {
      toast.error("Could not update status", e.response?.data?.message || e.response?.data?.error);
    }
  };

  return (
    <div className="p-4 md:p-8 bg-background min-h-screen font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-primary-700 text-white rounded-card p-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users size={28} /> Staff
          </h1>
          <p className="text-white/80 text-sm mt-1">Create staff accounts and assign a role</p>
        </div>

        <div className="bg-surface rounded-card border border-sand p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-ink" />
              <span className="font-semibold text-ink">Search & filters</span>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-muted hover:text-ink"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, email, phone…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-sand rounded-lg focus:ring-2 focus:ring-primary-700 outline-none"
              />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={inputCls}>
              <option value="all">All roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className={inputCls}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {!loading && (
            <p className="text-xs text-muted">
              Showing {filteredStaff.length} of {staff.length} staff
            </p>
          )}
        </div>

        <div className="bg-surface rounded-card border border-sand shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-sand">
            <h2 className="font-bold text-ink">All staff</h2>
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-2 bg-primary-700 text-white px-4 py-2 rounded-control text-sm font-semibold hover:bg-primary-800"
            >
              <Plus size={16} /> Add staff
            </button>
          </div>

          {loading ? (
            <Loader size="sm" title="Loading staff..." subtitle="Fetching staff accounts" className="py-8" />
          ) : filteredStaff.length === 0 ? (
            <div className="p-8 text-center text-muted">
              {staff.length === 0 ? "No staff yet" : "No staff match your filters"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-muted uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((u) => (
                    <tr key={u.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-semibold">{u.name}</td>
                      <td className="px-4 py-3 text-muted">{u.role}</td>
                      <td className="px-4 py-3">{u.email}</td>
                      <td className="px-4 py-3 text-muted">{u.phone || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            u.status === "active"
                              ? "bg-primary-100 text-ink"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => editStaffMember(u)}
                            className="p-2 text-muted hover:text-amber-600"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(u)}
                            className="p-2 text-muted hover:text-ink"
                            title={u.status === "active" ? "Deactivate" : "Activate"}
                          >
                            {u.status === "active" ? <UserX size={16} /> : <UserCheck size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-ink">{editId ? "Edit staff" : "Add staff"}</h3>
              <button type="button" onClick={closeForm} className="text-muted hover:text-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveStaff} className="space-y-3">
              <input
                className={inputCls}
                placeholder="Full name"
                value={staffForm.name}
                onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                required
              />
              <input
                type="email"
                className={inputCls}
                placeholder="Email"
                value={staffForm.email}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                required
              />
              <input
                className={inputCls}
                placeholder="Phone"
                value={staffForm.phone}
                onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
              />
              <select
                className={inputCls}
                value={staffForm.roleId}
                onChange={(e) => setStaffForm({ ...staffForm, roleId: e.target.value })}
                required
              >
                <option value="" disabled>Select a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              <select
                className={inputCls}
                value={staffForm.status}
                onChange={(e) => setStaffForm({ ...staffForm, status: e.target.value as StaffStatus })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <input
                type="password"
                className={inputCls}
                placeholder={editId ? "New password (leave blank to keep)" : "Password"}
                value={staffForm.password}
                onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                required={!editId}
                minLength={7}
              />

              <button type="submit" className="w-full py-2.5 bg-primary-700 text-white rounded-control font-semibold">
                {editId ? "Save changes" : "Add staff"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Staffs;
