import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";

export function TopProgressBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary-100" role="progressbar" aria-label="Loading page">
      <div className="h-full w-1/2 animate-pulse bg-primary-700" />
    </div>
  );
}

/** Thin bar under the header while the route is changing. */
export function RouteProgress({ className }: { className?: string }) {
  const location = useLocation();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
    const timer = window.setTimeout(() => setActive(false), 450);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div className={cn("relative h-0.5", className)}>
      <TopProgressBar active={active} />
    </div>
  );
}
