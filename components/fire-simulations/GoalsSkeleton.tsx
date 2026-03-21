/**
 * GoalsSkeleton — loading placeholder for the Goal-Based Investing tab.
 *
 * Mirrors: header + summary cards grid (4 cards) + goal detail cards list.
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

export function GoalsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <SkeletonBar className="h-6 w-52" delayMs={0} />
          <SkeletonBar className="h-4 w-72" delayMs={30} />
        </div>
        <SkeletonBar className="h-10 w-36 rounded-md" delayMs={60} />
      </div>

      {/* Summary cards (4-col on desktop, 2-col on mobile) */}
      <div className="grid gap-4 grid-cols-2 desktop:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card shadow-sm px-5 py-5 flex flex-col gap-3">
            <SkeletonBar className="h-4 w-28" delayMs={100 + i * 50} />
            <SkeletonBar className="h-8 w-20" delayMs={130 + i * 50} />
            <SkeletonBar className="h-3 w-24" delayMs={160 + i * 50} />
          </div>
        ))}
      </div>

      {/* Goal cards list */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
          {/* Goal header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SkeletonBar className="h-10 w-10 rounded-full" delayMs={320 + i * 80} />
              <div className="flex flex-col gap-1.5">
                <SkeletonBar className="h-5 w-36" delayMs={340 + i * 80} />
                <SkeletonBar className="h-3 w-24" delayMs={360 + i * 80} />
              </div>
            </div>
            <SkeletonBar className="h-8 w-20 rounded-md" delayMs={360 + i * 80} />
          </div>
          {/* Progress bar */}
          <SkeletonBar className="h-2.5 w-full rounded-full" delayMs={380 + i * 80} />
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex flex-col gap-1">
                <SkeletonBar className="h-3 w-20" delayMs={400 + i * 80 + j * 20} />
                <SkeletonBar className="h-5 w-24" delayMs={420 + i * 80 + j * 20} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
