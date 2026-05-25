/**
 * HallOfFameSkeleton — loading placeholder for the Hall of Fame page.
 *
 * Mirrors the redesigned layout: header, mobile nav pill, hero block,
 * spotlight grid, then the rankings card.
 */

import { cn } from '@/lib/utils';

function SkeletonBar({ className, delayMs = 0 }: { className?: string; delayMs?: number }) {
  return (
    <div
      className={cn('rounded bg-muted motion-safe:animate-pulse motion-reduce:opacity-40', className)}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    />
  );
}

function RankingRowSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3.5 border-b last:border-0">
      <SkeletonBar className="h-4 w-5 shrink-0" delayMs={delayMs} />
      <SkeletonBar className="h-4 w-28 flex-1" delayMs={delayMs + 20} />
      <SkeletonBar className="h-4 w-20 ml-auto" delayMs={delayMs + 40} />
    </div>
  );
}

export function HallOfFameSkeleton() {
  return (
    <div className="p-4 sm:p-6 desktop:p-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="space-y-2">
          <SkeletonBar className="h-3 w-28" />
          <div className="flex items-center gap-3">
            <SkeletonBar className="h-7 w-7 rounded-full" delayMs={20} />
            <SkeletonBar className="h-8 w-40" delayMs={40} />
          </div>
          <SkeletonBar className="h-4 w-72" delayMs={60} />
        </div>
        {/* Mobile nav pill skeleton */}
        <SkeletonBar className="h-11 w-full rounded-lg desktop:hidden" delayMs={80} />
        <div className="h-px bg-border/40" />
      </div>

      {/* Hero block */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-6 space-y-2">
          <SkeletonBar className="h-3 w-40" delayMs={100} />
          <SkeletonBar className="h-10 w-48" delayMs={120} />
          <SkeletonBar className="h-4 w-32" delayMs={140} />
        </div>
        <div className="border-t border-border/60 flex items-center justify-between px-6 py-3.5">
          <SkeletonBar className="h-4 w-24" delayMs={160} />
          <SkeletonBar className="h-4 w-28" delayMs={180} />
        </div>
      </div>

      {/* Spotlight grid */}
      <div className="grid gap-4 desktop:grid-cols-2">
        {[200, 280].map((delay) => (
          <div key={delay} className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
              <div className="space-y-1.5">
                <SkeletonBar className="h-3 w-24" delayMs={delay} />
                <SkeletonBar className="h-6 w-32" delayMs={delay + 20} />
              </div>
              <SkeletonBar className="h-6 w-28 rounded-md" delayMs={delay + 40} />
            </div>
            <div className="px-6 py-4 space-y-1">
              <SkeletonBar className="h-4 w-full" delayMs={delay + 60} />
              <SkeletonBar className="h-4 w-3/4" delayMs={delay + 80} />
            </div>
          </div>
        ))}
      </div>

      {/* Rankings section */}
      <div className="space-y-3 border-t border-border/40 pt-6">
        <SkeletonBar className="h-3 w-20" delayMs={360} />
        <SkeletonBar className="h-6 w-36" delayMs={380} />
        {/* Category pill skeleton */}
        <SkeletonBar className="h-11 w-full rounded-lg" delayMs={400} />
        {/* Ranking card skeleton */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 space-y-1">
            <SkeletonBar className="h-4 w-48" delayMs={420} />
            <SkeletonBar className="h-3 w-72" delayMs={440} />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <RankingRowSkeleton key={i} delayMs={460 + i * 40} />
          ))}
        </div>
      </div>
    </div>
  );
}
