import { useMemo } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const DOCUMENT_PAGE_SIZE = 10;

export function filterDocumentsByName<T extends {
  name?: string;
  title?: string;
  role_title?: string;
  company_name?: string;
  file_path?: string;
}>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const label =
      item.title ||
      item.name ||
      item.role_title ||
      "";
    const file = item.file_path?.split("/").pop() ?? "";
    const company = item.company_name ?? "";
    const haystack = `${label} ${file} ${company}`.toLowerCase();
    return haystack.includes(q);
  });
}

export function paginateItems<T>(items: T[], page: number, pageSize = DOCUMENT_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    totalPages,
    safePage,
    pageItems: items.slice(start, start + pageSize),
    total: items.length,
  };
}

export function useDocumentListState<T extends {
  name?: string;
  title?: string;
  role_title?: string;
  company_name?: string;
  file_path?: string;
}>(items: T[], searchQuery: string, page: number) {
  return useMemo(() => {
    const filtered = filterDocumentsByName(items, searchQuery);
    const pagination = paginateItems(filtered, page);
    return { filtered, ...pagination };
  }, [items, searchQuery, page]);
}

interface DocumentSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function DocumentSearchBar({
  value,
  onChange,
  placeholder = "Search by filename…",
}: DocumentSearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </div>
  );
}

interface DocumentPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function DocumentPagination({
  page,
  totalPages,
  total,
  onPageChange,
}: DocumentPaginationProps) {
  if (total <= DOCUMENT_PAGE_SIZE) return null;

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground">
        {total} item{total !== 1 ? "s" : ""} · Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={cn(
            "p-1.5 rounded-lg border border-border transition-colors",
            page <= 1
              ? "opacity-40 cursor-not-allowed"
              : "hover:bg-secondary text-foreground",
          )}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={cn(
            "p-1.5 rounded-lg border border-border transition-colors",
            page >= totalPages
              ? "opacity-40 cursor-not-allowed"
              : "hover:bg-secondary text-foreground",
          )}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
