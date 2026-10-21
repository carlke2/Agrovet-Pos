import { AlertTriangle, CheckCircle2, Info, MinusCircle, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StatusVariant = "success" | "warning" | "danger" | "info" | "inactive";

const styles: Record<StatusVariant, { className: string; icon: typeof CheckCircle2; label: string }> = {
  success: { className: "bg-success-wash text-success-ink", icon: CheckCircle2, label: "Success" },
  warning: { className: "bg-warning-wash text-warning-ink", icon: AlertTriangle, label: "Warning" },
  danger: { className: "bg-danger-wash text-danger-ink", icon: XCircle, label: "Danger" },
  info: { className: "bg-info-wash text-info-ink", icon: Info, label: "Info" },
  inactive: { className: "bg-inactive-wash text-inactive-ink", icon: MinusCircle, label: "Inactive" },
};

type StatusBadgeProps = {
  variant: StatusVariant;
  children?: ReactNode;
  className?: string;
};

export default function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  const style = styles[variant];
  const Icon = style.icon;
  const label = children ?? style.label;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold", style.className, className)}>
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
