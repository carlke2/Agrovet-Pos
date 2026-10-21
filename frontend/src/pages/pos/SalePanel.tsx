import { ShoppingCart, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Money from "@/components/ui/Money";
import QuantityStepper from "@/components/ui/QuantityStepper";
import { formatMoney } from "@/lib/money";

export type SaleLine = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
};

type SalePanelProps = {
  lines: SaleLine[];
  total: number;
  cashierName: string;
  when: string;
  paying: boolean;
  onClear: () => void;
  onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onPay: () => void;
};

export default function SalePanel({
  lines,
  total,
  cashierName,
  when,
  paying,
  onClear,
  onQuantity,
  onRemove,
  onPay,
}: SalePanelProps) {
  const hasItems = lines.length > 0;

  return (
    <div className="flex h-full max-h-[calc(100vh-7rem)] min-h-0 flex-col gap-3 overflow-hidden">
      <Card padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-lg font-bold text-ink">Current sale</h2>
          <button
            type="button"
            onClick={onClear}
            disabled={!hasItems || paying}
            className="text-sm font-semibold text-primary-800 underline-offset-2 hover:underline disabled:text-muted disabled:no-underline"
          >
            Clear
          </button>
        </div>

        <div className="mx-5 mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-control border border-sand p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Date</p>
          <p className="tabular text-right text-sm font-semibold text-ink">{when}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Cashier</p>
          <p className="text-right text-sm font-semibold text-ink">{cashierName || "—"}</p>
        </div>

        <div className="mx-5 mt-3 flex items-center justify-between border-b border-sand pb-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Customer</p>
          <p className="text-sm font-semibold text-ink">Walk-in customer</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {hasItems ? (
            <ul>
              {lines.map((line) => (
                <li key={line.menuItemId} className="border-b border-sand py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink">{line.name}</p>
                    <button
                      type="button"
                      aria-label={`Remove ${line.name}`}
                      className="rounded-control p-2 text-danger"
                      onClick={() => onRemove(line.menuItemId)}
                      disabled={paying}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <QuantityStepper
                      value={line.quantity}
                      min={1}
                      label={line.name}
                      onChange={(quantity) => onQuantity(line.menuItemId, quantity)}
                    />
                    <div className="ml-auto text-right">
                      <p className="text-xs text-muted">
                        <Money amount={line.price} /> each
                      </p>
                      <p className="text-base font-semibold text-ink">
                        <Money amount={line.price * line.quantity} />
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<ShoppingCart size={22} aria-hidden="true" />}
              title="No items in the cart"
              message="Search or scan an item to start a sale"
              className="px-2 py-8"
            />
          )}
        </div>
      </Card>

      <Card className="shrink-0">
        <h2 className="text-lg font-bold text-ink">Price summary</h2>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-ink">Subtotal</span>
          <Money amount={total} className="font-semibold text-ink" />
        </div>
        <div className="my-3 border-t border-sand" />
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-ink">Total</span>
          <Money amount={total} className="text-2xl font-bold text-primary-700" />
        </div>
      </Card>

      <Button
        size="lg"
        className={`!min-h-14 w-full shrink-0 ${hasItems ? "" : "disabled:bg-primary-100 disabled:text-primary-800 disabled:opacity-100"}`}
        disabled={!hasItems}
        loading={paying}
        onClick={onPay}
      >
        {hasItems ? `Pay ${formatMoney(total)}` : "Add items to start"}
      </Button>
    </div>
  );
}
