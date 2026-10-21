import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const sizes = {
  sm: 14,
  md: 20,
  lg: 28,
} as const;

type SpinnerProps = {
  size?: keyof typeof sizes;
  inline?: boolean;
  label?: string;
  className?: string;
};

export default function Spinner({ size = "md", inline = false, label = "Loading", className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center justify-center text-primary", inline && "align-[-0.15em]", className)}
    >
      <Loader2 size={sizes[size]} className="animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
