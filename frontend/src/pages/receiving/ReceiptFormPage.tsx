import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import PageHeader from "@/components/ui/PageHeader";
import PageLoader from "@/components/ui/PageLoader";
import StatusBadge, { type StatusVariant } from "@/components/ui/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/money";
import API from "@/services/api";
import { toast } from "@/services/toast";

type SupplierOption = { id: string; name: string };
type PackOption = { id: string; name: string; isActive: boolean };
type ItemHit = {
  id: string;
  name: string;
  effectiveSku: string;
  barcode: string | null;
  unitName: string;
  unitAbbreviation: string;
  tracksExpiry: boolean;
};
type ItemDetail = ItemHit & { packs?: PackOption[] };

type LineDraft = {
  key: string;
  itemId: string;
  itemName: string;
  unitName: string;
  unitAbbreviation: string;
  tracksExpiry: boolean;
  packs: PackOption[];
  packId: string;
  packName: string;
  quantity: string;
  cost: string;
  batchNo: string;
  expiryDate: string;
  manufactureDate: string;
  search: string;
  results: ItemHit[];
  quantityInBase: string;
  unitCostBase: string;
};

type Preview = { text: string; base: string | null; error: string };

type ReceiptDetail = {
  id: string;
  receiptNo: string;
  type: "DELIVERY" | "OPENING";
  status: string;
  vendorId: string | null;
  vendor: { id: string; name: string } | null;
  supplierInvoiceNo: string | null;
  receivedDate: string;
  notes: string | null;
  lines: Array<{
    itemId: string;
    item: { name: string; tracksExpiry: boolean; unit: { name: string; abbreviation: string } };
    packId: string | null;
    pack: { id: string; name: string } | null;
    quantityEntered: string;
    quantityInBase: string;
    costEntered?: string;
    unitCostBase?: string;
    batchNo: string | null;
    manufactureDate: string | null;
    expiryDate: string | null;
  }>;
};

type Problem = { message: string; field?: string; lineNo?: number };

function apiProblem(error: unknown): Problem {
  const data = (error as { response?: { data?: { error?: string; message?: string; field?: string; lineNo?: number } } })?.response?.data;
  return {
    message: data?.error || data?.message || "Something went wrong. Try again.",
    field: data?.field,
    lineNo: data?.lineNo,
  };
}

function nairobiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function showQuantity(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
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

function sumDecimals(values: string[]): string {
  let millis = 0n;
  for (const value of values) {
    if (!/^\d+(\.\d+)?$/.test(value)) return "";
    const [whole, frac = ""] = value.split(".");
    millis += BigInt(whole) * 1000n + BigInt((frac + "000").slice(0, 3));
  }
  const whole = millis / 1000n;
  const frac = (millis % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function emptyLine(): LineDraft {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemId: "",
    itemName: "",
    unitName: "",
    unitAbbreviation: "",
    tracksExpiry: false,
    packs: [],
    packId: "",
    packName: "",
    quantity: "",
    cost: "",
    batchNo: "",
    expiryDate: "",
    manufactureDate: "",
    search: "",
    results: [],
    quantityInBase: "",
    unitCostBase: "",
  };
}

function statusBadge(status: string): { variant: StatusVariant; label: string } {
  if (status === "CONFIRMED") return { variant: "success", label: "Confirmed" };
  if (status === "CANCELLED") return { variant: "inactive", label: "Cancelled" };
  return { variant: "warning", label: "Draft" };
}

function sentence(quantity: string, receivedAs: string, base: string, unit: string, unitCost: string, showCost: boolean): string {
  const cost = showCost && unitCost ? ` at ${formatMoney(moneyAmount(unitCost))} each` : "";
  return `${showQuantity(quantity)} ${receivedAs} = ${showQuantity(base)} ${unit}${cost}`;
}

export default function ReceiptFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canReceive = user?.permissions.includes("manage_receiving") ?? false;
  const canViewCost = user?.permissions.includes("view_cost") ?? false;
  const today = nairobiToday();
  const [loading, setLoading] = useState(Boolean(id));
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [type, setType] = useState<"DELIVERY" | "OPENING">("DELIVERY");
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [receivedDate, setReceivedDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<number, Record<string, string>>>({});
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const readOnly = !canReceive || status !== "DRAFT";
  const busy = saving || confirming || cancelling;

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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const { data } = await API.get<ReceiptDetail>(`/receipts/${id}`);
        const details = new Map<string, ItemDetail>();
        await Promise.all(
          [...new Set(data.lines.map((line) => line.itemId))].map(async (itemId) => {
            const item = await API.get<ItemDetail>(`/items/${itemId}`);
            details.set(itemId, item.data);
          }),
        );
        if (cancelled) return;
        setReceiptNo(data.receiptNo);
        setStatus(data.status);
        setType(data.type);
        setVendorId(data.vendorId || "");
        setVendorName(data.vendor?.name || "");
        setInvoiceNo(data.supplierInvoiceNo || "");
        setReceivedDate(data.receivedDate);
        setNotes(data.notes || "");
        setLines(
          data.lines.map((line) => {
            const detail = details.get(line.itemId);
            const packs = detail?.packs || [];
            const known = packs.some((pack) => pack.id === line.packId);
            const withSaved =
              line.pack && !known ? [...packs, { id: line.pack.id, name: line.pack.name, isActive: false }] : packs;
            return {
              key: `saved-${line.itemId}-${line.packId || "base"}-${line.quantityEntered}-${Math.random().toString(36).slice(2, 6)}`,
              itemId: line.itemId,
              itemName: line.item.name,
              unitName: line.item.unit.name,
              unitAbbreviation: line.item.unit.abbreviation,
              tracksExpiry: line.item.tracksExpiry,
              packs: withSaved,
              packId: line.packId || "",
              packName: line.pack?.name || "",
              quantity: showQuantity(line.quantityEntered),
              cost: line.costEntered == null ? "" : showQuantity(line.costEntered),
              batchNo: line.batchNo || "",
              expiryDate: line.expiryDate || "",
              manufactureDate: line.manufactureDate || "",
              search: "",
              results: [],
              quantityInBase: line.quantityInBase,
              unitCostBase: line.unitCostBase || "",
            };
          }),
        );
        setFieldErrors({});
        setLineErrors({});
      } catch (err) {
        if (!cancelled) setLoadError(apiProblem(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const linesRef = useRef(lines);
  linesRef.current = lines;
  const searchKey = lines.map((line) => `${line.key}:${line.itemId}:${line.search}`).join("\n");
  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    const handles = linesRef.current.map((line) => {
      if (line.itemId || line.search.trim().length < 1) return 0;
      return window.setTimeout(() => {
        const params = new URLSearchParams();
        params.set("search", line.search.trim());
        params.set("status", "active");
        params.set("pageSize", "8");
        void API.get<{ items: ItemHit[] }>(`/items?${params.toString()}`)
          .then(({ data }) => {
            if (cancelled) return;
            setLines((current) => current.map((item) => (item.key === line.key ? { ...item, results: data.items } : item)));
          })
          .catch(() => {
            if (cancelled) return;
            setLines((current) => current.map((item) => (item.key === line.key ? { ...item, results: [] } : item)));
          });
      }, 250);
    });
    return () => {
      cancelled = true;
      handles.forEach((handle) => {
        if (handle) window.clearTimeout(handle);
      });
    };
  }, [searchKey, readOnly]);

  const previewKey = lines.map((line) => `${line.key}|${line.itemId}|${line.packId}|${line.quantity}|${line.cost}`).join("\n");
  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void Promise.all(
        linesRef.current.map(async (line) => {
          if (!line.itemId || !line.quantity.trim()) return { key: line.key, text: "", base: null, error: "" };
          try {
            const body: Record<string, string> = { itemId: line.itemId, quantity: line.quantity.trim() };
            if (line.packId) body.packId = line.packId;
            if (line.cost.trim()) body.cost = line.cost.trim();
            const { data } = await API.post<{ quantityInBase: string; baseUnit: string; unitCostBase: string | null }>(
              "/receipts/lines/preview",
              body,
            );
            const receivedAs = line.packId ? line.packs.find((pack) => pack.id === line.packId)?.name || line.packName || "Pack" : line.unitName;
            return {
              key: line.key,
              text: sentence(line.quantity.trim(), receivedAs, data.quantityInBase, data.baseUnit, data.unitCostBase || "", canViewCost),
              base: data.quantityInBase,
              error: "",
            };
          } catch (err) {
            return { key: line.key, text: "", base: null, error: apiProblem(err).message };
          }
        }),
      ).then((results) => {
        if (cancelled) return;
        const next: Record<string, Preview> = {};
        for (const result of results) next[result.key] = result;
        setPreviews(next);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [previewKey, readOnly, canViewCost]);

  const supplierOptions = useMemo(() => {
    if (vendorId && vendorName && !suppliers.some((supplier) => supplier.id === vendorId)) {
      return [{ id: vendorId, name: vendorName }, ...suppliers];
    }
    return suppliers;
  }, [suppliers, vendorId, vendorName]);

  if (!id && !canReceive) return <Navigate to="/receipts" replace />;

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const chooseItem = async (key: string, hit: ItemHit) => {
    updateLine(key, {
      itemId: hit.id,
      itemName: hit.name,
      unitName: hit.unitName,
      unitAbbreviation: hit.unitAbbreviation,
      tracksExpiry: hit.tracksExpiry,
      packId: "",
      packName: "",
      packs: [],
      search: "",
      results: [],
    });
    try {
      const { data } = await API.get<ItemDetail>(`/items/${hit.id}`);
      updateLine(key, { packs: (data.packs || []).filter((pack) => pack.isActive), tracksExpiry: data.tracksExpiry });
    } catch (err) {
      toast.error("Could not load packs", apiProblem(err).message);
    }
  };

  const payload = () => ({
    type,
    vendorId: type === "DELIVERY" ? vendorId : null,
    supplierInvoiceNo: invoiceNo.trim() || null,
    receivedDate,
    notes: notes.trim() || null,
    lines: lines.map((line) => ({
      itemId: line.itemId,
      packId: line.packId || null,
      quantity: line.quantity.trim(),
      cost: line.cost.trim(),
      batchNo: line.batchNo.trim() || null,
      expiryDate: line.expiryDate || null,
      manufactureDate: line.manufactureDate || null,
    })),
  });

  const applyProblem = (problem: Problem) => {
    if (problem.lineNo && problem.field) {
      setLineErrors({ [problem.lineNo]: { [problem.field]: problem.message } });
      return;
    }
    if (problem.field) {
      setFieldErrors({ [problem.field]: problem.message });
      return;
    }
    toast.error("Could not save the receipt", problem.message);
  };

  const persist = async (): Promise<string> => {
    setFieldErrors({});
    setLineErrors({});
    if (id) {
      await API.put(`/receipts/${id}`, payload());
      return id;
    }
    const { data } = await API.post<{ id: string }>("/receipts", payload());
    return data.id;
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const savedId = await persist();
      toast.success("Draft saved");
      if (savedId !== id) navigate(`/receipts/${savedId}`, { replace: true });
    } catch (err) {
      applyProblem(apiProblem(err));
    } finally {
      setSaving(false);
    }
  };

  const askConfirm = () => {
    const missing = lines.some((line) => !previews[line.key]?.base);
    if (missing) {
      toast.error("Check each line", "Wait for the quantity preview before confirming.");
      return;
    }
    setConfirmOpen(true);
  };

  const unitsLabel = sumDecimals(lines.map((line) => previews[line.key]?.base || "").filter(Boolean));
  const itemWord = lines.length === 1 ? "item" : "items";
  const unitWord = unitsLabel === "1" ? "unit" : "units";

  const confirmReceipt = async () => {
    setConfirming(true);
    let savedId = id;
    try {
      savedId = await persist();
      await API.post(`/receipts/${savedId}/confirm`);
      toast.success("Receipt confirmed");
      setConfirmOpen(false);
      if (savedId !== id) navigate(`/receipts/${savedId}`, { replace: true });
      else setReloadKey((value) => value + 1);
    } catch (err) {
      applyProblem(apiProblem(err));
      setConfirmOpen(false);
      if (savedId && savedId !== id) navigate(`/receipts/${savedId}`, { replace: true });
    } finally {
      setConfirming(false);
    }
  };

  const cancelDraft = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      await API.post(`/receipts/${id}/cancel`);
      toast.success("Draft cancelled");
      setCancelOpen(false);
      navigate("/receipts");
    } catch (err) {
      applyProblem(apiProblem(err));
      setCancelOpen(false);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <PageHeader title={id ? "Receipt" : "New receipt"} />
        <PageLoader label="Loading receipt" detail="Fetching the receipt and its lines" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <PageHeader title="Receipt" />
        <div className="rounded-card border border-sand bg-surface px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink">Could not load the receipt</p>
          <p className="mt-1 text-sm text-ink">{loadError}</p>
          <Button className="mt-4" onClick={() => navigate("/receipts")}>
            Back to receipts
          </Button>
        </div>
      </div>
    );
  }

  const badge = statusBadge(status);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title={id ? receiptNo || "Receipt" : "New receipt"}
        subtitle={readOnly ? "This receipt can no longer be edited." : "Save a draft, or confirm to add the stock."}
        actions={
          readOnly ? (
            <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
          ) : (
            <>
              <Button variant="secondary" loading={saving} disabled={busy && !saving} onClick={() => void saveDraft()}>
                Save draft
              </Button>
              <Button loading={confirming} disabled={busy && !confirming} onClick={askConfirm}>
                Confirm receipt
              </Button>
              {id ? (
                <Button variant="danger" loading={cancelling} disabled={busy && !cancelling} onClick={() => setCancelOpen(true)}>
                  Cancel draft
                </Button>
              ) : null}
            </>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Type" htmlFor="receipt-type" error={fieldErrors.type}>
          <Select
            id="receipt-type"
            value={type}
            disabled={readOnly}
            onChange={(event) => {
              const next = event.target.value === "OPENING" ? "OPENING" : "DELIVERY";
              setType(next);
              if (next === "OPENING") setVendorId("");
            }}
          >
            <option value="DELIVERY">Delivery from supplier</option>
            <option value="OPENING">Opening stock</option>
          </Select>
        </FormField>
        <FormField
          label="Supplier"
          htmlFor="receipt-supplier"
          hint={type === "OPENING" ? "Opening stock does not need a supplier." : "Required for a delivery."}
          error={fieldErrors.vendorId}
        >
          <Select
            id="receipt-supplier"
            value={type === "OPENING" ? "" : vendorId}
            disabled={readOnly || type === "OPENING"}
            onChange={(event) => setVendorId(event.target.value)}
          >
            <option value="">Choose a supplier</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Supplier invoice no" htmlFor="receipt-invoice" error={fieldErrors.supplierInvoiceNo}>
          <Input
            id="receipt-invoice"
            value={invoiceNo}
            disabled={readOnly}
            onChange={(event) => setInvoiceNo(event.target.value)}
          />
        </FormField>
        <FormField label="Date received" htmlFor="receipt-date" error={fieldErrors.receivedDate}>
          <Input
            id="receipt-date"
            type="date"
            max={today}
            value={receivedDate}
            disabled={readOnly}
            onChange={(event) => setReceivedDate(event.target.value)}
          />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="Notes" htmlFor="receipt-notes" error={fieldErrors.notes}>
            <Textarea id="receipt-notes" value={notes} disabled={readOnly} onChange={(event) => setNotes(event.target.value)} />
          </FormField>
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => {
          const lineNo = index + 1;
          const errors = lineErrors[lineNo] || {};
          const preview = previews[line.key];
          const receivedAs = line.packId ? line.packs.find((pack) => pack.id === line.packId)?.name || line.packName : line.unitName;
          const stored = line.quantityInBase
            ? sentence(line.quantity, receivedAs || line.unitName, line.quantityInBase, line.unitAbbreviation, line.unitCostBase, canViewCost)
            : "";
          const live = readOnly ? stored : preview?.text || "";
          return (
            <section key={line.key} className="space-y-3 rounded-card border border-sand bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">Line {lineNo}</h2>
                {!readOnly && lines.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="block space-y-1.5">
                  <span className="text-sm font-semibold text-ink">Item</span>
                  {line.itemId ? (
                    <div className="flex h-10 items-center justify-between gap-2 rounded-control border border-sand px-3">
                      <span className="truncate text-sm text-ink">{line.itemName}</span>
                      {!readOnly ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateLine(line.key, { itemId: "", itemName: "", packs: [], packId: "", results: [], search: "" })}
                        >
                          Change
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        aria-label={`Search item for line ${lineNo}`}
                        placeholder="Name, SKU, or barcode"
                        value={line.search}
                        disabled={readOnly}
                        onChange={(event) => updateLine(line.key, { search: event.target.value, results: [] })}
                      />
                      {line.results.length > 0 ? (
                        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-control border border-sand bg-surface shadow-sm">
                          {line.results.map((hit) => (
                            <li key={hit.id}>
                              <Button
                                variant="ghost"
                                className="h-auto w-full justify-start px-3 py-2 text-left"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => void chooseItem(line.key, hit)}
                              >
                                <span className="block">
                                  <span className="block font-semibold text-ink">{hit.name}</span>
                                  <span className="block text-xs text-muted">
                                    {hit.effectiveSku}
                                    {hit.barcode ? ` · ${hit.barcode}` : ""}
                                  </span>
                                </span>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                  {errors.itemId ? <span className="block text-xs text-danger">{errors.itemId}</span> : null}
                </div>
                <FormField label="Received as" error={errors.packId}>
                  <Select
                    aria-label={`Received as for line ${lineNo}`}
                    value={line.packId}
                    disabled={readOnly || !line.itemId}
                    onChange={(event) => updateLine(line.key, { packId: event.target.value })}
                  >
                    <option value="">{line.unitName ? `${line.unitName} (${line.unitAbbreviation})` : "Base unit"}</option>
                    {line.packs
                      .filter((pack) => pack.isActive || pack.id === line.packId)
                      .map((pack) => (
                        <option key={pack.id} value={pack.id}>
                          {pack.name}
                        </option>
                      ))}
                  </Select>
                </FormField>
                <FormField label="Quantity" error={errors.quantity || (!readOnly ? preview?.error : "")}>
                  <Input
                    aria-label={`Quantity for line ${lineNo}`}
                    inputMode="decimal"
                    value={line.quantity}
                    disabled={readOnly}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                  />
                </FormField>
                {canViewCost || canReceive ? (
                  <FormField label="Cost per unit" error={errors.cost}>
                    <Input
                      aria-label={`Cost for line ${lineNo}`}
                      inputMode="decimal"
                      value={line.cost}
                      disabled={readOnly}
                      onChange={(event) => updateLine(line.key, { cost: event.target.value })}
                    />
                  </FormField>
                ) : null}
                <FormField label={line.tracksExpiry ? "Batch number (required)" : "Batch number"} error={errors.batchNo}>
                  <Input
                    aria-label={`Batch number for line ${lineNo}`}
                    value={line.batchNo}
                    disabled={readOnly}
                    onChange={(event) => updateLine(line.key, { batchNo: event.target.value })}
                  />
                </FormField>
                <FormField label={line.tracksExpiry ? "Expiry date (required)" : "Expiry date"} error={errors.expiryDate}>
                  <Input
                    aria-label={`Expiry date for line ${lineNo}`}
                    type="date"
                    value={line.expiryDate}
                    disabled={readOnly}
                    onChange={(event) => updateLine(line.key, { expiryDate: event.target.value })}
                  />
                </FormField>
                <FormField label="Manufacture date" hint="Optional" error={errors.manufactureDate}>
                  <Input
                    aria-label={`Manufacture date for line ${lineNo}`}
                    type="date"
                    value={line.manufactureDate}
                    disabled={readOnly}
                    onChange={(event) => updateLine(line.key, { manufactureDate: event.target.value })}
                  />
                </FormField>
              </div>
              {live ? <p className="text-sm text-ink">{live}</p> : null}
              {errors.lines ? <p className="text-xs text-danger">{errors.lines}</p> : null}
            </section>
          );
        })}
        {!readOnly && lines.length < 200 ? (
          <Button variant="secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>
            Add line
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm receipt"
        message={`This will add ${lines.length} ${itemWord} and ${unitsLabel || "0"} ${unitWord}. The receipt cannot be edited afterwards.`}
        confirmLabel="Confirm receipt"
        loading={confirming}
        onConfirm={() => void confirmReceipt()}
        onCancel={() => {
          if (!confirming) setConfirmOpen(false);
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        title="Cancel draft"
        message="This draft will be cancelled. It cannot be confirmed afterwards."
        confirmLabel="Cancel draft"
        danger
        loading={cancelling}
        onConfirm={() => void cancelDraft()}
        onCancel={() => {
          if (!cancelling) setCancelOpen(false);
        }}
      />
    </div>
  );
}
