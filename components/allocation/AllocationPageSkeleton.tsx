/**
 * AllocationPageSkeleton — loading placeholder for the Allocation page.
 *
 * Mirrors the main view layout: header, legend box, then
 * - Mobile/tablet: asset class cards grid (1-col)
 * - Desktop: table card with rows
 */

import { cn } from '@/lib/utils';

function SkeletonBar({ className, delayMs = 0 }: { className?: string; delayMs?: number }) {
  return (
    <div
      className={cn(
        'rounded bg-muted motion-safe:animate-pulse motion-reduce:opacity-40',
        className
      )}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    />
  );
}

function AssetClassCardSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SkeletonBar className="h-4 w-24" delayMs={delayMs} />
        <SkeletonBar className="h-5 w-14 rounded-full" delayMs={delayMs + 30} />
      </div>
      <div className="flex items-center justify-between">
        <SkeletonBar className="h-6 w-16" delayMs={delayMs + 60} />
        <SkeletonBar className="h-4 w-10" delayMs={delayMs + 60} />
      </div>
      <SkeletonBar className="h-2 w-full rounded-full" delayMs={delayMs + 90} />
      <SkeletonBar className="h-4 w-28" delayMs={delayMs + 120} />
    </div>
  );
}

function TableRowSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-0">
      <SkeletonBar className="h-4 w-24" delayMs={delayMs} />
      <SkeletonBar className="h-4 w-16 ml-auto" delayMs={delayMs + 30} />
      <SkeletonBar className="h-4 w-20" delayMs={delayMs + 30} />
      <SkeletonBar className="h-4 w-16" delayMs={delayMs + 30} />
      <SkeletonBar className="h-4 w-20" delayMs={delayMs + 30} />
      <SkeletonBar className="h-4 w-16" delayMs={delayMs + 50} />
      <SkeletonBar className="h-4 w-20" delayMs={delayMs + 50} />
      <SkeletonBar className="h-6 w-16 rounded-full" delayMs={delayMs + 60} />
    </div>
  );
}

export function AllocationPageSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-col gap-2">
          <SkeletonBar className="h-8 w-48" />
          <SkeletonBar className="h-4 w-72" delayMs={40} />
        </div>
        <SkeletonBar className="h-9 w-36 rounded-md" delayMs={80} />
      </div>

      {/* Legend info box */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 sm:p-4 flex flex-col gap-2">
        <SkeletonBar className="h-4 w-20 bg-blue-200 dark:bg-blue-800" delayMs={100} />
        <SkeletonBar className="h-3 w-64 bg-blue-200 dark:bg-blue-800" delayMs={130} />
        <SkeletonBar className="h-3 w-56 bg-blue-200 dark:bg-blue-800" delayMs={150} />
        <SkeletonBar className="h-3 w-48 bg-blue-200 dark:bg-blue-800" delayMs={170} />
      </div>

      {/* Mobile/tablet: card grid */}
      <div className="desktop:hidden space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <AssetClassCardSkeleton key={i} delayMs={200 + i * 60} />
        ))}
      </div>

      {/* Desktop: table card */}
      <div className="hidden desktop:block rounded-xl border bg-card shadow-sm px-6 py-6">
        {/* Table header */}
        <div className="flex items-center gap-4 pb-3 border-b mb-1">
          <SkeletonBar className="h-3 w-24" delayMs={200} />
          <SkeletonBar className="h-3 w-16 ml-auto" delayMs={220} />
          <SkeletonBar className="h-3 w-20" delayMs={220} />
          <SkeletonBar className="h-3 w-16" delayMs={220} />
          <SkeletonBar className="h-3 w-20" delayMs={220} />
          <SkeletonBar className="h-3 w-16" delayMs={240} />
          <SkeletonBar className="h-3 w-20" delayMs={240} />
          <SkeletonBar className="h-3 w-16" delayMs={240} />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <TableRowSkeleton key={i} delayMs={260 + i * 50} />
        ))}
      </div>
    </div>
  );
}
