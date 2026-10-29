import { Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Drawer from "@/components/ui/Drawer";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import SearchInput from "@/components/ui/SearchInput";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import API from "@/services/api";
import { toast } from "@/services/toast";

type Customer = {
  id: string;
  customerNo: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isSystem: boolean;
  isActive: boolean;
};

type CustomerList = {
  customers: Customer[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  notes: "",
};

function apiProblem(error: unknown): { message: string; field?: string; code?: string } {
  const data = (error as { response?: { data?: { error?: string; message?: string; field?: string; code?: string } } })?.response?.data;
  return {
    message: data?.error || data?.message || "Something went wrong. Try again.",
    field: data?.field,
    code: data?.code,
  };
}

function text(value: string | null | undefined): string {
  return value || "";
}

function customerCode(customerNo: number): string {
  return `CUS-${String(customerNo).padStart(5, "0")}`;
}

export default function CustomersPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("manage_customers") ?? false;
  const isAdmin = user?.role === "Admin";
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [walkInMissing, setWalkInMissing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Customer | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("page", String(page));
      params.set("pageSize", "25");
      if (query) params.set("search", query);
      const { data } = await API.get<CustomerList>(`/customers?${params.toString()}`);
      setRows(data.customers);
      setPageCount(data.pageCount);
      setTotal(data.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(apiProblem(err).message);
    } finally {
      setLoading(false);
    }
  }, [page, query, status]);

  const checkWalkIn = useCallback(async () => {
    if (!isAdmin) {
      setWalkInMissing(false);
      return;
    }
    try {
      await API.get("/customers/walk-in");
      setWalkInMissing(false);
    } catch (err) {
      setWalkInMissing(apiProblem(err).code === "WALKIN_MISSING");
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void checkWalkIn();
  }, [checkWalkIn]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormOpen(true);
  };

  const openEdit = (row: Customer) => {
    if (row.isSystem) return;
    setEditing(row);
    setForm({
      name: row.name,
      phone: text(row.phone),
      email: text(row.email),
      notes: text(row.notes),
    });
    setFieldErrors({});
    setFormOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFieldErrors({});
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
    };
    try {
      if (editing) await API.put(`/customers/${editing.id}`, payload);
      else await API.post("/customers", payload);
      toast.success(editing ? "Customer updated" : "Customer added");
      setFormOpen(false);
      await load();
    } catch (err) {
      const problem = apiProblem(err);
      if (problem.field) setFieldErrors({ [problem.field]: problem.message });
      else toast.error("Could not save customer", problem.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: Customer, isActive: boolean) => {
    if (row.isSystem) return;
    setStatusId(row.id);
    try {
      await API.patch(`/customers/${row.id}/status`, { isActive });
      toast.success(isActive ? "Customer activated" : "Customer deactivated");
      setPending(null);
      await load();
    } catch (err) {
      toast.error("Could not change status", apiProblem(err).message);
    } finally {
      setStatusId(null);
    }
  };

  const columns = useMemo<Column<Customer>[]>(() => {
    const base: Column<Customer>[] = [
      {
        key: "customerNo",
        header: "Customer no",
        render: (row) => <span className="tabular-nums">{customerCode(row.customerNo)}</span>,
      },
      {
        key: "name",
        header: "Name",
        render: (row) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            {row.isSystem ? <Lock size={14} className="text-muted" aria-hidden="true" /> : null}
            <span className="font-semibold text-ink">{row.name}</span>
            {row.isSystem ? <StatusBadge variant="info">System</StatusBadge> : null}
          </span>
        ),
      },
      { key: "phone", header: "Phone", render: (row) => row.phone || "—" },
      { key: "email", header: "Email", render: (row) => row.email || "—" },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <StatusBadge variant={row.isActive ? "success" : "inactive"}>{row.isActive ? "Active" : "Inactive"}</StatusBadge>
        ),
      },
    ];
    if (!canManage) return base;
    base.push({
      key: "actions",
      header: "Actions",
      render: (row) => {
        if (row.isSystem) return null;
        return (
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => openEdit(row)} disabled={statusId === row.id}>
              Edit
            </Button>
            {row.isActive ? (
              <Button size="sm" variant="danger" onClick={() => setPending(row)} disabled={statusId === row.id}>
                Deactivate
              </Button>
            ) : (
              <Button size="sm" variant="secondary" loading={statusId === row.id} onClick={() => void changeStatus(row, true)}>
                Activate
              </Button>
            )}
          </span>
        );
      },
    });
    return base;
  }, [canManage, statusId]);

  const filtersOn = query !== "" || status !== "active";
  const emptyTitle = filtersOn ? "No customers match" : "No customers yet";
  const emptyMessage = filtersOn ? "Try a different search or status." : "Customers you add will be listed here.";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Customers"
        subtitle="People you sell to"
        actions={canManage ? <Button onClick={openCreate}>Add customer</Button> : undefined}
      />

      {walkInMissing ? (
        <div className="rounded-card border border-sand bg-surface px-4 py-3" role="status">
          <p className="text-sm font-semibold text-ink">Walk-in customer is missing</p>
          <p className="mt-1 text-sm text-ink">Run npm run db:create-walkin</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          label="Search customers"
          placeholder="Search name, phone, or customer number"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="w-full sm:max-w-sm"
        />
        <Select
          aria-label="Status"
          value={status}
          className="sm:w-40"
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </Select>
      </div>

      {error ? (
        <div className="rounded-card border border-sand bg-surface px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink">Could not load customers</p>
          <p className="mt-1 text-sm text-ink">{error}</p>
          <Button className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle={emptyTitle}
          emptyMessage={emptyMessage}
          emptyMode={filtersOn ? "search" : "empty"}
          emptyAction={canManage && !filtersOn ? <Button onClick={openCreate}>Add customer</Button> : undefined}
        />
      )}

      {!error && !loading && total > 0 ? <Pagination page={page} pageCount={pageCount} onPageChange={setPage} /> : null}

      <Drawer
        open={formOpen}
        side="right"
        widthClass="w-[min(100%,36rem)]"
        title={editing ? "Edit customer" : "Add customer"}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
      >
        <div className="space-y-3">
          <FormField label="Name" htmlFor="customer-name" error={fieldErrors.name}>
            <Input
              id="customer-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </FormField>
          <FormField label="Phone" htmlFor="customer-phone" error={fieldErrors.phone}>
            <Input
              id="customer-phone"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            />
          </FormField>
          <FormField label="Email" htmlFor="customer-email" error={fieldErrors.email}>
            <Input
              id="customer-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </FormField>
          <FormField label="Notes" htmlFor="customer-notes" error={fieldErrors.notes}>
            <Textarea
              id="customer-notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </FormField>
          <div className="flex justify-end gap-2 border-t border-sand pt-4">
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={pending != null}
        title="Deactivate this customer?"
        message={pending ? `"${pending.name}" will be hidden from active lists.` : ""}
        confirmLabel="Deactivate"
        danger
        loading={statusId != null}
        onCancel={() => {
          if (!statusId) setPending(null);
        }}
        onConfirm={() => {
          if (pending) void changeStatus(pending, false);
        }}
      />
    </div>
  );
}
