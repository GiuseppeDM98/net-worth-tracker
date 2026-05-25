/**
 * Skeleton loading state for the Assistente AI page.
 *
 * Matches the post-load layout exactly so the perceived layout shift on first load
 * is minimal. Order: left col (mode strip → hero block → conversation → composer),
 * right col (tab card → context block). This mirrors AssistantPageClient's render order.
 */
export function AssistantPageSkeleton() {
  return (
    <div className="space-y-6 max-desktop:portrait:pb-20 animate-pulse">
      {/* Page header skeleton */}
      <div className="space-y-4 border-b border-border pb-4">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted" />
      </div>

      <div className="grid gap-6 desktop:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]">
        {/* Left column skeleton */}
        <div className="flex flex-col gap-0">
          {/* Mode pill strip */}
          <div className="mb-4 flex gap-2">
            <div className="h-8 w-16 rounded-full bg-muted" />
            <div className="h-8 w-16 rounded-full bg-muted" />
            <div className="h-8 w-14 rounded-full bg-muted" />
            <div className="h-8 w-20 rounded-full bg-muted" />
            <div className="h-8 w-14 rounded-full bg-muted" />
          </div>

          {/* Hero block */}
          <div className="mb-6 rounded-2xl border border-border bg-card px-6 py-5">
            <div className="h-3 w-28 rounded bg-muted mb-2" />
            <div className="h-9 w-44 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted mt-3" />
          </div>

          {/* Conversation area */}
          <div className="min-h-[200px] rounded-2xl border border-border bg-background overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="h-4 w-40 rounded bg-muted" />
            </div>
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
            </div>
          </div>

          {/* Composer skeleton */}
          <div className="border-t border-border bg-background px-4 pt-3 pb-4">
            <div className="h-[44px] w-full rounded-xl bg-muted" />
          </div>
        </div>

        {/* Right column skeleton — matches new layout: tab card → context block */}
        <div className="hidden desktop:flex desktop:flex-col desktop:gap-4">
          {/* Tab card: Conversazioni | Memoria */}
          <div className="overflow-hidden rounded-xl border border-border">
            {/* Tab headers */}
            <div className="flex border-b border-border">
              <div className="flex-1 px-4 py-3">
                <div className="h-4 w-28 rounded bg-muted" />
              </div>
              <div className="flex-1 px-4 py-3">
                <div className="h-4 w-16 rounded bg-muted" />
              </div>
            </div>
            {/* Thread list rows */}
            <div className="p-4 space-y-3">
              <div className="h-14 w-full rounded-xl bg-muted" />
              <div className="h-14 w-full rounded-xl bg-muted" />
              <div className="h-14 w-full rounded-xl bg-muted" />
            </div>
          </div>

          {/* Context block */}
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border">
              <div className="h-3 w-32 rounded bg-muted" />
            </div>
            <div className="px-4 py-4 border-b border-border/50">
              <div className="h-3 w-24 rounded bg-muted mb-2" />
              <div className="h-7 w-36 rounded bg-muted" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex justify-between px-4 py-2.5 border-b border-border/50 last:border-0">
                <div className="h-3 w-16 rounded bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
