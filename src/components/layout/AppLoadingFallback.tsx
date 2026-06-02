// ✅ FIX P0-A: Route-level Suspense fallback matching app shell chrome (sidebar + header).

import { Skeleton } from "@/components/ui/SkeletonLoader";

export function AppLoadingFallback(): JSX.Element {
  return (
    <div className="flex h-[100vh] w-full overflow-hidden bg-background">
      {/* Sidebar skeleton */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card/40 p-4 gap-4">
        <Skeleton className="h-8 w-32" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-xl mt-auto" />
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar skeleton */}
        <header className="h-14 border-b border-border flex items-center gap-3 px-4 shrink-0">
          <Skeleton className="h-8 w-8 rounded-lg md:hidden" />
          <Skeleton className="h-6 w-40" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </header>

        {/* Main content skeleton */}
        <main className="flex-1 overflow-hidden p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <Skeleton className="h-8 w-56" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Skeleton className="h-48 rounded-2xl" />
                <Skeleton className="h-40 rounded-2xl" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-36 rounded-2xl" />
                <Skeleton className="h-28 rounded-2xl" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLoadingFallback;
