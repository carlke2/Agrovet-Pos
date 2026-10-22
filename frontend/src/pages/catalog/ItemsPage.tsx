import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Drawer from "@/components/ui/Drawer";
import { FormField, Input, Select, Switch } from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import Money from "@/components/ui/Money";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import SearchInput from "@/components/ui/SearchInput";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import API from "@/services/api";
import { toast } from "@/services/toast";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  tracksExpiryByDefault: boolean;
  isActive: boolean;
};

type UnitRow = {
  id: string;
  name: string;
  abbreviation: string;
  isActive: boolean;
};

type ItemRow = {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  effectiveSku: string;
  barcode: string | null;
  categoryId: string;
  categoryName: string;
  unitId: string;
  unitName: string;
  unitAbbreviation: string;
  costPrice?: number | null;
  markupPercent?: number | null;
  sellingPrice: number | null;
  priceOverridden: boolean;
  taxType: "NONE" | "STANDARD" | "ZERO_RATED" | "EXEMPT";
  tracksExpiry: boolean;
  reorderLevel: number | null;
  isActive: boolean;
  needsPrice: boolean;
};

type ItemList = {
  items: ItemRow[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

type Preview = {
  resolvedMarkupPercent: number | null;
  markupSource: "item" | "category" | "parent category" | "none";
  suggestedSellingPrice: number | null;
};

type ItemForm = {
  name: string;
  categoryId: string;
  brand: string;
  sku: string;
  barcode: string;
  unitId: string;
  tracksExpiry: boolean;
  reorderLevel: string;
  taxType: ItemRow["taxType"];
  cost: string;
  markup: string;
  selling: string;
};

const EMPTY_FORM: ItemForm = {
  name: "",
  categoryId: "",
  brand: "",
  sku: "",
  barcode: "",
  unitId: "",
  tracksExpiry: false,
  reorderLevel: "0",
  taxType: "NONE",
  cost: "",
  markup: "",
  selling: "",
};

const TAX_OPTIONS: { value: ItemRow["taxType"]; label: string }[] = [
  { value: "NONE", label: "No tax" },
  { value: "STANDARD", label: "Standard" },
  { value: "ZERO_RATED", label: "Zero rated" },
  { value: "EXEMPT", label: "Exempt" },
];

function apiProblem(error: unknown): { message: string; field?: string; code?: string } {
  const data = (error as { response?: { data?: { error?: string; message?: string; field?: string; code?: string } } })?.response?.data;
  return {
    message: data?.error || data?.message || "Something went wrong. Try again.",
    field: data?.field,
    code: data?.code,
  };
}

function inputDecimal(value: number | null | undefined, places: number): string {
  if (value == null || Number.isNaN(value)) return "";
  const text = value.toFixed(places);
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

function cents(value: string): bigint | null {
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

function sameMoney(input: string, suggestion: number | null): boolean {
  if (suggestion == null) return false;
  const left = cents(input);
  const right = cents(inputDecimal(suggestion, 2));
  return left != null && right != null && left === right;
}

function categoryLabel(row: Category): string {
  const prefix = row.parentId ? "— " : "";
  return `${prefix}${row.name}${row.isActive ? "" : " (inactive)"}`;
}

export default function ItemsPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("manage_catalog") ?? false;
  const canViewCost = user?.permissions.includes("view_cost") ?? false;
  const canPrice = user?.permissions.includes("manage_prices") ?? false;

  const [rows, setRows] = useState<ItemRow[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("active");
  const [needsPrice, setNeedsPrice] = useState(false);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [originalCost, setOriginalCost] = useState("");
  const [originalMarkup, setOriginalMarkup] = useState("");
  const [sellingDirty, setSellingDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<ItemRow | null>(null);
  const [belowOpen, setBelowOpen] = useState(false);

  const [unitsOpen, setUnitsOpen] = useState(false);
  const [unitName, setUnitName] = useState("");
  const [unitAbbreviation, setUnitAbbreviation] = useState("");
  const [unitErrors, setUnitErrors] = useState<Record<string, string>>({});
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [pendingUnit, setPendingUnit] = useState<UnitRow | null>(null);
  const [unitStatusId, setUnitStatusId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const loadCategories = useCallback(async () => {
    const { data } = await API.get<Category[]>("/categories?includeInactive=true");
    setCategories(data);
  }, []);

  const loadUnits = useCallback(async (includeInactive: boolean) => {
    const { data } = await API.get<UnitRow[]>(`/units${includeInactive ? "?includeInactive=true" : ""}`);
    setUnits(data);
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      if (categoryId) params.set("categoryId", categoryId);
      params.set("status", status);
      if (needsPrice) params.set("needsPrice", "true");
      params.set("page", String(page));
      params.set("pageSize", "25");
      const { data } = await API.get<ItemList>(`/items?${params.toString()}`);
      setRows(data.items);
      setPageCount(data.pageCount);
      setTotal(data.total);
    } catch (err) {
      setRows([]);
      setError(apiProblem(err).message);
    } finally {
      setLoading(false);
    }
  }, [query, categoryId, status, needsPrice, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCategories().catch(() => {
      /* The item list error state covers a failed catalog. Category filters stay empty. */
    });
    void loadUnits(false).catch(() => {
      /* Units are loaded again when the form opens. */
    });
  }, [loadCategories, loadUnits]);

  useEffect(() => {
    if (!canPrice || !formOpen || !form.categoryId || form.cost.trim() === "") {
      setPreview(null);
      return;
    }
    const handle = window.setTimeout(() => {
      const body: Record<string, string> = {
        categoryId: form.categoryId,
        costPrice: form.cost.trim(),
      };
      if (form.markup.trim() !== "") body.markupPercent = form.markup.trim();
      void API.post<Preview>("/items/price-preview", body)
        .then(({ data }) => setPreview(data))
        .catch(() => setPreview(null));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [canPrice, formOpen, form.categoryId, form.cost, form.markup]);

  const openCreate = async () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOriginalCost("");
    setOriginalMarkup("");
    setSellingDirty(false);
    setFieldErrors({});
    setPreview(null);
    setFormOpen(true);
    try {
      await Promise.all([loadCategories(), loadUnits(false)]);
    } catch (err) {
      toast.error("Could not load the form", apiProblem(err).message);
    }
  };

  const openEdit = async (row: ItemRow) => {
    const cost = inputDecimal(row.costPrice, 2);
    const markup = inputDecimal(row.markupPercent, 2);
    setEditing(row);
    setForm({
      name: row.name,
      categoryId: row.categoryId,
      brand: row.brand || "",
      sku: row.sku || "",
      barcode: row.barcode || "",
      unitId: row.unitId,
      tracksExpiry: row.tracksExpiry,
      reorderLevel: inputDecimal(row.reorderLevel, 3) || "0",
      taxType: row.taxType,
      cost,
      markup,
      selling: inputDecimal(row.sellingPrice, 2),
    });
    setOriginalCost(cost);
    setOriginalMarkup(markup);
    setSellingDirty(false);
    setFieldErrors({});
    setFormOpen(true);
    try {
      await Promise.all([loadCategories(), loadUnits(true)]);
    } catch (err) {
      toast.error("Could not load the form", apiProblem(err).message);
    }
  };

  const sellingIsBelowCost = form.selling.trim() !== "" && form.cost.trim() !== "" && (() => {
    const selling = cents(form.selling);
    const cost = cents(form.cost);
    return selling != null && cost != null && selling < cost;
  })();

  const save = async (allowBelowCost = false) => {
    if (canPrice && !allowBelowCost && sellingIsBelowCost) {
      setBelowOpen(true);
      return;
    }
    setSaving(true);
    setFieldErrors({});
    const payload: Record<string, unknown> = {
      name: form.name,
      categoryId: form.categoryId,
      brand: form.brand.trim() === "" ? null : form.brand.trim(),
      sku: form.sku.trim() === "" ? null : form.sku.trim(),
      barcode: form.barcode.trim() === "" ? null : form.barcode.trim(),
      unitId: form.unitId,
      tracksExpiry: form.tracksExpiry,
      reorderLevel: form.reorderLevel.trim() === "" ? "0" : form.reorderLevel.trim(),
      taxType: form.taxType,
    };
    if (canPrice) {
      payload.costPrice = form.cost.trim() === "" ? null : form.cost.trim();
      payload.markupPercent = form.markup.trim() === "" ? null : form.markup.trim();
      if (!editing && form.selling.trim() !== "") payload.sellingPrice = form.selling.trim();
      if (editing && sellingDirty) payload.sellingPrice = form.selling.trim() === "" ? null : form.selling.trim();
      if (allowBelowCost) payload.allowBelowCost = true;
    }
    try {
      if (editing) await API.put(`/items/${editing.id}`, payload);
      else await API.post("/items", payload);
      toast.success(editing ? "Item updated" : "Item added");
      setFormOpen(false);
      setBelowOpen(false);
      await load();
    } catch (err) {
      const problem = apiProblem(err);
      if (problem.code === "BELOW_COST") {
        setBelowOpen(true);
      } else if (problem.field) {
        setFieldErrors({ [problem.field]: problem.message });
      } else {
        toast.error("Could not save item", problem.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: ItemRow, isActive: boolean) => {
    setStatusId(row.id);
    try {
      await API.patch(`/items/${row.id}/status`, { isActive });
      toast.success(isActive ? "Item activated" : "Item deactivated");
      setPendingItem(null);
      await load();
    } catch (err) {
      toast.error("Could not change status", apiProblem(err).message);
    } finally {
      setStatusId(null);
    }
  };

  const openUnits = async () => {
    setUnitsOpen(true);
    setUnitErrors({});
    setUnitsLoading(true);
    try {
      await loadUnits(true);
    } catch (err) {
      toast.error("Could not load units", apiProblem(err).message);
    } finally {
      setUnitsLoading(false);
    }
  };

  const addUnit = async () => {
    setUnitSaving(true);
    setUnitErrors({});
    try {
      const { data } = await API.post<UnitRow>("/units", {
        name: unitName,
        abbreviation: unitAbbreviation,
      });
      toast.success("Unit added");
      setUnitName("");
      setUnitAbbreviation("");
      await loadUnits(true);
      if (formOpen) setForm((current) => ({ ...current, unitId: data.id }));
    } catch (err) {
      const problem = apiProblem(err);
      if (problem.field) setUnitErrors({ [problem.field]: problem.message });
      else toast.error("Could not add unit", problem.message);
    } finally {
      setUnitSaving(false);
    }
  };

  const changeUnitStatus = async (unit: UnitRow, isActive: boolean) => {
    setUnitStatusId(unit.id);
    try {
      await API.patch(`/units/${unit.id}/status`, { isActive });
      toast.success(isActive ? "Unit activated" : "Unit deactivated");
      setPendingUnit(null);
      await loadUnits(true);
    } catch (err) {
      toast.error("Could not change unit", apiProblem(err).message);
    } finally {
      setUnitStatusId(null);
    }
  };

  const filtersOn = query !== "" || categoryId !== "" || status !== "active" || needsPrice;
  const pricingChanged = form.cost !== originalCost || form.markup !== originalMarkup;
  const showOverride =
    form.selling.trim() !== "" &&
    (preview?.suggestedSellingPrice == null
      ? Boolean(editing?.priceOverridden && !sellingDirty)
      : !sameMoney(form.selling, preview.suggestedSellingPrice));

  const formCategories = categories.filter((row) => row.isActive || row.id === form.categoryId);
  const formUnits = units.filter((unit) => unit.isActive || unit.id === form.unitId);

  const columns = useMemo<Column<ItemRow>[]>(() => {
    const base: Column<ItemRow>[] = [
      {
        key: "name",
        header: "Name",
        render: (row) => (
          <span>
            <span className="block font-semibold text-ink">{row.name}</span>
            <span className="block text-xs text-muted">
              {row.brand ? `${row.brand} · ${row.effectiveSku}` : row.effectiveSku}
            </span>
          </span>
        ),
      },
      { key: "category", header: "Category", render: (row) => row.categoryName },
      {
        key: "unit",
        header: "Unit",
        render: (row) => `${row.unitName} (${row.unitAbbreviation})`,
      },
    ];
    if (canViewCost) {
      base.push({
        key: "cost",
        header: "Cost",
        numeric: true,
        render: (row) => (row.costPrice == null ? "—" : <Money amount={row.costPrice} />),
      });
    }
    base.push(
      {
        key: "price",
        header: "Selling price",
        numeric: true,
        render: (row) =>
          row.needsPrice || row.sellingPrice == null ? (
            <StatusBadge variant="warning">Needs price</StatusBadge>
          ) : (
            <Money amount={row.sellingPrice} />
          ),
      },
      {
        key: "expiry",
        header: "Expiry tracking",
        render: (row) => (
          <StatusBadge variant={row.tracksExpiry ? "success" : "inactive"}>
            {row.tracksExpiry ? "Tracked" : "Not tracked"}
          </StatusBadge>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <StatusBadge variant={row.isActive ? "success" : "inactive"}>{row.isActive ? "Active" : "Inactive"}</StatusBadge>
        ),
      },
    );
    if (canManage) {
      base.push({
        key: "actions",
        header: "Actions",
        render: (row) => (
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void openEdit(row)} disabled={statusId === row.id}>
              Edit
            </Button>
            {row.isActive ? (
              <Button size="sm" variant="danger" onClick={() => setPendingItem(row)} disabled={statusId === row.id}>
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
    }
    return base;
  }, [canManage, canViewCost, statusId, load]);

  const unitColumns = useMemo<Column<UnitRow>[]>(
    () => [
      { key: "name", header: "Unit", render: (row) => row.name },
      { key: "abbreviation", header: "Abbreviation", render: (row) => row.abbreviation },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <StatusBadge variant={row.isActive ? "success" : "inactive"}>{row.isActive ? "Active" : "Inactive"}</StatusBadge>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) =>
          row.isActive ? (
            <Button size="sm" variant="danger" onClick={() => setPendingUnit(row)} disabled={unitStatusId === row.id}>
              Deactivate
            </Button>
          ) : (
            <Button size="sm" variant="secondary" loading={unitStatusId === row.id} onClick={() => void changeUnitStatus(row, true)}>
              Activate
            </Button>
          ),
      },
    ],
    [unitStatusId],
  );

  const markupHint = !form.categoryId
    ? "Choose a category to resolve the markup."
    : !preview || preview.markupSource === "none" || preview.resolvedMarkupPercent == null
      ? "No markup is set on this item, its category, or the parent category."
      : `Resolved markup is ${preview.resolvedMarkupPercent}% from ${preview.markupSource}.`;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Items"
        actions={
          canManage ? (
            <>
              <Button variant="secondary" onClick={() => void openUnits()}>
                Manage units
              </Button>
              <Button onClick={() => void openCreate()}>Add item</Button>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          label="Search items"
          placeholder="Search name, brand, SKU, or barcode"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full lg:max-w-sm"
        />
        <Select
          aria-label="Category"
          value={categoryId}
          className="lg:w-56"
          onChange={(event) => {
            setCategoryId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryLabel(category)}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          value={status}
          className="lg:w-40"
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </Select>
        <div className="flex items-center gap-3">
          <Switch
            checked={needsPrice}
            onCheckedChange={(checked) => {
              setNeedsPrice(checked);
              setPage(1);
            }}
            label="Needs price"
          />
          <span className="text-sm font-medium text-ink">Needs price</span>
        </div>
      </div>

      {error ? (
        <div className="rounded-card border border-sand bg-surface px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink">Could not load items</p>
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
          emptyTitle={filtersOn ? "No items match your filters" : "No items yet"}
          emptyMessage={filtersOn ? "Try a different search, category, or status." : "Items you add will be listed here."}
          emptyMode={filtersOn ? "search" : "empty"}
          emptyAction={
            canManage && !filtersOn ? (
              <Button onClick={() => void openCreate()}>Add item</Button>
            ) : undefined
          }
        />
      )}

      {!error && !loading && total > 0 ? <Pagination page={page} pageCount={pageCount} onPageChange={setPage} /> : null}

      <Drawer
        open={formOpen}
        side="right"
        widthClass="w-[min(100%,36rem)]"
        title={editing ? "Edit item" : "Add item"}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
      >
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-ink">Basics</h3>
            <FormField label="Name" htmlFor="item-name" error={fieldErrors.name}>
              <Input id="item-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </FormField>
            <FormField label="Category" htmlFor="item-category" error={fieldErrors.categoryId}>
              <Select
                id="item-category"
                value={form.categoryId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const category = categories.find((row) => row.id === nextId);
                  setForm({
                    ...form,
                    categoryId: nextId,
                    tracksExpiry: category ? category.tracksExpiryByDefault : form.tracksExpiry,
                  });
                }}
              >
                <option value="">Select a category</option>
                {formCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Brand" htmlFor="item-brand" error={fieldErrors.brand}>
              <Input id="item-brand" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
            </FormField>
            <FormField label="SKU" htmlFor="item-sku" hint="Leave blank to use ITM- followed by the item number." error={fieldErrors.sku}>
              <Input id="item-sku" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
            </FormField>
            <FormField label="Barcode" htmlFor="item-barcode" error={fieldErrors.barcode}>
              <Input id="item-barcode" value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} />
            </FormField>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-ink">Unit and stock rules</h3>
            <FormField label="Unit" htmlFor="item-unit" error={fieldErrors.unitId}>
              <Select id="item-unit" value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}>
                <option value="">Select a unit</option>
                {formUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.abbreviation}){unit.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </Select>
            </FormField>
            {canManage ? (
              <Button variant="secondary" onClick={() => void openUnits()}>
                Add unit
              </Button>
            ) : null}
            <FormField label="Tracks expiry" hint="Pre-selected from the category. Change it when this item is different.">
              <Switch
                checked={form.tracksExpiry}
                onCheckedChange={(tracksExpiry) => setForm({ ...form, tracksExpiry })}
                label="Tracks expiry"
              />
            </FormField>
            <FormField label="Reorder level" htmlFor="item-reorder" error={fieldErrors.reorderLevel}>
              <Input
                id="item-reorder"
                inputMode="decimal"
                value={form.reorderLevel}
                onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })}
              />
            </FormField>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-ink">Tax</h3>
            <FormField label="Tax type" htmlFor="item-tax" hint="Confirm the tax treatment with your accountant" error={fieldErrors.taxType}>
              <Select
                id="item-tax"
                value={form.taxType}
                onChange={(event) => setForm({ ...form, taxType: event.target.value as ItemRow["taxType"] })}
              >
                {TAX_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </section>

          {canPrice ? (
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-ink">Pricing</h3>
              <FormField label="Cost" htmlFor="item-cost" error={fieldErrors.costPrice}>
                <Input
                  id="item-cost"
                  inputMode="decimal"
                  value={form.cost}
                  onChange={(event) => setForm({ ...form, cost: event.target.value })}
                />
              </FormField>
              <FormField label="Markup %" htmlFor="item-markup" hint={markupHint} error={fieldErrors.markupPercent}>
                <Input
                  id="item-markup"
                  inputMode="decimal"
                  value={form.markup}
                  onChange={(event) => setForm({ ...form, markup: event.target.value })}
                />
              </FormField>
              <div className="rounded-control border border-sand bg-primary-50 px-3 py-2 text-sm text-ink">
                <p className="font-semibold">Suggested selling price</p>
                <p className="mt-1">
                  {preview?.suggestedSellingPrice == null ? "—" : <Money amount={preview.suggestedSellingPrice} />}
                </p>
                {editing && pricingChanged && preview?.suggestedSellingPrice != null ? (
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setForm({ ...form, selling: inputDecimal(preview.suggestedSellingPrice, 2) });
                      setSellingDirty(true);
                    }}
                  >
                    Apply suggestion
                  </Button>
                ) : null}
              </div>
              <FormField
                label="Selling price"
                htmlFor="item-selling"
                hint={editing ? "Cost and markup changes leave this price as it is until you edit it." : "Leave blank to save the suggested price."}
                error={fieldErrors.sellingPrice}
              >
                <Input
                  id="item-selling"
                  inputMode="decimal"
                  value={form.selling}
                  onChange={(event) => {
                    setSellingDirty(true);
                    setForm({ ...form, selling: event.target.value });
                  }}
                />
              </FormField>
              {showOverride ? <StatusBadge variant="info">Override</StatusBadge> : null}
              {sellingIsBelowCost ? (
                <p className="text-sm font-medium text-warning-ink">This selling price is below the cost price.</p>
              ) : null}
            </section>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-sand pt-4">
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void save(false)}>
              Save
            </Button>
          </div>
        </div>
      </Drawer>

      <Modal
        open={unitsOpen}
        title="Manage units"
        className="max-w-lg"
        closeDisabled={unitSaving}
        onClose={() => {
          if (!unitSaving) setUnitsOpen(false);
        }}
        footer={
          <Button variant="ghost" onClick={() => setUnitsOpen(false)} disabled={unitSaving}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
            <FormField label="Name" htmlFor="unit-name" error={unitErrors.name}>
              <Input id="unit-name" value={unitName} onChange={(event) => setUnitName(event.target.value)} />
            </FormField>
            <FormField label="Abbreviation" htmlFor="unit-abbreviation" error={unitErrors.abbreviation}>
              <Input
                id="unit-abbreviation"
                value={unitAbbreviation}
                onChange={(event) => setUnitAbbreviation(event.target.value)}
              />
            </FormField>
            <Button loading={unitSaving} onClick={() => void addUnit()}>
              Add unit
            </Button>
          </div>
          <DataTable
            columns={unitColumns}
            rows={units}
            rowKey={(row) => row.id}
            loading={unitsLoading}
            density="compact"
            emptyTitle="No units yet"
            emptyMessage="Units you add will be listed here."
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingItem != null}
        title="Deactivate this item?"
        message={pendingItem ? `"${pendingItem.name}" will be hidden from active lists.` : ""}
        confirmLabel="Deactivate"
        danger
        loading={statusId != null}
        onCancel={() => {
          if (!statusId) setPendingItem(null);
        }}
        onConfirm={() => {
          if (pendingItem) void changeStatus(pendingItem, false);
        }}
      />

      <ConfirmDialog
        open={pendingUnit != null}
        title="Deactivate this unit?"
        message={pendingUnit ? `"${pendingUnit.name}" cannot be chosen for new items until it is activated again.` : ""}
        confirmLabel="Deactivate"
        danger
        loading={unitStatusId != null}
        onCancel={() => {
          if (!unitStatusId) setPendingUnit(null);
        }}
        onConfirm={() => {
          if (pendingUnit) void changeUnitStatus(pendingUnit, false);
        }}
      />

      <ConfirmDialog
        open={belowOpen}
        title="Sell this item below cost?"
        message="The selling price is below the cost price. Save it only if that is intentional."
        confirmLabel="Save below cost"
        danger
        loading={saving}
        onCancel={() => {
          if (!saving) setBelowOpen(false);
        }}
        onConfirm={() => void save(true)}
      />
    </div>
  );
}
