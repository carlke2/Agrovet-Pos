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

type Supplier = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxPin: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
};

type SupplierList = {
  suppliers: Supplier[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

type SupplierForm = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  taxPin: string;
  paymentTerms: string;
  notes: string;
};

const EMPTY_FORM: SupplierForm = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  taxPin: "",
  paymentTerms: "",
  notes: "",
};

function apiProblem(error: unknown): { message: string; field?: string } {
  const data = (error as { response?: { data?: { error?: string; message?: string; field?: string } } })?.response?.data;
  return {
    message: data?.error || data?.message || "Something went wrong. Try again.",
    field: data?.field,
  };
}

function text(value: string | null | undefined): string {
  return value || "";
}

export default function SuppliersPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("manage_suppliers") ?? false;
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Supplier | null>(null);
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
      const { data } = await API.get<SupplierList>(`/suppliers?${params.toString()}`);
      setRows(data.suppliers);
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

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormOpen(true);
  };

  const openEdit = (row: Supplier) => {
    setEditing(row);
    setForm({
      name: row.name,
      contactPerson: text(row.contactPerson),
      phone: text(row.phone),
      email: text(row.email),
      address: text(row.address),
      taxPin: text(row.taxPin),
      paymentTerms: text(row.paymentTerms),
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
      contactPerson: form.contactPerson,
      phone: form.phone,
      email: form.email,
      address: form.address,
      taxPin: form.taxPin,
      paymentTerms: form.paymentTerms,
      notes: form.notes,
    };
    try {
      if (editing) await API.put(`/suppliers/${editing.id}`, payload);
      else await API.post("/suppliers", payload);
      toast.success(editing ? "Supplier updated" : "Supplier added");
      setFormOpen(false);
      await load();
    } catch (err) {
      const problem = apiProblem(err);
      if (problem.field) setFieldErrors({ [problem.field]: problem.message });
      else toast.error("Could not save supplier", problem.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: Supplier, isActive: boolean) => {
    setStatusId(row.id);
    try {
      await API.patch(`/suppliers/${row.id}/status`, { isActive });
      toast.success(isActive ? "Supplier activated" : "Supplier deactivated");
      setPending(null);
      await load();
    } catch (err) {
      toast.error("Could not change status", apiProblem(err).message);
    } finally {
      setStatusId(null);
    }
  };

  const columns = useMemo<Column<Supplier>[]>(() => {
    const base: Column<Supplier>[] = [
      {
        key: "name",
        header: "Name",
        render: (row) => (
          <span className="block">
            <span className="block font-semibold text-ink">{row.name}</span>
            {row.contactPerson ? <span className="block text-xs text-muted">{row.contactPerson}</span> : null}
          </span>
        ),
      },
      { key: "phone", header: "Phone", render: (row) => row.phone || "—" },
      { key: "email", header: "Email", render: (row) => row.email || "—" },
      { key: "terms", header: "Payment terms", render: (row) => row.paymentTerms || "—" },
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
      render: (row) => (
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
      ),
    });
    return base;
  }, [canManage, statusId]);

  const filtersOn = query !== "" || status !== "active";
  const emptyTitle = filtersOn ? "No suppliers match" : "No suppliers yet";
  const emptyMessage = filtersOn ? "Try a different search or status." : "Suppliers you add will be listed here.";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Suppliers"
        subtitle="Who you buy from"
        actions={canManage ? <Button onClick={openCreate}>Add supplier</Button> : undefined}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          label="Search suppliers"
          placeholder="Search name, contact person, or phone"
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
          <p className="text-base font-semibold text-ink">Could not load suppliers</p>
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
          emptyAction={canManage && !filtersOn ? <Button onClick={openCreate}>Add supplier</Button> : undefined}
        />
      )}

      {!error && !loading && total > 0 ? <Pagination page={page} pageCount={pageCount} onPageChange={setPage} /> : null}

      <Drawer
        open={formOpen}
        side="right"
        widthClass="w-[min(100%,36rem)]"
        title={editing ? "Edit supplier" : "Add supplier"}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
      >
        <div className="space-y-3">
          <FormField label="Name" htmlFor="supplier-name" error={fieldErrors.name}>
            <Input
              id="supplier-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </FormField>
          <FormField label="Contact person" htmlFor="supplier-contact" error={fieldErrors.contactPerson}>
            <Input
              id="supplier-contact"
              value={form.contactPerson}
              onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))}
            />
          </FormField>
          <FormField label="Phone" htmlFor="supplier-phone" error={fieldErrors.phone}>
            <Input
              id="supplier-phone"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            />
          </FormField>
          <FormField label="Email" htmlFor="supplier-email" error={fieldErrors.email}>
            <Input
              id="supplier-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </FormField>
          <FormField label="Address" htmlFor="supplier-address" error={fieldErrors.address}>
            <Textarea
              id="supplier-address"
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
            />
          </FormField>
          <FormField label="Tax PIN" htmlFor="supplier-tax" error={fieldErrors.taxPin}>
            <Input
              id="supplier-tax"
              value={form.taxPin}
              onChange={(event) => setForm((current) => ({ ...current, taxPin: event.target.value }))}
            />
          </FormField>
          <FormField
            label="Payment terms"
            htmlFor="supplier-terms"
            hint="For example: 30 days, or pay on delivery"
            error={fieldErrors.paymentTerms}
          >
            <Input
              id="supplier-terms"
              value={form.paymentTerms}
              onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))}
            />
          </FormField>
          <FormField label="Notes" htmlFor="supplier-notes" error={fieldErrors.notes}>
            <Textarea
              id="supplier-notes"
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
        title="Deactivate this supplier?"
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
