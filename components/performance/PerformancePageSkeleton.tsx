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

// === Metric card skeleton ===

/**
 * Reproduces the structure of a real MetricCard:
 * CardHeader row (title + help icon placeholder) + large value + small description.
 *
 * @param delayMs - animation-delay in ms for the stagger wave effect
 */
function MetricCardSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div
      className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-3"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {/* Card header row: title + icon */}
      <div className="flex justify-between items-center">
        <SkeletonBar className="h-3 w-24" />
        <SkeletonBar className="h-4 w-4 rounded-full" />
      </div>
      {/* Large metric value */}
      <SkeletonBar className="h-7 w-20" />
      {/* Description line */}
      <SkeletonBar className="h-3 w-36" />
    </div>
  );
}

// === Section skeleton ===

/**
 * Reproduces a MetricSection: slide-in title bar + responsive card grid.
 * Grid matches the real layout: 1 col → md:2 col → lg:4 col.
 *
 * @param cardCount  - number of card skeletons to render (matches real section)
 * @param baseDelay  - section-level offset so later sections start after earlier ones
 */
function MetricSectionSkeleton({
  cardCount,
  baseDelay = 0,
}: {
  cardCount: number;
  baseDelay?: number;
}) {
  return (
    <div className="mt-8">
      {/* Section title placeholder */}
      <SkeletonBar className="h-5 w-52 mb-4" />
      {/* Cards grid — same breakpoints as the real MetricSection grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-4 gap-4">
        {Array.from({ length: cardCount }).map((_, i) => (
          <MetricCardSkeleton key={i} delayMs={baseDelay + i * 100} />
        ))}
      </div>
    </div>
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

      {/* Tab bar: 6 equal-width tab triggers */}
      <SkeletonBar className="h-10 w-full rounded-md" />

      {/*
       * Metric sections — card counts match the real page:
       *   Rendimento  → 4 cards
       *   Rischio     → 5 cards
       *   Contesto    → 2 cards
       * baseDelay staggers sections so later sections start their pulse wave after earlier ones.
       */}
      <MetricSectionSkeleton cardCount={4} baseDelay={0} />
      <MetricSectionSkeleton cardCount={5} baseDelay={400} />
      <MetricSectionSkeleton cardCount={2} baseDelay={900} />

      {/* Charts area */}
      <ChartSkeleton />
      <ChartSkeleton />

    </div>
  );
}
