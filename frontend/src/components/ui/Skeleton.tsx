import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-control bg-primary-100", className)} />;
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-card border border-sand bg-surface p-5 shadow-sm", className)}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-8 w-40" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-2/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-sand bg-surface" role="status" aria-label="Loading table">
      <div className="grid gap-3 border-b border-sand bg-primary-50 px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-sand">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="grid gap-3 px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }, (_, column) => (
              <Skeleton key={column} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
