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
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Hero block */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-5 flex flex-col gap-2">
          <SkeletonBar className="h-3 w-48" delayMs={0} />
          <SkeletonBar className="h-10 w-32" delayMs={40} />
        </div>
        <div className="flex items-center justify-between px-6 py-3.5 border-t">
          <SkeletonBar className="h-4 w-36" delayMs={80} />
          <SkeletonBar className="h-4 w-24" delayMs={100} />
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex justify-center">
        <SkeletonBar className="h-10 w-72 rounded-lg" delayMs={120} />
      </div>

      {/* Parameters form card */}
      <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <SkeletonBar className="h-5 w-40" delayMs={160} />
          <SkeletonBar className="h-8 w-32 rounded-md" delayMs={180} />
        </div>
        {/* Core fields */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <SkeletonBar className="h-4 w-32" delayMs={200 + i * 40} />
            <SkeletonBar className="h-10 w-full rounded-md" delayMs={220 + i * 40} />
          </div>
        ))}
        {/* Allocation rows */}
        <div className="border-t pt-4 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <SkeletonBar className="h-4 w-24" delayMs={360 + i * 40} />
              <SkeletonBar className="h-8 w-20 rounded-md ml-auto" delayMs={380 + i * 40} />
              <SkeletonBar className="h-4 w-8" delayMs={390 + i * 40} />
            </div>
          ))}
        </div>
        {/* Run button */}
        <SkeletonBar className="h-11 w-full rounded-md" delayMs={540} />
      </div>

      {/* Results placeholder */}
      <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
        <SkeletonBar className="h-5 w-52" delayMs={580} />
        <div
          className="w-full rounded-lg bg-muted motion-safe:animate-pulse motion-reduce:opacity-40"
          style={{ height: 300, animationDelay: '620ms' }}
        />
        <div className="grid gap-2 grid-cols-3 sm:grid-cols-5 mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3 flex flex-col gap-2 items-center">
              <SkeletonBar className="h-3 w-12" delayMs={660 + i * 40} />
              <SkeletonBar className="h-5 w-20" delayMs={680 + i * 40} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
