/**
 * HallOfFameSkeleton — loading placeholder for the Hall of Fame page.
 *
 * Mirrors the layout: header, "Ranking Mensili" section (2×2 grid of 4 cards),
 * "Ranking Annuali" section (2×2 grid of 4 cards).
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

function RankingRowSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <SkeletonBar className="h-5 w-6 rounded" delayMs={delayMs} />
      <SkeletonBar className="h-4 w-24" delayMs={delayMs + 20} />
      <SkeletonBar className="h-4 w-20 ml-auto" delayMs={delayMs + 40} />
    </div>
  );
}

function RankingCardSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-5 flex flex-col gap-4 h-full">
      {/* Card header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <SkeletonBar className="h-5 w-5 rounded-full" delayMs={delayMs} />
          <SkeletonBar className="h-5 w-52" delayMs={delayMs + 20} />
        </div>
        <SkeletonBar className="h-3 w-72" delayMs={delayMs + 40} />
      </div>
      {/* Rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <RankingRowSkeleton key={i} delayMs={delayMs + 60 + i * 40} />
      ))}
    </div>
  );
}

export function HallOfFameSkeleton() {
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <SkeletonBar className="h-8 w-8 rounded-full" />
            <SkeletonBar className="h-8 w-40" delayMs={30} />
          </div>
          <SkeletonBar className="h-4 w-64" delayMs={60} />
        </div>
        <div className="flex gap-2">
          <SkeletonBar className="h-9 w-36 rounded-md" delayMs={80} />
          <SkeletonBar className="h-9 w-40 rounded-md" delayMs={100} />
        </div>
      </div>

      {/* Ranking Mensili */}
      <div className="space-y-4">
        <SkeletonBar className="h-7 w-64" delayMs={120} />
        <div className="grid gap-4 sm:gap-6 grid-cols-1 desktop:grid-cols-2">
          <RankingCardSkeleton delayMs={160} />
          <RankingCardSkeleton delayMs={240} />
          <RankingCardSkeleton delayMs={320} />
          <RankingCardSkeleton delayMs={400} />
        </div>
      </div>

      {/* Ranking Annuali */}
      <div className="space-y-4">
        <SkeletonBar className="h-7 w-56" delayMs={480} />
        <div className="grid gap-4 sm:gap-6 grid-cols-1 desktop:grid-cols-2">
          <RankingCardSkeleton delayMs={520} />
          <RankingCardSkeleton delayMs={600} />
          <RankingCardSkeleton delayMs={680} />
          <RankingCardSkeleton delayMs={760} />
        </div>
      </div>
    </div>
  );
}
