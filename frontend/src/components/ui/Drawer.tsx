import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/useFocusTrap";

type DrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right" | "bottom";
  widthClass?: string;
};

export default function Drawer({ open, title, onClose, children, side = "left", widthClass }: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(open, panelRef, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close panel" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col bg-surface shadow-md outline-none",
          side === "bottom"
            ? "inset-x-0 bottom-0 h-[min(85vh,40rem)] w-full rounded-t-[16px]"
            : cn("top-0 h-full", widthClass ?? "w-[min(100%,20rem)]", side === "left" ? "left-0" : "right-0"),
        )}
      >
        <div className="border-b border-sand px-4 py-3">
          <h2 id={titleId} className="text-base font-bold text-ink">
            {title}
          </h2>
        </div>
        <div className={cn("min-h-0 flex-1 p-4", side === "bottom" ? "flex flex-col overflow-hidden" : "overflow-y-auto")}>{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
