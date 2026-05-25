/**
 * GoalsSkeleton — loading placeholder isomorphic to the post-redesign layout.
 *
 * Mirrors: hero block (value + 3 flat rows) + goal list card (header + 3 flat goal rows).
 * No summary cards grid — that component was removed in the redesign.
 */

import { cn } from '@/lib/utils';

function Bone({ className, delayMs = 0 }: { className?: string; delayMs?: number }) {
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

export function GoalsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero block */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Hero value area */}
        <div className="px-6 py-5 border-b border-border flex flex-col gap-2">
          <Bone className="h-3 w-32" delayMs={0} />
          <Bone className="h-10 w-48" delayMs={30} />
        </div>
        {/* Three flat metric rows */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between px-6 py-3.5 border-b border-border last:border-0"
          >
            <Bone className="h-3.5 w-28" delayMs={60 + i * 30} />
            <Bone className="h-3.5 w-20" delayMs={75 + i * 30} />
          </div>
        ))}
      </div>

      {/* Goal list card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex flex-col gap-1.5">
            <Bone className="h-4 w-48" delayMs={160} />
            <Bone className="h-3 w-64" delayMs={180} />
          </div>
          <Bone className="h-8 w-28 rounded-md" delayMs={200} />
        </div>

        {/* Three goal rows */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-b border-border last:border-0">
            {/* Row header */}
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Bone className="h-4 w-4 rounded shrink-0" delayMs={220 + i * 60} />
                <Bone className="h-3 w-3 rounded-full shrink-0" delayMs={230 + i * 60} />
                <div className="flex flex-col gap-1.5 min-w-0">
                  <Bone className="h-4 w-36" delayMs={240 + i * 60} />
                  <Bone className="h-3 w-24" delayMs={255 + i * 60} />
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Bone className="h-4 w-16 hidden desktop:block" delayMs={260 + i * 60} />
                <Bone className="h-4 w-12" delayMs={270 + i * 60} />
              </div>
            </div>
            {/* Slim progress bar */}
            <div className="px-6 pb-3">
              <Bone className="h-1.5 w-full rounded-full" delayMs={280 + i * 60} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
