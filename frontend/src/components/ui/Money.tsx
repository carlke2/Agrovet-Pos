import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

type MoneyProps = {
  amount: number | null | undefined;
  className?: string;
};

export default function Money({ amount, className }: MoneyProps) {
  return <span className={cn("tabular", className)}>{formatMoney(amount)}</span>;
}
