import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tab = { id: string; label: string };

type TabsProps = {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  children?: ReactNode;
};

export default function Tabs({ tabs, value, onChange, children }: TabsProps) {
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 rounded-control bg-primary-50 p-1">
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "rounded-control px-3 py-1.5 text-sm font-semibold",
                selected ? "bg-surface text-primary-800 shadow-sm" : "text-muted",
              )}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
