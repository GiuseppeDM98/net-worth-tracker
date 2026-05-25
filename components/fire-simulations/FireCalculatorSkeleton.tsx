/**
 * FireCalculatorSkeleton — loading placeholder for the FIRE Calculator tab.
 *
 * Mirrors the post-load layout in order:
 * 1. Hero card (FIRE Number + progress chip + secondary row)
 * 2. Metrics card (sustainable income hero + divide-y rows)
 * 3. Settings collapsible trigger
 * 4. Runway card (summary rows + chart)
 * 5. Cashflow chart card
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

export function FireCalculatorSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero: FIRE Number */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-2 px-6 py-5">
          <SkeletonBar className="h-3 w-24" delayMs={0} />
          <SkeletonBar className="h-10 w-52" delayMs={20} />
          <div className="flex items-center gap-2 pt-0.5">
            <SkeletonBar className="h-5 w-28 rounded-md" delayMs={40} />
            <SkeletonBar className="h-3 w-36" delayMs={50} />
          </div>
          <SkeletonBar className="h-3 w-48" delayMs={60} />
        </div>
        <div className="divide-y border-t border-border">
          <div className="flex items-center justify-between px-6 py-3.5">
            <SkeletonBar className="h-3 w-24" delayMs={80} />
            <SkeletonBar className="h-4 w-16" delayMs={90} />
          </div>
        </div>
      </div>

      {/* Sustainable income: hero + divide-y rows */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-2 px-6 py-5">
          <SkeletonBar className="h-3 w-44" delayMs={120} />
          <SkeletonBar className="h-10 w-48" delayMs={140} />
          <SkeletonBar className="h-3 w-40" delayMs={160} />
        </div>
        <div className="divide-y border-t border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-6 py-3.5">
              <SkeletonBar className="h-3 w-28" delayMs={180 + i * 20} />
              <SkeletonBar className="h-4 w-24" delayMs={190 + i * 20} />
            </div>
          ))}
        </div>
      </div>

      {/* Settings collapsible trigger */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex flex-col gap-1.5">
            <SkeletonBar className="h-4 w-36" delayMs={260} />
            <SkeletonBar className="h-3 w-56" delayMs={280} />
          </div>
          <SkeletonBar className="h-4 w-4 rounded" delayMs={280} />
        </div>
      </div>

      {/* Runway card: summary rows + chart */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-1 px-6 pb-0 pt-6">
          <SkeletonBar className="h-5 w-56" delayMs={320} />
          <SkeletonBar className="h-3 w-72" delayMs={340} />
        </div>
        <div className="px-6 pb-6 pt-4 space-y-4">
          {/* Summary rows */}
          <div className="divide-y rounded-lg border border-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3.5">
                <div className="flex flex-col gap-1">
                  <SkeletonBar className="h-3.5 w-24" delayMs={360 + i * 20} />
                  <SkeletonBar className="h-3 w-36" delayMs={370 + i * 20} />
                </div>
                <SkeletonBar className="h-7 w-20" delayMs={380 + i * 20} />
              </div>
            ))}
          </div>
          {/* Chart area */}
          <div
            className="w-full rounded-lg bg-muted motion-safe:animate-pulse motion-reduce:opacity-40"
            style={{ height: 320, animationDelay: '440ms' }}
          />
        </div>
      </div>

      {/* Cashflow chart card */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-1 px-6 pb-0 pt-6">
          <SkeletonBar className="h-5 w-64" delayMs={480} />
          <SkeletonBar className="h-3 w-80" delayMs={500} />
        </div>
        <div className="px-6 pb-6 pt-4">
          <div
            className="w-full rounded-lg bg-muted motion-safe:animate-pulse motion-reduce:opacity-40"
            style={{ height: 280, animationDelay: '520ms' }}
          />
        </div>
      </div>
    </div>
  );
}
