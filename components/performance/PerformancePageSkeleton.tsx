/**
 * PerformancePageSkeleton — loading placeholder for the Performance page.
 *
 * Mirrors the exact layout of the real page (header, tab bar, 3 metric sections,
 * chart area) so the transition from loading to loaded feels seamless rather than
 * jarring. Uses Tailwind animate-pulse for the shimmer effect.
 *
 * Stagger rationale: each card pulse is offset by 100ms so the wave travels
 * left-to-right across the grid instead of all blocks flashing in unison.
 *
 * Reduced-motion: respects prefers-reduced-motion by disabling pulse and using
 * a static muted opacity instead.
 */

import { cn } from '@/lib/utils';

// === Primitive building blocks ===

/** A single shimmer bar with configurable size. */
function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded bg-muted motion-safe:animate-pulse motion-reduce:opacity-40',
        className
      )}
    />
  );
}

// === Chart area skeleton ===

/** Placeholder for the Recharts area/line chart cards below the metric sections. */
function ChartSkeleton() {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-6 mt-6">
      <SkeletonBar className="h-5 w-44 mb-1" />
      <SkeletonBar className="h-3 w-64 mb-6" />
      <SkeletonBar className="h-64 w-full rounded-lg" />
    </div>
  );
}

// === Full page skeleton ===

/**
 * Full-page skeleton that mirrors the structure of PerformancePage.
 * Rendered while Firestore snapshot data is being fetched.
 */
export function PerformancePageSkeleton() {
  return (
    <div className="space-y-6 p-3 sm:p-6">

      {/* Header: title block + button group */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <SkeletonBar className="h-8 w-72" />
          <SkeletonBar className="h-4 w-80" />
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <SkeletonBar className="h-9 w-9 rounded-md sm:w-40" />
          <SkeletonBar className="h-9 w-36 rounded-md" />
          <SkeletonBar className="h-9 w-28 rounded-md" />
        </div>
      </div>

      {/* Period selector pill */}
      <SkeletonBar className="h-10 w-full rounded-md" />

      {/* Hero: dominant TWR block (2fr) + vital-signs companion (1fr) — mirrors PerformanceHero */}
      <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border bg-card px-[22px] py-6 flex flex-col gap-3">
          <SkeletonBar className="h-3 w-32" />
          <SkeletonBar className="h-12 w-48" />
          <SkeletonBar className="h-4 w-full max-w-md" />
          <SkeletonBar className="h-6 w-40 rounded-full mt-2" />
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-muted/40 px-3 py-2.5 flex flex-col gap-2">
              <SkeletonBar className="h-2.5 w-16" />
              <SkeletonBar className="h-6 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Consistency strip */}
      <SkeletonBar className="h-12 w-full rounded-xl" />

      {/* Charts area (detailed metrics are collapsed by default, so not shown in skeleton) */}
      <ChartSkeleton />
      <ChartSkeleton />

    </div>
  );
}
