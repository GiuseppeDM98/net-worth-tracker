/**
 * MonteCarloSkeleton — loading placeholder for the Monte Carlo tab.
 *
 * Mirrors: info card + scenario params cards + run button + results area.
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

export function MonteCarloSkeleton() {
  return (
    <div className="space-y-6">
      {/* Info card (gradient) */}
      <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-3">
        <SkeletonBar className="h-5 w-56" delayMs={0} />
        <div className="space-y-2">
          <SkeletonBar className="h-3 w-full" delayMs={40} />
          <SkeletonBar className="h-3 w-5/6" delayMs={60} />
          <SkeletonBar className="h-3 w-4/5" delayMs={80} />
        </div>
      </div>

      {/* Parametri + Allocazione section (2-col on desktop) */}
      <div className="grid gap-6 desktop:grid-cols-2">
        {/* Parametri card */}
        <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
          <SkeletonBar className="h-5 w-40" delayMs={120} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <SkeletonBar className="h-4 w-32" delayMs={150 + i * 40} />
              <SkeletonBar className="h-10 w-full rounded-md" delayMs={170 + i * 40} />
            </div>
          ))}
        </div>
        {/* Allocazione card */}
        <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <SkeletonBar className="h-5 w-36" delayMs={120} />
            <SkeletonBar className="h-8 w-32 rounded-md" delayMs={140} />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-1">
              <SkeletonBar className="h-4 w-24" delayMs={170 + i * 40} />
              <SkeletonBar className="h-8 w-20 rounded-md ml-auto" delayMs={190 + i * 40} />
              <SkeletonBar className="h-4 w-8" delayMs={200 + i * 40} />
            </div>
          ))}
        </div>
      </div>

      {/* Run button area */}
      <div className="flex justify-center">
        <SkeletonBar className="h-11 w-48 rounded-md" delayMs={380} />
      </div>

      {/* Results: chart + percentile table */}
      <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
        <SkeletonBar className="h-5 w-52" delayMs={420} />
        <div
          className="w-full rounded-lg bg-muted motion-safe:animate-pulse motion-reduce:opacity-40"
          style={{ height: 300, animationDelay: '460ms' }}
        />
        {/* Percentile rows */}
        <div className="grid gap-2 grid-cols-3 sm:grid-cols-5 mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3 flex flex-col gap-2 items-center">
              <SkeletonBar className="h-3 w-12" delayMs={500 + i * 40} />
              <SkeletonBar className="h-5 w-20" delayMs={520 + i * 40} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
