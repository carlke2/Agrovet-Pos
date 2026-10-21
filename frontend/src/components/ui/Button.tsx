import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "accent" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary-700 text-white hover:bg-primary-800",
  accent: "bg-accent text-accent-foreground hover:brightness-95",
  secondary: "bg-primary-100 text-primary-800 hover:bg-primary-200",
  danger: "bg-danger text-white hover:brightness-95",
  ghost: "bg-transparent text-ink hover:bg-primary-50",
};

const sizes: Record<Size, string> = {
  sm: "min-h-8 px-3 text-xs gap-1.5",
  md: "min-h-10 px-4 text-sm gap-2",
  lg: "min-h-12 px-5 text-base gap-2",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  onClick,
  ...props
}: ButtonProps) {
  const blocked = disabled || loading;

  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      disabled={blocked}
      className={cn(
        "inline-flex items-center justify-center rounded-control font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      onClick={(event) => {
        if (blocked) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      {loading && <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
