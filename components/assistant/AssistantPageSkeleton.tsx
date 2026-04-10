/**
 * Skeleton loading state for the Assistente AI page.
 *
 * Matches the two-column layout (conversation + right panel) used by AssistantPageClient
 * so the perceived layout shift on first load is minimal. Visible while auth resolves
 * or threads are loading before the client hydrates.
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
          {/* Hero chip row */}
          <div className="mb-4 flex gap-2">
            <div className="h-8 w-28 rounded-full bg-muted" />
            <div className="h-8 w-36 rounded-full bg-muted" />
            <div className="h-8 w-24 rounded-full bg-muted" />
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
          <div className="mt-0 rounded-2xl border border-border bg-card p-4">
            <div className="h-10 w-full rounded-lg bg-muted" />
          </div>
        </div>

        {/* Right column skeleton */}
        <div className="space-y-4">
          {/* Context card */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-12 w-full rounded-lg bg-muted" />
          </div>

          {/* Preferences card */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-9 w-full rounded-lg bg-muted" />
            <div className="h-10 w-full rounded-lg bg-muted" />
          </div>

          {/* Thread list card */}
          <div className="rounded-xl border border-border p-4 space-y-2">
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="h-14 w-full rounded-xl bg-muted" />
            <div className="h-14 w-full rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
