export type OrderReceiptLine = {
  name: string;
  quantity: number;
  price: number;
};

export type OrderReceiptData = {
  receiptNo: string;
  customerName: string;
  reference: string;
  items: OrderReceiptLine[];
  total: number;
  paidAt: string;
  paymentMethod?: string;
  /** Cashier who processed the sale */
  servedBy?: string;
};
