import Spinner from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

type PageLoaderProps = {
  label?: string;
  detail?: string;
  className?: string;
};

export default function PageLoader({ label = "Loading", detail, className }: PageLoaderProps) {
  return (
    <div className={cn("flex min-h-48 flex-col items-center justify-center gap-3 py-16 text-muted", className)}>
      <Spinner size="lg" label={label} />
      <div className="text-center">
        <p className="text-sm font-medium text-ink">{label}</p>
        {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
      </div>
    </div>
  );
}
