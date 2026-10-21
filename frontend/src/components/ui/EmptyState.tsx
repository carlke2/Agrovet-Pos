import { Inbox, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  mode?: "empty" | "search";
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({ mode = "empty", icon, title, message, action, className }: EmptyStateProps) {
  const Fallback = mode === "search" ? SearchX : Inbox;

  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-card bg-primary-50 text-primary-700">
        {icon ?? <Fallback size={22} aria-hidden="true" />}
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
