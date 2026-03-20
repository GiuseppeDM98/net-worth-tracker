/**
 * DividendStatsSkeleton — loading placeholder for the DividendStats section.
 *
 * Mirrors the exact layout of DividendStats (3 metric cards, 2 side-by-side
 * charts, 1 full-width chart, 3 table cards) so the transition from loading
 * to loaded feels seamless rather than jarring.
 *
 * Follows the same pattern as PerformancePageSkeleton:
 * - motion-safe:animate-pulse so reduced-motion users see a static muted state
 * - per-element animationDelay for a left-to-right stagger wave
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

/** Reproduces a metric card: icon row + large value + two description lines. */
function StatCardSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <SkeletonBar className="h-3 w-36" delayMs={delayMs} />
        <SkeletonBar className="h-4 w-4 rounded-full" delayMs={delayMs} />
      </div>
      <SkeletonBar className="h-8 w-28" delayMs={delayMs + 50} />
      <SkeletonBar className="h-3 w-44" delayMs={delayMs + 100} />
      <SkeletonBar className="h-3 w-32" delayMs={delayMs + 100} />
    </div>
  );
}

/** Reproduces a chart card with a title and a filled chart area. */
function ChartCardSkeleton({
  height = 300,
  titleWidth = 'w-44',
  delayMs = 0,
}: {
  height?: number;
  titleWidth?: string;
  delayMs?: number;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
      <SkeletonBar className={`h-5 ${titleWidth}`} delayMs={delayMs} />
      {/* Use a plain div for the chart area so we can set an arbitrary pixel height via style */}
      <div
        className="w-full rounded-lg bg-muted motion-safe:animate-pulse motion-reduce:opacity-40"
        style={{ height, animationDelay: `${delayMs + 80}ms` }}
      />
    </div>
  );
}

/** Reproduces the Top Asset table card: title + N asset rows. */
function TopAssetsSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
      <SkeletonBar className="h-5 w-48" delayMs={delayMs} />
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SkeletonBar className="h-8 w-8 rounded-full" delayMs={delayMs + i * 60} />
              <div className="flex flex-col gap-1.5">
                <SkeletonBar className="h-3 w-16" delayMs={delayMs + i * 60} />
                <SkeletonBar className="h-3 w-28" delayMs={delayMs + i * 60 + 30} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <SkeletonBar className="h-4 w-20" delayMs={delayMs + i * 60} />
              <SkeletonBar className="h-3 w-14" delayMs={delayMs + i * 60 + 30} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Reproduces a table card (DPS Growth, Total Return): title + subtitle + rows. */
function TableCardSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SkeletonBar className="h-5 w-56" delayMs={delayMs} />
        <SkeletonBar className="h-3 w-80" delayMs={delayMs + 40} />
      </div>
      {/* Table header row */}
      <div className="flex gap-4 border-b pb-2">
        <SkeletonBar className="h-3 w-16" delayMs={delayMs + 80} />
        <SkeletonBar className="h-3 w-16 ml-auto" delayMs={delayMs + 80} />
        <SkeletonBar className="h-3 w-16" delayMs={delayMs + 80} />
        <SkeletonBar className="h-3 w-16" delayMs={delayMs + 80} />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <SkeletonBar className="h-3 w-20" delayMs={delayMs + 120 + i * 50} />
          <SkeletonBar className="h-3 w-12 ml-auto" delayMs={delayMs + 120 + i * 50} />
          <SkeletonBar className="h-3 w-12" delayMs={delayMs + 120 + i * 50} />
          <SkeletonBar className="h-3 w-12" delayMs={delayMs + 120 + i * 50} />
        </div>
      ))}
    </div>
  );
}

/**
 * Full-section skeleton that mirrors the structure of DividendStats.
 * Rendered while the /api/dividends/stats fetch is in progress on first load.
 */
export function DividendStatsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Row 1: 3 metric cards */}
      <div className="grid gap-4 grid-cols-1 desktop:grid-cols-3">
        <StatCardSkeleton delayMs={0} />
        <StatCardSkeleton delayMs={100} />
        <StatCardSkeleton delayMs={200} />
      </div>

      {/* Row 2: pie chart + bar chart side by side */}
      <div className="grid gap-6 desktop:grid-cols-2">
        <ChartCardSkeleton height={280} titleWidth="w-40" delayMs={300} />
        <ChartCardSkeleton height={300} titleWidth="w-40" delayMs={400} />
      </div>

      {/* Row 3: full-width line chart */}
      <ChartCardSkeleton height={300} titleWidth="w-56" delayMs={500} />

      {/* Row 4: Top Asset table */}
      <TopAssetsSkeleton delayMs={600} />

      {/* Row 5: DPS Growth table */}
      <TableCardSkeleton delayMs={700} />

      {/* Row 6: Total Return table */}
      <TableCardSkeleton delayMs={800} />
    </div>
  );
}
