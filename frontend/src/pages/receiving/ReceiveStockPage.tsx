import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { Input, Select } from "@/components/ui/Field";
import Money from "@/components/ui/Money";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import SearchInput from "@/components/ui/SearchInput";
import StatusBadge, { type StatusVariant } from "@/components/ui/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/datetime";
import API from "@/services/api";

type SupplierOption = { id: string; name: string };

type ReceiptRow = {
  id: string;
  receiptNo: string;
  receivedDate: string;
  supplierInvoiceNo: string | null;
  status: string;
  lineCount: number;
  totalCost?: string | null;
  vendor: { id: string; name: string } | null;
};

type ReceiptList = {
  receipts: ReceiptRow[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

function apiMessage(error: unknown): string {
  const data = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return data?.error || data?.message || "Something went wrong. Try again.";
}

function moneyAmount(value: string | null | undefined): number | null {
  if (!value || !/^-?\d+(\.\d+)?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, frac = ""] = (negative ? value.slice(1) : value).split(".");
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const amount = Number(cents) / 100;
  return negative ? -amount : amount;
}

function statusBadge(status: string): { variant: StatusVariant; label: string } {
  if (status === "CONFIRMED") return { variant: "success", label: "Confirmed" };
  if (status === "CANCELLED") return { variant: "inactive", label: "Cancelled" };
  return { variant: "warning", label: "Draft" };
}

export default function ReceiveStockPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canReceive = user?.permissions.includes("manage_receiving") ?? false;
  const canViewCost = user?.permissions.includes("view_cost") ?? false;
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    void API.get<{ suppliers: SupplierOption[]; pageCount: number }>("/suppliers?status=active&page=1&pageSize=100")
      .then(async ({ data }) => {
        const collected = [...data.suppliers];
        for (let next = 2; next <= data.pageCount && next <= 5; next += 1) {
          const pageData = await API.get<{ suppliers: SupplierOption[] }>(`/suppliers?status=active&page=${next}&pageSize=100`);
          collected.push(...pageData.data.suppliers);
        }
        if (!cancelled) setSuppliers(collected);
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "25");
      if (status) params.set("status", status);
      if (vendorId) params.set("vendorId", vendorId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (query) params.set("search", query);
      const { data } = await API.get<ReceiptList>(`/receipts?${params.toString()}`);
      setRows(data.receipts);
      setPageCount(data.pageCount);
      setTotal(data.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, status, vendorId, dateFrom, dateTo, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtersOn = Boolean(status || vendorId || dateFrom || dateTo || query);

  const columns = useMemo<Column<ReceiptRow>[]>(() => {
    const base: Column<ReceiptRow>[] = [
      {
        key: "receiptNo",
        header: "Receipt",
        render: (row) => (
          <Link to={`/receipts/${row.id}`} className="font-semibold text-primary-700">
            {row.receiptNo}
          </Link>
        ),
      },
      { key: "date", header: "Date", render: (row) => formatDate(row.receivedDate) },
      { key: "supplier", header: "Supplier", render: (row) => row.vendor?.name || "—" },
      { key: "invoice", header: "Invoice no", render: (row) => row.supplierInvoiceNo || "—" },
      { key: "lines", header: "Lines", numeric: true, render: (row) => row.lineCount },
    ];
    if (canViewCost) {
      base.push({
        key: "total",
        header: "Total",
        numeric: true,
        render: (row) => (row.totalCost == null ? "—" : <Money amount={moneyAmount(row.totalCost)} />),
      });
    }
    base.push({
      key: "status",
      header: "Status",
      render: (row) => {
        const badge = statusBadge(row.status);
        return <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>;
      },
    });
    return base;
  }, [canViewCost]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Receive stock"
        subtitle="Deliveries and opening stock"
        actions={
          canReceive ? (
            <Button onClick={() => navigate("/receipts/new")}>New receipt</Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Select
          aria-label="Supplier"
          value={vendorId}
          onChange={(event) => {
            setVendorId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All suppliers</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Date from"
          type="date"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value);
            setPage(1);
          }}
        />
        <Input
          aria-label="Date to"
          type="date"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value);
            setPage(1);
          }}
        />
        <SearchInput
          label="Search receipts"
          placeholder="Receipt no or invoice no"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error ? (
        <div className="rounded-card border border-sand bg-surface px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink">Could not load receipts</p>
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
          emptyTitle={filtersOn ? "No receipts match your filters" : "No receipts yet"}
          emptyMessage={filtersOn ? "Try a different status, supplier, date, or search." : "Receipts you save will be listed here."}
          emptyMode={filtersOn ? "search" : "empty"}
          emptyAction={
            canReceive && !filtersOn ? (
              <Button onClick={() => navigate("/receipts/new")}>New receipt</Button>
            ) : undefined
          }
        />
      )}

      {!error && !loading && total > 0 ? <Pagination page={page} pageCount={pageCount} onPageChange={setPage} /> : null}
    </div>
  );
}
