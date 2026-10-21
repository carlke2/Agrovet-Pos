import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padded?: boolean;
};

export default function Card({ children, className, padded = true, ...props }: CardProps) {
  return (
    <section
      className={cn("rounded-card border border-sand bg-surface shadow-sm", padded && "p-5", className)}
      {...props}
    >
      {children}
    </section>
  );
}
