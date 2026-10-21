import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bird,
  Bug,
  Droplet,
  FlaskConical,
  Leaf,
  Package,
  PawPrint,
  Pill,
  Shovel,
  Sprout,
  Syringe,
  Tags,
  Tractor,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { FormField, Input, Select, Switch, Textarea } from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import PageHeader from "@/components/ui/PageHeader";
import SearchInput from "@/components/ui/SearchInput";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";
import API from "@/services/api";
import { toast } from "@/services/toast";

type Category = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  parentName: string | null;
  defaultMarkupPercent: number | null;
  tracksExpiryByDefault: boolean;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
};

const ICONS: { name: string; icon: LucideIcon }[] = [
  { name: "leaf", icon: Leaf },
  { name: "droplet", icon: Droplet },
  { name: "paw-print", icon: PawPrint },
  { name: "syringe", icon: Syringe },
  { name: "pill", icon: Pill },
  { name: "sprout", icon: Sprout },
  { name: "wheat", icon: Wheat },
  { name: "bird", icon: Bird },
  { name: "shovel", icon: Shovel },
  { name: "flask-conical", icon: FlaskConical },
  { name: "package", icon: Package },
  { name: "bug", icon: Bug },
  { name: "tractor", icon: Tractor },
];

const EMPTY_FORM = {
  name: "",
  description: "",
  parentId: "",
  markup: "",
  tracksExpiry: false,
  icon: "" as string,
  sortOrder: "0",
};

