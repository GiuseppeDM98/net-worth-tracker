/**
 * AllocationPageSkeleton — loading placeholder for the Allocation page.
 *
 * Mirrors the real layout:
 * - Header with border-b
 * - Mobile/tablet: flat divide-y list (matches AllocationCard flat list structure)
 * - Desktop: table card with stacked cells
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

// Mirrors AllocationCard flat list item: name+chip row, dominant value, muted micro row
function AllocationListItemSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Row 1: name + badge */}
          <div className="mb-2 flex items-center gap-2">
            <SkeletonBar className="h-3.5 w-32" delayMs={delayMs} />
            <SkeletonBar className="h-5 w-14 rounded-full shrink-0" delayMs={delayMs + 20} />
          </div>
          {/* Row 2: dominant value */}
          <SkeletonBar className="h-7 w-36" delayMs={delayMs + 40} />
          {/* Row 3: micro context */}
          <div className="mt-1.5 flex items-center gap-2">
            <SkeletonBar className="h-3 w-10" delayMs={delayMs + 60} />
            <SkeletonBar className="h-3 w-16" delayMs={delayMs + 60} />
          </div>
        </div>
        {/* Chevron */}
        <SkeletonBar className="mt-1.5 h-4 w-4 shrink-0 rounded" delayMs={delayMs + 30} />
      </div>
    </div>
  );
}

function TableRowSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-0">
      <SkeletonBar className="h-4 w-32" delayMs={delayMs} />
      <div className="ml-auto flex flex-col items-end gap-1">
        <SkeletonBar className="h-4 w-20" delayMs={delayMs + 30} />
        <SkeletonBar className="h-3 w-12" delayMs={delayMs + 30} />
      </div>
      <div className="flex flex-col items-end gap-1">
        <SkeletonBar className="h-4 w-16" delayMs={delayMs + 30} />
        <SkeletonBar className="h-3 w-10" delayMs={delayMs + 30} />
      </div>
      <div className="flex flex-col items-end gap-1">
        <SkeletonBar className="h-4 w-14" delayMs={delayMs + 40} />
        <SkeletonBar className="h-3 w-10" delayMs={delayMs + 40} />
      </div>
      <SkeletonBar className="h-6 w-16 rounded-full" delayMs={delayMs + 50} />
    </div>
  );
}

export function AllocationPageSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="mb-2">
          <SkeletonBar className="h-3 w-28" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <SkeletonBar className="h-8 w-48" delayMs={20} />
            <SkeletonBar className="h-4 w-72" delayMs={40} />
          </div>
          <SkeletonBar className="h-9 w-36 rounded-md" delayMs={60} />
        </div>
      </div>

      {/* Mobile/tablet: flat list (mirrors real divide-y list) */}
      <div className="desktop:hidden overflow-hidden rounded-xl border border-border bg-card divide-y divide-border/50">
        {Array.from({ length: 6 }).map((_, i) => (
          <AllocationListItemSkeleton key={i} delayMs={80 + i * 50} />
        ))}
      </div>

      {/* Desktop: table card */}
      <div className="hidden desktop:block rounded-xl border border-border bg-card px-6 py-6">
        {/* Table header row */}
        <div className="flex items-center gap-4 pb-3 border-b border-border mb-1">
          <SkeletonBar className="h-3 w-24" delayMs={80} />
          <SkeletonBar className="h-3 w-20 ml-auto" delayMs={90} />
          <SkeletonBar className="h-3 w-16" delayMs={90} />
          <SkeletonBar className="h-3 w-20" delayMs={90} />
          <SkeletonBar className="h-3 w-14" delayMs={100} />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <TableRowSkeleton key={i} delayMs={120 + i * 40} />
        ))}
      </div>
    </div>
  );
}
