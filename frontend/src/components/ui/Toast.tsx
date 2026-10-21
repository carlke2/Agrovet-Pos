import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "success" | "warning" | "danger" | "info";

type ToastInput = { tone?: Tone; title: string; message?: string };

type ToastItem = ToastInput & { id: number; tone: Tone };

type ToastApi = {
  push: (toast: ToastInput) => void;
  success: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  danger: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const tones: Record<Tone, string> = {
  success: "border-success-wash",
  warning: "border-warning-wash",
  danger: "border-danger-wash",
  info: "border-info-wash",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((toast: ToastInput) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const item: ToastItem = { id, tone: toast.tone ?? "info", title: toast.title, message: toast.message };
    setItems((current) => [...current, item]);
    window.setTimeout(() => {
      setItems((current) => current.filter((entry) => entry.id !== id));
    }, 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, message) => push({ tone: "success", title, message }),
      warning: (title, message) => push({ tone: "warning", title, message }),
      danger: (title, message) => push({ tone: "danger", title, message }),
      info: (title, message) => push({ tone: "info", title, message }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(100%-2rem,22rem)] flex-col gap-2" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={cn("pointer-events-auto rounded-card border bg-surface p-3 shadow-md", tones[item.tone])}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                {item.message && <p className="mt-0.5 text-xs text-muted">{item.message}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                className="text-muted"
                onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
