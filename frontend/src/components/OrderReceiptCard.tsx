import { Download, Printer } from "lucide-react";
import {
  downloadOrderReceipt,
  printOrderReceipt,
  type OrderReceiptData,
} from "@/lib/orderReceipt";
import { toast } from "@/services/toast";

type Props = {
  data: OrderReceiptData;
  compact?: boolean;
};

const formatMoney = (amount: number) => `KES ${amount.toLocaleString()}`;

const OrderReceiptCard = ({ data, compact = false }: Props) => {
  const handlePrint = async () => {
    try {
      await printOrderReceipt(data);
    } catch (e: any) {
      toast.error("Print failed", e.message || "Could not open print window");
    }
  };

  const handleDownload = async () => {
    try {
      await downloadOrderReceipt(data);
      toast.success("Receipt downloaded", "Saved as PDF");
    } catch (e: any) {
      toast.error("Download failed", e.message || "Could not download receipt");
    }
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-5 text-left font-mono text-sm">
        <div className="text-center border-b border-gray-100 pb-4 mb-4">
          <p className="text-sm font-black text-[#334155]">Agrovet POS</p>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-sans">Receipt</p>
          <p className="text-base font-black text-[#334155] mt-2 tracking-wide">{data.receiptNo}</p>
          <p className="text-xs text-gray-500 mt-2 font-sans">
            {data.customerName} · {data.reference}
          </p>
          <p className="text-[10px] text-gray-400 font-sans">
            {new Date(data.paidAt).toLocaleString()}
            {data.paymentMethod ? ` · ${data.paymentMethod}` : ""}
          </p>
          {data.servedBy && (
            <p className="text-xs text-[#334155] font-semibold mt-2 font-sans">
              Served by: {data.servedBy}
            </p>
          )}
        </div>

        <div className="space-y-2">
          {data.items.map((item, i) => (
            <div key={i} className="flex justify-between gap-2 text-xs">
              <span className="flex-1 truncate">
                {item.name} <span className="text-gray-400">×{item.quantity}</span>
              </span>
              <span className="font-semibold shrink-0">{formatMoney(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 mt-4 pt-3 space-y-1 text-xs font-sans">
          <div className="flex justify-between font-bold text-[#334155]">
            <span>Total paid</span>
            <span>{formatMoney(data.total)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[#334155] text-[#334155] font-bold text-sm hover:bg-[#334155]/5 transition"
        >
          <Printer size={16} /> Print
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#334155] text-white font-bold text-sm hover:bg-[#334155]/90 transition"
        >
          <Download size={16} /> Download
        </button>
      </div>
    </div>
  );
};

export default OrderReceiptCard;
