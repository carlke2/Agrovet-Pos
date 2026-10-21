import type { HTMLAttributes } from "react";
import PageLoader from "@/components/ui/PageLoader";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

interface LoaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showText?: boolean;
  tone?: "brand" | "light";
}

/** Older pages still import this. New pages should use Spinner or PageLoader. */
export default function DashboardLoader({
  title = "Loading",
  subtitle,
  size = "md",
  showText = true,
  tone = "brand",
  className,
  ...props
}: LoaderProps) {
  if (!showText) {
    return (
      <div className={cn(tone === "light" && "text-white", className)} {...props}>
        <Spinner
          inline
          size={size === "lg" ? "lg" : "sm"}
          label={title}
          className={tone === "light" ? "text-white" : undefined}
        />
      </div>
    );
  }

  return <PageLoader label={title} detail={subtitle} className={className} />;
}
