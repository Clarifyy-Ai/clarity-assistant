import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./SkeletonLoader";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHead,
  TableFooter,
  TableCaption,
} from "./table";

export {
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableFooter,
  TableCaption,
};

interface DataTableProps {
  children?: ReactNode;
  className?: string;
  /** Show skeleton placeholder rows */
  loading?: boolean;
  skeletonRows?: number;
  skeletonColumns?: number;
  /** Render when `isEmpty` is true */
  empty?: ReactNode;
  isEmpty?: boolean;
}

function DataTableSkeleton({
  rows,
  columns,
}: {
  rows: number;
  columns: number;
}) {
  return (
    <Table>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex} className="hover:bg-transparent">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <TableCell key={colIndex}>
                <Skeleton
                  className={cn(
                    "h-4",
                    colIndex === columns - 1 ? "w-16 ml-auto" : "w-full max-w-[12rem]",
                  )}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Responsive table wrapper with loading skeleton and empty-state slots. */
export function DataTable({
  children,
  className,
  loading = false,
  skeletonRows = 5,
  skeletonColumns = 4,
  empty,
  isEmpty = false,
}: DataTableProps) {
  return (
    <div className={cn("relative w-full overflow-x-auto", className)}>
      {loading ? (
        <DataTableSkeleton rows={skeletonRows} columns={skeletonColumns} />
      ) : isEmpty && empty ? (
        empty
      ) : (
        children
      )}
    </div>
  );
}