function markupLabel(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Number.isInteger(value) ? value : value}%`;
}

function apiProblem(error: unknown): { message: string; field?: string } {
  const data = (error as { response?: { data?: { error?: string; message?: string; field?: string } } })?.response?.data;
  return {
    message: data?.error || data?.message || "Something went wrong. Try again.",
    field: data?.field,
  };
}

export default function CategoriesPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("manage_catalog") ?? false;
  const [rows, setRows] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [parents, setParents] = useState<Category[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Category | null>(null);
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
      if (showInactive) params.set("includeInactive", "true");
      if (query) params.set("search", query);
      const { data } = await API.get<Category[]>(`/categories?${params.toString()}`);
      setRows(data);
    } catch (err) {
      setRows([]);
      setError(apiProblem(err).message);
    } finally {
      setLoading(false);
    }
  }, [query, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = async () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormOpen(true);
    try {
      const { data } = await API.get<Category[]>("/categories");
      setParents(data.filter((row) => !row.parentId && row.isActive));
    } catch (err) {
      toast.error("Could not load parent categories", apiProblem(err).message);
    }
  };

  const openEdit = async (row: Category) => {
    setEditing(row);
    setForm({
      name: row.name,
      description: row.description || "",
      parentId: row.parentId || "",
      markup: row.defaultMarkupPercent == null ? "" : String(row.defaultMarkupPercent),
      tracksExpiry: row.tracksExpiryByDefault,
      icon: row.icon || "",
      sortOrder: String(row.sortOrder),
    });
    setFieldErrors({});
    setFormOpen(true);
    try {
      const { data } = await API.get<Category[]>("/categories?includeInactive=true");
      setParents(data.filter((item) => !item.parentId && item.isActive && item.id !== row.id));
    } catch (err) {
      toast.error("Could not load parent categories", apiProblem(err).message);
    }
  };

  const save = async () => {
    setSaving(true);
    setFieldErrors({});
    const payload = {
      name: form.name,
      description: form.description,
      parentId: form.parentId || null,
      defaultMarkupPercent: form.markup.trim() === "" ? null : Number(form.markup),
      tracksExpiryByDefault: form.tracksExpiry,
      icon: form.icon || null,
      sortOrder: form.sortOrder.trim() === "" ? 0 : Number(form.sortOrder),
    };
    try {
      if (editing) await API.put(`/categories/${editing.id}`, payload);
      else await API.post("/categories", payload);
      toast.success(editing ? "Category updated" : "Category added");
      setFormOpen(false);
      await load();
    } catch (err) {
      const problem = apiProblem(err);
      if (problem.field) setFieldErrors({ [problem.field]: problem.message });
      else toast.error("Could not save category", problem.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: Category, isActive: boolean) => {
    setStatusId(row.id);
    try {
      await API.patch(`/categories/${row.id}/status`, { isActive });
      toast.success(isActive ? "Category activated" : "Category deactivated");
      setPending(null);
      await load();
    } catch (err) {
      toast.error("Could not change status", apiProblem(err).message);
    } finally {
      setStatusId(null);
    }
  };

  const columns = useMemo<Column<Category>[]>(() => {
    const base: Column<Category>[] = [
      {
        key: "name",
        header: "Category",
        render: (row) => {
          const icon = ICONS.find((item) => item.name === row.icon)?.icon;
          const Icon = icon;
          return (
            <span className={cn("flex items-center gap-2", row.parentId && "pl-6")}>
              {Icon ? <Icon size={16} aria-hidden="true" /> : <Tags size={16} className="text-muted" aria-hidden="true" />}
              <span className="font-semibold text-ink">{row.name}</span>
            </span>
          );
        },
      },
      { key: "parent", header: "Parent", render: (row) => row.parentName || "—" },
      { key: "markup", header: "Default markup", render: (row) => markupLabel(row.defaultMarkupPercent) },
      {
        key: "expiry",
        header: "Tracks expiry",
        render: (row) => (
          <StatusBadge variant={row.tracksExpiryByDefault ? "success" : "inactive"}>
            {row.tracksExpiryByDefault ? "Yes" : "No"}
          </StatusBadge>
        ),
      },
      { key: "sort", header: "Sort order", numeric: true, render: (row) => row.sortOrder },
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
          <Button size="sm" variant="secondary" onClick={() => void openEdit(row)} disabled={statusId === row.id}>
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

  const emptyTitle = query ? "No categories match your search" : "No categories yet";
  const emptyMessage = query
    ? "Try a different name, or clear the search."
    : "Categories you add will be listed here.";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Categories"
        subtitle="Product groups for the catalog"
        actions={
          canManage ? (
            <Button onClick={() => void openCreate()}>Add category</Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          label="Search categories"
          placeholder="Search categories"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full sm:max-w-sm"
        />
        <div className="flex items-center gap-3">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} label="Show inactive" />
          <span className="text-sm font-medium text-ink">Show inactive</span>
        </div>
      </div>

      {error ? (
        <div className="rounded-card border border-sand bg-surface px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink">Could not load categories</p>
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
          emptyMode={query ? "search" : "empty"}
          emptyAction={
            canManage && !query ? (
              <Button onClick={() => void openCreate()}>Add category</Button>
            ) : undefined
          }
        />
      )}

      <Modal
        open={formOpen}
        title={editing ? "Edit category" : "Add category"}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        closeDisabled={saving}
        className="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Name" htmlFor="category-name" error={fieldErrors.name}>
            <Input
              id="category-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </FormField>
          <FormField label="Description" htmlFor="category-description" error={fieldErrors.description}>
            <Textarea
              id="category-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </FormField>
          <FormField label="Parent" htmlFor="category-parent" error={fieldErrors.parentId}>
            <Select
              id="category-parent"
              value={form.parentId}
              onChange={(event) => setForm({ ...form, parentId: event.target.value })}
            >
              <option value="">No parent</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Default markup %"
            htmlFor="category-markup"
            hint="Used for items that have no markup of their own"
            error={fieldErrors.defaultMarkupPercent}
          >
            <Input
              id="category-markup"
              inputMode="decimal"
              value={form.markup}
              onChange={(event) => setForm({ ...form, markup: event.target.value })}
            />
          </FormField>
          <FormField label="Tracks expiry by default" hint="New items in this category track expiry unless an item sets its own rule.">
            <Switch
              checked={form.tracksExpiry}
              onCheckedChange={(tracksExpiry) => setForm({ ...form, tracksExpiry })}
              label="Tracks expiry by default"
            />
          </FormField>
          <FormField label="Icon" error={fieldErrors.icon}>
            <div className="grid grid-cols-7 gap-2">
              {ICONS.map((item) => {
                const Icon = item.icon;
                const selected = form.icon === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    aria-label={item.name}
                    aria-pressed={selected}
                    className={cn(
                      "flex h-10 items-center justify-center rounded-control border",
                      selected ? "border-primary-700 bg-primary-100 text-primary-800" : "border-sand text-ink",
                    )}
                    onClick={() => setForm({ ...form, icon: selected ? "" : item.name })}
                  >
                    <Icon size={18} />
                  </button>
                );
              })}
            </div>
          </FormField>
          <FormField label="Sort order" htmlFor="category-sort" error={fieldErrors.sortOrder}>
            <Input
              id="category-sort"
              inputMode="numeric"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
            />
          </FormField>
        </div>
      </Modal>

      <ConfirmDialog
        open={pending != null}
        title="Deactivate this category?"
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
