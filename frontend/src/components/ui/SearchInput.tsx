import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
};

export default function SearchInput({ label = "Search", className, ...props }: SearchInputProps) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        className="h-10 w-full rounded-control border border-sand bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-inactive"
        {...props}
      />
    </label>
  );
}
