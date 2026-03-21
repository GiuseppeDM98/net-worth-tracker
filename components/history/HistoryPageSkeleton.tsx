/**
 * HistoryPageSkeleton — loading placeholder for the History page.
 *
 * Mirrors the layout of history/page.tsx: header + 8 full-width chart cards
 * + the snapshot grid at the bottom, so the transition from loading to loaded
 * feels seamless rather than jarring.
 *
 * Pattern:
 * - motion-safe:animate-pulse + animationDelay stagger for a wave effect
 * - motion-reduce:opacity-40 for users who prefer reduced motion
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

function ChartCardSkeleton({
  height = 320,
  titleWidth = 'w-64',
  delayMs = 0,
  hasButton = false,
}: {
  height?: number;
  titleWidth?: string;
  delayMs?: number;
  hasButton?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <SkeletonBar className={`h-5 ${titleWidth}`} delayMs={delayMs} />
        {hasButton && <SkeletonBar className="h-8 w-28 rounded-md" delayMs={delayMs + 40} />}
      </div>
      <div
        className="w-full rounded-lg bg-muted motion-safe:animate-pulse motion-reduce:opacity-40"
        style={{ height, animationDelay: `${delayMs + 80}ms` }}
      />
    </div>
  );
}

function SnapshotGridSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
      <SkeletonBar className="h-5 w-40" delayMs={delayMs} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 desktop:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-3 flex flex-col gap-2">
            <SkeletonBar className="h-3 w-20" delayMs={delayMs + i * 40} />
            <SkeletonBar className="h-5 w-28" delayMs={delayMs + i * 40 + 30} />
            <SkeletonBar className="h-3 w-16" delayMs={delayMs + i * 40 + 60} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HistoryPageSkeleton() {
  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <SkeletonBar className="h-8 w-32" />
          <SkeletonBar className="h-4 w-80" delayMs={40} />
        </div>
        <div className="flex gap-2">
          <SkeletonBar className="h-9 w-40 rounded-md" delayMs={80} />
          <SkeletonBar className="h-9 w-28 rounded-md" delayMs={120} />
          <SkeletonBar className="h-9 w-28 rounded-md" delayMs={160} />
        </div>
      </div>

      {/* 1. Evoluzione Patrimonio Netto */}
      <ChartCardSkeleton height={320} titleWidth="w-72" hasButton delayMs={100} />

      {/* 2. Patrimonio Netto per Asset Class */}
      <ChartCardSkeleton height={320} titleWidth="w-80" hasButton delayMs={200} />

      {/* 3. Evoluzione Liquidità vs Illiquidità */}
      <ChartCardSkeleton height={320} titleWidth="w-72" delayMs={300} />

      {/* 4. Storico YoY */}
      <ChartCardSkeleton height={280} titleWidth="w-36" delayMs={400} />

      {/* 5. Risparmio vs Crescita Investimento */}
      <ChartCardSkeleton height={320} titleWidth="w-80" hasButton delayMs={500} />

      {/* 6. Tempo di Raddoppio Patrimonio */}
      <ChartCardSkeleton height={280} titleWidth="w-72" delayMs={600} />

      {/* 7. Asset Class: Corrente vs Desiderata */}
      <ChartCardSkeleton height={280} titleWidth="w-64" delayMs={700} />

      {/* 8. Snapshot Mensili */}
      <SnapshotGridSkeleton delayMs={800} />
    </div>
  );
}
