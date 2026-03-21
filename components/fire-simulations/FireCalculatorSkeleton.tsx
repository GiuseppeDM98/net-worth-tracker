/**
 * FireCalculatorSkeleton — loading placeholder for the FIRE Calculator tab.
 *
 * Mirrors: Impostazioni FIRE card (2-col form) + 3 FIRE number metric cards
 * + Proiezione Scenari section with chart.
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
      {/* Impostazioni FIRE card */}
      <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <SkeletonBar className="h-5 w-5 rounded-full" />
          <SkeletonBar className="h-5 w-40" delayMs={20} />
        </div>
        <SkeletonBar className="h-3 w-80" delayMs={40} />
        <div className="grid gap-4 desktop:grid-cols-2">
          <div className="flex flex-col gap-2">
            <SkeletonBar className="h-4 w-44" delayMs={80} />
            <SkeletonBar className="h-10 w-full rounded-md" delayMs={100} />
            <SkeletonBar className="h-3 w-64" delayMs={120} />
          </div>
          <div className="flex flex-col gap-2">
            <SkeletonBar className="h-4 w-52" delayMs={80} />
            <SkeletonBar className="h-10 w-full rounded-md" delayMs={100} />
            <SkeletonBar className="h-3 w-56" delayMs={120} />
          </div>
        </div>
        {/* Toggle row */}
        <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <SkeletonBar className="h-4 w-60" delayMs={140} />
            <SkeletonBar className="h-3 w-80" delayMs={160} />
          </div>
          <SkeletonBar className="h-6 w-10 rounded-full shrink-0 ml-4" delayMs={160} />
        </div>
        <SkeletonBar className="h-10 w-32 rounded-md" delayMs={180} />
      </div>

      {/* 3 FIRE number metric cards */}
      <div className="grid gap-4 grid-cols-1 desktop:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-3">
            <SkeletonBar className="h-4 w-36" delayMs={220 + i * 60} />
            <SkeletonBar className="h-9 w-40" delayMs={250 + i * 60} />
            <SkeletonBar className="h-3 w-28" delayMs={280 + i * 60} />
          </div>
        ))}
      </div>

      {/* Proiezione Scenari card */}
      <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <SkeletonBar className="h-5 w-48" delayMs={400} />
          <SkeletonBar className="h-8 w-24 rounded-md" delayMs={420} />
        </div>
        {/* 3 scenario summary cards */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3 flex flex-col gap-2">
              <SkeletonBar className="h-4 w-20" delayMs={440 + i * 40} />
              <SkeletonBar className="h-6 w-28" delayMs={460 + i * 40} />
              <SkeletonBar className="h-3 w-24" delayMs={480 + i * 40} />
            </div>
          ))}
        </div>
        {/* Chart area */}
        <div
          className="w-full rounded-lg bg-muted motion-safe:animate-pulse motion-reduce:opacity-40"
          style={{ height: 320, animationDelay: '560ms' }}
        />
      </div>
    </div>
  );
}
