export type { OrderReceiptData, OrderReceiptLine } from "@/lib/orderReceiptTypes";
export { downloadOrderReceipt, printOrderReceipt } from "@/lib/orderReceiptPdf";

import type { OrderReceiptData } from "@/lib/orderReceiptTypes";

export function receiptFromPosTransaction(
  receipt: {
    id: string;
    receiptNo?: string | null;
    totalAmount: number;
    createdAt: string;
    paymentMethod?: string;
    cashierName?: string | null;
    servedBy?: string | null;
    items: { quantity: number; price: number; menuItem: { name: string } }[];
    customer?: { name: string; reference: string } | null;
  },
  fallbackCustomer?: { name: string; reference: string },
  servedByOverride?: string,
): OrderReceiptData {
  const receiptNo =
    receipt.receiptNo ||
    `ORDER-${receipt.id.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-6)}`;

  const customer = receipt.customer ?? fallbackCustomer;
  const servedBy =
    servedByOverride?.trim() ||
    receipt.servedBy?.trim() ||
    receipt.cashierName?.trim() ||
    undefined;

  return {
    receiptNo,
    customerName: customer?.name ?? "Guest",
    reference: customer?.reference ?? "Walk-in",
    items: receipt.items.map((i) => ({
      name: i.menuItem.name,
      quantity: i.quantity,
      price: i.price,
    })),
    total: receipt.totalAmount,
    paidAt: receipt.createdAt,
    paymentMethod:
      receipt.paymentMethod === "mpesa"
        ? "M-Pesa"
        : receipt.paymentMethod === "cash"
          ? "Cash"
          : receipt.paymentMethod || "Paid",
    servedBy,
  };
}

export function receiptFromGuestCash(
  receipt: {
    id: string;
    receiptNo?: string | null;
    totalAmount: number;
    createdAt: string;
    paymentMethod?: string;
    cashierName?: string | null;
    servedBy?: string | null;
    items: { quantity: number; price: number; menuItem: { name: string } }[];
  },
  servedByOverride?: string,
): OrderReceiptData {
  return receiptFromPosTransaction(
    receipt,
    { name: "Guest", reference: "Walk-in · Cash" },
    servedByOverride,
  );
}

export function receiptFromApiResponse(
  receipt: {
    id: string;
    receiptNo?: string | null;
    totalAmount: number;
    createdAt: string;
    paymentMethod?: string;
    cashierName?: string | null;
    servedBy?: string | null;
    items: { quantity: number; price: number; menuItem: { name: string } }[];
  },
  customer: { name: string; reference: string },
  servedByOverride?: string,
) {
  return receiptFromPosTransaction(receipt, customer, servedByOverride);
}
