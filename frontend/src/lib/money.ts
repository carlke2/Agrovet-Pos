const money = new Intl.NumberFormat("en-KE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "KES 12,500" with thousands separators. Non-finite values render as KES 0. */
export function formatMoney(amount: number | null | undefined): string {
  const value = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return `KES ${money.format(value)}`;
}
