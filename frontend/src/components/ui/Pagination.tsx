import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  const safeCount = Math.max(1, pageCount);
  return (
    <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        className="inline-flex h-10 items-center gap-1 rounded-control border border-sand bg-surface px-3 font-semibold text-ink disabled:opacity-40"
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Previous
      </button>
      <p className="tabular text-muted">
        Page {page} of {safeCount}
      </p>
      <button
        type="button"
        aria-label="Next page"
        disabled={page >= safeCount}
        className="inline-flex h-10 items-center gap-1 rounded-control border border-sand bg-surface px-3 font-semibold text-ink disabled:opacity-40"
        onClick={() => onPageChange(page + 1)}
      >
        Next
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
